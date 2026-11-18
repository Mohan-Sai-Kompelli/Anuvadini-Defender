const express = require('express');
const passport = require('passport');
const router = express.Router();

const Student = require('../models/Student');
const LiveLocation = require('../models/LiveLocation');
const workingHoursService = require('../services/workingHoursService');
const locationTrackingService = require('../services/locationTrackingService');

const jwtAuth = passport.authenticate('jwt', { session: false });

// Resolve the org + department for the authenticated student. passport-jwt
// returns the full Student document, but fall back to a lookup if a slim token
// strategy ever changes that.
async function actorContext(req) {
  let orgId = req.user && req.user.organization;
  let department = (req.user && req.user.department) || '';
  if (!orgId) {
    const s = await Student.findById(req.user._id).select('organization department');
    orgId = s && s.organization;
    department = (s && s.department) || '';
  }
  return { orgId, department };
}

// @route   POST /api/student/live-location
// @desc    Push the latest GPS fix while a tracking window is active. Called
//          every ~15s by the mobile app. Upserts the single live-location doc.
//          Optional body flag `isVerification: true` marks this as a hard-refresh
//          confirmation ping (requested by the server on a suspicious outside fix).
// @access  Private (Student)
router.post('/live-location', jwtAuth, async (req, res) => {
  try {
    const { latitude, longitude, accuracy, heading, speed, isVerification } = req.body || {};
    console.log(`[PING] user=${req.user?._id} lat=${latitude} lon=${longitude} acc=${accuracy} ver=${isVerification} at=${new Date().toISOString()}`);
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ success: false, error: 'latitude and longitude are required' });
    }

    const result = await locationTrackingService.recordPing({
      studentId: req.user._id,
      latitude,
      longitude,
      accuracy,
      heading,
      speed,
      isVerification: isVerification === true,
    });

    // needsVerification: true tells the app to immediately take a fresh GPS
    // fix (maximumAge:0) and POST it back with isVerification:true.
    res.json({
      success: true,
      discarded: result.discarded || false,
      insidePremises: result.insidePremises,
      events: result.events,
      needsVerification: result.needsVerification || false,
      exitVerifyCount: result.exitVerifyCount || 0,
    });
  } catch (error) {
    console.error('[LiveLocation] update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update live location' });
  }
});

// @route   POST /api/student/live-location/share
// @desc    Start a tracking window. Used both by the manual "share live
//          location" flow and as a generic session opener. Computes an auto-stop
//          time from the org working hours (or the requested duration).
// @access  Private (Student)
router.post('/live-location/share', jwtAuth, async (req, res) => {
  try {
    console.log(`[SHARE] user=${req.user?._id} body=${JSON.stringify(req.body)} at=${new Date().toISOString()}`);
    const { durationMinutes } = req.body || {};
    const { orgId, department } = await actorContext(req);
    const now = new Date();

    let trackUntil;
    if (typeof durationMinutes === 'number' && durationMinutes > 0) {
      trackUntil = new Date(now.getTime() + durationMinutes * 60 * 1000);
    } else {
      // Fall back to the working-hours window so a share lasts the rest of the day.
      try {
        const Organization = require('../models/Organization');
        const org = await Organization.findById(orgId).select('workingHours');
        trackUntil = workingHoursService.trackUntil(org && org.workingHours, now).trackUntil;
      } catch (_) {
        trackUntil = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      }
    }

    await LiveLocation.findOneAndUpdate(
      { student: req.user._id },
      {
        $set: {
          organization: orgId,
          department,
          active: true,
          startedAt: now,
          stoppedAt: null,
          trackUntil,
          lastStatus: 'tracking',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: { trackUntil: trackUntil.toISOString() } });
  } catch (error) {
    console.error('[LiveLocation] share start error:', error);
    res.status(500).json({ success: false, error: 'Failed to start live location share' });
  }
});

// @route   POST /api/student/live-location/stop
// @desc    Stop the active tracking window.
// @access  Private (Student)
router.post('/live-location/stop', jwtAuth, async (req, res) => {
  try {
    await LiveLocation.findOneAndUpdate(
      { student: req.user._id },
      { $set: { active: false, stoppedAt: new Date(), lastStatus: 'stopped' } }
    );
    // Reset Kalman state so next check-in starts a fresh filter.
    const kalmanFilter = require('../utils/kalmanFilter');
    kalmanFilter.reset(req.user._id);
    res.json({ success: true });
  } catch (error) {
    console.error('[LiveLocation] stop error:', error);
    res.status(500).json({ success: false, error: 'Failed to stop live location' });
  }
});

// @route   POST /api/student/location-status
// @desc    Report a tracking status change ('stopped' | 'logged_out' | 'live').
//          Logout/stop deactivate the live point so it drops off the map.
// @access  Private (Student)
router.post('/location-status', jwtAuth, async (req, res) => {
  try {
    const { status } = req.body || {};
    const deactivate = status === 'stopped' || status === 'logged_out' || status === 'offline';
    const update = { lastStatus: String(status || '') };
    if (deactivate) {
      update.active = false;
      update.stoppedAt = new Date();
    } else if (status === 'live') {
      update.active = true;
    }

    await LiveLocation.findOneAndUpdate(
      { student: req.user._id },
      { $set: update }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[LiveLocation] status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update location status' });
  }
});

module.exports = router;
