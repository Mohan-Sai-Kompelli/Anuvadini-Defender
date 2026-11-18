# SAACMS — Master Build Plan (End-to-End)
### Smart Attendance, Academic & Compliance Monitoring System
**For:** Anuvadini / MARBISM · 700+ AYUSH colleges · ~50,000 users
**Repo:** `examples/facelandmarkdetection` (React Native app + Node/Express server + React web dashboard + Python face service)
**Status of this document:** Engineering source-of-truth. Grounded in a full read of the actual code (not the status docs, which are partly stale — see §2). Every file path below was verified to exist or is explicitly marked **(new)**.

---

## 0. How to read this document

This is the complete plan to take the project from its **real** current state to a **completed, tested, error-free, end-to-end** SAACMS that matches the proposal — including the headline asks:

1. **Real liveness detection** that defeats the **video-replay attack** (someone recording a face and replaying it on a screen). → §6
2. **Best-in-class UI/UX** — friendly, modern, with proper icons and animations. → §7
3. **Everything complete, tested, no errors, end-to-end.** → §8 (testing) + §10 (phased roadmap with Definition of Done)

Sections:
- §1 Executive summary & verdict
- §2 **Reality check** — verified code vs. what the docs claim (important: large drift)
- §3 Target architecture
- §4 Module-by-module build plan (the 8 proposal modules)
- §5 Data model & API plan
- §6 **Liveness & anti-replay engine** (deep dive)
- §7 **UI/UX overhaul** (deep dive)
- §8 Testing & QA strategy ("no errors" plan)
- §9 Security, DPDP 2023 & infrastructure
- §10 Phased roadmap, effort, Definition of Done
- §11 Dependencies to add
- §12 Risk register

---

## 1. Executive summary & verdict

The codebase is a **working student-attendance app**, not yet the MARBISM faculty/clinical compliance platform the proposal describes. The foundation is genuinely good:

- **Mobile** (`src/`): React Native 0.84.1, on-device face capture (ML Kit), GPS geofencing, WFH, leave, push notifications, dashboards. ~17k lines, polished in places.
- **Server** (`server/`): Node/Express + **MongoDB** (not PostgreSQL), JWT auth, attendance/geofence, leave, WFH, FCM push, cron, CSV/PDF reports.
- **Web** (`client/`): React 18 + Tailwind + MUI HOI dashboard with live polling, charts, approval queues.
- **Face service** (`face-back/`): Python Flask, FaceNet512 + RetinaFace embeddings, enrollment + verify endpoints.
- **MediaPipe bridge** (`/Users/ankush/anuvadiniaapp` lib): exposes **468 landmarks + blendshapes + 4×4 head-pose matrices to JS** — the exact primitives needed for real liveness, currently unused by the app.

**Three findings dominate this plan:**

1. 🔴 **The security keystone is missing.** `server/routes/attendance.js` accepts a `faceImage` and sets `faceVerified = !!faceImage` — it **never calls the face verification service**. Combined with a 1-blink on-device check, a recorded video played to the camera marks attendance successfully. The entire anti-fraud value proposition is currently unenforced. (Detail + fix: §6.)

2. 🟠 **The status docs significantly overstate completion.** Files like `MARBISM_PHASE1/2/3_IMPLEMENTATION.md` describe models/routes (Timetable, DutyRoster, DeviceBinding, OutreachActivity, marbismAdmin…) that **do not exist in `server/`**. Treat those features as **not built**. (Evidence: §2.)

3. 🟢 **The hard primitives for the asks already exist** — MediaPipe blendshapes for liveness, Reanimated 4 + Skia for animations, Lucide on web — they just need to be wired up. This makes the plan very achievable.

**Verdict:** This is a finishing-and-hardening job plus a faculty/clinical/anti-fraud build-out — not a rewrite. The plan below is sequenced so each phase ships something testable.

---

## 2. Reality check — verified code vs. documentation

The repo's `*_STATUS.md` / `MARBISM_PHASE*.md` files are **partly aspirational**. Direct inspection of `server/` shows:

**Models that actually exist** (`server/models/`):
`Attendance.js`, `AttendanceNote.js`, `FaceImage.js`, `IrisImage.js`, `Model_LeaveRequest.js`, `Model_cheakoutRequest.js`, `Organization.js`, `PalmImage.js`, `Student.js`, `WFHRequest.js` — **10 models.**

**Routes that actually exist** (`server/routes/`):
`auth.js`, `attendance.js`, `students.js`, `students2.js`, `getstudents.js`, `organization.js`, `organizationManagement.js`, `LeaveRequest.js`, `WFHRequest.js`, `wfhAssignments.js`, `cheakoutRequest.js`, `studentLocation.js`, `voiceAuth.js`, `palmAuth.js`, `fcm.js`.

**Documented but NOT present (treat as unbuilt):**
| Claimed in docs | Reality |
|---|---|
| `models/Timetable.js`, `ClassCheckin.js`, `DutyRoster.js`, `DeviceBinding.js`, `OutreachActivity.js`, `MARBISMDashboard.js` | ❌ absent |
| `routes/timetables.js`, `dutyRosters.js`, `marbismAdmin.js`, `deviceBinding.js`, `outreachActivities.js` | ❌ absent |
| `services/photoTamperingDetectionService.js`, `gpsSpoofingDetectionService.js` | ❌ absent (only `cronService.js`, `firebaseService.js`, `pushNotificationService.js` exist) |
| Compliance scoring, OPD/IPD, academic timetable, device binding | ❌ not in code |
| Automated tests | ❌ `jest.config.js` exists; **zero test files**; `server/package.json` has no test script |

**Stack reality vs. proposal:**
- Proposal says **PostgreSQL** + **FastAPI**; reality is **MongoDB/Mongoose** + **Express** + **Flask**. → Decision needed (§9.1). Recommendation: **keep MongoDB**, update the proposal wording — a Postgres rewrite buys little here and costs weeks.
- Proposal says **S3 + AES-256 at rest**; reality stores biometric images as **base64 inside MongoDB** + local `uploads/`. → must change before scale/compliance (§9).
- Proposal says **Android + iOS**; iOS paths are stubbed (background location returns early, no iOS mock-GPS). → iOS is a real work item.

> **Action item before sign-off:** reconcile the proposal's "95% ready" framing with this verified ~40% baseline so delivery commitments are honest.

---

## 3. Target architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│ MOBILE (React Native 0.84, Android + iOS)   src/                        │
│  • Face check-in/out  • Liveness challenge (MediaPipe)  • Geofence      │
│  • Class check-in  • OPD/IPD duty  • Outreach  • Leave  • Spot-checks   │
│  • Design system (tokens, Lucide icons, Reanimated/Lottie, haptics)     │
└───────────────┬───────────────────────────────────────────────────────┘
                │ HTTPS (TLS 1.3) + JWT + Play Integrity / App Attest
┌───────────────▼───────────────────────────────────────────────────────┐
│ API GATEWAY / BACKEND (Node 18 + Express)   server/                     │
│  Auth · Attendance(+server-side face verify) · Liveness · Timetable     │
│  Duty/Roster · Outreach · Leave(+certs) · Spot-checks + analytics       │
│  Reporting/Export · MARBISM admin/API · Audit log                       │
│  ├─ Redis (nonces, cache, queues)   ├─ BullMQ (verify/report workers)   │
│  └─ MongoDB (replica set)           └─ S3/MinIO (encrypted media)        │
└──────┬───────────────────────────────────────┬────────────────────────┘
       │                                        │
