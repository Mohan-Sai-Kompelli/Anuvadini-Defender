const express = require('express');
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const auth = require('../middleware/auth');
const Student = require('../models/Student');
const DefenderPairing = require('../models/DefenderPairing');

/**
 * Anuvadini Defender gateway.
 *
 * The Defender engine (Python / FastAPI, ../../defender) runs as its own local
 * service. Admin traffic reaches it ONLY through this router, so every call is
 * protected by the normal Anuvadini admin login. Employee-PC agents talk to the
 * Defender service directly (their endpoints are deliberately not proxied).
 */
const router = express.Router();

const DEFENDER_URL = (process.env.DEFENDER_URL || 'http://127.0.0.1:8055').replace(/\/$/, '');

// Admin console endpoints that may be reached through the gateway. Agent-facing
// endpoints (fleet/register, fleet/heartbeat, fleet/stream-frame, fleet/policy,
// fleet/firewall-event, agent/*, employee/*, admin/*) are intentionally absent.
const ALLOWED = [
  /^status$/, /^schedule(\/override)?$/, /^autostart\/toggle$/,
  /^toggle-(monitor|autokill|sound|popup)$/, /^simulate$/,
  /^violations$/, /^evidence\/[\w.\-]+$/, /^analytics$/,
  /^enforce\/(kill|warn)$/, /^rules(\/\d+)?$/,
  /^fleet$/, /^fleet\/stats$/, /^fleet\/bulk-action$/, /^fleet\/live-screen\/[^/]+$/, /^fleet\/quality$/, /^alerts\/send$/, /^alerts\/audio$/,
  /^fleet\/simulate-violation\/[^/]+$/, /^fleet\/[^/]+\/command$/,
  /^fleet\/(?!register$|heartbeat$|stream-frame$|policy$|firewall-event$|lookup$|stream$|live-screen$|stats$|bulk-action$)[^/]+$/,
  /^reports?\/(csv|export)$/, /^attendance\/timesheet(\/export)?$/,
  /^notifications(\/(read|clear|simulate))?$/,
  /^nvidia\/(status|settings|test-key|audit-screen)$/,
  /^anti-?tamper\/(audit|status)$/, /^system\/health$/, /^audit\/logs$/,
  /^firewall\/(status|toggle|rules|sync|logs|people|exemptions)$/, /^firewall\/exemptions\/\d+$/, /^firewall\/rules\/\d+(\/toggle)?$/,
  /^features\/access(\/\d+)?$/,
  /^fleet\/(live-camera|stream-cam)\/[^/]+$/,
  /^fleet\/stream\/[^/]+$/,
  /^proctor\/(watches(\/[^/]+)?|events\/[^/]+|snapshots\/[^/]+|challenge\/[^/]+)$/, /^evidence\/proctor\/[\w.\-]+$/,
  /^proctor\/gaze\/[^/]+$/,
  /^usage\/exclusions(\/\d+)?$/, /^usage\/export$/, /^usage\/focus-rules(\/\d+|\/report)?$/,
  /^usage\/person\/[^/]+$/, /^usage\/person\/[^/]+\/day\/\d{4}-\d{2}-\d{2}$/, /^usage\/team\/[^/]+$/, /^usage\/person\/[^/]+\/live$/,
  /^firewall\/roles$/, /^firewall\/roles\/[^/]+$/, /^firewall\/roles\/[^/]+\/members$/, /^firewall\/roles\/[^/]+\/members\/[^/]+$/,
  /^download\/(installer|mac-installer|client-bundle\.zip)$/,
];

const adminOnly = (req, res, next) => {
  if (!req.organization || req.isHod || req.isSuperAdminView) {
    return res.status(403).json({ message: 'Defender is available to organisation admins only.' });
  }
  return next();
};

