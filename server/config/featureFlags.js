/**
 * Central feature flags for SAACMS security rollout.
 *
 * Every fraud-relevant control ships behind a flag so it can go
 *   off -> shadow (compute + log, don't block) -> enforce (block)
 * per the staged rollout in SAACMS_MASTER_PLAN.md §6.
 *
 * Override any flag with an env var of the same name (e.g. FACE_VERIFY_MODE=enforce).
 */

function mode(envVar, fallback) {
  const v = (process.env[envVar] || '').toLowerCase();
  return ['off', 'shadow', 'enforce'].includes(v) ? v : fallback;
}

function bool(envVar, fallback) {
  if (process.env[envVar] == null) return fallback;
  return String(process.env[envVar]).toLowerCase() === 'true';
}

module.exports = {
  // Server-side face verification at attendance-mark time.
  //   off     -> legacy behaviour (faceVerified = !!faceImage)   [INSECURE]
  //   shadow  -> call the face service, log + store the score, but never block
  //   enforce -> reject the mark when the face does not match
  faceVerify: {
    // Identity verification is never optional for attendance. Keeping this
    // enforce-only closes the env/config bypass where a bare uploaded image
    // could be treated as a valid face mark.
    mode: 'enforce',
    // When the face service is unreachable in `enforce` mode: block (true) or
    // let the mark through with a flag (false).
    failClosedOnError: bool('FACE_VERIFY_FAIL_CLOSED', true),
  },

  // Active liveness challenge (server-issued nonce + randomized action sequence).
  //   off     -> not required
  //   shadow  -> adjudicate + store verdict, but never block
  //   enforce -> reject the mark without a valid, passing liveness submission
  liveness: {
    // A recorded video or virtual camera must never reach attendance. Liveness
    // therefore cannot be downgraded to shadow/off for this action.
    mode: 'enforce',
  },

  // Require an organization password on login. Default ON (the check was
  // previously commented out — a real auth bypass). Set ALLOW_PASSWORDLESS_ORG_LOGIN=true
  // only as a temporary escape hatch for legacy accounts with no password set.
  orgPasswordRequired: bool('ORG_PASSWORD_REQUIRED', true),
  allowPasswordlessOrgLogin: bool('ALLOW_PASSWORDLESS_ORG_LOGIN', false),

  // Global cap on how aggressively the silent fraud-detection pipeline reacts,
  // WITHOUT touching any detector (PAD, liveness, attempt-limiter, injection
  // risk). Every detector always writes a SecurityEvent (see
  // services/securityEventService.js) regardless of this setting — this only
  // controls how far the CONSEQUENCE escalates:
  //   monitor  -> record only, never blocks, never notifies admin in real time
  //   warn     -> record + bump risk score, never blocks, never notifies
  //   escalate -> record + bump risk score + notify super admin, never blocks
  //   block    -> record + bump risk score + notify + actually reject the
  //               request (the production default — matches current behavior
  //               for a confirmed spoof / liveness failure / lockout)
  // A detector's OWN natural severity can only ever be capped DOWN by this
  // mode, never escalated past what the detector itself asked for — e.g. a
  // borderline/uncertain verdict never blocks even in 'block' mode.
  fraudMonitoring: {
    mode: (() => {
      const v = (process.env.FRAUD_MONITORING_MODE || '').toLowerCase();
      return ['monitor', 'warn', 'escalate', 'block'].includes(v) ? v : 'block';
    })(),
  },
};