┌──────▼──────────────────┐         ┌───────────▼────────────────────────┐
│ FACE SERVICE (Flask)    │         │ WEB DASHBOARDS (React 18 + Tailwind)│
│ face-back/              │         │ client/                             │
│  /verify-face (exists)  │         │  • HOI dashboard                    │
│  /create-embedding      │         │  • MARBISM President analytics      │
│  /anti-spoof    (new)   │         │  • Anuvadini board (aggregate + API)    │
│  /replay-forensics (new)│         │  • Role-based access                │
│  Silent-Face PAD models │         └─────────────────────────────────────┘
└─────────────────────────┘
   Observability: Prometheus + Grafana + AlertManager · Loki logs · Backups
```

**Principles:**
- **Client is a sensor, not a judge.** All accept/reject decisions are server-side (critical for liveness — §6).
- **Fail closed** on verification, geofence, nonce, attestation.
- **Every sensitive action is audited** (immutable append-only audit log) — required for "tamper-proof reports" and DPDP.
- **Feature-flagged rollout** so each module can go shadow → enforce per college.

---

## 4. Module-by-module build plan

Format per module: **Current (verified) → Gaps → Work items (with file paths) → Done when.**

### Module 1 — Smart Attendance (Real Person · Real Place · Real Time)

**Current:** On-device ML Kit face capture + 1-blink (`src/CameraStream.tsx`); enrollment embeddings (`face-back/app.py`, wired in `server/routes/students.js`); Haversine geofence with per-student `Area_radius` (`server/routes/attendance.js`, `src/utils/location.ts`); server-side timestamps (`server/models/Attendance.js`); check-in/out + history.

**Gaps:** No server-side face verification at mark time; no real liveness (replay-vulnerable); iOS mock-GPS missing; spot-check analytics now built (§4-A) but mobile deep-link wiring pending; no failed-attempt audit; thresholds/scores not logged.

**Work items:**
- **Server-side face verify at mark time** — ✅ **DONE & tested** (§6 Phase 0): `server/routes/attendance.js` now calls `faceVerifyService` and (enforce mode) rejects non-matching faces; score stored.
- **Liveness engine** — Layer 1 (challenge/nonce + adjudication) ✅ **DONE & tested**; remaining: on-device MediaPipe blendshapes (Phase 2), PAD/replay forensics (Phase 3), parallax + attestation (Phase 4). Full design in §6.
- **Spot-checks + non-response analytics** — ✅ **BUILT** (§4-A). `server/services/spotCheckService.js`, `models/SpotCheck.js`, `routes/spotChecks.js`, cron wiring: random daily face prompts via FCM, non-response → `missed`, and a detailed HOI report identifying chronic non-responders, miss streaks, and "missed the live check but marked attendance anyway" proxy suspects. Mobile deep-link → liveness flow is the remaining wiring.
- **iOS mock-GPS + geofence parity** — `src/utils/location.ts`, native iOS bits.
- **Audit** — log every verification (pass/fail, scores) to the audit collection.

> **Device binding: dropped from scope** (per decision). One-account-per-device enforcement is intentionally **not** part of SAACMS. Anti-proxy strength instead comes from (a) server-side face verification + liveness (§6) and (b) the spot-check non-response analytics (§4-A), which catches the proxy pattern behaviorally rather than by locking devices.

**Done when:** a recorded-video replay is rejected server-side; a real user passes in <8s; spot-check non-response auto-flags and surfaces repeat offenders in the report; all attempts audited with scores; works on Android **and** iOS.

---

### Module 4-A — Random Spot-Checks + Non-Response Analytics ✅ BUILT

> **This is the anti-proxy mechanism that replaces device binding.** Instead of locking accounts to hardware, SAACMS sends *random, unannounced* face-verification prompts during the day and then **analyzes who keeps ignoring them** — including the key fraud signal: people who skip the live spot-check but still have a normal attendance mark on the books that day (classic proxy/buddy-punching).

**Status: implemented and tested** against a local MongoDB (issue → respond → evaluate → report all verified, including streak/miss-rate/proxy-flag math).

**Files added/changed:**
| File | Role |
|---|---|
| `server/models/SpotCheck.js` **(new)** | One random check per staff member: `issuedAt/expiresAt/windowMinutes`, `status (pending/responded/missed/skipped)`, `respondedAt`, `responseLatencyMs`, `faceVerified/verificationScore/livenessVerdict`, and the pattern flags `hadAttendanceThatDay` + `markedAfterMiss`. Indexed by org/student/round/status. |
| `server/services/spotCheckService.js` **(new)** | `issueRound()` (pick targets, create checks, FCM push), `recordResponse()`, `evaluateExpired()` (close windows → mark missed → compute proxy flags), `getAnalytics()` (the report), `planDailyRounds()` (random times in working hours). |
| `server/routes/spotChecks.js` **(new)** | `POST /trigger` (HOI fires a round now), `GET /pending` (staff fetch open checks), `POST /:id/respond`, `GET /round/:roundId`, **`GET /report`** (the analytics), `POST /evaluate`. Mounted at `/api/spot-checks`. |
| `server/services/pushNotificationService.js` | `sendSpotCheckNotification()` — deep-link prompt carrying `spotCheckId` so the app opens straight into the liveness flow. |
| `server/services/cronService.js` | Two new jobs: plan random rounds (9 AM daily + on boot), and auto-evaluate expired windows every 5 min. |
| `server/.env.example` | `SPOTCHECK_ROUNDS_PER_DAY / START_HOUR / END_HOUR / WINDOW_MINUTES`. |

**How the random alerts work:** each working day the cron arms `SPOTCHECK_ROUNDS_PER_DAY` rounds at random times inside `[START_HOUR, END_HOUR]`. A round targets staff who are present (checked in) today, creates a `SpotCheck` each, and pushes a prompt. Staff have `WINDOW_MINUTES` to open the app and complete a live face check (`POST /:id/respond`). Anything unanswered when the window closes is marked **missed** by the evaluator, which also checks whether that person *did* have a normal check-in that day → sets `markedAfterMiss` (the proxy signal). HOI can also fire a round on demand via `POST /trigger`.

**The detailed report — `GET /api/spot-checks/report?from=&to=&missRateThreshold=&minIssued=`** returns exactly the "who is actually not marking attendance again and again" view you asked for:

- **`summary`** — total checks, responded, missed, overall response/miss rate, `totalRounds`, and `proxySuspectChecks` (count of "missed the live check but marked attendance anyway").
- **`users[]`** (sorted worst-first) — per staff member: `totalIssued`, `responded`, `missed`, `responseRate`, `missRate`, **`currentMissStreak`**, **`longestMissStreak`**, `avgLatencyMs`, **`markedAfterMissCount`**, `lastRespondedAt`, `lastMissedAt`, plus auto-`flags`:
  - `repeat_offender` — miss rate ≥ threshold (default 0.4) over ≥ `minIssued` checks → *regularly missing*.
  - `on_miss_streak` — currently ignoring 3+ in a row.
  - `proxy_suspect` — 2+ times missed the live check yet still marked attendance → *"missed but marked after that"*.
  - `never_responds` — never once responded.
- **`repeatOffenders[]`** and **`proxySuspects[]`** — pre-filtered shortlists for the HOI.
- **`trend[]`** — per-day issued/responded/missed for charting.

**Sample report output (from the integration test):**
```
Dr Proxy     issued=5 responded=1 missed=4 missRate=0.8 streak=4 proxyHits=4 flags=[repeat_offender,on_miss_streak,proxy_suspect]
Dr Offender  issued=5 responded=1 missed=4 missRate=0.8 streak=4 proxyHits=0 flags=[repeat_offender,on_miss_streak]
Dr Reliable  issued=5 responded=5 missed=0 missRate=0   streak=0 proxyHits=0 flags=[]
```

**HOI web report — ✅ BUILT:** `client/src/pages/SpotCheckReport.js` (+ `spotCheckAPI` in `client/src/services/api.js`, route in `App.js`, "Spot-Checks" nav item in `Layout.js`). Renders the summary cards (response rate, total checks, repeat-offender + proxy-suspect counts), a daily responded-vs-missed trend chart (recharts), a proxy-suspect shortlist, and a sortable/searchable staff-compliance table with the auto-flags (`repeat_offender`, `on_miss_streak`, `proxy_suspect`, `never_responds`) — plus a **"Run spot-check now"** button (`POST /trigger`). Lints clean (0 errors).

**Remaining wiring (mobile, Phase P2):** handle the `spot_check` FCM payload → deep-link into the liveness flow → `POST /:id/respond`.

**Done when:** random rounds fire automatically, non-response is auto-flagged, and the HOI report ranks chronic non-responders and proxy suspects. *(Backend + HOI web report done & verified; mobile deep-link pending.)*

---

### Module 2 — Academic Activity Tracking (Timetable + Start Class)

**Current:** None in code (the documented Timetable/ClassCheckin are absent — §2). Generic camera+geofence flow is reusable.

**Work items (all new):**
- **Models** — `server/models/Timetable.js` (faculty, subject, room/ward, day, start/end, college), `ClassCheckin.js` (timetableRef, actualStart/End, geo, selfie, durationDeviation, status).
- **Routes** — `server/routes/timetables.js` (CRUD + per-faculty daily schedule), `routes/classCheckins.js` (start/stop class, deviation calc).
- **Web** — `client/src/pages/TimetableManagement.js` (upload/assign, CSV import via existing `react-dropzone`).
- **Mobile** — `src/screens/ClassCheckInScreen.tsx` **(new)**: day timeline of scheduled classes; "Start Class" → geo-tagged liveness selfie from classroom; duration logged vs schedule; deviation flagged. Reuse `src/components/ui/Timeline.tsx`.
- **Report** — per-faculty daily teaching log endpoint + export.

**Done when:** faculty sees today's timetable, starts/ends a class with verified geo-selfie, deviations flagged, HOI sees the teaching log.

---

### Module 3 — Clinical Duty (OPD / IPD)

**Current:** A `ConsultationLogScreen.tsx` exists in mobile; `DutyModeIndicator.tsx` UI. No DutyRoster backend (docs claim it; absent — §2).

**Work items (mostly new):**
- **Models** — `server/models/DutyRoster.js` (faculty/doctor, shift, location=OPD/IPD/ward, start/end), `ConsultationLog.js` (geo, selfie evidence, optional patient count).
- **Routes** — `routes/dutyRosters.js`, `routes/consultations.js`.
- **Mobile** — OPD/IPD check-in (GPS + liveness selfie at consultation area), shift start/end vs roster, geo-tagged photo evidence chain.
- **Evidence integrity** — store media in S3 with SHA-256 hash recorded in DB (tamper-evident); see §9.
- **Optional** — HIS/hospital-MIS cross-verification adapter interface (stub + documented contract; not wired without a partner system).

**Done when:** a doctor checks into OPD with verified location+selfie, shift logged vs roster, evidence hashed and immutable.

---

### Module 4 — Leave Management (Digital & Automated)

**Current (strongest module):** `src/RequestScreen.tsx`, `src/LeaveBalanceScreen.tsx`, `src/HolidayCalendarScreen.tsx`; `server/routes/LeaveRequest.js` (apply/approve/reject, overlap prevention); web `client/src/pages/LeaveReques.js`; WFH auto-status proves the auto-mark pattern.

**Gaps:** No auto-mark "On Approved Leave" into attendance records; no medical-certificate upload; no timetable/roster auto-update + substitute prompt on approved leave; no unapproved-absence alert; thin audit trail.

**Work items:**
- **Auto-mark on approval** — ✅ **BUILT & TESTED**: `server/services/leaveAttendanceService.js` + wired into the leave approval controller. On approval, each covered day gets a `type:'leave'` attendance record (`status:'on_leave'`, linked to the request); on rejection the marks are cleared. Idempotent, respects real check-ins, audited (`leave.auto_marked` / `leave.status_updated`). `Attendance.type` gained a `'leave'` value + `leaveRequestId` (existing dashboards filter `in`/`out`, so leave days never inflate presence). *(6 tests pass.)*
- **Medical certificate upload** — add document field to `Model_LeaveRequest.js`; reuse `server/middleware/upload.js` (multer) → S3; required for medical leave.
- **Roster linkage + substitute** — on approval, flag affected Timetable/DutyRoster slots; prompt HOI to assign substitute.
- **Unapproved-absence detector** — ✅ **BUILT & TESTED**: `server/models/AbsenceFlag.js`, `services/absenceService.js`, `routes/absences.js` (`GET /api/absences`, `POST /api/absences/detect`), daily cron at `ABSENCE_DETECT_HOUR`. Flags staff with no check-in **and** no approved leave **and** no active WFH → the "clear distinction from unapproved absence." Idempotent (one flag/person/day), writes an `attendance.unapproved_absence` audit entry. *(Verified: present/on-leave/WFH/inactive excluded; only the genuine absentee flagged; idempotent; audited.)* Remaining: a true push to the HOI (web dashboard currently polls the endpoint).
- **Audit** — ✅ append-only audit log built (§9.2); wire it onto leave-approval events next.

**Done when:** approving leave auto-updates attendance + roster, certificate required for medical leave, unapproved absence alerts HOI in real time.

---

### Module 5 — Outreach Activity Documentation

**Current:** None in code (documented OutreachActivity absent — §2). Background GPS tracking exists Android-only (`src/services/backgroundLocationService.ts`, iOS returns early).

**Work items (all new):**
- **Model/route** — `server/models/OutreachActivity.js` (approval state, GPS trail, photos, participant count, timing), `routes/outreachActivities.js` (request → HOI approval → live session → evidence report).
- **Mobile** — `src/screens/OutreachScreen.tsx`: request activity (blocked until HOI approves), live GPS trail capture during camp, geo-tagged timestamped photos, participant count field.
- **iOS background location** — implement the stubbed path.
- **Photo authenticity** — `face-back/replay_forensics.py` reused for tampering checks; store hashes.
- **Auto evidence report** — generator compiling GPS trail + photos + participant count + timing into a signed PDF.

**Done when:** an approved outreach session produces a tamper-evident, server-signed evidence report.

---

### Module 6 — Real-Time Reporting & Data Access

**Current:** HOI dashboard `client/src/pages/Dashboard.js` (30s polling, charts, time-slot classification); CSV export + 4 PDF reports; web has **no role differentiation** (all users see all routes).

**Gaps:** No President/Board personas; CSV drops lat/long/status/authMethod/department; no XLSX; no external ANUVADINI API; no tamper-proof report signing; no queryable audit trail; polling won't scale to 700 colleges.

**Work items:**
- **Audit trail viewer (web)** — ✅ **BUILT**: `client/src/pages/AuditTrail.js` (+ `auditAPI`/`absenceAPI` in `client/src/services/api.js`, route + "Audit Trail" nav item). Filter by action/outcome, paginated, shows actor + metadata for every security event. Lints clean.
- **Absences viewer (web)** — ✅ **BUILT**: `client/src/pages/Absences.js` (route `/absences` + "Absences" nav item). Per-day list of unapproved absentees (name/uid/dept/reason/HOI-alerted/time), count banner, search, and a "Run detection now" button. Lints clean.
- **Live location for working hours** — ✅ **backend BUILT & unit-tested**: `server/services/workingHoursService.js` computes the tracking window from the org's `workingHours {start,end}`; the check-in (`POST /api/attendance/mark` type:'in') response now returns `tracking: { shouldTrack, trackUntil, basis }` so the app auto-shares location until end-of-working-hours (falls back to an 8h shift if hours aren't configured or check-in is late). **Remaining (device build):** the mobile check-in handler should consume `tracking.trackUntil` to set the share `endsAt` + auto-start tracking, and implement the iOS background path.
- **RBAC** — roles `student/faculty | HOI | MARBISM_president | Anuvadini_board | admin`; gate web routes + API. New `middleware/rbac.js`.
- **MARBISM President analytics** — `client/src/pages/MarbismDashboard.js`: multi-college compliance trends, rating-linked metrics (compliance scoring service §4-scoring), audit trails. Backed by `routes/marbismAdmin.js` **(new)** + `models/ComplianceScore.js`.
- **Anuvadini Board** — aggregate national view + **partner API** with scoped API keys (`routes/publicApi.js`, key model, rate-limited).
- **Tamper-proof reports** — server-generate, hash + sign (HMAC/PKI), embed verification code; store hash in audit log.
- **Export fields** — ✅ **DONE & TESTED**: `GET /api/attendance/export` no longer drops fields — CSV now includes status, auth method, **face verified + verification score**, distance, lat/long, WFH, class, department, bureau. *(Verified the header + row data.)* XLSX (`exceljs`) is the remaining nice-to-have.
- **Scale real-time** — replace blanket 30s polling with Redis-cached aggregates + SSE/WebSocket for live deltas.

**Done when:** each persona sees only their scope; reports are signed/verifiable; Anuvadini can pull aggregate data via API; dashboards stay responsive at scale.

---

### Module 7 — Anti-Fraud & Verification Engine

**Current:** ML Kit on-device; Android `position.mocked` check. Server verification broken (Module 1). Documented tampering/GPS-spoof services are absent (§2).

**Work items:**
- **Server face verification + liveness** — §6 (the keystone).
- **GPS spoofing detection** — `server/services/gpsSpoofingService.js` **(new)**: mock-flag (both platforms), velocity/teleport heuristics, accuracy sanity; flag on mark.
- **Photo tampering / replay forensics** — `face-back/replay_forensics.py` **(new)** (moiré FFT, specular, color-band, frame-beat) + Silent-Face PAD `anti_spoof.py` **(new)**.
- **Behavioral proxy detection** — the spot-check analytics engine (§4-A) is the anti-proxy control in place of device binding.
- **Fraud signal fusion** — `server/services/fraudEngine.js` **(new)**: combine face score + liveness + GPS anomaly + spot-check non-response pattern + tampering into a single risk score & decision; log all signals.
- **Failed-attempt monitoring** — rate limiting (`express-rate-limit`), lockout, alerting (AlertManager).

**Done when:** a single fraud engine adjudicates each attempt from fused signals, every signal logged, alerts fire on anomalies.

---

### Module 8 — Backend & Infrastructure (On-Premise)

**Current:** `docker-compose.yml` (9 services), `Dockerfile.backend/web`, `k8s-manifests.yaml`, `nginx.conf` (TLS 1.2/1.3, HSTS), `prometheus.yml` + `alert-rules.yml`, `backup.sh`/`restore.sh`, EAS/Gradle build.

**Gaps:** AES-256 at rest absent (biometrics base64 in Mongo); secrets in repo; AlertManager not deployed; exporters referenced but missing; placeholders (`your-domain.com`, `CHANGE_ME`); no CI/CD; hardcoded `localhost:50011/5002` face/voice URLs; iOS build unproven.

**Work items:** see §9 (security/infra) — encryption at rest, secrets management, S3/MinIO media, configurable service URLs, CI/CD, AlertManager + exporters, on-prem hardening, iOS build pipeline, load testing to 50k.

**Done when:** deployable on-premise from clean configs, encrypted at rest, monitored end-to-end, CI green, load-tested.

---

## 5. Data model & API plan

**Keep MongoDB.** Add models (all with `createdAt/updatedAt`, soft-delete `deletedAt`, and audit hooks):

| New model | Purpose |
|---|---|
| `Timetable`, `ClassCheckin` | Module 2 |
| `DutyRoster`, `ConsultationLog` | Module 3 |
| `OutreachActivity` | Module 5 |
| `LivenessChallenge` (or Redis-only) | §6 nonce lifecycle |
| `SpotCheck` ✅ built | Module 1 / §4-A |
| `ComplianceScore` | Module 6 |
| `AuditLog` (append-only) | cross-cutting |
| `ApiKey` | Module 6 ANUVADINI API |
| `AuditLog` ✅ built | cross-cutting (see below) |
| `MediaAsset` (S3 ref + SHA-256) | replaces base64-in-Mongo |

**Indexing for scale:** compound indexes on `{organization, date}`, `{student, date}`, `{timetable, date}`; TTL index on liveness nonces; partial indexes for active duty/WFH. Replace full-scan heatmap aggregations with pre-aggregated daily rollups (cron → `DailyRollup` collection).

**API conventions:** standard `{ success, data, error, pagination }`; JWT + RBAC on all non-auth routes; rate limiting; request size limits; OpenAPI spec generated and published (`API_DOCUMENTATION.md` regenerated from code, not hand-maintained).

**Migrations:** introduce `migrate-mongo` so schema/data changes are versioned (none exist today).

---

## 6. Liveness & Anti-Replay Engine (the headline ask)

> **The problem you described:** users record someone's face and play the recording to the camera; current system accepts it. **This is real and confirmed in code** — `server/routes/attendance.js` sets `faceVerified = !!faceImage` and never calls verification; on-device check is a single blink any recording satisfies.

**Design principle:** *the client is a sensor, not a judge.* The server issues a randomized challenge bound to a single-use nonce and re-judges every layer from raw evidence. Four independent layers must all pass — a flat screen replay fails at least three simultaneously.

| Layer | Defeats | Where decided |
|---|---|---|
| **L1 Active challenge-response** — randomized blink/turn/smile sequence, server nonce + timing windows | pre-recorded video that can't match *today's* random sequence in-window | Server (from evidence) |
| **L2 Passive PAD / replay forensics** — Silent-Face MobileNet + moiré FFT + specular + color-band + frame-beat | *any* screen, even a live stream containing a blink | Server (authoritative); on-device fast-reject for UX |
| **L3 3D depth / parallax** — head-pose matrix + landmark planar-homography residual | flat surfaces (screen/photo have no parallax) | Server |
| **L4 Binding / attestation** — single-use nonce, frame timestamps, nonce overlay, Play Integrity / App Attest | frame injection, replayed payloads, emulators, rooted devices | Server |

### Why each layer defeats the replay
- **L1:** the recording was made before today's nonce existed, so it can't perform `blink → turn-right → smile` in the server's randomized order and timing windows.
- **L2:** a display emits moiré (pixel grid beats the camera sensor → sharp periodic FFT peaks), broad specular highlights, clipped/banded color gamut, and a frame-rate beat — detectable even if the video itself contains a blink and a turn.
- **L3:** a screen is planar; during the head-turn, a real 3D face's nose/inner-face landmarks deviate from a planar homography (parallax), while a flat screen's residual is ~0.
- **L4:** if the attacker skips the camera and POSTs crafted frames, the burned single-use nonce + timestamp freshness + Play Integrity reject it.

To pass, an attacker needs a **live, 3D, correctly-timed face responding to an unpredictable challenge on an attested genuine device** — i.e., the actual person.

### What we leverage (already in the stack)
- `react-native-mediapipe` v0.6.0 exposes **blendshapes** (`eyeBlinkLeft/Right`, `mouthSmileLeft/Right`, `jawOpen`…) + **4×4 facial transformation matrix** + **468 landmarks** to JS. Confirmed in `/Users/ankush/anuvadiniaapp/src/faceLandmarkDetection/index.ts` and the Android/iOS converters. The app currently ignores these — they are our biggest lever.
- `react-native-vision-camera` 4.7.3 + `react-native-worklets` 0.8.1 → frame processors for real-time detection.
- `face-back/app.py` already has FaceNet512 `/verify-face` (cosine 0.4) — we call it and add anti-spoof endpoints.
- Redis is in the infra stack → nonce store.

### Phased implementation (file-level)

**Phase 0 — Close the hole — ✅ BUILT & TESTED:**
- `server/routes/attendance.js`: the `faceVerified = !!faceImage` line is **replaced** with a server-authoritative gate that calls the face service and (in enforce mode) rejects non-matching faces; the real match result + score are stored on the record.
- `server/services/faceVerifyService.js` **(new)**: configurable wrapper over `/verify-face` (base URL via `FACE_API_URL` — hardcoded IP killed), handles match/no-match/404/error/unreachable, parses the score.
- `server/config/featureFlags.js` **(new)**: `off | shadow | enforce` modes so this rolls out shadow-first then enforces.
- `server/middleware/rateLimit.js` **(new, no dependency)**: applied to the mark, liveness, and spot-check-response routes.
- Org-login password bypass (`auth.js` had the check commented out) **re-enabled** and tested.
*Effect: "any image string passes" is dead. Verified by an end-to-end test (below).*

**Phase 1 — Server-issued challenge + nonce — ✅ BUILT & TESTED (Layer 1):**
- `server/routes/liveness.js` **(new)**: `POST /api/liveness/challenge` → `{nonce, sequence[2–3], issuedAt, expiresAt, perActionWindowMs, hmac}`; `POST /verify` for standalone adjudication.
- `server/services/livenessService.js` **(new)**: crypto nonce, randomized non-repeating sequence, HMAC signing, single-use burn, and full evidence adjudication — order match, per-action timing windows, human-latency check, and magnitude thresholds (blink/smile/turn/nod). In-memory nonce store (swap for Redis at multi-node scale).
- `server/routes/attendance.js`: the mark route now adjudicates `livenessNonce` + `livenessEvents` inline and (in enforce mode) blocks marks without a valid, passing, unexpired, single-use challenge.
- **Remaining wiring:** `src/services/api.ts` `getLivenessChallenge` stub → real endpoint; on-device MediaPipe evidence capture (Phase 2); `src/components/LivenessChallenge.tsx` evidence-only.

> **Tested (run against local MongoDB + a stub face service, not the Atlas cluster):** liveness adjudication unit tests (correct pass; burned-nonce replay, wrong-order, weak-magnitude, student-mismatch, robotic-timing all rejected); faceVerifyService against a real HTTP stub (match/no-match/404/error/unreachable/guards); and an **end-to-end mark-route test** proving: (A) a face image with **no** liveness → `401 liveness_failed`; (B) a forged nonce → `401`; (C) genuine face + correct challenge → `201` with `faceVerified=true`, score + `livenessVerdict.passed` persisted; (D) a non-matching face → `401 face_verification_failed`; and exactly one row persisted. Plus the org-password bypass closed (wrong password → 401, correct → 200).

**Phase 2 — On-device MediaPipe detection — 🟡 CORE BUILT & UNIT-TESTED:**
- ✅ `src/liveness/types.ts`, `faceFrame.ts`, `actionDetectors.ts`, `runner.ts` **(new)**: pure, native-free modules that flatten MediaPipe blendshapes + 4×4 head-pose matrix into `FrameSample`s and detect blink/smile/turn/nod, producing the **exact evidence shape the server adjudicates** (thresholds set stricter than the server so any emitted event passes). Head-pose decomposition validated against synthetic rotations.
- ✅ `src/services/api.ts`: `markAttendance` now forwards `livenessNonce` + `livenessEvents`. **Bug fixed:** the app sent only `face_image` but the server reads `faceImage` — it now sends both, so the new face-verify gate actually receives the image.
- ✅ **17 Jest tests pass** (`src/liveness/__tests__/liveness.test.ts`): head-pose math, blendshape extraction, each detector (incl. rejecting a permanently-closed eye = still photo, and a too-brief smile), and full-challenge evidence collection (correct sequence/order/magnitudes; incomplete when an action is missing; wrong-order recording fails).
- - ✅ `src/liveness/session.ts` **(new)**: framework-agnostic `LivenessSession` that buffers MediaPipe frames (relative-timestamped via an injectable clock), reports live UI progress (`currentPrompt`, detected/total, done/expired), and assembles the evidence — using the tested detectors. **21 Jest tests** total now (incl. 4 session tests: relative timestamps, live progress as actions are observed, expiry stops buffering, nonce passthrough).
- ✅ `src/liveness/INTEGRATION.md` **(new)**: exact device-build wiring guide (capture → session → `markAttendance`; challenge UI; spot-check FCM deep-link → `/spot-checks/:id/respond`).

**Remaining (needs a device build, not headless-testable):** `src/CameraStream.tsx` — swap the ML Kit blink loop for a `react-native-vision-camera` frame processor that calls the MediaPipe face landmarker and pushes results into a `LivenessSession`; `src/components/LivenessChallenge.tsx` — drive the step UI from `session.progress()` and **delete the client-side `passed` verdict**; handle the `spot_check` FCM tap. All of these now call already-tested modules — see `INTEGRATION.md`.
- `src/liveness/parallax.ts` (L3 planar-homography) deferred until the server adjudicates L3 (it currently consumes only L1 evidence).

**Client sends evidence, not a verdict:**
```json
{ "nonce":"…",
  "events":[{"t":412,"action":"blink","eyeBlinkL":0.71,"eyeBlinkR":0.69},
            {"t":1890,"action":"turn_right","yawDeg":22.4},
            {"t":3120,"action":"smile","smileL":0.74,"smileR":0.71}],
  "frameTimeline":[{"t":0,"yaw":0.2,"meanLuma":131}, …],
  "keyFrames":["<jpeg@blink>","<jpeg@turn>","<jpeg@smile>"],
  "attestation":"<play-integrity-token>" }
