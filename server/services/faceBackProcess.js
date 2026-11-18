/**
 * Starts the face-recognition service (../face-back/check.py, port 50011) together with the
 * API server when it is not already running, so registration and check-in work without a
 * separate terminal. The service shares this process's MONGODB_URI / MONGO_DB_NAME.
 *
 * FACE_AUTOSTART=0   -> never start it from here
 * FACE_PYTHON        -> python executable (default "python")
 */
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const FIRST_URL = (process.env.FACE_API_URLS || process.env.FACE_API_URL || 'http://localhost:50011').split(',')[0].trim();

function portOpen(host, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 1200 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });
}

let child = null;

async function startFaceBack() {
  if (process.env.FACE_AUTOSTART === '0' || child) return;
  let u;
  try { u = new URL(FIRST_URL); } catch { return; }
  const host = ['localhost', '127.0.0.1', '::1'].includes(u.hostname) ? '127.0.0.1' : null;
  if (!host) return; // remote face service: nothing to start here
  const port = Number(u.port || 50011);
  if (await portOpen(host, port)) return;

  const dir = path.resolve(__dirname, '../../face-back');
  child = spawn(process.env.FACE_PYTHON || 'python', ['check.py'], {
    cwd: dir,
    env: { ...process.env, FACE_API_PORT: String(port), PYTHONUTF8: '1' },
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('exit', (code) => { console.warn(`[face-back] exited (${code})`); child = null; });
  child.on('error', (e) => { console.warn(`[face-back] could not start: ${e.message}`); child = null; });
  console.log(`[face-back] starting from ${dir} on port ${port}`);
}

process.on('exit', () => { try { child && child.kill(); } catch (_) { /* noop */ } });

module.exports = { startFaceBack };