// ---- optional: let the API server start the Defender engine itself --------------
let child = null;
async function isUp() {
  try { await axios.get(`${DEFENDER_URL}/api/admin/session`, { timeout: 1500 }); return true; } catch { return false; }
}
async function maybeAutostart() {
  if (process.env.DEFENDER_AUTOSTART === '0' || child) return;
  if (await isUp()) return;
  const dir = path.resolve(__dirname, '../../defender');
  const port = new URL(DEFENDER_URL).port || '8055';
  child = spawn(process.env.DEFENDER_PYTHON || 'python', ['main.py'], {
    cwd: dir,
    env: { ...process.env, DEFENDER_NO_BROWSER: '1', DEFENDER_PORT: port },
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('exit', () => { child = null; });
  child.on('error', () => { child = null; });
  console.log(`[defender] engine started from ${dir}`);
}
maybeAutostart();
process.on('exit', () => { try { child && child.kill(); } catch (_) { /* noop */ } });

router.use(auth, adminOnly);

// Gateway health (used by the UI to show an "engine offline" state).
router.get('/gateway/status', async (req, res) => {
  try {
    const r = await axios.get(`${DEFENDER_URL}/api/system/health`, { timeout: 3000 });
    res.json({ online: true, url: DEFENDER_URL, health: r.data });
  } catch (e) {
    res.json({ online: false, url: DEFENDER_URL, autostart: process.env.DEFENDER_AUTOSTART !== '0' });
  }
});

// Staff picker for firewall exceptions: the organisation's own people, searched by name or ID.
router.get('/staff-search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60);
    const filter = { organization: req.organization._id, isActive: { $ne: false } };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ fullName: rx }, { uid: rx }];
    }
    const rows = await Student.find(filter).select('uid fullName department class bureau role').sort({ fullName: 1 }).limit(15).lean();
    res.json(rows.map((s) => ({
      employee_id: s.uid,
      name: s.fullName,
      department: s.department || s.class || s.bureau || '',
      role: s.role,
      organization: req.organization.name || req.organization.organizationName || '',
    })));
  } catch (e) {
    res.status(500).json({ message: 'Could not search staff.' });
  }
});

const xmlEscape = (v) => String(v == null ? '' : v).replace(/[<>&"']/g, (c) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
}[c]));