```

**Phase 3 — Passive PAD + replay forensics (5–7 days):**
- `face-back/anti_spoof.py` **(new)**: Silent-Face-Anti-Spoofing MobileNetV2/V3 (public pretrained weights), fused spoof score.
- `face-back/replay_forensics.py` **(new)**: `moire_score` (FFT peak-to-mean), `specular_ratio` (HSV V>0.95 blobs), `color_band_score` (histogram comb/gamut clip), `beat_score` (FFT of mean-luma-over-time).
- `face-back/app.py`: `POST /anti-spoof` returning per-cue scores + verdict; fuse with weighted rule + small logistic combiner; any hard trip vetoes.
- `server/services/livenessService.js`: call `/anti-spoof` during mark; combine with L1/L3.
- Optional on-device int8 TFLite PAD as **UX-only** fast pre-reject (never trusted).

**Phase 4 — Attestation + hardening (3–5 days):**
- Android **Play Integrity** (Gradle dep + native module) using the liveness nonce as `requestHash`; iOS **DCAppAttest**.
- `server/services/attestationService.js` **(new)**: verify tokens server-side, gate the mark, store verdict on record.
- Nonce-overlay watermark + server-side OCR/template match; full failed-attempt audit logging.

**Phase 5 — Tuning, corpus, rollout (ongoing):**
- Feature flags: `enableServerFaceVerify`, `enableLivenessChallenge`, `enablePAD`, `enableAttestation`.
- **Shadow mode first** (compute + log verdicts, don't block) for 1–2 weeks; tune thresholds; then enforce per pilot college.

### Latency / UX budget (target ≤ 8s, feels like "follow the prompts")
| Step | Budget |
|---|---|
| Fetch challenge | 200–400ms |
| User performs 2–3 actions | 4–6s (human-bound) |
| On-device detection/frame | <33ms @30fps |
| On-device PAD fast-reject | <100ms |
| Upload (3 keyframes + numeric timeline, not the full burst) | 300–800ms |
| Server verify (face + PAD + forensics + nonce, parallelized) | 400–900ms |

One retry on soft failure with a **fresh** nonce/sequence (never reuse). Hard fails (attestation/PAD veto) block + audit, no instant retry.

### Threshold tuning & test corpus
- Start: blink rise/fall 0.5/0.2; smile ≥0.6 sustained 300ms; turn ±15°; per-action window 4000ms; PAD spoof 0.5; cosine 0.4 (existing). Tune by **target spoof FAR first**, then minimize genuine FRR. Report APCER/BPCER/ACER (ISO/IEC 30107-3).
- **Build a corpus** (consented): genuine positives (varied lighting/skin tones/glasses); screen-replays across LCD/OLED/tablet/laptop with/without glare/tilt/bezel (including replays that *contain* a blink + turn); printed photos (matte/glossy, flat/curved); static photo-on-screen; injection attempts (rooted device); binding negatives (replayed payload → nonce burn must reject; expired window; wrong sequence). Run the full pipeline offline → confusion matrix per layer + fused; keep as a **CI regression suite**.
- Watch for demographic bias (dark-skinned users in low light is a known PAD failure mode) before enforcing.

---

## 7. UI/UX Overhaul (friendly, modern, great icons & animations)

**Audit reality:** there *is* a token file (`src/theme.ts`, teal `#2C8395`) but adoption is inconsistent — e.g. `RequestScreen.tsx` has 83 hardcoded hex values, the login screen is off-brand amber, icons are mostly **emoji**, there are **149 blocking `Alert.alert`** calls and **zero** skeleton loaders, **zero** accessibility labels, and Reanimated 4 is installed but unused. Web has a teal/blue brand mismatch, two toast libraries, and fake hardcoded progress bars. So this is a **wire-up + consistency** job more than a from-scratch design.

