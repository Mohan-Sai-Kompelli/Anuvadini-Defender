const mongoose = require('mongoose');
const SpotCheck = require('../models/SpotCheck');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { BiometricAttendance } = require('../config/biometricDb');
const pushNotificationService = require('./pushNotificationService');
const audit = require('./auditService');
const injectionRiskService = require('./injectionRiskService');
const { getCampusContext, findNearestOffice } = require('../utils/sharedOffices');

// Parse a 'YYYY-MM-DD' query param as a LOCAL calendar day. `new Date('YYYY-MM-DD')`
// parses as UTC midnight, which in IST drops the whole `to` day from the range —
// so today's spot-checks would never show in the report. `parseTo` snaps to the
// END of the day so the requested day is fully inclusive.
const parseFrom = (s) => {
  if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  return new Date(s);
};
const parseTo = (s) => {
  if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }
  return new Date(s);
};

/**
 * SpotCheckService
 * ----------------
 * Random attendance verification ("spot checks") + the non-response analytics
 * the Admin needs to catch people who repeatedly dodge live verification.
 *
 * Flow:
 *   1. issueRound()      -> pick targets, create SpotCheck docs, push FCM prompts
 *   2. recordResponse()  -> staff completes the live face check in time
 *   3. evaluateExpired() -> cron closes the window, marks misses, flags patterns
 *   4. getAnalytics()    -> the detailed report (who's missing, repeat offenders,
 *                           "missed the live check but marked attendance anyway")
 */
class SpotCheckService {
  constructor() {
    this._dailyTimers = [];
    this._IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  }

  // ---- helpers ---------------------------------------------------------------

