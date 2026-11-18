// Concurrent-session cap for ADMIN-type accounts (super admin, Admin/
// organization admin, HOD, and any future administrative role): at most
// MAX_ACTIVE_SESSIONS devices may hold an active dashboard session at once.
//
// How it plugs into the EXISTING stateless-JWT auth without redesigning it:
//   • Admin logins keep issuing the same JWTs, now with one extra claim: `sid`
//     (a random session id) that maps to an AdminSession row.
//   • createSession() checks how many sessions for this account are already
//     active; if that's already at the cap, it terminates the OLDEST one(s)
//     (by loginAt) first, so the account never holds more than
//     MAX_ACTIVE_SESSIONS active rows at once.
//   • The auth middlewares call requireActiveSession() after verifying the
//     JWT: a valid signature is no longer sufficient for admin tokens — the
//     sid must also be an ACTIVE session. A session terminated to make room
//     for a newer login answers 401 with code 'session_terminated' so that
//     device can show the "logged in on another device" message and return
//     to Login.
//   • Faculty and student tokens carry NO sid and are never checked — their
//     flow (mobile attendance included) is byte-for-byte what it was.
//
// Terminated rows double as the session history (login/logout time, device,
// IP, duration, reason) served to the super admin.

const crypto = require('crypto');
const AdminSession = require('../models/AdminSession');
const AuthControl = require('../models/AuthControl');
const audit = require('./auditService');

// ---- Log out everyone -------------------------------------------------------
// The super admin can end every login at once. Admin sessions are closed in
// AdminSession, and a cutoff time is stored: any token issued before it is
// rejected (this also covers mobile-app logins, which carry no session id).
// Defender PC agent tokens are exempt, so PCs stay paired.
const LOGOUT_ALL_KEY = 'logout_all';
const CUTOFF_CACHE_MS = 10 * 1000;
let cutoffCache = { at: 0, value: null };

async function logoutAllCutoff() {
  if (Date.now() - cutoffCache.at < CUTOFF_CACHE_MS) return cutoffCache.value;
  const row = await AuthControl.findOne({ key: LOGOUT_ALL_KEY }).lean();
  cutoffCache = { at: Date.now(), value: row ? new Date(row.at).getTime() : null };
  return cutoffCache.value;
}

/** True when this token was issued before the last "log out everyone". */
async function isLoggedOutEveryone(decoded) {
  if (!decoded || decoded.kind === 'defender-agent') return false;
  const cutoff = await logoutAllCutoff();
  if (!cutoff) return false;
  if (!decoded.iat) return true;
  return decoded.iat * 1000 < cutoff;
}

/** End every active login (admin sessions + all older tokens). */
async function logoutEveryone() {
  const now = new Date();
  await AuthControl.updateOne(
    { key: LOGOUT_ALL_KEY },
    { $set: { at: now } },
    { upsert: true }
  );
  cutoffCache = { at: 0, value: null };
  const r = await AdminSession.updateMany(
    { active: true },
    { $set: { active: false, logoutAt: now, logoutReason: 'logged_out_by_admin' } }
  );
  return { at: now, endedAdminSessions: r.modifiedCount || 0 };
}

// How many devices may hold an active session at once per admin account.
// Overrideable only for ops tuning — do not raise ad-hoc without weighing the
// security tradeoff (more concurrent sessions = more standing attack surface
// if one device's token leaks).
const MAX_ACTIVE_SESSIONS = Math.max(1, parseInt(process.env.ADMIN_MAX_SESSIONS || '2', 10));

// Message shown on the device that lost its session to make room for a newer login.
const TERMINATED_MESSAGE =
  'Your account has been logged in on another device. For security reasons, this session has been terminated.';

// Roles exempt from the concurrent-session cap. Any OTHER role that reaches an
// admin login surface (hod today; nodal officers etc. tomorrow) is enforced.
const NON_ADMIN_ROLES = new Set(['faculty', 'staff', 'student']);
const isAdminRole = (role) => !NON_ADMIN_ROLES.has(String(role || 'faculty').toLowerCase());

// Sessions older than the JWT lifetime can never present a valid token again;
// close them lazily so they don't linger "active" in the history forever.
function jwtLifetimeMs() {
  const raw = String(process.env.JWT_EXPIRE || '7d');
  const m = raw.match(/^(\d+)([smhd])$/);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
  return parseInt(m[1], 10) * mult;
}

// Don't write lastActivityAt on every request — once a minute is plenty.
const ACTIVITY_TOUCH_MS = 60 * 1000;

/**
 * Open a new session for an admin account, keeping at most MAX_ACTIVE_SESSIONS
 * active at once — if the account is already at the cap, the OLDEST active
 * session(s) are terminated first ('logged_in_another_device') to make room.
 * Returns the sessionId to embed in the JWT as `sid`. Throws only on DB
 * failure — callers decide whether a login without a session row is
 * acceptable (it is not; let it 500).
 */