### 7.1 Design system (shared tokens)
- **One teal brand**, semantic + dark-ready:
  `brand 500 #2C8395` (primary), `600 #246E7E`, `700 #1A6B7A`; `accent #FF6B35` (CTAs only); `success #16A34A · warning #F59E0B · danger #DC2626 · info #0284C7`; neutral slate scale; semantic `bg/surface/text/textMuted/border` for light **and** dark.
- Mobile: restructure `src/theme.ts` → `src/design/tokens.ts` + `src/design/ThemeContext.tsx` (`useTheme()` driven by `useColorScheme()` + persisted override).
- Web: set Tailwind `primary` to teal, add `darkMode: 'class'`.
- Typography scale (Inter), 4-pt spacing (add the missing `12`), radii `sm8/md12/lg16/xl24/pill`, 4 elevation shadows + dark variants.

### 7.2 Icons — replace every emoji
- Mobile: add **`lucide-react-native`** (uses already-installed `react-native-svg`). Map 📥→`LogIn`, 📤→`LogOut`, 📍→`MapPin`, 🏠→`Home`, 📊→`BarChart3`, ✅→`CheckCircle2`, ❌→`XCircle`, 🔒→`Lock`, etc.
- Web already uses `lucide-react` → **identical icon language across mobile + web.**

