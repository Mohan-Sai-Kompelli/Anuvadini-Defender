const Student = require('../models/Student');
const Organization = require('../models/Organization');
const LiveLocation = require('../models/LiveLocation');
const LocationTrail = require('../models/LocationTrail');
const GeofenceAlert = require('../models/GeofenceAlert');
const pushNotificationService = require('./pushNotificationService');
const { haversineMeters, resolvePremises } = require('../utils/geofence');
const kalmanFilter = require('../utils/kalmanFilter');

// Discard any GPS ping whose self-reported accuracy is worse than this.
// 60 m is the practical ceiling for useful geofencing — tighter than the
// 100 m campus radius so boundary calls are still reliable, but loose enough
// to accept the ~50-55 m readings common on mid-range Android devices indoors.
const MAX_ACCURACY_M = 60;

// Hysteresis: staff must be this far PAST the geofence radius before we
// even start the exit-verification countdown (avoids boundary jitter).
const EXIT_BUFFER_M = 25;

// Number of consecutive HARD-REFRESH fixes that must all land outside
// before we declare a genuine exit and fire alerts.
const EXIT_CONFIRM_COUNT = 3;

// Ignore absurd GPS jumps when accumulating distance-traveled.
const MAX_STEP_M = 5000;

// A live-location ping this far from the org premises is not a real person on
// duty — it's a mock/fake location, an emulator's default fix (Android
// emulators default to Google HQ in Mountain View, California → ~12,000 km
// from India, which is exactly the "staff shown in the USA" symptom), or a
// wild GPS glitch. Discard it so one bogus coordinate can't teleport a staff
// member across the world on the live map. Generous default (500 km) so real
// field-work / travel within the region is never affected; env-tunable.
const MAX_PREMISES_DISTANCE_M = parseInt(process.env.LIVE_LOCATION_MAX_DISTANCE_M || '500000', 10);

function localYMD(d = new Date()) {
  // Use IST (UTC+5:30) so midnight-IST pings get the correct calendar date
  // regardless of the server's local timezone (which is typically UTC).
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
}

class LocationTrackingService {
  /**
   * Process one live-location ping.
   *
   * Two new behaviours vs the original:
   *
   * 1. ACCURACY FILTER — pings with accuracy > MAX_ACCURACY_M are silently
   *    dropped.  The GPS chip itself is saying "I don't know where I am
   *    within 50 m", so the distance-from-campus value would be meaningless.
   *    The client receives { success: true, discarded: true } so it doesn't
   *    retry in a tight loop.
   *
   * 2. HARD-REFRESH VERIFICATION — when a ping would trigger an exit
   *    transition the server does NOT immediately fire the alert.  Instead it
   *    increments a pending counter (exitVerifyCount) and returns
   *    { needsVerification: true } to the app.  The app must respond by
   *    obtaining a fresh GPS fix (maximumAge:0, no cache) and posting it back.
   *    Only after EXIT_CONFIRM_COUNT consecutive outside verifications (all
   *    passing the accuracy filter) does the server declare a genuine exit and
   *    emit alerts.  Any single inside fix during verification resets the
   *    counter back to zero — the person is still on campus.
   */
  async recordPing({ studentId, latitude, longitude, accuracy, heading, speed, isVerification = false }) {
    const now = new Date();
    const today = localYMD(now);

    // ── 0. RANGE SANITY ─────────────────────────────────────────────────────
    // A valid latitude is -90..90 and longitude -180..180. Anything else is
    // corrupt data (never store it) — and (0,0) "null island" is the classic
    // "no real fix" placeholder, not a place a staff member can be on duty.
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
      (latitude === 0 && longitude === 0)
    ) {
      console.log(`[Tracking] ping discarded — invalid coordinates (${latitude},${longitude}) (student ${studentId})`);
      return { success: true, discarded: true, insidePremises: null, events: [] };
    }

    // ── 1. ACCURACY FILTER ──────────────────────────────────────────────────
    // Drop garbage pings.  We still return success so the app doesn't retry.
    if (typeof accuracy === 'number' && accuracy > MAX_ACCURACY_M) {
      console.log(`[Tracking] ping discarded — accuracy ${Math.round(accuracy)} m > ${MAX_ACCURACY_M} m limit (student ${studentId})`);
      return { success: true, discarded: true, insidePremises: null, events: [] };
    }

    const student = await Student.findById(studentId).select('organization department Area_radius fullName');
    if (!student) return { success: false, error: 'Student not found' };

    const org = await Organization.findById(student.organization).select('location Area_radius');
    let premises = resolvePremises(org, student);

