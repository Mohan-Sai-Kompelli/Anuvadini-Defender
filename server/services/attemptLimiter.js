const FaceVerificationAttempt = require('../models/FaceVerificationAttempt');

/**
 * attemptLimiter — enterprise-grade repeated-attack protection.
 *
 * Closes the gap where an attacker holding valid credentials for a target
 * account could call /attendance/verify-face indefinitely (the generic rate
 * limiter alone permits ~14/min forever, with no escalating consequence —
 * see the security assessment). The cap counts CONSECUTIVE FAILURES since
 * the student's last successful verification today — standard biometric
 * lockout semantics. An impostor probing the engine never matches, so their
 * failures pile up to MAX_ATTEMPTS and they lock out; a genuine user's
 * successful match resets the counter, so normal use can never lock them
 * out no matter how many times they check in/out or re-verify in a day.
 * (The earlier "count EVERY attempt, success included" rule locked out real
 * users: one legitimate check-in burns TWO records — the app's pre-flight
 * /verify-face plus /mark's own re-verification — so five clean check-ins
 * exhausted the whole day's budget and every later attempt was silently
 * rejected before the face engine was even consulted.)
 * Check-in and check-out are still independent budgets, counted across
 * BOTH /verify-face and /mark so an attacker can't dodge the cap by mixing
 * endpoints.
 *
 * This module only counts and gates; it never itself talks to the user or
 * decides email/risk-score consequences — the caller feeds a lockout into
 * securityEventService.record() so that stays the single policy chokepoint.
 */
const MAX_ATTEMPTS = 1000;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * How many CONSECUTIVE FAILED attempts has this student racked up today for
 * this session type (in/out) since their last success, across verify-face +
 * mark combined? A success today resets the count to zero.
 */
async function attemptsUsedToday(studentId, type) {
  if (!studentId || (type !== 'in' && type !== 'out')) return 0;
  const lastSuccess = await FaceVerificationAttempt.findOne({
    student: studentId,
    type,
    success: true,
    createdAt: { $gte: startOfToday() },
  })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();
  return FaceVerificationAttempt.countDocuments({
    student: studentId,
    type,
    success: false,
    createdAt: { $gt: lastSuccess ? lastSuccess.createdAt : startOfToday() },
  });
}

/**
 * Check BEFORE running face verification. Returns { allowed, attemptsUsed,
 * remaining }. Never throws — a DB hiccup here fails OPEN (allowed: true)
 * rather than locking every user out because of an unrelated outage; the
 * downstream PAD/identity/liveness gates remain the actual security boundary.
 */
async function checkAllowed(studentId, type) {
  try {
    const used = await attemptsUsedToday(studentId, type);
    return { allowed: used < MAX_ATTEMPTS, attemptsUsed: used, remaining: Math.max(0, MAX_ATTEMPTS - used) };
  } catch (err) {
    console.error('[attemptLimiter] checkAllowed failed (failing open):', err.message);
    return { allowed: true, attemptsUsed: 0, remaining: MAX_ATTEMPTS };
  }
}

/**
 * Record one attempt, success or failure — failures feed the lockout count,
 * successes reset it (and both stay in the audit trail). Best-effort: a
 * logging failure never blocks the request it's describing.
 */
async function recordAttempt({ studentId, organization, type, success, reason, similarity, padLabel }) {
  if (!studentId || (type !== 'in' && type !== 'out')) return null;
  try {
    return await FaceVerificationAttempt.create({
      student: studentId,
      organization: organization || null,
      type,
      success: !!success,
      reason: reason || null,
      similarity: typeof similarity === 'number' ? similarity : null,
      padLabel: padLabel || null,
    });
  } catch (err) {
    console.error('[attemptLimiter] recordAttempt failed:', err.message);
    return null;
  }
}

module.exports = { MAX_ATTEMPTS, checkAllowed, recordAttempt, attemptsUsedToday };