async function createSession({ userKey, userType, role, userLabel, organization = null, ip = null, deviceInfo = null }) {
  const now = new Date();

  // Oldest-first: whichever device has been active longest without a newer
  // login loses its seat when a new one arrives at the cap.
  const activeSessions = await AdminSession.find({ userKey: String(userKey), active: true })
    .sort({ loginAt: 1 })
    .select('_id');

  const seatsToFree = activeSessions.length - (MAX_ACTIVE_SESSIONS - 1);
  if (seatsToFree > 0) {
    const idsToKick = activeSessions.slice(0, seatsToFree).map((s) => s._id);
    const kicked = await AdminSession.updateMany(
      { _id: { $in: idsToKick }, active: true },
      { $set: { active: false, logoutAt: now, logoutReason: 'logged_in_another_device' } }
    );
    if (kicked.modifiedCount > 0) {
      audit.log({
        organization,
        actorType: userType === 'employee' ? 'student' : userType === 'organization' ? 'organization' : 'system',
        actor: /^[0-9a-fA-F]{24}$/.test(String(userKey)) ? userKey : null,
        actorLabel: userLabel,
        action: 'session.terminated_by_new_login',
        outcome: 'flagged',
        targetType: 'auth',
        ip,
        metadata: { userKey: String(userKey), role, terminatedSessions: kicked.modifiedCount, maxActiveSessions: MAX_ACTIVE_SESSIONS },
      });
    }
  }

  const sessionId = crypto.randomUUID();
  await AdminSession.create({
    sessionId,
    userKey: String(userKey),
    userType,
    role: role || null,
    userLabel: userLabel || null,
    organization,
    ip,
    deviceInfo,
    loginAt: now,
    lastActivityAt: now,
    active: true,
  });
  return sessionId;
}

/**
 * Validate the `sid` claim of an admin token on a protected request.
 * Returns null when the session is active, else a ready-to-send 401 body:
 *   { code: 'session_terminated' | 'session_expired' | 'session_required', message }
 *
 * @param {object} decoded  verified JWT payload
 * @param {object} [opts]
 * @param {boolean} [opts.requireSid=true]  reject admin tokens minted before
 *   this feature (no sid) — they cannot be remotely invalidated, so letting
 *   them through would be a standing bypass. The owner just logs in again.
 */
async function requireActiveSession(decoded, { requireSid = true } = {}) {
  const sid = decoded && decoded.sid;
  if (!sid) {
    if (!requireSid) return null;
    return {
      code: 'session_required',
      message: 'Your session has expired. Please log in again.',
    };
  }

  const session = await AdminSession.findOne({ sessionId: sid });
  if (!session) {
    return { code: 'session_expired', message: 'Your session has expired. Please log in again.' };
  }

  if (session.active) {
    // A token can outlive nothing: past the JWT lifetime the signature check
    // upstream already failed, but close the row if we ever see it stale.
    if (Date.now() - session.loginAt.getTime() > jwtLifetimeMs()) {
      await AdminSession.updateOne(
        { _id: session._id, active: true },
        { $set: { active: false, logoutAt: new Date(), logoutReason: 'token_expired' } }
      );
      return { code: 'session_expired', message: 'Your session has expired. Please log in again.' };
    }
    if (Date.now() - session.lastActivityAt.getTime() > ACTIVITY_TOUCH_MS) {
      AdminSession.updateOne({ _id: session._id }, { $set: { lastActivityAt: new Date() } }).catch(() => {});
    }
    return null;
  }

  // Session was ended. A newer login gets the explicit security message; every
  // other reason reads as an ordinary expiry.
  if (session.logoutReason === 'logged_in_another_device') {
    return { code: 'session_terminated', message: TERMINATED_MESSAGE };
  }
  return { code: 'session_expired', message: 'Your session has expired. Please log in again.' };
}

/** Convenience: run requireActiveSession and answer the 401 when it fails. */
async function enforceOrReject(decoded, res, opts) {
  const err = await requireActiveSession(decoded, opts);
  if (!err) return true;
  res.status(401).json({ success: false, ...err });
  return false;
}

/** Close a session explicitly (manual logout, admin action). Idempotent. */
async function endSession(sessionId, reason = 'manual_logout') {
  if (!sessionId) return false;
  const r = await AdminSession.updateOne(
    { sessionId, active: true },
    { $set: { active: false, logoutAt: new Date(), logoutReason: reason } }
  );
  return r.modifiedCount > 0;
}

module.exports = {
  createSession,
  requireActiveSession,
  enforceOrReject,
  endSession,
  isLoggedOutEveryone,
  logoutEveryone,
  LOGGED_OUT_EVERYONE_MESSAGE: 'You have been logged out by an administrator. Please log in again.',
  isAdminRole,
  TERMINATED_MESSAGE,
  MAX_ACTIVE_SESSIONS,
};
