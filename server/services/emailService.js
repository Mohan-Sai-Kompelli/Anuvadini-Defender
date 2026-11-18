const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

/**
 * emailService
 * ------------
 * Outbound email for SAACMS, reusing the Anuvadini contact-server's transport
 * config (same env vars): SMTP via nodemailer is preferred, with an optional
 * SendGrid SDK fallback. Everything is best-effort — a missing/broken transport
 * never throws into the request that triggered the mail (callers fire-and-forget).
 *
 * Env (set on the server, copied from the Anuvadini project's .env):
 *   SMTP_HOST, SMTP_PORT(=587), SMTP_SECURE(true|tls), SMTP_USER(=apikey), SMTP_PASS
 *   — OR — SENDGRID_API_KEY
 *   EMAIL_FROM_ADDRESS (default ops@example.org), EMAIL_FROM_NAME
 *   SPOOF_ALERT_TO (default ops@example.org)  ← who gets the fake-attendance alert
 */

// Optional SendGrid SDK — only used if installed AND SENDGRID_API_KEY is set.
// The SMTP (nodemailer) path already covers SendGrid-over-SMTP, so this is a pure
// fallback and is required lazily so a missing package never breaks the server.
let sgMail = null;
try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (_e) {
  sgMail = null;
}

const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'ops@example.org';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Anuvadini Attendance';
const FROM = `${FROM_NAME} <${FROM_ADDRESS}>`;
const SPOOF_ALERT_TO = process.env.SPOOF_ALERT_TO || 'ops@example.org';

// Build the SMTP transporter once (when configured). Mirrors the Anuvadini code.
let smtpTransporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_PASS) {
  try {
    smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER || 'apikey',
        pass: process.env.SMTP_PASS,
      },
      requireTLS: process.env.SMTP_SECURE === 'tls' || process.env.SMTP_SECURE === 'true',
    });
    smtpTransporter
      .verify()
      .then(() => console.log('[email] SMTP transporter ready'))
      .catch((err) => console.warn('[email] SMTP verify failed (will still attempt sends):', err.message));
  } catch (e) {
    console.warn('[email] failed to configure SMTP transporter:', e.message);
    smtpTransporter = null;
  }
}

function isConfigured() {
  return !!smtpTransporter || !!(sgMail && process.env.SENDGRID_API_KEY);
}

// ---------------------------------------------------------------------------
// Shared branding — every outbound email embeds the SAME app logo (the mobile
// app's splash-screen image, src/assets/anuvadini_logo.png) via a CID attachment,
// and wraps its body in one consistent card/header/footer shell, so a spoof
// alert, a security alert and a password-reset code all read as coming from
// the same product instead of three differently-styled one-off templates.
// ---------------------------------------------------------------------------
const LOGO_PATH = path.join(__dirname, '../../src/assets/anuvadini_logo.png');
const LOGO_CID = 'anuvadinilogo';

// Read once at module load (a static asset, not something that changes at
// runtime) — best-effort: a missing/unreadable file just means no logo
// attachment is added, never a broken email.
let logoBuffer = null;
try {
  logoBuffer = fs.readFileSync(LOGO_PATH);
} catch (e) {
  console.warn('[email] logo asset not found, emails will render without it:', e.message);
}

function logoAttachment() {
  return logoBuffer
    ? [{ filename: 'anuvadini_logo.png', content: logoBuffer, contentType: 'image/png', cid: LOGO_CID }]
    : [];
}

/**
 * Wrap an email's body HTML in the shared card/header/footer shell.
 * @param {Object} a
 *   accent      header background — a CSS gradient or solid color string
 *   eyebrow     small uppercase label above the title (e.g. "SECURITY ALERT")
 *   title       header title line (with emoji if desired)
 *   subtitle    optional header subtitle line
 *   bodyHtml    the email-specific content (table, OTP box, etc.)
 */