    // Campus-aware premises. Anuvadini / NETF / IUAC share offices, so a staff
    // member standing at ANY of the three is "on campus". Use the NEAREST campus
    // office to this ping as the premises — otherwise someone at IUAC shows as
    // ~2.9 km "outside" just because their org's single location is Anuvadini.
    // Non-campus orgs keep their single org premises (resolvePremises above).
    try {
      const { getCampusContext, findNearestOffice } = require('../utils/sharedOffices');
      const { offices, orgIds } = await getCampusContext();
      if (orgIds.has(String(student.organization)) && offices.length) {
        const nearest = findNearestOffice(offices, latitude, longitude, (student && student.Area_radius) || 0);
        if (nearest && nearest.office) {
          premises = {
            latitude: nearest.office.latitude,
            longitude: nearest.office.longitude,
            radius: nearest.allowed,
          };
        }
      }
    } catch (e) {
      console.warn('[Tracking] campus premises resolve failed, using single org premises:', e.message);
    }

    const prev = await LiveLocation.findOne({ student: studentId });

    // ── 1b. PLAUSIBILITY (anti-teleport) ────────────────────────────────────
    // A ping impossibly far from the org premises is a mock/emulator/glitch
    // fix, not a real person on duty. Discard it BEFORE it gets stored and
    // teleports the staff member across the map (e.g. the Android-emulator
    // default in California, ~12,000 km from an Indian campus). Only enforced
    // when we actually know where the premises is.
    if (premises) {
      const premisesDistM = haversineMeters(latitude, longitude, premises.latitude, premises.longitude);
      if (premisesDistM > MAX_PREMISES_DISTANCE_M) {
        console.log(`[Tracking] ping discarded — ${Math.round(premisesDistM / 1000)} km from premises > ${Math.round(MAX_PREMISES_DISTANCE_M / 1000)} km limit — mock/emulator/glitch fix (student ${studentId}, coords ${latitude},${longitude})`);
        return { success: true, discarded: true, insidePremises: prev ? prev.insidePremises : null, events: [] };
      }
    }

    // ── 2. KALMAN SMOOTHING ─────────────────────────────────────────────────
    // Keep raw coordinates for the trail (portal comparison) then replace
    // lat/lon with the smoothed values for all geofence decisions and storage.
    const rawLatitude  = latitude;
    const rawLongitude = longitude;
    const smoothed = kalmanFilter.smooth(studentId, latitude, longitude, accuracy);
    latitude  = smoothed.latitude;
    longitude = smoothed.longitude;
    console.log(
      `[Kalman] ${student.fullName}: raw=(${rawLatitude.toFixed(6)},${rawLongitude.toFixed(6)}) ` +
      `→ smoothed=(${latitude.toFixed(6)},${longitude.toFixed(6)}) ` +
      `gain=${smoothed.kalmanGain} acc=${accuracy != null ? Math.round(accuracy) + 'm' : 'n/a'}`
    );

    // ── 3. DISTANCE + INSIDE/OUTSIDE ───────────────────────────────────────
    let distanceM = null;
    let insidePremises = prev ? prev.insidePremises : null;
    if (premises) {
      distanceM = haversineMeters(latitude, longitude, premises.latitude, premises.longitude);
      const firstFix = !prev || prev.insidePremises == null;
      const wasInside = prev && prev.insidePremises === false ? false : true;
      if (firstFix) {
        insidePremises = distanceM <= premises.radius;
      } else if (wasInside && distanceM > premises.radius + EXIT_BUFFER_M) {
        insidePremises = false;
      } else if (!wasInside && distanceM <= premises.radius) {
        insidePremises = true;
      } else {
        insidePremises = wasInside;
      }
    }

    // ── 3. HARD-REFRESH VERIFICATION STATE ─────────────────────────────────
    // exitVerifyCount tracks how many consecutive fresh-GPS outside fixes we
    // have seen since the first suspicious ping.  It lives on the LiveLocation
    // doc so it survives across requests.
    let exitVerifyCount = (prev && prev.exitVerifyCount) || 0;
    let needsVerification = false;
    let verifiedExit = false;

    if (premises) {
      const wasInside = prev ? (prev.insidePremises !== false) : true;

      if (wasInside && insidePremises === false) {
        if (isVerification) {
          exitVerifyCount += 1;
          console.log(`[Tracking] exit verification ${exitVerifyCount}/${EXIT_CONFIRM_COUNT} for student ${studentId} — distance ${Math.round(distanceM)} m`);
        } else {
          // First suspicious ping — start/continue counter, ask app for a hard refresh.
          exitVerifyCount = 1;
          console.log(`[Tracking] outside ping detected, starting verification for student ${studentId} — distance ${Math.round(distanceM)} m`);
        }

        if (exitVerifyCount >= EXIT_CONFIRM_COUNT) {
          verifiedExit = true;
          exitVerifyCount = 0;
          console.log(`[Tracking] genuine exit confirmed after ${EXIT_CONFIRM_COUNT} hard-refresh fixes for student ${studentId}`);
        } else {
          // Not yet confirmed — don't fire alert, but DO show the real distance/position.
          // Keep insidePremises as the computed value (false) so map shows true location;
          // we just don't emit a breach event until fully verified.
          needsVerification = true;
        }
      } else if (!wasInside && insidePremises === true) {
        exitVerifyCount = 0;
      } else if (insidePremises === true) {
        exitVerifyCount = 0;
      }
    }