### 7.3 Animation & motion (Reanimated 4 + Skia + Lottie)
- Card/list entrances (`FadeInDown`, `LinearTransition`), count-up stat numbers, color crossfades.
- Face check-in: animated **ProgressRing** (Skia arc) replacing the border-width hack; pulsing guide ring; per-liveness-step segment fill.
- **Lottie** (`lottie-react-native`) for terminal states only: success burst, failure shake, location-verified pin drop.
- **Haptics** (`react-native-haptic-feedback`): light impact on press, success/error notifications on verify, selection on tab change — centralized in `src/utils/haptics.ts`.
- Web: delete the 5-pulse-circles-per-card and fake progress bars; one subtle hover lift; skeletons replace spinners; `prefers-reduced-motion` respected.

### 7.4 Components to build (`src/components/ui/`)
`Button`, `Input` (Lucide leading icon, error text), `Card`, `Screen` (SafeArea + pull-to-refresh wrapper — kills per-screen boilerplate), `Toast` (migrate the 149 `Alert.alert`s → `react-native-toast-message`; keep Alert only for true confirms), `Skeleton` (Reanimated shimmer), `EmptyState`, `BottomSheet`/`ConfirmSheet` (`@gorhom/bottom-sheet` v5), `ProgressRing`, `AppHeader` (logo once, via navigator `screenOptions`). Web: `Button`, `Card`, `Skeleton`, `EmptyState`, `ConfirmDialog`, `ErrorBoundary`, `DataTable`.