function emailShell({ accent, eyebrow, title, subtitle, bodyHtml }) {
  return `
  <div style="background:#f4f6f5;padding:32px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(8,62,36,0.08);border:1px solid #e5e9e7">
      <div style="background:${accent};padding:28px 24px 24px;text-align:center">
        <div style="display:inline-block;background:#ffffff;border-radius:14px;padding:10px 14px;box-shadow:0 4px 14px rgba(0,0,0,0.12)">
          <img src="cid:${LOGO_CID}" alt="Anuvadini" width="40" height="40" style="display:block;width:40px;height:40px;object-fit:contain" />
        </div>
        ${eyebrow ? `<p style="margin:16px 0 4px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.75)">${eyebrow}</p>` : ''}
        <h1 style="margin:0;font-size:20px;font-weight:800;color:#ffffff;line-height:1.3">${title}</h1>
        ${subtitle ? `<p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85)">${subtitle}</p>` : ''}
      </div>
      <div style="padding:26px 26px 8px">
        ${bodyHtml}
      </div>
      <div style="padding:18px 26px;background:#fafbfa;border-top:1px solid #eef1ef;text-align:center">
        <p style="margin:0;font-size:11.5px;color:#9aa5a0">Anuvadini Attendance &middot; automated message &middot; please do not reply</p>
      </div>
    </div>
  </div>`;
}

const BRAND_GREEN = 'linear-gradient(135deg,#0B5A33 0%,#083E24 100%)';
const ALERT_RED = 'linear-gradient(135deg,#dc2626 0%,#991b1b 100%)';
const ALERT_AMBER = 'linear-gradient(135deg,#d97706 0%,#92400e 100%)';

// Accept a Buffer / base64 / data-URL and return a raw Buffer (for attachments).
function toBuffer(image) {
  if (!image) return null;
  if (Buffer.isBuffer(image)) return image.length ? image : null;
  if (typeof image !== 'string') return null;
  const comma = image.indexOf(',');
  const b64 = image.startsWith('data:') && comma !== -1 ? image.slice(comma + 1) : image;
  try {
    const buf = Buffer.from(b64, 'base64');
    return buf.length ? buf : null;
  } catch (_e) {
    return null;
  }
}

// Send via SMTP (preferred) or the SendGrid SDK. Returns the channel used.
async function sendMail(msg) {
  if (smtpTransporter) {
    await smtpTransporter.sendMail(msg);
    return 'smtp';
  }
  if (sgMail && process.env.SENDGRID_API_KEY) {
    await sgMail.send(msg);
    return 'sendgrid';
  }
  throw new Error('no email transport configured (set SMTP_* or SENDGRID_API_KEY)');
}

const TYPE_LABEL = { in: 'Check-in', out: 'Check-out', checkin: 'Check-in', checkout: 'Check-out', spotcheck: 'Spot-check', class: 'Class' };

// Plain-English translation of the internal reason/signal codes that liveness,
// camera-integrity and quality checks emit, so the alert email says WHY in
// words an admin can act on instead of a raw code. Prefix matches cover the
// per-step liveness codes (e.g. "missing_action_2_blink").
const REASON_LABEL = {
  // Liveness challenge
  nonce_expired: 'The liveness challenge timed out before it was completed',
  nonce_already_used: 'The liveness challenge was reused (possible replay attempt)',
  nonce_student_mismatch: 'The liveness challenge did not belong to this user',
  no_events: 'No liveness actions (blink/turn/nod) were performed',
  insufficient_actions: 'Not all requested liveness actions were completed',
  // Camera / device integrity
  emulator_or_test_device: 'Running on an emulator or test device (not a real phone)',
  hooking_framework_detected: 'A hooking framework (Frida/Xposed) was detected — camera-injection risk',
  rooted_device: 'The device is rooted / jailbroken',
  mock_location_enabled: 'Mock (fake) location is enabled on the device',
  failed_play_integrity: 'Google Play Integrity / device attestation failed',
  external_or_virtual_camera: 'An external or virtual camera was in use (not the built-in camera)',
  no_front_hardware_camera: 'No real front camera was found on the device',
  no_cameras_enumerated: 'No cameras were detected on the device',
  static_frames: 'The camera frames did not change — a still photo or paused video, not a live face',
  unnatural_frame_timing: 'Unnatural camera frame timing (possible injected/looped video)',
  // Capture quality
  too_dark: 'The photo was too dark to judge (poor lighting)',
  too_bright: 'The photo was over-exposed / strongly backlit',
  too_blurry: 'The photo was too blurry (camera shake or out of focus)',
  no_face: 'No face was clearly visible in the frame',
};

// Prefix → template for the per-step liveness codes that carry an index.
const REASON_PREFIX = [
  ['missing_action_', 'A requested action (blink / turn / nod) was not detected'],
  ['wrong_action_', 'A different action was performed than the one asked for'],
  ['weak_', 'A liveness action was too slight to confirm (needs a clearer movement)'],
  ['too_fast_', 'Actions were performed impossibly fast (possible automation)'],
  ['window_exceeded_', 'An action took too long — outside the allowed time window'],
  ['bad_timestamp_', 'The action timing data was invalid'],
];

function humanizeReason(code) {
  if (!code) return null;
  if (REASON_LABEL[code]) return REASON_LABEL[code];
  for (const [prefix, text] of REASON_PREFIX) {
    if (String(code).startsWith(prefix)) return text;
  }
  // Unknown code: show it readably rather than dropping it.
  return String(code).replace(/_/g, ' ');
}

// De-duplicated human reasons from an array of codes.
function humanizeReasons(codes) {
  if (!Array.isArray(codes)) return [];
  const seen = new Set();
  const out = [];
  for (const c of codes) {
    const h = humanizeReason(c);
    if (h && !seen.has(h)) { seen.add(h); out.push(h); }
  }
  return out;
}

/**
 * Alert that a FAKE (phone-screen / photo replay) attendance attempt was caught,
 * with the faculty member's details and the captured evidence image attached.
 *
 * @param {Object} a
 *   student   { fullName/name, uid, designation, department, organization{name} }
 *   type      'in' | 'out' | 'spotcheck' | 'class'
 *   label     'fake'
 *   score     fused real-face probability (low = more fake)
 *   similarity face-match similarity, if any
 *   image     captured frame (Buffer | base64 | data-URL)
 *   latitude, longitude
 */
async function sendSpoofAlert({ student, type, label, score, similarity, image, latitude, longitude, detail } = {}) {
  if (!isConfigured()) {
    console.log('[email] spoof alert skipped — no transport configured');
    return null;
  }
  const name = student?.fullName || student?.name || 'Unknown';
  const uid = student?.uid || '—';
  const institute = student?.organization?.name || student?.organizationName || '—';
  const designation = student?.designation || '—';
  const department = student?.department || '—';
  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const typeLabel = TYPE_LABEL[String(type || '').toLowerCase()] || type || 'Attendance';
  const scorePct = typeof score === 'number' ? `${Math.round((1 - Math.max(0, Math.min(1, score))) * 100)}% fake-confidence (real-score ${score.toFixed(2)})` : '—';
  const loc = latitude != null && longitude != null ? `${latitude}, ${longitude}` : '—';
  const mapLink = latitude != null && longitude != null ? `https://www.google.com/maps?q=${latitude},${longitude}` : null;

  // WHY was this flagged fake — put it in words the admin can judge. Built from
  // the anti-spoof detail the route passes (screen signature vs. face-texture
  // margin), so the alert isn't just a bare "fake" verdict.
  const d = detail || {};
  let whyFake;
  if (d.screenSuspected) {
    whyFake = `A whole-frame screen pattern (moiré) was detected${d.screenMoire != null ? ` — texture ratio ${d.screenMoire}, periodicity ${d.screenPeak}` : ''}: the face was being shown on a phone/monitor screen, not a live person in front of the camera.`;
  } else if (typeof d.margin === 'number') {
    whyFake = `The captured face failed the anti-spoof texture test on every view (real-vs-fake margin ${d.margin.toFixed(2)}; a genuine live face scores clearly positive). This flat, printed/screen-like texture matches a photo or video replay rather than a live 3D face.`;
  } else {
    whyFake = `The anti-spoof model classified the captured frame as a replay (a face on a screen or a printed photo) rather than a live face.`;
  }
  const marginsLine = d.margins && Object.keys(d.margins).length
    ? `Per-view scores: ${Object.entries(d.margins).map(([k, v]) => `${k} ${v}`).join(', ')}`
    : null;

  const buf = toBuffer(image);
  const cid = 'spoofcapture';
  const attachments = buf
    ? [{ filename: `spoof_${uid}_${Date.now()}.jpg`, content: buf, contentType: 'image/jpeg', cid }]
    : [];

  const text =
    `FAKE attendance detected (phone-screen / photo replay).\n\n` +
    `Faculty: ${name}\nID: ${uid}\nDesignation: ${designation}\nDepartment: ${department}\nInstitute: ${institute}\n\n` +
    `Action: ${typeLabel}\nAnti-spoof: ${scorePct}\nFace match similarity: ${similarity != null ? similarity : '—'}\n` +
    `Why flagged: ${whyFake}\n${marginsLine ? marginsLine + '\n' : ''}` +
    `Location: ${loc}${mapLink ? ` (${mapLink})` : ''}\nTime: ${when}\n\n` +
    `The captured evidence image is attached.`;

  const html = emailShell({
    accent: ALERT_RED,
    eyebrow: 'ANTI-SPOOF ALERT',
    title: '⚠️ Fake Attendance Detected',
    subtitle: 'A face replayed on a phone/tablet screen or a printed photo was caught at verification.',
    bodyHtml: `
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#666;width:140px">Faculty</td><td style="padding:6px 0;font-weight:700">${name}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Faculty ID</td><td style="padding:6px 0">${uid}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Designation</td><td style="padding:6px 0">${designation}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Department</td><td style="padding:6px 0">${department}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Institute</td><td style="padding:6px 0">${institute}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Action</td><td style="padding:6px 0">${typeLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Anti-spoof</td><td style="padding:6px 0;color:#dc2626;font-weight:700">${scorePct}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Location</td><td style="padding:6px 0">${mapLink ? `<a href="${mapLink}">${loc}</a>` : loc}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Time</td><td style="padding:6px 0">${when}</td></tr>
        </table>
        <div style="margin-top:14px;padding:12px 14px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px">
          <p style="margin:0 0 4px;font-size:12px;color:#991b1b;font-weight:700;text-transform:uppercase;letter-spacing:.3px">Why flagged as fake</p>
          <p style="margin:0;font-size:13.5px;color:#333;line-height:1.5">${whyFake}</p>
          ${marginsLine ? `<p style="margin:8px 0 0;font-size:12px;color:#888">${marginsLine}</p>` : ''}
        </div>
        ${buf ? `<div style="margin-top:16px;margin-bottom:8px"><p style="font-size:13px;color:#666;margin:0 0 8px">Captured evidence:</p><img src="cid:${cid}" alt="captured face" style="max-width:240px;border-radius:10px;border:2px solid #dc2626"/></div>` : ''}`,
  });

  const msg = {
    to: SPOOF_ALERT_TO,
    from: FROM,
    subject: `⚠️ Fake attendance detected — ${name} (${uid})`,
    text,
    html,
    attachments: [...attachments, ...logoAttachment()],
  };
  const via = await sendMail(msg);
  console.log(`[email] spoof alert sent via ${via} to ${SPOOF_ALERT_TO} for ${name} (${uid})`);
  return via;
}