    // ── 4. PER-DAY STATS ───────────────────────────────────────────────────
    const sameDay = prev && prev.statsDate === today;
    let breachCountToday = sameDay ? prev.breachCountToday || 0 : 0;
    let outsideSecondsToday = sameDay ? prev.outsideSecondsToday || 0 : 0;
    let distanceTraveledM = sameDay ? prev.distanceTraveledM || 0 : 0;
    let outsideSince = sameDay ? prev.outsideSince || null : null;

    if (sameDay && prev && prev.latitude != null && prev.longitude != null) {
      const step = haversineMeters(prev.latitude, prev.longitude, latitude, longitude);
      if (step <= MAX_STEP_M) distanceTraveledM += step;
    }

    // ── 5. EXIT / ENTER TRANSITIONS ────────────────────────────────────────
    const events = [];
    if (premises && prev && prev.insidePremises != null) {
      const wasInside = prev.insidePremises;
      if (wasInside && verifiedExit) {
        // Only fire exit after hard-refresh confirmation.
        breachCountToday += 1;
        outsideSince = now;
        events.push('exit');
      } else if (!wasInside && insidePremises === true) {
        if (prev.outsideSince) {
          outsideSecondsToday += Math.max(0, Math.round((now - new Date(prev.outsideSince)) / 1000));
        }
        outsideSince = null;
        events.push('enter');
      }
    } else if (premises && insidePremises === false && !outsideSince && verifiedExit) {
      outsideSince = now;
    }

    // ── 6. PERSIST ─────────────────────────────────────────────────────────
    await LiveLocation.findOneAndUpdate(
      { student: studentId },
      {
        $set: {
          organization: student.organization,
          department: student.department || '',
          latitude,
          longitude,
          accuracy: typeof accuracy === 'number' ? accuracy : undefined,
          heading: typeof heading === 'number' ? heading : undefined,
          speed: typeof speed === 'number' ? speed : undefined,
          active: true,
          lastStatus: 'tracking',
          lastFixAt: now,
          insidePremises,
          distanceM,
          outsideSince,
          exitVerifyCount,
          statsDate: today,
          breachCountToday,
          outsideSecondsToday,
          distanceTraveledM,
          ...(events.includes('exit') ? { lastBreachAt: now } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // ── 7. TRAIL BREADCRUMB (best-effort) ──────────────────────────────────
    // Store smoothed coordinates as the canonical position.
    // Raw coordinates are kept alongside so the portal can show a
    // "Raw GPS vs Kalman Smoothed" overlay for verification.
    LocationTrail.create({
      student: studentId,
      organization: student.organization,
      date: today,
      latitude,           // Kalman-smoothed
      longitude,          // Kalman-smoothed
      rawLatitude,        // original GPS (for portal debug overlay)
      rawLongitude,       // original GPS (for portal debug overlay)
      kalmanGain: smoothed.kalmanGain,
      accuracy,
      speed: typeof speed === 'number' ? speed : undefined,
      insidePremises,
      distanceM,
      at: now,
    }).catch((e) => console.warn('[Tracking] trail write failed:', e.message));

    // ── 8. SIDE-EFFECTS ON CONFIRMED TRANSITIONS ───────────────────────────
    for (const type of events) {
      this._emitGeofenceEvent({ student, type, latitude, longitude, distanceM, now }).catch((e) =>
        console.warn('[Tracking] geofence event failed:', e.message)
      );
    }

    return { success: true, insidePremises, distanceM, events, needsVerification, exitVerifyCount };
  }

  async _emitGeofenceEvent({ student, type, latitude, longitude, distanceM, now }) {
    await GeofenceAlert.create({
      student: student._id,
      organization: student.organization,
      department: student.department || '',
      type,
      latitude,
      longitude,
      distanceM: distanceM != null ? Math.round(distanceM) : undefined,
      at: now,
    });

    const distTxt = distanceM != null ? ` (~${Math.round(distanceM)} m from campus)` : '';
    const notification =
      type === 'exit'
        ? {
            title: '⚠️ You left the premises',
            body: `You have moved outside the campus geofence${distTxt}. Please return — this has been flagged to your HOD/Admin.`,
          }
        : { title: '✅ Back inside premises', body: 'You are back within the campus geofence.' };

    await pushNotificationService.sendNotificationToStudent(student._id, notification, {
      type: type === 'exit' ? 'geofence_exit' : 'geofence_enter',
      distanceM: distanceM != null ? String(Math.round(distanceM)) : '',
    });

    if (type === 'exit') {
      const hods = await Student.find({
        organization: student.organization,
        department: student.department || '',
        role: 'hod',
        fcmToken: { $exists: true, $ne: null, $ne: '' },
        _id: { $ne: student._id },
      }).select('_id');
      for (const hod of hods) {
        pushNotificationService
          .sendNotificationToStudent(
            hod._id,
            { title: '🚨 Staff left premises', body: `${student.fullName} has moved outside the campus geofence${distTxt}.` },
            { type: 'geofence_exit', staff: String(student._id) }
          )
          .catch(() => {});
      }
    }
  }
}

module.exports = new LocationTrackingService();