### 7.5 Navigation
Add `@react-navigation/native-stack` (currently bottom-tabs only with `display:none` hacks) → real push transitions, proper back behavior, tabs only for the 4 real tabs.

### 7.6 Screen-by-screen (key flows)
- **Login** — re-skin to brand (teal gradient header, `Input` with icons, password toggle), inline errors + toast, **remove the debug "Test Backend Connection" button + hardcoded IP**, migrate to `react-native-safe-area-context`.
- **Attendance hub** (`AttendanceScreen.tsx`, 2,171 lines) — split into `LocationStatusCard` (animated geofence ring), `CheckInOutButtons`, `TodaySummary`; one big primary CTA with haptic + Lottie success; skeletons while loading.
- **Face check-in + liveness** — full-screen camera, Skia oval cutout, animated guide ring, **integrate `LivenessChallenge`** with step chips (`Eye`, `ArrowLeft`, `Smile` icons), per-step haptic + ring fill, Lottie terminal states, `accessibilityLiveRegion` announcing prompts.
- **Class check-in** (new) — day timeline, ongoing-class CTA → liveness with class context.
- **Leave/Requests** (`RequestScreen.tsx`) — re-theme to tokens (biggest cleanup), segmented Leave|WFH, date-range bottom sheet, card list with `StatusBadge`, pull-to-refresh, skeletons, empty states; optimistic submit + toast.
- **History/Dashboard** — delete duplicate `UserDashboard.tsx`, fix fake "Leave Balance 12 / WFH 2" stats (bind real data), grouped-by-day timeline, Skia calendar heat strip.
- **HOI dashboard (web)** — teal rebrand, calm SummaryCards (real deltas, no fake bars/pulses), skeletons + `ErrorBoundary` (switch `useDashboardData` to `Promise.allSettled`), one toast lib, `ConfirmDialog` over `window.confirm`, dark mode, fix file typos (`LeaveReques.js`→`LeaveRequests.js`, `CheakOutRequest.js`→`CheckoutRequests.js`).