function pausedScreenSvg(hostname, employeeName, employeeId, opts = {}) {
  const host = xmlEscape(hostname || 'Work PC');
  const name = xmlEscape(employeeName || 'Employee');
  const uid = xmlEscape(employeeId || '-');
  const title = xmlEscape(opts.title || 'MONITORING PAUSED');
  const message = xmlEscape(opts.message || 'Employee checked out — live screen and monitoring are paused.');
  const footer = xmlEscape(opts.footer || 'Live screen resumes automatically on the next check-in.');
  const bottom = xmlEscape(opts.bottom || 'MONITORING PAUSED');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <rect width="800" height="450" fill="#0f172a"/>
  <rect width="800" height="40" fill="#1e293b"/>
  <circle cx="22" cy="20" r="6" fill="#f59e0b"/>
  <text x="40" y="26" fill="#e2e8f0" font-family="Segoe UI, Arial, sans-serif" font-size="14">ANUVADINI SHIELD · LIVE SCREEN</text>
  <rect x="60" y="80" width="680" height="290" rx="10" fill="#020617" stroke="#334155" stroke-width="2"/>
  <text x="400" y="175" text-anchor="middle" fill="#f59e0b" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="700">${title}</text>
  <text x="400" y="210" text-anchor="middle" fill="#94a3b8" font-family="Segoe UI, Arial, sans-serif" font-size="15">${message}</text>
  <text x="120" y="270" fill="#cbd5e1" font-family="Consolas, monospace" font-size="14">Workstation:  ${host}</text>
  <text x="120" y="295" fill="#cbd5e1" font-family="Consolas, monospace" font-size="14">Employee:     ${name} (${uid})</text>
  <text x="120" y="320" fill="#64748b" font-family="Consolas, monospace" font-size="13">${footer}</text>
  <text x="400" y="405" text-anchor="middle" fill="#64748b" font-family="Consolas, monospace" font-size="12">${bottom} · ${new Date().toLocaleString()}</text>
</svg>`;
}

// Checkout pauses the agent, but this PC is also the Defender engine host. The
// engine's generic live-screen endpoint would otherwise capture the local
// desktop directly (bypassing the agent). Gate it here so a checked-out PC
// shows a paused placeholder instead of a live screen.
router.get('/fleet/live-screen/:hostname', async (req, res, next) => {
  try {
    const hostname = String(req.params.hostname || '').trim();
    if (!hostname) return next();
    const hostPairing = await DefenderPairing.findOne({
      'device.hostname': hostname,
      'employee.organization': req.organization?._id,
    }).sort({ claimedAt: -1 });
    // Decide by the employee's NEWEST pairing (any PC name). A re-scan can link the
    // same PC under a different device name; the older record must not keep it paused.
    const pairing = hostPairing
      ? (await DefenderPairing.findOne({
          'employee.uid': hostPairing.employee?.uid,
          'employee.organization': req.organization?._id,
        }).sort({ claimedAt: -1 })) || hostPairing
      : null;
    if (pairing && pairing.status === 'disconnected') {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.type('image/svg+xml').send(
        pausedScreenSvg(hostname, pairing.employee?.name, pairing.employee?.uid)
      );
    }

    // The agent stops itself at shift end. This PC is also the engine host, so
    // gate the engine's local capture as well; otherwise the dashboard would
    // keep showing the desktop after the agent has stopped for the day.
    try {
      const schedule = await axios.get(`${DEFENDER_URL}/api/schedule`, { timeout: 1500 });
      const shift = schedule.data?.shift;
      if (shift && shift.is_active === false) {
        const standby = shift.status_label === 'STANDBY';
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.type('image/svg+xml').send(
          pausedScreenSvg(hostname, pairing?.employee?.name, pairing?.employee?.uid, {
            title: standby ? 'MONITORING STANDBY' : 'MONITORING STOPPED',
            message: shift.status_reason || 'Outside office hours — monitoring is stopped.',
            footer: standby
              ? 'Live screen resumes automatically when the shift starts.'
              : 'Live screen resumes automatically at the next shift start.',
            bottom: standby ? 'STANDBY' : 'SHIFT ENDED',
          })
        );
      }
    } catch (_) {
      // Engine unavailable: fall through to the normal upstream response.
    }
    return next();
  } catch (e) {
    return next();
  }
});

router.all('/*', async (req, res) => {
  const sub = req.params[0].replace(/^\/+/, '');
  if (!ALLOWED.some((re) => re.test(sub))) {
    return res.status(404).json({ message: 'Unknown Defender endpoint.' });
  }
  try {
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const upstream = await axios({
      method: req.method,
      url: `${DEFENDER_URL}/api/${sub}`,
      params: req.query,
      data: hasBody ? (req.body && Object.keys(req.body).length ? req.body : undefined) : undefined,
      headers: hasBody ? { 'Content-Type': 'application/json' } : {},
      responseType: 'stream',
      timeout: 30000,
      validateStatus: () => true,
      maxRedirects: 0,
    });
    res.status(upstream.status);
    ['content-type', 'content-disposition', 'cache-control', 'x-live'].forEach((h) => {
      if (upstream.headers[h]) res.setHeader(h, upstream.headers[h]);
    });
    upstream.data.on('error', () => res.end());
    req.on('close', () => upstream.data.destroy());
    upstream.data.pipe(res);
  } catch (e) {
    const offline = e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED';
    res.status(offline ? 503 : 502).json({
      message: offline ? 'The Defender engine is not running.' : 'Defender request failed.',
      code: offline ? 'defender_offline' : 'defender_error',
    });
  }
});

module.exports = router;
