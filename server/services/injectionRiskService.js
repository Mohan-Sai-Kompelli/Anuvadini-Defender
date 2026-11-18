/**
 * InjectionRiskService
 * --------------------
 * Scores a capture's "device & camera attestation" bundle for signs of a
 * camera-injection / virtual-camera / video-replay attack — the next-gen spoof
 * where an attacker feeds a pre-recorded or deepfake video into the camera
 * pipeline instead of the live sensor.
 *
 * The mobile app sends a best-effort `attestation` object (see src/utils/
 * attestation.ts). We never have ground truth, so this returns a RISK SCORE the
 * portal surfaces — flag, don't hard-block, to avoid locking out genuine users.
 *
 * Strongest production signals (Play Integrity verdict, Frida/Xposed hook
 * detection) need native modules + a rebuild; when the app starts sending
 * `playIntegrity` / `hookDetected`, they're scored here automatically.
 */

const EMULATOR_TOKENS = [
  'generic', 'unknown', 'emulator', 'sdk_gphone', 'sdk_google', 'google_sdk',
  'android sdk built for', 'goldfish', 'ranchu', 'vbox', 'genymotion', 'andy',
  'nox', 'bluestacks', 'ttvm', 'droid4x', 'x86',
];

function looksEmulated(att) {
  const hay = [att.fingerprint, att.model, att.brand, att.manufacturer, att.product, att.device, att.hardware, att.board]
    .map((s) => String(s || '').toLowerCase());
  if (att.isEmulator === true || att.isTesting === true) return true;
  return EMULATOR_TOKENS.some((t) => hay.some((h) => h.includes(t)));
}

/**
 * @param {Object|null} att attestation bundle from the device
 * @returns {{score:number, level:string, reasons:string[], signals:Object}}
 */
function score(att) {
  if (!att || typeof att !== 'object') {
    return { score: 0, level: 'unknown', reasons: ['no_attestation'], signals: {} };
  }

  let s = 0;
  const reasons = [];

  // --- device integrity ---
  if (looksEmulated(att)) { s += 70; reasons.push('emulator_or_test_device'); }
  // Native-only signals (scored when present) — SecurityGate.tsx's native
  // SecurityModule.runChecks() (root/hook/adb/dev-options detection) is the
  // only source for these and is currently disabled client-side
  // (SECURITY_GATE_ENABLED=false), so isRooted/hookDetected/canMockLocation/
  // playIntegrity are NOT populated by the app today — these branches stay
  // dormant until that changes. Do not rely on them until the app sends them.
  if (att.hookDetected === true) { s += 80; reasons.push('hooking_framework_detected'); } // Frida/Xposed → camera injection
  if (att.isRooted === true || att.isJailBroken === true) { s += 45; reasons.push('rooted_device'); }
  if (att.canMockLocation === true) { s += 15; reasons.push('mock_location_enabled'); }
  if (att.playIntegrity && att.playIntegrity.verdict && att.playIntegrity.verdict !== 'MEETS_DEVICE_INTEGRITY' && att.playIntegrity.verdict !== 'pass') {
    s += 60; reasons.push('failed_play_integrity');
  }
  // Weak-but-live root/tamper heuristic from Android build props ALREADY sent
  // in every attestation bundle today (Build.TAGS / Build.FINGERPRINT via
  // Platform.constants — see src/utils/attestation.ts) — usable WITHOUT a new
  // APK, unlike the native signals above. "test-keys" means the OS image was
  // signed with a non-Google/OEM key (custom ROM / most root setups); a
  // userdebug/eng build type is a debug image, not a production retail
  // build. Both are classic (imperfect — some legit OEMs ship test-keys)
  // root-detection-library heuristics, kept as a lower weight than the real
  // native isRooted signal for that reason.
  const tagsLower = String(att.tags || '').toLowerCase();
  const fpLower = String(att.fingerprint || '').toLowerCase();
  if (tagsLower.includes('test-keys') || /\/(userdebug|eng)\//.test(fpLower)) {
    s += 30; reasons.push('rooted_device');
  }

  // --- camera hardware ---
  if (att.hasExternalCamera === true) { s += 55; reasons.push('external_or_virtual_camera'); }
  if (att.hasFrontHardwareCamera === false) { s += 30; reasons.push('no_front_hardware_camera'); }
  if (att.cameraCount === 0) { s += 25; reasons.push('no_cameras_enumerated'); }

  // --- frame liveness ---
  // Near-zero frame-to-frame variation over a live challenge ⇒ a frozen still or
  // a very short looped clip (a real sensor always has micro-noise + motion).
  if (typeof att.frameVariance === 'number' && att.frameVariance >= 0 && att.frameVariance < 0.0015) {
    s += 25; reasons.push('static_frames');
  }
  // Perfectly periodic detection timing can indicate an injected, re-clocked feed.
  if (typeof att.frameTimingCv === 'number' && att.frameTimingCv >= 0 && att.frameTimingCv < 0.02) {
    s += 10; reasons.push('unnatural_frame_timing');
  }

  s = Math.min(100, s);
  const level =
    s >= 70 ? 'critical' :
    s >= 40 ? 'high' :
    s >= 20 ? 'medium' :
    reasons.length ? 'low' : 'clean';

  return {
    score: s,
    level,
    reasons,
    signals: {
      emulator: looksEmulated(att),
      externalCamera: att.hasExternalCamera === true,
      rooted: att.isRooted === true || att.isJailBroken === true || tagsLower.includes('test-keys') || /\/(userdebug|eng)\//.test(fpLower),
      hooked: att.hookDetected === true,
    },
  };
}

/** Convenience: is a scored verdict worth flagging to an admin? */
const isFlagged = (verdict) => verdict && (verdict.level === 'high' || verdict.level === 'critical');

module.exports = { score, isFlagged };
