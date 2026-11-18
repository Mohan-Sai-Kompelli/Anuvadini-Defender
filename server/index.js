const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

// Some local/router DNS servers don't answer SRV queries, which breaks
// mongodb+srv:// connections (querySrv ECONNREFUSED). Use public DNS resolvers.
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const attendanceRoutes = require('./routes/attendance');
const organizationRoutes = require('./routes/organization');
const organizationManagementRoutes = require('./routes/organizationManagement');
const studentLocationRoutes = require('./routes/studentLocation');
const liveLocationRoutes = require('./routes/liveLocation');
const voiceAuthRoutes = require('./routes/voiceAuth');
const palmAuthRoutes = require('./routes/palmAuth');
const LeaveRequest = require("./routes/LeaveRequest");
const cheakoutRequest = require("./routes/cheakoutRequest");
// WFH is out of scope for this deployment (clinical/doctor user base) — the
// whole feature is disabled: routes below are NOT mounted, so /api/wfh/* and
// the WFH-request endpoints return 404 and clients treat it as "no WFH".
// const wfhAssignmentRoutes = require('./routes/wfhAssignments');
// const wfhRequestRoutes = require('./routes/WFHRequest');
const fieldRequestRoutes = require('./routes/fieldRequests');
const fcmRoutes = require('./routes/fcm');
const spotCheckRoutes = require('./routes/spotChecks');
const livenessRoutes = require('./routes/liveness');
const auditRoutes = require('./routes/audit');
const absenceRoutes = require('./routes/absences');
const timetableRoutes = require('./routes/timetables');
const classCheckinRoutes = require('./routes/classCheckins');
const outreachRoutes = require('./routes/outreach');
const complianceRoutes = require('./routes/compliance');
const regularizationRoutes = require('./routes/regularization');
const memoRoutes = require('./routes/memos');
const verificationRoutes = require('./routes/verifications');
const holidayRoutes = require('./routes/holidays');
const leaveBalanceRoutes = require('./routes/leaveBalances');
const supportRoutes = require('./routes/support');
const saacmsRoutes = require('./routes/saacms');
const apiKeyRoutes = require('./routes/apiKeys');
const portalRoutes = require('./routes/portal');
const superadminRoutes = require('./routes/superadmin');
const checkoutComplianceRoutes = require('./routes/checkoutCompliance');
const deviceSecurityRoutes = require('./routes/deviceSecurity');
const publicRegistrationRoutes = require('./routes/publicRegistration');
const passport = require("./config/passport");
const StudentController = require("./controllers/api/v1/StudentController");
const { markPastPendingOutreachNoResponse } = require('./utils/outreachNoResponse');
const { markPastPendingFieldRequestsAsNoResponse } = require('./utils/fieldRequestNoResponse');

// Initialize services
const firebaseService = require('./services/firebaseService');
const cronService = require('./services/cronService');

const app = express();
app.use(require("./middleware/partnerKey"));

// Defender (Python monitoring backend, uvicorn on 127.0.0.1:8055) is served through this same domain.
// The proxy sits BEFORE express.json so request bodies (screen frames, rules, logs) are forwarded untouched.
const { createProxyMiddleware } = require('http-proxy-middleware');
const DEFENDER_BACKEND = process.env.DEFENDER_BACKEND_URL || 'http://127.0.0.1:8055';
const DEFENDER_PREFIXES = [
  '/api/fleet', '/api/agent', '/api/firewall', '/api/rules', '/api/violations', '/api/status',
  '/api/analytics', '/api/system', '/api/activity', '/api/antitamper', '/api/anti-tamper',
  '/api/enforce', '/api/simulate', '/api/toggle-', '/api/schedule', '/api/notifications',
  '/api/nvidia', '/api/autostart', '/api/evidence', '/api/download/installer',
  '/api/download/mac-installer', '/api/download/client-bundle.zip', '/api/report', '/api/reports',
  '/api/admin', '/api/employee/verify', '/api/employee/login',
];
app.use(createProxyMiddleware({
  target: DEFENDER_BACKEND,
  changeOrigin: true,
  xfwd: true,
  pathFilter: (p) => DEFENDER_PREFIXES.some((pre) => p.startsWith(pre)),
  proxyTimeout: 60000,
  on: {
    error: (err, req, res) => {
      if (res && !res.headersSent) res.status(502).json({ success: false, error: 'Defender backend unreachable' });
    },
  },
}));


app.use(express.json({ limit: '25mb' })); // base64 face images can be several MB