const CATEGORY_LABEL = {
  enrollment_spoof_suspected: 'Enrollment image flagged as spoof material',
  verification_attempt_lockout: 'Verification attempts exhausted (possible probing)',
  liveness_failed: 'Liveness check failed',
  camera_integrity: 'Camera/device integrity check failed',
  face_mismatch_pattern: 'Possible impersonation — face did not match this account',
  verification_uncertain: 'Borderline anti-spoof verdict',
};

/**
 * Generalized security-event alert — the escalation path for
 * securityEventService.js's 'escalate'/'block' actions, covering categories
 * beyond the confirmed-attendance-spoof case sendSpoofAlert already handles
 * (enrollment screening, attempt lockouts, camera-integrity failures, ...).
 * Reuses the same transport/attachment plumbing as sendSpoofAlert.
 *
 * @param {Object} a
 *   category   SecurityEvent.category
 *   severity   'low'|'medium'|'high'|'critical'
 *   student    { fullName/name, uid, designation, department, organizationName }
 *   summary    short human sentence describing what happened
 *   detection  { faceMatchConfidence, spoofConfidence, spoofLabel, riskScore }
 *   image      optional captured/enrollment evidence (Buffer | base64 | data-URL)
 */
async function sendSecurityAlert({ category, severity, student, summary, detection, image } = {}) {
  if (!isConfigured()) {
    console.log('[email] security alert skipped — no transport configured');
    return null;
  }
  const name = student?.fullName || student?.name || 'Unknown';
  const uid = student?.uid || '—';
  const institute = student?.organization?.name || student?.organizationName || '—';
  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const label = CATEGORY_LABEL[category] || category || 'Security event';

  const buf = toBuffer(image);
  const cid = 'securityevidence';
  const attachments = buf
    ? [{ filename: `security_${uid}_${Date.now()}.jpg`, content: buf, contentType: 'image/jpeg', cid }]
    : [];

  const det = detection || {};
  // Plain-English reasons for WHY this fired (lighting, timing, which liveness
  // action failed, camera-integrity signal, …) — the codes are in
  // det.signals; humanize them so the admin sees the actual cause.
  const reasons = humanizeReasons(det.signals);
  const detLines = [
    det.faceMatchConfidence != null ? `Face match confidence: ${det.faceMatchConfidence}` : null,
    det.spoofConfidence != null ? `Anti-spoof confidence: ${det.spoofConfidence}` : null,
    det.spoofLabel ? `Anti-spoof verdict: ${det.spoofLabel}` : null,
    det.riskScore != null ? `Fused risk score: ${det.riskScore}/100` : null,
  ].filter(Boolean);

  const text =
    `${label} — severity: ${severity || 'medium'}\n\n` +
    `Faculty: ${name}\nID: ${uid}\nInstitute: ${institute}\nTime: ${when}\n\n` +
    `${summary || ''}\n` +
    `${reasons.length ? '\nReason(s):\n' + reasons.map((r) => `  • ${r}`).join('\n') + '\n' : ''}` +
    `${detLines.length ? '\n' + detLines.join('\n') : ''}`;

  const html = emailShell({
    accent: ALERT_AMBER,
    eyebrow: `SEVERITY: ${(severity || 'medium').toUpperCase()}`,
    title: `🔒 ${label}`,
    subtitle: 'Visible to Super Admin only',
    bodyHtml: `
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#666;width:140px">Faculty</td><td style="padding:6px 0;font-weight:700">${name}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Faculty ID</td><td style="padding:6px 0">${uid}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Institute</td><td style="padding:6px 0">${institute}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Time</td><td style="padding:6px 0">${when}</td></tr>
          ${summary ? `<tr><td style="padding:6px 0;color:#666">Summary</td><td style="padding:6px 0">${summary}</td></tr>` : ''}
          ${detLines.map((l) => `<tr><td colspan="2" style="padding:4px 0;color:#666;font-size:12px">${l}</td></tr>`).join('')}
        </table>
        ${reasons.length ? `
        <div style="margin-top:14px;padding:12px 14px;background:#fffbeb;border-left:4px solid #b45309;border-radius:6px">
          <p style="margin:0 0 6px;font-size:12px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:.3px">Reason${reasons.length > 1 ? 's' : ''}</p>
          <ul style="margin:0;padding-left:18px;font-size:13.5px;color:#333;line-height:1.6">
            ${reasons.map((r) => `<li>${r}</li>`).join('')}
          </ul>
        </div>` : ''}
        ${buf ? `<div style="margin-top:16px;margin-bottom:8px"><p style="font-size:13px;color:#666;margin:0 0 8px">Evidence:</p><img src="cid:${cid}" alt="evidence" style="max-width:240px;border-radius:10px;border:2px solid #b45309"/></div>` : ''}`,
  });

  const msg = {
    to: SPOOF_ALERT_TO,
    from: FROM,
    subject: `🔒 ${label} — ${name} (${uid})`,
    text,
    html,
    attachments: [...attachments, ...logoAttachment()],
  };
  const via = await sendMail(msg);
  console.log(`[email] security alert (${category}) sent via ${via} to ${SPOOF_ALERT_TO} for ${name} (${uid})`);
  return via;
}

