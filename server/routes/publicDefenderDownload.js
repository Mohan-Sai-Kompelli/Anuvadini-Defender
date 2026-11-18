const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const rateLimit = require('../middleware/rateLimit');

// The new one-click Windows installer (.exe) is built next to the Defender
// engine and served straight from disk, so it needs no running Python service.
const WINDOWS_EXE = path.resolve(__dirname, '../../defender/dist/AnuvadiniDefenderSetup.exe');
// Android attendance app (APK) — same pattern, served from disk.
const ANDROID_APK = path.resolve(__dirname, '../../defender/dist/Anuvadini-Attendance.apk');

/**
 * Public download portal for the Defender employee-PC agent.
 * Only three fixed files can be fetched and nothing else on the engine is reachable from here.
 */
const router = express.Router();
const DEFENDER_URL = (process.env.DEFENDER_URL || 'http://127.0.0.1:8055').replace(/\/$/, '');

const FILES = {
  windows: { path: 'download/installer', name: 'Anuvadini_Installer.bat' },
  mac: { path: 'download/mac-installer', name: 'Anuvadini_Installer_Mac.sh' },
  bundle: { path: 'download/client-bundle.zip', name: 'anuvadini_client_bundle.zip' },
};

// Address employee PCs must use to reach the Defender engine (agents talk to it directly).
function enginePublicUrl(req) {
  if (process.env.DEFENDER_PUBLIC_URL) return process.env.DEFENDER_PUBLIC_URL.replace(/\/$/, '');
  const port = new URL(DEFENDER_URL).port || '8055';
  return `http://${req.hostname}:${port}`;
}

router.get('/info', rateLimit({ windowMs: 60 * 1000, max: 60 }), async (req, res) => {
  let online = false;
  try { await axios.get(`${DEFENDER_URL}/api/admin/session`, { timeout: 2000 }); online = true; } catch (_) { /* offline */ }
  const url = enginePublicUrl(req);
  res.json({
    success: true,
    online,
    serverUrl: url,
    loopbackOnly: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(req.hostname),
    files: Object.keys(FILES),
    hasWindowsApp: fs.existsSync(WINDOWS_EXE),
  });
});

// One-click Windows installer (.exe) — served from disk, no Python needed.
// Defined before /files/:key so it is matched first.
router.get('/files/windows-app', rateLimit({ windowMs: 60 * 1000, max: 20 }), (req, res) => {
  if (!fs.existsSync(WINDOWS_EXE)) {
    return res.status(404).json({ success: false, message: 'The Windows app has not been built on the server yet.' });
  }
  res.download(WINDOWS_EXE, 'AnuvadiniDefenderSetup.exe');
});

// Android attendance app (APK) — served from disk. Defined before /files/:key.
router.get('/files/android-apk', rateLimit({ windowMs: 60 * 1000, max: 20 }), (req, res) => {
  if (!fs.existsSync(ANDROID_APK)) {
    return res.status(404).json({ success: false, message: 'The Android app has not been built on the server yet.' });
  }
  res.download(ANDROID_APK, 'Anuvadini-Attendance.apk');
});

router.get('/files/:key', rateLimit({ windowMs: 60 * 1000, max: 20 }), async (req, res) => {
  const f = FILES[req.params.key];
  if (!f) return res.status(404).json({ success: false, message: 'Unknown file' });
  try {
    const up = await axios.get(`${DEFENDER_URL}/api/${f.path}`, { responseType: 'stream', timeout: 30000, validateStatus: () => true });
    if (up.status !== 200) return res.status(up.status === 404 ? 404 : 502).json({ success: false, message: 'The installer is not available right now.' });
    res.setHeader('Content-Type', up.headers['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${f.name}"`);
    up.data.on('error', () => res.end());
    up.data.pipe(res);
  } catch (e) {
    res.status(503).json({ success: false, message: 'The Defender engine is not running, so the installer cannot be downloaded yet.' });
  }
});

module.exports = router;