// Minimal request logger (in addition to morgan) writing to per-route files
const fs = require("fs");
app.use((req, res, next) => {
  const start = Date.now();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const durationMs = Date.now() - start;
    try {
      const line =
        JSON.stringify({
          ts: new Date().toISOString(),
          method: req.method,
          path: req.path,
          query: req.query,
          status: res.statusCode,
          durationMs,
        }) + "\n";
      const target =
        req.path && req.path.startsWith("/api/attendance")
          ? path.join(__dirname, "routes", "attendance_log.txt")
          : path.join(__dirname, "payload_log.txt");
      fs.appendFileSync(target, line);
    } catch (e) {
      // ignore file write errors
    }
    return originalJson(body);
  };
  next();
});
// console.log(process.env.PORT);
const PORT = process.env.PORT || 5001;

// Middleware
// Run HTTP only: disable HSTS and CSP's upgrade-insecure-requests so clients
// are never forced/redirected to HTTPS.
app.use(
  helmet({
    hsts: false,
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);
app.use(morgan("combined"));
// Allow requests from the mobile app and web admin regardless of origin.
// In production the mobile app has no browser origin, so '*' is safe here.
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '25mb' })); // base64 face images can be several MB
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// A missing upload (deleted file, or a record whose file only exists on a
// DIFFERENT server instance — local disk storage isn't shared across
// environments) must not fall through to the SPA catch-all below: that tried
// to sendFile() client/build/index.html, which crashes with a raw ENOENT
// stack trace (leaking this machine's local filesystem path to the browser —
// see the "Evidence image could not be loaded" report) whenever the client
// hasn't been built locally. A plain 404 here is safe either way.
app.use("/uploads", (_req, res) => {
  res.status(404).json({ success: false, error: 'File not found' });
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/defender", require("./routes/defender"));
app.use("/api/students", studentRoutes);
app.use("/api/partner", require("./routes/partner"));
app.use("/api/attendance", attendanceRoutes);
app.use("/api/organization", organizationRoutes);
app.use("/api/organizations", organizationManagementRoutes);
// liveLocationRoutes MUST be mounted before studentLocationRoutes: both define
// POST /live-location, but only liveLocationRoutes runs the full pipeline
// (recordPing → geofence inside/outside, daily stats, dated trail breadcrumbs).
// The legacy studentLocation handler wrote incomplete trail docs (no date /
// insidePremises / distanceM), breaking the live-map path + reports.
app.use("/api/student", liveLocationRoutes);
app.use("/api/student", studentLocationRoutes);
app.use("/api", voiceAuthRoutes);
app.use("/api", palmAuthRoutes);
app.use("/api", LeaveRequest);
// Enterprise leave module: configurable leave types + full apply/validation +
// secure document upload/download. Mounted at /api so it shares the same base
// (routes are namespaced /leave-types and /leaves/*).
app.use("/api", require("./routes/leaves"));
app.use("/api", cheakoutRequest);
// WFH disabled — see the commented requires at the top of this file.
// app.use("/api/wfh", wfhAssignmentRoutes);
// app.use("/api", wfhRequestRoutes);
app.use("/api", fieldRequestRoutes);
app.use("/api/fcm", fcmRoutes);
app.use("/api/spot-checks", spotCheckRoutes);
app.use("/api/liveness", livenessRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/absences", absenceRoutes);
app.use("/api/timetables", timetableRoutes);
app.use("/api/class-checkins", classCheckinRoutes);
app.use("/api/outreach", outreachRoutes);
app.use("/api/compliance", complianceRoutes);
app.use("/api/regularization", regularizationRoutes);
app.use("/api/memos", memoRoutes);
app.use("/api/verifications", verificationRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/leave-balances", leaveBalanceRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/saacms", saacmsRoutes);
app.use("/api/api-keys", apiKeyRoutes);
app.use("/api/portal", portalRoutes);
app.use("/api/superadmin/checkout-compliance", checkoutComplianceRoutes);
app.use("/api/superadmin", superadminRoutes);
app.use("/api/device-security", deviceSecurityRoutes);
app.use("/api/public/registration", publicRegistrationRoutes);
app.use("/api/public/defender", require("./routes/publicDefenderDownload"));
// Defender desktop pairing (QR, WhatsApp-Web style)
app.use("/api/defender-pair", require("./routes/defenderPair"));

app.post("/api/student/login", StudentController.StudentLogin);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Ensure unknown /api/* return JSON, not HTML
app.use('/api', (req, res, next) => {
  res.status(404).json({ success: false, error: 'API route not found', path: req.path });
});

// Serve the React client build (single-origin). /api/* is handled above; every
// other route serves the SPA build, with an index.html fallback so client-side
// routes (e.g. /dashboard) load on a hard refresh.
const clientBuildPath = path.join(__dirname, '..', 'client', 'build');
// "/" is the standalone Anuvadini website (built into client/build/site); the URL stays "/".
app.get('/', (req, res, next) => {
  const site = path.join(clientBuildPath, 'site', 'index.html');
  if (!fs.existsSync(site)) return next();
  return res.sendFile(site);
});
app.use(express.static(clientBuildPath, { index: false }));
// Android APK download endpoints
const apkFile = path.join(__dirname, 'public', 'downloads', 'Anuvadini-Attendance.apk');
app.get('/download/apk', (_req, res) => {
  if (fs.existsSync(apkFile)) {
    return res.download(apkFile, 'Anuvadini-Attendance.apk');
  }
  const fallbackApk = path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (fs.existsSync(fallbackApk)) {
    return res.download(fallbackApk, 'Anuvadini-Attendance.apk');
  }
  return res.status(404).send('APK build not found.');
});
app.get('/apk', (_req, res) => {
  const apkPage = path.join(__dirname, 'public', 'apk.html');
  if (fs.existsSync(apkPage)) {
    return res.sendFile(apkPage);
  }
  return res.redirect('/download/apk');
});
// Never serve index.html for missing static assets (prevents SyntaxError: Unexpected token '<')
app.use('/static', (_req, res) => res.status(404).end());
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Centralised error handler. Without this, an error passed to next() (e.g. a
// multer fileFilter rejection, or any route that throws) falls through to
// Express's default HTML error page — the mobile app then can't parse a JSON
// body, gets a generic "Request failed (500)", and the user has no idea what
// went wrong. This turns every such error into a clean, specific JSON message.
const multer = require('multer');
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'That file is too large.',
      LIMIT_FILE_COUNT: 'Too many files attached.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field — please retry.',
    };
    return res.status(400).json({ success: false, error: messages[err.code] || err.message });
  }
  if (err) {
    console.error('[unhandled error]', req.method, req.originalUrl, err);
    return res.status(err.status || 500).json({ success: false, error: err.message || 'Something went wrong. Please try again.' });
  }
  return next();
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || '', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB');

  // Ensure the 13 default (global) leave types exist. Idempotent upsert — safe
  // to run on every boot; never duplicates or overwrites org customisations.
  require('./scripts/seedLeaveTypes')
    .seedLeaveTypes()
    .then((r) => console.log(`[seedLeaveTypes] created ${r.created}, present ${r.existing}`))
    .catch((e) => console.error('[seedLeaveTypes] boot seed failed:', e.message));

  // Initialize Firebase service
  firebaseService.initialize();
  
  // Start cron jobs
  cronService.start();
  require("./services/defenderOvertimeService").start();
  cron.schedule(
    '0 0 * * *',
    async () => {
      try {
        const result = await markPastPendingOutreachNoResponse();
        if (result.modifiedCount) {
          console.log(`[Outreach] marked ${result.modifiedCount} stale pending request(s) as no_response`);
        }
        const fieldResult = await markPastPendingFieldRequestsAsNoResponse();
        if (fieldResult.modifiedCount) {
          console.log(`[Field Requests] marked ${fieldResult.modifiedCount} stale pending request(s) as no_response`);
        }
      } catch (error) {
        console.error('[No Response] cron failed:', error.message);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  // Deferred face re-verification ("mark now, verify async"): settle attendance
  // marks that were recorded while the face engine was overloaded/unreachable
  // (see FACE_VERIFY_FAIL_CLOSED=false). Runs every minute — frequent enough to
  // clear a check-in rush quickly; the job self-throttles (one batch, skips if a
  // previous cycle is still running, and no-ops when nothing is pending).
  const faceReverifyService = require('./services/faceReverifyService');
  cron.schedule('* * * * *', () => {
    faceReverifyService.processPending().catch((e) =>
      console.error('[faceReverify] schedule error:', e.message)
    );
  });

  // Bind to 0.0.0.0 so the server is reachable from phones on the same LAN.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    // Face-recognition service (../face-back) is started alongside the API when it is not already up.
    require('./services/faceBackProcess').startFaceBack().catch((e) => console.warn('[face-back]', e.message));
  });
})
.catch((err) => {
  console.error('MongoDB connection error:', err);
});

module.exports = app; 