  _roundId() {
    return `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // "Today" and "which minute of the day" throughout this service must mean
  // IST, not whatever timezone the actual deployed server's OS happens to
  // run in. `date.getFullYear()/getHours()/etc.` all read the SERVER's LOCAL
  // clock — fine on a machine already set to IST, silently wrong on a
  // server whose OS runs UTC (the common default for cloud hosting). Only
  // the cron TRIGGER itself (`cron.schedule(..., { timezone: 'Asia/Kolkata' })`
  // in cronService.js) is explicitly IST-aware; everything else in this file
  // was doing local-time math. Anchoring through `_istParts` fixes both:
  //   - the day-boundary queries below (so "today" always means the IST
  //     calendar day, not a UTC server's), and
  //   - the "has this window already fired today" check added for the
  //     restart-safe planning (a UTC server previously reported an issuedAt
  //     of, say, "11:00 IST" as UTC hour 5 — which never falls inside the
  //     IST-numbered window range, silently defeating that whole check and
  //     letting duplicate rounds through again on a redeploy).
  _istParts(date) {
    const shifted = new Date(date.getTime() + this._IST_OFFSET_MS);
    return {
      y: shifted.getUTCFullYear(),
      m: shifted.getUTCMonth(),
      d: shifted.getUTCDate(),
      minutesOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    };
  }

  _dayBounds(date = new Date()) {
    const { y, m, d } = this._istParts(date);
    // Midnight IST for this calendar day, expressed as the correct UTC instant.
    const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - this._IST_OFFSET_MS);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  /** Pick `count` random items from an array without mutating it. */
  _sample(arr, count) {
    if (count >= arr.length) return [...arr];
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  }

  // ---- 1. issue a round ------------------------------------------------------

  /**
   * Issue a spot-check round for an organization.
   * @param {String} organizationId
   * @param {Object} opts
   *   - studentIds       explicit targets (overrides sampling)
   *   - sampleSize       how many staff to randomly pick (default: all eligible)
   *   - onlyCheckedIn    only target people who have checked in today (default true)
   *   - windowMinutes    response window (default 15)
   *   - triggeredBy      'auto' | 'manual'
   */
  async issueRound(organizationId, opts = {}) {
    const {
      studentIds = null,
      sampleSize = null,
      onlyCheckedIn = true,
      windowMinutes = 15,
      triggeredBy = 'auto',
    } = opts;

    const roundId = this._roundId();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + windowMinutes * 60 * 1000);

    // 1. Determine the eligible pool.
    let eligible;
    if (Array.isArray(studentIds) && studentIds.length) {
      eligible = await Student.find({
        _id: { $in: studentIds },
        organization: organizationId,
        isActive: true,
      }).select('_id fullName fcmToken');
    } else {
      const query = { organization: organizationId, isActive: true };
      eligible = await Student.find(query).select('_id fullName fcmToken WFH wfhAssignments');

      // Skip anyone on active WFH — a spot check at the office boundary is meaningless.
      eligible = eligible.filter((s) => {
        try {
          return !s.hasActiveWFH || !s.hasActiveWFH();
        } catch (_e) {
          return true;
        }
      });

      // A spot check can only ever reach someone whose app has actually
      // registered a device (fcmToken) — without one, sendSpotCheckNotification
      // has nothing to push to, so the check silently sits there and the
      // person gets flagged as a "miss" for a prompt they never received.
      // Someone whose device has never logged in is not eligible.
      eligible = eligible.filter((s) => !!s.fcmToken);

      // Optionally restrict to people actually present today.
      if (onlyCheckedIn) {
        const { start, end } = this._dayBounds(issuedAt);
        const inQuery = {
          organization: organizationId,
          type: 'in',
          timestamp: { $gte: start, $lt: end },
        };
        const outQuery = { ...inQuery, type: 'out' };
        const checkedInSet = new Set(
          (await Attendance.distinct('student', inQuery)).map((id) => String(id))
        );
        // Anyone who has already checked OUT today is no longer on duty (e.g.
        // left early, half-day, went on leave for the rest of the day) — a
        // spot check has nothing to verify them against and would just record
        // an unreachable "miss".
        const checkedOutSet = new Set(
          (await Attendance.distinct('student', outQuery)).map((id) => String(id))
        );
        try {
          const bioIds = await BiometricAttendance.distinct('student', inQuery);
          for (const id of bioIds) checkedInSet.add(String(id));
          const bioOutIds = await BiometricAttendance.distinct('student', outQuery);
          for (const id of bioOutIds) checkedOutSet.add(String(id));
        } catch (e) {
          console.warn('[SpotCheck] biometric checked-in lookup failed:', e.message);
        }
        eligible = eligible.filter(
          (s) => checkedInSet.has(String(s._id)) && !checkedOutSet.has(String(s._id))
        );
      }
    }

    if (!eligible.length) {
      console.log(`[SpotCheck] No eligible staff for org ${organizationId}`);
      return { success: true, roundId, issued: 0, notified: 0, targets: [] };
    }

    // 2. Random subset if requested.
    let targets =
      sampleSize && sampleSize < eligible.length
        ? this._sample(eligible, sampleSize)
        : eligible;

    // 2b. Daily cap — AUTO ONLY: nobody gets more than
    // SPOTCHECK_MAX_PER_STUDENT_PER_DAY (default 2) AUTOMATIC spot-checks in
    // one IST calendar day. A manual trigger is a deliberate admin action
    // (e.g. specific suspicion about someone) and must never be silently
    // blocked just because that person already had their 2 auto checks for
    // the day — so the cap, and the count it's compared against, only ever
    // look at `triggeredBy: 'auto'` docs, and only apply when THIS round
    // itself is auto.
    const MAX_AUTO_PER_DAY = parseInt(process.env.SPOTCHECK_MAX_PER_STUDENT_PER_DAY || '2', 10);
    if (triggeredBy === 'auto' && MAX_AUTO_PER_DAY > 0 && targets.length) {
      const { start, end } = this._dayBounds(issuedAt);
      const todaysAutoCounts = await SpotCheck.aggregate([
        {
          $match: {
            organization: new mongoose.Types.ObjectId(organizationId),
            triggeredBy: 'auto',
            issuedAt: { $gte: start, $lt: end },
          },
        },
        { $group: { _id: '$student', count: { $sum: 1 } } },
      ]);
      const countByStudent = new Map(todaysAutoCounts.map((r) => [String(r._id), r.count]));
      const before = targets.length;
      targets = targets.filter((s) => (countByStudent.get(String(s._id)) || 0) < MAX_AUTO_PER_DAY);
      const skipped = before - targets.length;
      if (skipped > 0) {
        console.log(`[SpotCheck] Skipped ${skipped} student(s) already at the auto daily cap (${MAX_AUTO_PER_DAY}/day)`);
      }
    }

    if (!targets.length) {
      console.log(`[SpotCheck] All eligible staff for org ${organizationId} are already at the daily cap`);
      return { success: true, roundId, issued: 0, notified: 0, targets: [] };
    }

    // 3. Create + notify in BATCHES, not all at once — firing hundreds of
    // simultaneous FCM sends + DB writes the instant a round fires spikes
    // both server load and Firebase's per-project send rate. Each batch's
    // docs are created (and get their `issuedAt`/`expiresAt`) right before
    // that batch is actually sent, so every target gets the FULL
    // `windowMinutes` to respond regardless of how far into the round their
    // batch falls — a fixed round-wide expiresAt would otherwise silently
    // shrink the response window for people in later batches once the
    // inter-batch delay is more than a few seconds.
    const BATCH_SIZE = Math.max(1, parseInt(process.env.SPOTCHECK_BATCH_SIZE || '16', 10));
    const BATCH_DELAY_MS = Math.max(0, parseInt(process.env.SPOTCHECK_BATCH_DELAY_MS || String(2 * 60 * 1000), 10));
    const totalBatches = Math.ceil(targets.length / BATCH_SIZE);
    let notified = 0;
    const created = [];

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batchTargets = targets.slice(i, i + BATCH_SIZE);
      const batchIssuedAt = new Date();
      const batchExpiresAt = new Date(batchIssuedAt.getTime() + windowMinutes * 60 * 1000);

      const batchDocs = batchTargets.map((s) => ({
        organization: organizationId,
        student: s._id,
        roundId,
        issuedAt: batchIssuedAt,
        expiresAt: batchExpiresAt,
        windowMinutes,
        status: 'pending',
        triggeredBy,
      }));
      const batchCreated = await SpotCheck.insertMany(batchDocs);
      created.push(...batchCreated);

      await Promise.all(
        batchCreated.map(async (sc) => {
          const result = await pushNotificationService.sendSpotCheckNotification(
            sc.student,
            {
              spotCheckId: String(sc._id),
              roundId,
              expiresAt: batchExpiresAt.toISOString(),
              windowMinutes,
            }
          );
          if (result && result.success) notified += 1;
          await SpotCheck.findByIdAndUpdate(sc._id, {
            notificationSent: !!(result && result.success),
            notificationResult: result,
          });
        })
      );

      const isLastBatch = i + BATCH_SIZE >= targets.length;
      if (!isLastBatch && BATCH_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    console.log(
      `[SpotCheck] Round ${roundId} issued for org ${organizationId}: ${created.length} targets in ${totalBatches} batch(es) of up to ${BATCH_SIZE}, ${notified} notified`
    );

    return {
      success: true,
      roundId,
      issuedAt,
      expiresAt,
      windowMinutes,
      issued: created.length,
      notified,
      targets: created.map((c) => ({ spotCheckId: c._id, student: c.student })),
    };
  }

  // ---- 2. record a response --------------------------------------------------

  /**
   * Record a staff member's response to a spot check.
   * @param {String} spotCheckId
   * @param {Object} payload { studentId, latitude, longitude, distance,
   *                           faceVerified, verificationScore, livenessVerdict,
   *                           attendanceRef }
   */
  async recordResponse(spotCheckId, payload = {}) {
    const sc = await SpotCheck.findById(spotCheckId);
    if (!sc) return { success: false, error: 'Spot check not found' };

    // Guard: only the addressee can answer their own spot check.
    if (payload.studentId && String(sc.student) !== String(payload.studentId)) {
      return { success: false, error: 'Spot check does not belong to this user' };
    }

    if (sc.status === 'responded') {
      return { success: true, alreadyResponded: true, spotCheck: sc };
    }

    const studentObj = await Student.findById(sc.student).select('Area_radius WFH');
    const hasActiveWFH = studentObj && studentObj.hasActiveWFH ? studentObj.hasActiveWFH() : false;
    const isLegacyWFH = studentObj && (studentObj.WFH === 'WFH allowed' || studentObj.WFH === 'Allowed');

    if (!hasActiveWFH && !isLegacyWFH) {
      if (payload.latitude === undefined || payload.longitude === undefined) {
        return { success: false, error: 'Location coordinates are required for spot check' };
      }

      const { offices, orgIds } = await getCampusContext();
      const isCampusStudent = orgIds.has(String(sc.organization));

      if (isCampusStudent) {
        if (!offices.length) {
          return { success: false, error: 'Attendance locations are not configured.' };
        }

        const nearest = findNearestOffice(offices, payload.latitude, payload.longitude, studentObj.Area_radius || 0);

        if (!nearest || !nearest.withinRange) {
          const dist = nearest ? Math.round(nearest.distance) : 0;
          return {
            success: false,
            error: nearest
              ? `Spot check failed: You must be within ${nearest.allowed} m of a campus office. Nearest is ${nearest.office.name} (${dist} m away).`
              : 'No campus office is configured to verify your location.'
          };
        }
        // Update distance with the actual calculated distance
        payload.distance = Math.round(nearest.distance);
      }
    }

    const now = new Date();
    const onTime = now <= new Date(sc.expiresAt);

    sc.respondedAt = now;
    sc.responseLatencyMs = now.getTime() - new Date(sc.issuedAt).getTime();
    if (payload.latitude != null && payload.longitude != null) {
      sc.responseLocation = {
        latitude: payload.latitude,
        longitude: payload.longitude,
      };
    }
    if (payload.distance != null) sc.distance = payload.distance;
    if (payload.faceVerified != null) sc.faceVerified = !!payload.faceVerified;
    if (payload.verificationScore != null) sc.verificationScore = payload.verificationScore;
    if (payload.livenessVerdict != null) sc.livenessVerdict = payload.livenessVerdict;
    if (payload.attendanceRef) sc.attendanceRef = payload.attendanceRef;
    // Keep the live selfie for the super-admin gallery (base64/data-URL).
    if (payload.faceImage) sc.faceImage = payload.faceImage;
    // Score the device/camera attestation for injection/deepfake risk.
    if (payload.attestation) {
      sc.attestation = payload.attestation;
      sc.injectionRisk = injectionRiskService.score(payload.attestation);
    }

    // A spot-check IS an attendance event: a verified response marks the user
    // present. If they haven't checked in today, create the 'in' record now; if
    // they already have, link it (no duplicate). This is what turns "respond to
    // the spot-check" into "mark your attendance".
    let attendanceMarked = false;
    if (!sc.attendanceRef && payload.faceVerified) {
      try {
        const { start, end } = this._dayBounds(now);
        const dayQuery = {
          student: sc.student,
          type: 'in',
          timestamp: { $gte: start, $lt: end },
        };
        // Check BOTH stores — a check-in may have landed only in the external
        // biometric DB (device check-in). Without this, a spot-check response
        // wrongly believes the user never checked in and creates a SECOND
        // 'in' record for the day (duplicate check-in in the history).
        let att = await Attendance.findOne(dayQuery).sort({ timestamp: -1 }).select('_id');
        if (!att) {
          try {
            att = await BiometricAttendance.findOne(dayQuery).sort({ timestamp: -1 }).select('_id');
          } catch (e) {
            console.warn('[SpotCheck] biometric exists-check failed:', e.message);
          }
        }

        if (!att) {
          const hasGeo = payload.latitude != null && payload.longitude != null;
          att = await Attendance.create({
            student: sc.student,
            organization: sc.organization,
            type: 'in',
            timestamp: now,
            latitude: payload.latitude,
            longitude: payload.longitude,
            location: hasGeo ? { latitude: payload.latitude, longitude: payload.longitude } : undefined,
            distance: payload.distance,
            faceVerified: !!payload.faceVerified,
            verificationScore: payload.verificationScore,
            livenessVerdict: payload.livenessVerdict,
            authMethod: 'face',
            status: 'success',
          });
          attendanceMarked = true;
        }
        sc.attendanceRef = att._id;
      } catch (e) {
        console.warn('[SpotCheck] attendance marking failed:', e.message);
      }
    }

    // Responses after the window closed are recorded but still count as a miss.
    sc.status = onTime ? 'responded' : 'missed';
    if (!onTime) sc.reason = 'late_response';

    await sc.save();
    return { success: true, onTime, attendanceMarked, attendanceRef: sc.attendanceRef, spotCheck: sc };
  }

  // ---- 3. evaluate expired (cron) -------------------------------------------

  /**
   * Close every spot check whose window has elapsed without a response, mark it
   * missed, and compute the pattern flags (did they still mark attendance that
   * day -> proxy suspect).
   */
  async evaluateExpired() {
    const now = new Date();
    const expired = await SpotCheck.find({
      status: 'pending',
      expiresAt: { $lt: now },
    });

    if (!expired.length) return { evaluated: 0 };

    let missed = 0;
    for (const sc of expired) {
      const { start, end } = this._dayBounds(new Date(sc.issuedAt));

      // Did they have a normal check-in that day despite ignoring the live check?
      const checkin = await Attendance.findOne({
        student: sc.student,
        type: 'in',
        timestamp: { $gte: start, $lt: end },
      }).select('_id timestamp');

      sc.status = 'missed';
      sc.reason = 'no_response';
      sc.hadAttendanceThatDay = !!checkin;
      // "missed the live check but marked attendance anyway" — the headline signal.
      sc.markedAfterMiss = !!checkin;
      await sc.save();
      missed += 1;

      audit.log({
        organization: sc.organization,
        actorType: 'system',
        action: 'spot_check.missed',
        outcome: sc.markedAfterMiss ? 'flagged' : 'failure',
        targetType: 'spot_check',
        target: sc._id,
        metadata: {
          student: String(sc.student),
          roundId: sc.roundId,
          markedAfterMiss: sc.markedAfterMiss,
        },
      });
    }

    console.log(`[SpotCheck] Evaluated ${expired.length} expired, marked ${missed} missed`);
    return { evaluated: expired.length, missed };
  }

  // ---- 4. analytics report ---------------------------------------------------

  /**
   * The detailed non-response report.
   * @param {String} organizationId
   * @param {Object} opts
   *   - from, to            ISO date range (default: last 30 days)
   *   - missRateThreshold   fraction at/above which someone is a repeat offender (default 0.4)
   *   - minIssued           ignore people with fewer than this many checks (default 3)
   * @returns summary + per-user breakdown + repeat offenders + proxy suspects + daily trend
   */
  async getAnalytics(organizationId, opts = {}) {
    const to = opts.to ? parseTo(opts.to) : new Date();
    const from = opts.from
      ? parseFrom(opts.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const missRateThreshold = opts.missRateThreshold != null ? Number(opts.missRateThreshold) : 0.4;
    const minIssued = opts.minIssued != null ? Number(opts.minIssued) : 3;

    const orgId = new mongoose.Types.ObjectId(organizationId);

    // Optional department scoping (HOD): restrict to a set of student ids.
    const scopeQuery = {};
    if (Array.isArray(opts.studentIds) && opts.studentIds.length) {
      scopeQuery.student = { $in: opts.studentIds };
    }

    // Pull every spot check in range, oldest first (needed for streak math),
    // and only the fields the report uses.
    const checks = await SpotCheck.find({
      organization: orgId,
      ...scopeQuery,
      issuedAt: { $gte: from, $lte: to },
    })
      .sort({ issuedAt: 1 })
      .select(
        'student roundId issuedAt status responseLatencyMs markedAfterMiss hadAttendanceThatDay reason triggeredBy windowMinutes'
      )
      .lean();

    // --- overall summary ---
    const summary = {
      from,
      to,
      totalChecks: checks.length,
      responded: 0,
      missed: 0,
      pending: 0,
      skipped: 0,
      proxySuspectChecks: 0, // missed the live check but marked attendance that day
      rounds: new Set(),
    };

    // --- per-user accumulation ---
    const byUser = new Map();
    const ensureUser = (id) => {
      const key = String(id);
      if (!byUser.has(key)) {
        byUser.set(key, {
          student: key,
          totalIssued: 0,
          responded: 0,
          missed: 0,
          pending: 0,
          skipped: 0,
          markedAfterMissCount: 0,
          latencies: [],
          currentMissStreak: 0,
          longestMissStreak: 0,
          lastRespondedAt: null,
          lastMissedAt: null,
          history: [], // chronological per-check outcomes (for the compliance dots)
          _runningMissStreak: 0,
        });
      }
      return byUser.get(key);
    };

    // --- daily trend ---
    const byDay = new Map();
    const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

    // --- per-round roll-up (powers the "Check History" sessions list) ---
    const byRound = new Map();

    for (const c of checks) {
      summary.rounds.add(c.roundId);

      // accumulate this round's counts
      if (!byRound.has(c.roundId)) {
        byRound.set(c.roundId, {
          roundId: c.roundId,
          issuedAt: c.issuedAt,
          issued: 0,
          responded: 0,
          missed: 0,
          pending: 0,
          triggeredBy: c.triggeredBy || null,
          windowMinutes: c.windowMinutes || null,
        });
      }
      const round = byRound.get(c.roundId);
      round.issued += 1;
      if (new Date(c.issuedAt) < new Date(round.issuedAt)) round.issuedAt = c.issuedAt;
      if (c.status === 'responded') round.responded += 1;
      else if (c.status === 'missed') round.missed += 1;
      else if (c.status === 'pending') round.pending += 1;

      const u = ensureUser(c.student);
      u.totalIssued += 1;
      if (c.status !== 'skipped') u.history.push(c.status); // responded | missed | pending

      if (c.status === 'responded') {
        summary.responded += 1;
        u.responded += 1;
        u.lastRespondedAt = c.issuedAt;
        if (typeof c.responseLatencyMs === 'number') u.latencies.push(c.responseLatencyMs);
        u._runningMissStreak = 0;
      } else if (c.status === 'missed') {
        summary.missed += 1;
        u.missed += 1;
        u.lastMissedAt = c.issuedAt;
        u._runningMissStreak += 1;
        u.longestMissStreak = Math.max(u.longestMissStreak, u._runningMissStreak);
        if (c.markedAfterMiss) {
          u.markedAfterMissCount += 1;
          summary.proxySuspectChecks += 1;
        }
      } else if (c.status === 'pending') {
        summary.pending += 1;
        u.pending += 1;
      } else if (c.status === 'skipped') {
        summary.skipped += 1;
        u.skipped += 1;
      }

      // daily trend (only count resolved checks toward response rate)
      const dk = dayKey(c.issuedAt);
      if (!byDay.has(dk)) byDay.set(dk, { date: dk, issued: 0, responded: 0, missed: 0 });
      const day = byDay.get(dk);
      day.issued += 1;
      if (c.status === 'responded') day.responded += 1;
      if (c.status === 'missed') day.missed += 1;
    }

    // The trailing run of misses is the current streak.
    for (const u of byUser.values()) {
      u.currentMissStreak = u._runningMissStreak;
      delete u._runningMissStreak;
    }

    // Attach names/department for readability.
    const studentIds = [...byUser.keys()].map((k) => new mongoose.Types.ObjectId(k));
    const students = await Student.find({ _id: { $in: studentIds } })
      .select('_id fullName uid department class')
      .lean();
    const studentMap = new Map(students.map((s) => [String(s._id), s]));

    // Finalize per-user records.
    const users = [...byUser.values()].map((u) => {
      const resolved = u.responded + u.missed; // checks with a definite outcome
      const missRate = resolved ? u.missed / resolved : 0;
      const responseRate = resolved ? u.responded / resolved : 0;
      const avgLatencyMs = u.latencies.length
        ? Math.round(u.latencies.reduce((a, b) => a + b, 0) / u.latencies.length)
        : null;

      const info = studentMap.get(u.student) || {};
      const flags = [];
      if (resolved >= minIssued && missRate >= missRateThreshold) flags.push('repeat_offender');
      if (u.currentMissStreak >= 3) flags.push('on_miss_streak');
      if (u.markedAfterMissCount >= 2) flags.push('proxy_suspect');
      if (resolved >= minIssued && u.missed === resolved) flags.push('never_responds');

      return {
        student: u.student,
        name: info.fullName || 'Unknown',
        uid: info.uid || null,
        department: info.department || null,
        class: info.class || null,
        totalIssued: u.totalIssued,
        responded: u.responded,
        missed: u.missed,
        pending: u.pending,
        skipped: u.skipped,
        responseRate: Number(responseRate.toFixed(3)),
        missRate: Number(missRate.toFixed(3)),
        currentMissStreak: u.currentMissStreak,
        longestMissStreak: u.longestMissStreak,
        avgLatencyMs,
        markedAfterMissCount: u.markedAfterMissCount,
        lastRespondedAt: u.lastRespondedAt,
        lastMissedAt: u.lastMissedAt,
        history: u.history.slice(-12), // most recent 12 outcomes, oldest → newest
        flags,
      };
    });

    // Sort worst-first so the Admin sees the problem people at the top.
    users.sort(
      (a, b) =>
        b.missRate - a.missRate ||
        b.missed - a.missed ||
        b.currentMissStreak - a.currentMissStreak
    );

    const resolvedTotal = summary.responded + summary.missed;
    summary.totalRounds = summary.rounds.size;
    delete summary.rounds;
    summary.overallResponseRate = resolvedTotal
      ? Number((summary.responded / resolvedTotal).toFixed(3))
      : 0;
    summary.overallMissRate = resolvedTotal
      ? Number((summary.missed / resolvedTotal).toFixed(3))
      : 0;

    const repeatOffenders = users.filter((u) => u.flags.includes('repeat_offender'));
    const proxySuspects = users
      .filter((u) => u.markedAfterMissCount > 0)
      .sort((a, b) => b.markedAfterMissCount - a.markedAfterMissCount);

    const trend = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

    // Newest session first; resolved = responded + missed (response rate base).
    const rounds = [...byRound.values()]
      .map((r) => {
        const resolved = r.responded + r.missed;
        return { ...r, responseRate: resolved ? Number((r.responded / resolved).toFixed(3)) : 0 };
      })
      .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));

    return {
      success: true,
      summary,
      users,
      repeatOffenders,
      proxySuspects,
      trend,
      rounds,
      thresholds: { missRateThreshold, minIssued },
    };
  }

  // ---- 5. one person's drill-down -------------------------------------------

  /**
   * One staff member's full spot-check history + stats, for the Admin/HOD
   * drill-down. Mirrors the per-user math in getAnalytics() but returns every
   * individual check (newest first) so the report can render the timeline.
   * @param {String} organizationId
   * @param {String} studentId
   * @param {Object} opts { from, to } ISO date range (default: last 30 days)
   */
  async getStudentHistory(organizationId, studentId, opts = {}) {
    if (!mongoose.isValidObjectId(studentId)) {
      return { success: false, error: 'Invalid staff id' };
    }
    const to = opts.to ? parseTo(opts.to) : new Date();
    const from = opts.from
      ? parseFrom(opts.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const orgId = new mongoose.Types.ObjectId(organizationId);
    const sid = new mongoose.Types.ObjectId(studentId);

    const student = await Student.findOne({ _id: sid, organization: orgId })
      .select('_id fullName uid department class')
      .lean();
    if (!student) return { success: false, error: 'Staff member not found' };

    const now = new Date();
    const docs = await SpotCheck.find({
      organization: orgId,
      student: sid,
      issuedAt: { $gte: from, $lte: to },
    })
      .sort({ issuedAt: -1 }) // newest first for display
      .select(
        'roundId issuedAt expiresAt respondedAt status responseLatencyMs markedAfterMiss hadAttendanceThatDay reason triggeredBy windowMinutes faceVerified'
      )
      .lean();

    // Normalise: a still-"pending" check whose window elapsed reads as a miss.
    const timeline = docs.map((d) => {
      let status = d.status;
      if (status === 'pending' && d.expiresAt && new Date(d.expiresAt) < now) status = 'missed';
      return {
        id: String(d._id),
        roundId: d.roundId,
        issuedAt: d.issuedAt,
        expiresAt: d.expiresAt,
        respondedAt: d.respondedAt || null,
        status, // 'pending' | 'responded' | 'missed'
        responseSec: d.responseLatencyMs != null ? Math.round(d.responseLatencyMs / 1000) : null,
        markedAfterMiss: !!d.markedAfterMiss,
        hadAttendanceThatDay: !!d.hadAttendanceThatDay,
        reason: d.reason || null,
        triggeredBy: d.triggeredBy || null,
        windowMinutes: d.windowMinutes || null,
        faceVerified: !!d.faceVerified,
      };
    });

    // Stats over the normalised timeline (so they match the report row).
    const responded = timeline.filter((t) => t.status === 'responded').length;
    const missed = timeline.filter((t) => t.status === 'missed').length;
    const pending = timeline.filter((t) => t.status === 'pending').length;
    const resolved = responded + missed;
    const markedAfterMissCount = timeline.filter(
      (t) => t.status === 'missed' && t.markedAfterMiss
    ).length;

    // Streaks (timeline is newest-first). Current = leading run of misses,
    // ignoring still-open pendings; longest = the worst run anywhere in range.
    let currentMissStreak = 0;
    let longestMissStreak = 0;
    let run = 0;
    let leading = true;
    for (const t of timeline) {
      if (t.status === 'pending') continue;
      if (t.status === 'missed') {
        run += 1;
        longestMissStreak = Math.max(longestMissStreak, run);
        if (leading) currentMissStreak += 1;
      } else {
        run = 0;
        leading = false;
      }
    }

    const latencies = timeline
      .filter((t) => t.status === 'responded' && t.responseSec != null)
      .map((t) => t.responseSec);
    const avgResponseSec = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

    const lastResponded = timeline.find((t) => t.status === 'responded');
    const lastMissed = timeline.find((t) => t.status === 'missed');

    return {
      success: true,
      student: {
        id: String(student._id),
        name: student.fullName || 'Unknown',
        uid: student.uid || null,
        department: student.department || null,
        class: student.class || null,
      },
      range: { from, to },
      stats: {
        totalIssued: timeline.length,
        responded,
        missed,
        pending,
        responseRate: resolved ? Number((responded / resolved).toFixed(3)) : 0,
        missRate: resolved ? Number((missed / resolved).toFixed(3)) : 0,
        currentMissStreak,
        longestMissStreak,
        avgResponseSec,
        markedAfterMissCount,
        lastRespondedAt: lastResponded ? lastResponded.issuedAt : null,
        lastMissedAt: lastMissed ? lastMissed.issuedAt : null,
      },
      timeline,
    };
  }

  // ---- daily auto-scheduling -------------------------------------------------

  /**
   * Plan today's random spot-check rounds for every active organization.
   *
   * Fires exactly ONE round per configured `roundWindows` entry, at a random
   * minute inside that specific window — e.g. one random pick somewhere in
   * 11:00–13:00 (first half) AND a separate random pick somewhere in
   * 14:25–17:25 (second half), instead of 2 picks spread uniformly across the
   * whole 10am–5pm day (which could, by chance, land both in the morning).
   * Called once per day by the cron service (and on boot for the rest of
   * today). Uses in-process timers — fine for a single backend; for multi-node
   * deployments move this to a durable queue (see SAACMS_MASTER_PLAN.md §9).
   */
  async planDailyRounds(opts = {}) {
    const {
      // Each window is {startMinute, endMinute} — minutes since midnight.
      // Default: one random pick in 11:00–13:00, one in 14:25–17:15.
      roundWindows = [
        { startMinute: 11 * 60, endMinute: 13 * 60 },
        { startMinute: 14 * 60 + 25, endMinute: 17 * 60 + 15 },
      ],
      windowMinutes = 15,
      sampleFraction = 1, // 1 = everyone present; <1 = random subset
    } = opts;

    // Clear any timers from a previous plan.
    this.clearDailyTimers();

    const Organization = require('../models/Organization');
    const orgs = await Organization.find({ isActive: true }).select('_id name');
    if (!orgs.length) return { planned: 0 };

    const now = new Date();
    let planned = 0;

    for (const org of orgs) {
      // Which windows have already fired an 'auto' round for THIS org TODAY —
      // planDailyRounds() runs both on the 9am cron AND on every server boot
      // (nodemon restarts on every file save in dev, or any prod redeploy).
      // Only checking "has this window's randomly-picked TIME already passed"
      // (the `delay <= 0` guard below) is not enough: a restart mid-window
      // recomputes a BRAND NEW random minute inside that same window, which
      // hasn't passed yet relative to the new restart time, and schedules a
      // SECOND round for a window that already fired earlier that day —
      // exactly the "3 auto rounds in one day, two crammed into the same
      // afternoon window" bug this fixes. Skip any window whose range
      // already has an auto round issued today, regardless of restarts.
      const { start: dayStart, end: dayEnd } = this._dayBounds(now);
      const todaysAutoRounds = await SpotCheck.find({
        organization: org._id,
        triggeredBy: 'auto',
        issuedAt: { $gte: dayStart, $lt: dayEnd },
      }).select('issuedAt').lean();
      const alreadyFiredWindow = (win) =>
        todaysAutoRounds.some((r) => {
          const mins = this._istParts(r.issuedAt).minutesOfDay;
          return mins >= win.startMinute && mins <= win.endMinute;
        });

      for (const win of roundWindows) {
        if (alreadyFiredWindow(win)) continue; // this window's round already went out today

        // One random minute-of-day (IST) inside THIS SPECIFIC window. Anchored
        // to dayStart (midnight IST, as a correct UTC instant — see
        // _dayBounds/_istParts above) rather than server-local Date field
        // setters, so the round actually fires at the intended IST wall-clock
        // time regardless of the server OS's own timezone.
        const span = Math.max(1, win.endMinute - win.startMinute);
        const minutes = win.startMinute + Math.floor(Math.random() * span);
        const fireAt = new Date(dayStart.getTime() + minutes * 60 * 1000);

        const delay = fireAt.getTime() - now.getTime();
        if (delay <= 0) continue; // this window already passed today

        const timer = setTimeout(async () => {
          try {
            const eligibleCount = await Student.countDocuments({
              organization: org._id,
              isActive: true,
            });
            const sampleSize =
              sampleFraction < 1
                ? Math.max(1, Math.round(eligibleCount * sampleFraction))
                : null;
            await this.issueRound(org._id, {
              windowMinutes,
              sampleSize,
              onlyCheckedIn: true,
              triggeredBy: 'auto',
            });
          } catch (e) {
            console.error('[SpotCheck] Auto round failed:', e.message);
          }
        }, delay);

        this._dailyTimers.push(timer);
        planned += 1;
      }
    }

    console.log(`[SpotCheck] Planned ${planned} auto rounds across ${orgs.length} orgs (${roundWindows.length} window(s)/org)`);
    return { planned, organizations: orgs.length };
  }

  clearDailyTimers() {
    this._dailyTimers.forEach((t) => clearTimeout(t));
    this._dailyTimers = [];
  }
}

module.exports = new SpotCheckService();
