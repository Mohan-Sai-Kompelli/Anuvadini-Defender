const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('../middleware/rateLimit');
const BlockedDevice = require('../models/BlockedDevice');
const Student = require('../models/Student');
const audit = require('../services/auditService');

const router = express.Router();

// Best-source public IP for the request (behind a proxy, trust x-forwarded-for's
// first hop; otherwise the socket address). Strips an IPv6-mapped IPv4 prefix.
function clientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = xff || req.ip || req.connection?.remoteAddress || '';
  return ip.replace(/^::ffff:/, '');
}

// @route   POST /api/device-security/blocked
// @desc    The mobile security gate reports a BLOCKED device. Auth is OPTIONAL —
//          the gate can fire before login — so we decode the token best-effort to
//          attach the employee, but never reject an unauthenticated report (we'd
//          otherwise lose visibility into exactly the devices we most want to see).
// @access  Public (rate-limited); token used opportunistically
router.post(
  '/blocked',
  rateLimit({ windowMs: 60 * 1000, max: 30 }),
  async (req, res) => {
    try {
      const {
        deviceId,
        deviceName,
        osVersion,
        platform,
        reasons,
        blockedBecause,
        riskScore,
        timestamp,
        signals,
      } = req.body || {};

      // Opportunistically identify the employee from the auth token.
      let student = null;
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded?.id) {
            student = await Student.findById(decoded.id).select('uid fullName organization').lean();
          }
        } catch {
          /* invalid/expired token → still record the block, just anonymously */
        }
      }

      // The security gate runs BEFORE login — a device that fails the check
      // (Developer Options / USB debugging permanently enabled) blocks the
      // user every single launch, before they can ever complete a login and
      // get a token. That made almost every row in the "Blocked Devices"
      // report show "—" for employee, even for devices used daily by the
      // same person. Fall back to matching this deviceId against whichever
      // student last logged in FROM it (recorded on every successful login/
      // mark elsewhere) — best-effort, but far better than always blank.
      if (!student && deviceId) {
        student = await Student.findOne({ lastKnownDeviceId: deviceId })
          .select('uid fullName organization')
          .sort({ lastLoginAt: -1 })
          .lean();
      }

      const doc = await BlockedDevice.create({
        student: student?._id || null,
        organization: student?.organization || null,
        employeeId: student?.uid || '',
        employeeName: student?.fullName || '',
        deviceId: deviceId || 'unknown',
        deviceName: deviceName || '',
        osVersion: osVersion || '',
        platform: platform || 'android',
        publicIp: clientIp(req),
        reasons: Array.isArray(reasons) ? reasons : [],
        blockedBecause: Array.isArray(blockedBecause) ? blockedBecause : [],
        riskScore: Number(riskScore) || 0,
        signals: signals || {},
        reportedAt: timestamp ? new Date(timestamp) : new Date(),
      });

      // Tamper-evident audit trail (same service the rest of the app uses).
      try {
        audit.log(
          audit.fromReq(req, {
            action: 'security.device_blocked',
            outcome: 'failure',
            targetType: 'device',
            targetId: doc.deviceId,
            metadata: {
              employeeId: doc.employeeId || null,
              reasons: doc.reasons,
              riskScore: doc.riskScore,
              publicIp: doc.publicIp,
            },
          })
        );
      } catch {
        /* audit is best-effort */
      }

      return res.status(201).json({ success: true, id: doc._id });
    } catch (err) {
      console.error('[device-security/blocked]', err);
      return res.status(500).json({ success: false, error: 'Failed to record block event' });
    }
  }
);

module.exports = router;
