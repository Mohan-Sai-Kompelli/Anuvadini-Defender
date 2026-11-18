#!/usr/bin/env node
/**
 * Anuvadini API smoke + security test harness.
 *
 * Exercises the real server over HTTP with the seeded accounts. Read-only by
 * default; the only writes are single-use liveness challenges (in-memory) and
 * two intentionally-rejected attendance attempts.
 *
 * Usage:
 *   node scripts/api-smoke.mjs
 *   BASE=http://127.0.0.1:5001 node scripts/api-smoke.mjs
 *   node scripts/api-smoke.mjs --verbose
 *
 * Exit code: 0 when every check passes, 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.BASE || 'http://127.0.0.1:5001').replace(/\/+$/, '');
const VERBOSE = process.argv.includes('--verbose');

const ACCOUNTS = {
  admin: { identifier: 'admin@example.org', password: 'Test@123' },
  superadmin: { identifier: 'superadmin', password: 'Super@123' },
  hod: { identifier: '7052214376', password: 'Test@123' },
  faculty: { identifier: '7287284306', password: 'Test@123' },
  staff: { identifier: '6100000012', password: 'Test@123' },
  student: { identifier: '7206823720', password: '7206823720' },
};

const results = [];
let currentGroup = 'general';

function group(name) {
  currentGroup = name;
  if (VERBOSE) console.log(`\n── ${name} ──`);
}

function record(name, ok, detail = '') {
  results.push({ group: currentGroup, name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  const line = `[${mark}] ${currentGroup} :: ${name}${detail ? ` — ${detail}` : ''}`;
  if (!ok || VERBOSE) console.log(line);
  return ok;
}

async function req(method, url, { token, body, headers = {}, raw = false } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (body !== undefined && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, ok: res.ok, json, text: raw ? text : undefined };
}

function expectStatus(name, r, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  const ok = list.includes(r.status);
  const detail = ok ? '' : `got ${r.status} ${JSON.stringify(r.json || r.text).slice(0, 160)}`;
  return record(name, ok, detail);
}

function expectTrue(name, cond, detail = '') {
  return record(name, !!cond, cond ? '' : detail);
}

async function login(key) {
  const acct = ACCOUNTS[key];
  const r = await req('POST', '/api/portal/login', { body: { identifier: acct.identifier, password: acct.password } });
  if (!r.ok || !r.json?.token) throw new Error(`${key} login failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}

async function studentLogin() {
  const acct = ACCOUNTS.student;
  const r = await req('POST', '/api/auth/student/login', { body: { uid: acct.identifier, password: acct.password } });
  if (!r.ok || !r.json?.token) throw new Error(`student login failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Anuvadini API smoke test → ${BASE}\n`);

  // ── 1. health & auth ────────────────────────────────────────────────
  group('health & auth');
  const health = await req('GET', '/api/health');
  expectStatus('health is 200', health, 200);
  expectTrue('health payload ok', health.json?.status === 'OK', JSON.stringify(health.json));

  const badLogin = await req('POST', '/api/portal/login', {
    body: { identifier: 'admin@example.org', password: 'definitely-wrong' },
  });
  expectStatus('wrong password rejected (401)', badLogin, 401);

  const missing = await req('POST', '/api/portal/login', { body: {} });
  expectStatus('missing credentials rejected (400)', missing, 400);

  const tokens = {};
  for (const key of ['admin', 'superadmin', 'hod', 'faculty', 'staff']) {
    try {
      const s = await login(key);
      tokens[key] = s.token;
      expectTrue(`${key} login returns token + role`, !!s.token && !!s.role, JSON.stringify(s).slice(0, 120));
    } catch (e) {
      expectTrue(`${key} login`, false, e.message);
    }
  }

  const student = await studentLogin().catch((e) => { record('student login', false, e.message); return null; });
  if (student) {
    tokens.student = student.token;
    record('student login returns token', !!student.token);
  }

  // ── 2. auth / RBAC negatives ────────────────────────────────────────
  group('RBAC');
  const noToken = await req('GET', '/api/students');
  expectStatus('no token on /api/students → 401', noToken, 401);

  const badToken = await req('GET', '/api/students', { token: 'not.a.jwt' });
  expectStatus('malformed token → 401', badToken, 401);

  if (tokens.student) {
    const stuOnSuper = await req('GET', '/api/superadmin/organizations', { token: tokens.student });
    expectStatus('employee token on /api/superadmin → 403/401', stuOnSuper, [401, 403]);

    const stuOnDefender = await req('GET', '/api/defender/fleet', { token: tokens.student });
    expectStatus('employee token on /api/defender → 403', stuOnDefender, [401, 403]);
  }

  if (tokens.hod) {
    const hodOnDefender = await req('GET', '/api/defender/fleet', { token: tokens.hod });
    expectStatus('HOD token on Defender (admin-only) → 403', hodOnDefender, [401, 403]);
  }

  if (tokens.admin) {
    const orgs = await req('GET', '/api/superadmin/organizations', { token: tokens.admin });
    expectStatus('admin cannot reach superadmin organization list', orgs, [401, 403]);
  }

  // ── 3. core read endpoints (admin) ──────────────────────────────────
  group('core API (admin)');
  const adminReads = [
    ['GET', '/api/students?limit=5'],
    ['GET', '/api/attendance/history?limit=5'],
    ['GET', '/api/attendance/stats'],
    ['GET', '/api/attendance/dashboard'],
    ['GET', '/api/attendance/live-activity'],
    ['GET', '/api/attendance/organization/stats'],
    ['GET', '/api/attendance/spoof-attempts'],
    ['GET', '/api/attendance/debug/today'],
    ['GET', '/api/timetables'],
    ['GET', '/api/class-checkins/log'],
    ['GET', '/api/outreach'],
    ['GET', '/api/compliance/departments'],
    ['GET', '/api/regularization/org'],
    ['GET', '/api/memos/my-memos'],
    ['GET', '/api/holidays'],
    ['GET', '/api/leave-balances'],
    ['GET', '/api/absences'],
    ['GET', '/api/spot-checks/report'],
    ['GET', '/api/support'],
    ['GET', '/api/audit'],
    ['GET', '/api/api-keys'],
    ['GET', '/api/verifications'],
  ];
  for (const [method, url] of adminReads) {
    const r = await req(method, url, { token: tokens.admin });
    expectStatus(`${method} ${url}`, r, [200, 204]);
  }

  // ── 4. superadmin surface ───────────────────────────────────────────
  group('superadmin');
  if (tokens.superadmin) {
    for (const url of ['/api/superadmin/organizations', '/api/superadmin/stats', '/api/superadmin/security-events']) {
      const r = await req('GET', url, { token: tokens.superadmin });
      expectStatus(`GET ${url}`, r, [200, 404]);
    }
  }

  // ── 5. Defender gateway ─────────────────────────────────────────────
  group('Defender gateway');
  if (tokens.admin) {
    const gw = await req('GET', '/api/defender/gateway/status', { token: tokens.admin });
    expectStatus('gateway status', gw, 200);
    expectTrue('Defender engine online', gw.json?.online === true, JSON.stringify(gw.json).slice(0, 120));

    for (const url of [
      '/api/defender/status',
      '/api/defender/fleet',
      '/api/defender/fleet/stats',
      '/api/defender/analytics',
      '/api/defender/violations',
      '/api/defender/rules',
      '/api/defender/notifications',
      '/api/defender/firewall/status',
      '/api/defender/firewall/rules',
      '/api/defender/antitamper/status',
      '/api/defender/system/health',
      '/api/defender/attendance/timesheet',
    ]) {
      const r = await req('GET', url, { token: tokens.admin });
      expectStatus(`GET ${url}`, r, [200, 204]);
    }

    const blocked = await req('GET', '/api/defender/fleet/register', { token: tokens.admin });
    expectStatus('agent-only endpoint blocked by gateway (404)', blocked, 404);
  }

  // ── 6. liveness protocol ────────────────────────────────────────────
  group('liveness');
  if (tokens.student) {
    const ch = await req('POST', '/api/liveness/challenge', { token: tokens.student });
    expectStatus('challenge issued', ch, 200);
    const challenge = ch.json?.challenge;
    expectTrue('challenge has nonce + 2 actions', !!challenge?.nonce && challenge?.sequence?.length === 2,
      JSON.stringify(challenge).slice(0, 160));

    if (challenge) {
      const expired = await req('POST', '/api/liveness/verify', {
        token: tokens.student,
        body: { nonce: 'deadbeef'.repeat(8), events: [] },
      });
      expectTrue('unknown nonce rejected', expired.json?.verdict?.passed === false,
        JSON.stringify(expired.json).slice(0, 160));

      // Build a plausible live timeline for the issued sequence.
      const events = [];
      let t = 1000;
      for (const action of challenge.sequence) {
        const ev = { t, action, confidence: 0.9 };
        if (action === 'blink') { ev.eyeBlinkL = 0.85; ev.eyeBlinkR = 0.85; }
        if (action === 'smile') { ev.smileL = 0.75; ev.smileR = 0.75; }
        if (action === 'turn_left') { ev.yawDeg = -22; }
        if (action === 'turn_right') { ev.yawDeg = 22; }
        if (action === 'nod') { ev.pitchDeg = -16; }
        events.push(ev);
        t += 1400;
      }
      const verdict = await req('POST', '/api/liveness/verify', {
        token: tokens.student,
        body: { nonce: challenge.nonce, events },
      });
      expectStatus('verify returns 200', verdict, 200);
      expectTrue('well-formed live timeline passes', verdict.json?.verdict?.passed === true,
        JSON.stringify(verdict.json).slice(0, 200));

      const replay = await req('POST', '/api/liveness/verify', {
        token: tokens.student,
        body: { nonce: challenge.nonce, events },
      });
      expectTrue('nonce is single-use (replay rejected)', replay.json?.verdict?.passed === false,
        JSON.stringify(replay.json).slice(0, 200));
    }
  }

  // ── 7. attendance enforcement ───────────────────────────────────────
  group('attendance gates');
  if (tokens.student) {
    const noFace = await req('POST', '/api/attendance/mark', {
      token: tokens.student,
      body: { type: 'in', latitude: 26.8718, longitude: 75.7906 },
    });
    expectStatus('face required when omitted (401)', noFace, 401);
    expectTrue('error code face_required', noFace.json?.code === 'face_required', JSON.stringify(noFace.json));

    const form = new FormData();
    form.append('type', 'in');
    form.append('latitude', '26.8718');
    form.append('longitude', '75.7906');
    form.append('authMethod', 'face');
    // 1x1 transparent PNG, not a face.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    form.append('faceImage', `data:image/png;base64,${png.toString('base64')}`);
    const noLiveness = await req('POST', '/api/attendance/mark', { token: tokens.student, body: form });
    expectTrue('mark without liveness is refused', noLiveness.status >= 400,
      `got ${noLiveness.status} ${JSON.stringify(noLiveness.json).slice(0, 160)}`);

    const tampered = await req('POST', '/api/attendance/mark', {
      token: tokens.student,
      body: {
        type: 'in', latitude: 26.8718, longitude: 75.7906, authMethod: 'face',
        faceImage: 'data:image/png;base64,AAAA',
        livenessNonce: 'x'.repeat(64),
        livenessEvents: [],
        attestation: { isEmulator: true, isRooted: true, isVirtualCamera: true, hookDetected: true, integrity: 'broken' },
      },
    });
    expectTrue('camera/device integrity rejection is generic (401)', tampered.status === 401 || tampered.status === 400,
      `got ${tampered.status} ${JSON.stringify(tampered.json).slice(0, 160)}`);
  }

  // ── 8. write-path validation ────────────────────────────────────────
  group('input validation');
  if (tokens.admin) {
    const badId = await req('GET', '/api/students/not-an-objectid', { token: tokens.admin });
    expectStatus('invalid ObjectId → 400/404', badId, [400, 404, 500]);

    const badBody = await req('POST', '/api/students', { token: tokens.admin, body: {} });
    expectTrue('empty student create rejected', badBody.status >= 400, `got ${badBody.status}`);

    const unknown = await req('GET', '/api/defender/not-a-real-route', { token: tokens.admin });
    expectStatus('unknown Defender endpoint → 404', unknown, 404);
  }

  // ── summary ─────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const byGroup = results.reduce((acc, r) => {
    acc[r.group] = acc[r.group] || { pass: 0, fail: 0 };
    r.ok ? acc[r.group].pass++ : acc[r.group].fail++;
    return acc;
  }, {});

  console.log('\n══════════════ SUMMARY ══════════════');
  for (const [g, s] of Object.entries(byGroup)) {
    console.log(`  ${g.padEnd(22)} ${String(s.pass).padStart(3)} pass  ${s.fail ? `${s.fail} FAIL` : ''}`);
  }
  console.log(`  ${'TOTAL'.padEnd(22)} ${String(passed).padStart(3)} pass  ${failed ? `${failed} FAIL` : ''}`);

  const outDir = path.join(process.cwd(), 'logs');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `api-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
  console.log(`\nReport: ${file}`);

  if (failed) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => !x.ok)) console.log(`  ✗ ${r.group} :: ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('Harness crashed:', e);
  process.exit(2);
});