### 7.7 Accessibility (currently zero)
`accessibilityRole/Label` on all touchables, 44pt targets, contrast checks, reduced-motion support, TalkBack/VoiceOver for the liveness prompts.

---

## 8. Testing & QA strategy ("complete, tested, no errors")

Today: **zero automated tests** anywhere. To deliver "tested, without errors" we add a full pyramid and gate merges on it.

**Unit**
- Mobile (Jest, already configured): `src/liveness/actionDetectors.ts`, `parallax.ts`, geofence math (`src/utils/location.ts`), reducers/hooks.
- Server (add Jest + supertest): geofence validation, liveness adjudication, RBAC, fraud fusion, leave/roster logic.
- Face service (pytest): embedding match, anti-spoof scoring, replay-forensics on the corpus.

**Integration / API** — supertest against an in-memory Mongo (`mongodb-memory-server`): auth, attendance mark (happy + replay-rejected), liveness challenge→mark, leave approval auto-mark, spot-check non-response, RBAC denials.

**E2E**
- Mobile: **Detox** — login, check-in with liveness, leave request, class check-in.
- Web: **Playwright** — HOI approval queue, dashboard, report export, role gating.

**Anti-spoof regression** — the §6 corpus runs in CI; thresholds can't regress past target APCER/BPCER.

**Load/performance** — **k6** simulating the morning check-in spike (tens of thousands of marks within minutes), HOI dashboard fan-out; validate HPA thresholds and DB indexes. Target the 99.5% SLA.

**Security** — `npm audit`/`pip-audit`, secret scanning (gitleaks), OWASP ZAP baseline, plus a third-party pen test before go-live (proposal commitment).

**Static/quality** — ESLint + TypeScript strict, Prettier, `tsc --noEmit` in CI; the existing `lefthook.yml` pre-commit hooks extended.

**CI/CD** — GitHub Actions (`.github/workflows/`): lint → typecheck → unit → integration → build (EAS Android/iOS, web, Docker images) → E2E on PR; deploy on tag. **Merges blocked on green.**

**Manual QA** — convert `QA_TESTING_CHECKLIST.md` into a tracked per-release checklist incl. real-device replay-attack attempts.

---

## 9. Security, DPDP 2023 & infrastructure

### 9.1 Stack decisions
- **DB:** keep **MongoDB** (replica set), update proposal wording. (Postgres rewrite = weeks for no functional gain.)
- **Face service:** keep **Flask**, but containerize, make URLs configurable, and scale horizontally behind a queue for the morning spike.

### 9.2 Security must-fixes (highest first)
1. **Server-side face verify** (Module 1/§6) — the keystone.
2. **Org login password check is commented out** in `server/routes/auth.js` (~lines 124–127) — **re-enable immediately**; any password currently logs in an org admin.
3. **Secrets out of the repo** — Mongo URI in `server/.env`, hardcoded Mongo creds in `face-back/check.py`, Android signing in `keystore.properties`, Firebase admin JSON in `server/config/`. Move to a secrets manager / sealed env; rotate all exposed creds; add gitleaks.
4. **Encryption at rest (AES-256)** — move biometric media to **S3/MinIO with SSE**; store only S3 ref + SHA-256 in Mongo (new `MediaAsset`); encrypt sensitive fields; encrypt device token storage (mobile uses plain AsyncStorage today).
5. **Rate limiting + request size limits** (`express-rate-limit`), tighten CSP (drop `unsafe-inline/eval`).
6. **Audit logging** — ✅ **BUILT & TESTED**: append-only, tamper-evident `AuditLog` (`server/models/AuditLog.js`, `services/auditService.js`, `routes/audit.js` → `GET /api/audit`, org-scoped + paginated + filterable). Each row carries a SHA-256 content hash (`verifyIntegrity()` detects edits). Wired into the attendance mark gate (`attendance.face_verify` / `attendance.liveness` / `attendance.marked`, success+failure), org login (`auth.org_login` success/failure), and spot-check misses (`spot_check.missed`, flagged when proxy). `log()` is fire-and-forget (never breaks the request). *(Follow-ups: extend to leave/export/report events; add cross-row hash-chain.)*

### 9.3 DPDP Act 2023 (currently nothing implemented)
Biometric data is **sensitive personal data**. Add: explicit **consent capture + withdrawal**, purpose limitation, **data-retention + erasure** (soft-delete already in new models; add purge jobs), data-principal rights endpoints (access/correction/erasure), breach-notification runbook, encryption at rest, and a documented DPIA. This is a go-live blocker for government deployment.

### 9.4 Infrastructure hardening
- Replace placeholders (`your-domain.com`, `CHANGE_ME`, `/path/to/marbism`) and `latest` image tags with pinned values.
- Deploy **AlertManager** + the missing mongodb/redis/nginx **exporters** referenced in `prometheus.yml`; provision Grafana dashboards.
- **S3/MinIO** for media (on-prem MinIO satisfies "on-premise" + "S3").
- Add **Redis-backed queues (BullMQ)** for verification + report generation + spot-check fan-out.
- **iOS**: implement background location + mock-GPS, prove the build, set up App Attest.
- **CI/CD** + **migrations** (`migrate-mongo`).
- **Load test to 50k** and validate the 99.5% SLA + backup/restore drills.