/**
 * Password-reset OTP for the student/employee mobile login's forgot-password
 * flow — sent to the account's registered email, never shown/logged in full
 * server-side beyond this call.
 *
 * @param {Object} a
 *   to        registered email address
 *   otp       6-digit code (plaintext, this is the only place it's ever sent in full)
 *   name      student's full name, for greeting
 *   minutes   validity window in minutes (for the copy)
 */
async function sendPasswordResetOtp({ to, otp, name, minutes = 10 } = {}) {
  if (!isConfigured()) {
    console.log('[email] password reset OTP skipped — no transport configured');
    return null;
  }
  const greetName = name || 'there';

  const text =
    `Hi ${greetName},\n\n` +
    `Your password reset code for Anuvadini Attendance is: ${otp}\n\n` +
    `This code expires in ${minutes} minutes. If you didn't request a password reset, you can safely ignore this email.`;

  const html = emailShell({
    accent: BRAND_GREEN,
    eyebrow: 'ACCOUNT SECURITY',
    title: '🔑 Password Reset Code',
    bodyHtml: `
        <p style="margin:0 0 14px;font-size:14.5px;color:#333;line-height:1.5">Hi <strong>${greetName}</strong>,</p>
        <p style="margin:0 0 20px;font-size:14.5px;color:#333;line-height:1.5">Use the code below to reset your Anuvadini Attendance password:</p>
        <div style="text-align:center;margin:0 0 20px">
          <span style="display:inline-block;font-size:34px;font-weight:800;letter-spacing:10px;color:#0B5A33;background:#eafaf0;border:1.5px dashed #0B5A33;padding:16px 20px 16px 30px;border-radius:12px">${otp}</span>
        </div>
        <p style="margin:0 0 4px;font-size:13px;color:#666;line-height:1.5">This code expires in <strong>${minutes} minutes</strong>.</p>
        <p style="margin:0;font-size:13px;color:#999;line-height:1.5">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
  });

  const msg = { to, from: FROM, subject: 'Your Anuvadini Attendance password reset code', text, html, attachments: logoAttachment() };
  const via = await sendMail(msg);
  console.log(`[email] password reset OTP sent via ${via} to ${to}`);
  return via;
}

module.exports = { sendMail, sendSpoofAlert, sendSecurityAlert, sendPasswordResetOtp, isConfigured, SPOOF_ALERT_TO, FROM };