---

## 10. Phased roadmap, effort & Definition of Done

Each phase is independently shippable and testable. Durations are engineering estimates (team of 3–4); sequence matters more than exact dates.

| Phase | Theme | Key deliverables | Rough effort |
|---|---|---|---|
| **P0** | 🔴 Stop the bleeding | ✅ **DONE** — server-side face verify; org password re-enabled; configurable `FACE_API_URL`; rate limiting; feature-flag rollout; **append-only audit log** wired + tested. | done |
| **P1** | Liveness core | ✅ **Layer-1 backend DONE & tested** (challenge/nonce + inline mark adjudication). ✅ **Mobile detector core DONE & unit-tested** (17 Jest tests; `src/liveness/*`). Remaining: wire `CameraStream.tsx` frame processor + `LivenessChallenge.tsx` UI (needs device build). | ~3–4 days left |
| **P2** | Anti-spoof depth | Silent-Face PAD + replay forensics endpoints; fraud fusion engine; GPS-spoof service; spot-check mobile wiring | 1.5–2 wks |
| **P3** | Attestation + corpus | Play Integrity / App Attest; nonce overlay; build replay corpus; tune thresholds; enforce on pilot | 1–1.5 wks |
| **P4** | UI/UX foundation | Design system + ThemeProvider + dark mode; Lucide; core `ui/` components; toast migration; nav restructure; kill dead screens | 1.5–2 wks |
| **P5** | UI/UX flows + a11y | Redesign login, attendance hub, face/liveness, leave, history; web rebrand + skeletons + error boundaries; accessibility pass | 1.5–2 wks |
| **P6** | Academic + Clinical | Timetable/ClassCheckin + faculty mobile; DutyRoster/Consultation + OPD-IPD; evidence hashing | 2–3 wks |
| **P7** | Leave++ + Outreach + Spot-checks | Auto-mark on leave, certificates, roster/substitute, absence alerts; outreach flow + evidence report; spot-check scheduler | 2–3 wks |
| **P8** | Reporting + RBAC + ANUVADINI API | Roles; MARBISM President analytics + compliance scoring; Anuvadini aggregate + partner API; signed reports; XLSX; SSE | 2–3 wks |
| **P9** | Infra, DPDP, hardening | S3/MinIO + encryption; secrets mgmt; AlertManager + exporters; queues; iOS parity; CI/CD; DPDP flows | 2–3 wks |
| **P10** | Test, load, security, launch | Full test pyramid green; k6 to 50k; pen test; backup/restore drills; pilot → rollout | 2–3 wks |

> Liveness (P0–P3) is front-loaded because it's your explicit priority and the biggest risk. UI (P4–P5) runs partly in parallel (different skill set). Faculty/clinical/reporting (P6–P8) is the bulk of the proposal scope that doesn't exist yet.

**Global Definition of Done (every feature):**
- Server-authoritative (no trusted client verdicts), fail-closed, audited.
- Unit + integration tests written and green; E2E for user-facing flows.
- TypeScript strict / lint clean; no new `Alert.alert` for non-confirms; uses design-system components + Lucide icons.
- Works Android **and** iOS; accessible (labels, 44pt, reduced-motion).
- Feature-flagged; shadow-tested where it affects fraud decisions; documented; no secrets in code.

---

## 11. Dependencies to add

**Mobile** (`package.json`): `lucide-react-native`, `react-native-toast-message`, `react-native-haptic-feedback`, `lottie-react-native@^7`, `react-native-gesture-handler`, `@gorhom/bottom-sheet@^5`, `@react-navigation/native-stack@^6`, `react-native-linear-gradient`. **Note:** project is on Reanimated **4** / New Architecture — use v4 APIs, don't downgrade. (Skia 2.5.3 already present for shimmer/rings — no new dep.)

**Server** (`server/package.json`): `express-rate-limit`, `exceljs`, `bullmq`, `ioredis`, `migrate-mongo`, `@aws-sdk/client-s3` (or MinIO client), `jest` + `supertest` + `mongodb-memory-server` (dev), `google-auth-library` (Play Integrity verify).

**Face service** (`face-back/requirements.txt` — create it): `flask`, `opencv-python`, `numpy`, `torch`, `torchvision`, `onnxruntime` (or the Silent-Face inference deps), `pymongo`, `pytest`.

**Web** (`client/package.json`): remove duplicate `react-toastify` (keep `react-hot-toast`); optionally `framer-motion`; `@playwright/test` (dev).

**Tooling:** GitHub Actions, gitleaks, k6, Detox, ESLint strict configs.

---

## 12. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Liveness false-rejects frustrate real users | Adoption | Shadow mode + corpus tuning + one retry; watch demographic bias |
| Play Integrity friction (old devices, no Play Services) | Some users blocked | Graceful fallback to L1–L3 with elevated scrutiny; document policy |
| Doc-vs-code drift hides scope | Schedule blowup | This doc reconciles it; treat absent files as unbuilt (§2) |
| Morning check-in spike (50k in minutes) | Outage | Queue verification (BullMQ), pre-aggregate dashboards, load test (k6), HPA |
| Biometric data handling | Legal/DPDP | Encryption at rest, consent/erasure flows, DPIA, pen test before go-live |
| MongoDB vs proposal's PostgreSQL | Contractual | Decide early (§9.1); recommend keeping Mongo + amend proposal |
| iOS parity underestimated | Half-platform | Treat iOS as first-class work in P9; budget native time |

---

### Appendix A — The single most important code change — ✅ DONE

`server/routes/attendance.js` was, before this work:
```js
faceVerified: !!faceImage,   // ← accepted ANY image. This was the whole vulnerability.
```
Now (shipped): the mark route runs a server-authoritative gate before persisting —
```js
// 1) real face verification (configurable service, off|shadow|enforce)
if (isFaceMethod && faceImage && flags.faceVerify.mode !== 'off') {
  const result = await faceVerifyService.verify({ uid: student.uid, faceImage });
  faceVerified = result.reachable ? result.match === true : false;
  verificationScore = result.score;
  if (flags.faceVerify.mode === 'enforce' && (result.reachable ? !result.match : flags.faceVerify.failClosedOnError))
    return res.status(401).json({ success:false, code:'face_verification_failed', ... });
}
// 2) liveness adjudication (single-use nonce, randomized sequence, timing+magnitude)
if (isFaceMethod && flags.liveness.mode !== 'off' && (livenessNonce || flags.liveness.mode === 'enforce')) {
  livenessVerdict = livenessService.adjudicate({ nonce: livenessNonce, studentId, events: livenessEvents });
  if (flags.liveness.mode === 'enforce' && !livenessVerdict.passed)
    return res.status(401).json({ success:false, code:'liveness_failed', reasons: livenessVerdict.reasons });
}
// …then persist faceVerified + verificationScore + livenessVerdict on the record.
```
*(Still TODO: write each attempt to a dedicated append-only `AuditLog` — currently logged + stored on the record.)*

### Appendix B — Source of truth
This plan was produced from a direct read of the actual code in `src/`, `server/`, `client/`, `face-back/`, the infra files, and the MediaPipe library — cross-checked against the proposal. Where the repo's status docs conflicted with the code, **the code wins** and is reflected here (§2).
