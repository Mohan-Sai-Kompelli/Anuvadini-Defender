# SAACMS — Backend Integration Guide (Timetable, Teaching Log, Analytics, Outreach)

This document explains how the **Academic Timetable** module and everything around
it (class evidence, teaching analytics, outreach) is wired **end‑to‑end**:
React client → Express REST API → MongoDB. It lists every API used, every
collection touched, exactly **what to drop / replace when you have real data**,
and worked examples.

> TL;DR — Nothing in the timetable module is hard‑coded in the frontend any more.
> The UI reads/writes MongoDB through the API. To go live, just put real rows in
> the same collections (or stop running the demo seed). No frontend change needed.

---

## 1. Architecture

```
┌────────────────────┐     HTTPS/JSON      ┌──────────────────────┐      ┌─────────────┐
│  React client      │  ───────────────▶   │  Express API         │  ──▶ │  MongoDB     │
│  (client/)         │   Authorization:    │  (server/, :5001)    │      │  (Atlas)     │
│                    │   Bearer <JWT>      │                      │      │  db: test    │
└────────────────────┘                     └──────────────────────┘      └─────────────┘
```

- **Auth**: one JWT for everyone. `POST /api/portal/login` auto‑detects:
  - an **email** → HOI / institution (`organizations` collection),
  - a **UID** → employee (`students` collection, `role` = `faculty | staff | hod`).
  The middleware (`server/middleware/auth.js`) attaches `req.organization` (HOI,
  and HOD is *promoted* to org scope + `req.hodDepartment`) or `req.student`
  (faculty/staff). `server/utils/resolveOrg.js` resolves the org id from either.
- **Scoping**: `server/utils/deptScope.js` restricts a **HOD** to their
  department’s faculty; **HOI** sees the whole institute; **faculty** only ever
  hit `/api/portal/my/*` (their own data).

---

## 2. What is now DB‑backed (and which API each screen uses)

| Screen / feature | Frontend file | API(s) | Collection(s) |
|---|---|---|---|
| HOI/HOD **Timetable** (view) | `client/src/pages/TimetableManagement.js` | `GET /api/timetables`, `GET /api/students?limit=1000` | `timetables`, `students` |
| HOI/HOD **Assign / Edit / Delete** class | same | `POST/PUT/DELETE /api/timetables[/:id]` | `timetables` |
| **Teaching Analytics** panel | `client/src/components/TimetableAnalytics.jsx` | `GET /api/timetables/analytics` | `timetables`, `classcheckins` |
| Card **conducted/missed + geo + selfie** (HOI/HOD) | `TimetableManagement.js` + `client/src/lib/teachingLog.js` | `GET /api/class-checkins/log?date=` | `classcheckins`, `timetables` |
| **Evidence modal** photos/note/geo (HOI/HOD) | `client/src/components/ClassEvidenceModal.jsx` | `GET /api/class-checkins/evidence/:timetableId?date=` | `classcheckins` |
| Faculty **My Timetable** | `client/src/pages/portal/FacultyTimetable.js` | `GET /api/portal/my/timetable` | `timetables` |
| Faculty card status + evidence | same + `lib/teachingLog.js` | `GET /api/portal/my/teaching-log?date=`, `GET /api/portal/my/class-evidence/:id?date=` | `classcheckins`, `timetables` |
| Faculty **My Outreach** | `client/src/pages/portal/FacultyOutreach.js` | `GET /api/portal/my/outreach` | `outreachactivities` |
| HOI/HOD Outreach page | `client/src/pages/OutreachActivities.js` | `GET /api/outreach`, `POST /api/outreach`, `PUT /api/outreach/:id/status` | `outreachactivities` |

### Graceful fallback (important for demos)
Three surfaces keep a **deterministic preview** if the live API returns nothing,
so the UI never looks empty:
- **Card status/geo/selfie** → if a slot has no `classcheckins` row for that date,
  a stable preview (seeded by `timetableId + date`) is shown instead.
- **Teaching Analytics** → falls back to a computed preview if `/analytics` fails.
- **Faculty Outreach** → shows a small sample list only if `my/outreach` is empty.

When real rows exist, the **real data wins** every time.

---

## 3. API reference (with examples)

All calls require `Authorization: Bearer <token>` from `POST /api/portal/login`.

### 3.1 Login
```http
POST /api/portal/login
Content-Type: application/json

{ "identifier": "<faculty-uid>", "password": "Test@123" }     # faculty (UID)
# or { "identifier": "admin@example.org", "password": "Test@123" }  # HOI (email)
```
```jsonc
// 200
{ "success": true, "token": "<JWT>", "userType": "employee",
  "role": "faculty",
  "profile": { "id": "...", "name": "<faculty-name>", "uid": "<faculty-uid>", "department": "Kayachikitsa" } }
```

### 3.2 Timetable CRUD (HOI/HOD)
```http
GET /api/timetables                      # all slots for the org (HOD = dept-scoped)
```
```jsonc
{ "success": true, "entries": [
  { "_id": "665...", "subject": "AyUG-RN", "type": "practical", "day": 1,
    "start": "09:00", "end": "10:00", "room": "Practical Lab",
    "academicYear": "2024-2025", "facultyLabel": "<faculty-name>",
    "faculty": { "_id": "...", "fullName": "<faculty-name>", "department": "Kayachikitsa" } } ] }
```
```http
POST /api/timetables
{ "faculty": "<studentId>", "subject": "AyUG-RN", "type": "lecture",
  "day": 2, "start": "14:00", "end": "15:00", "room": "Lecture Hall 1",
  "academicYear": "2024-2025", "facultyLabel": "<faculty-name>" }

PUT    /api/timetables/:id    # same body
DELETE /api/timetables/:id    # soft delete (sets deletedAt)
```
> `day`: 0=Mon … 5=Sat. `type`: `lecture | practical | clinical | activity`.

### 3.3 Real teaching analytics (HOI/HOD)
```http
GET /api/timetables/analytics?academicYear=2024-2025&faculty=<optional studentId>
```
```jsonc
{ "success": true, "totalSlots": 52,
  "typeDist":    [ { "name": "lecture", "value": 30 }, { "name": "practical", "value": 18 } ],
  "facultyLoad": [ { "name": "Gajanan C", "value": 9 }, { "name": "Varnit Yadav", "value": 4 } ],
  "byDate":      [ { "date": "2026-06-13", "conducted": 14, "missed": 3 } ],
  "todayPeriods":[ { "label": "9–10", "planned": 6, "conducted": 5, "missed": 1 } ],
  "totals":      { "conducted": 92, "missed": 11 } }
```
The client aggregates `byDate` into the **weekly / monthly / semester** charts and
uses `todayPeriods` for the **daily** view.

### 3.4 Teaching log + evidence (HOI/HOD)
```http
GET /api/class-checkins/log?date=2026-06-13
```
```jsonc
{ "success": true, "date": "2026-06-13", "rows": [
  { "timetableId": "...", "subject": "AyUG-RN", "status": "conducted",
    "geo": { "latitude": 22.3022, "longitude": 73.1892, "verified": true, "place": "Lecture Hall, Campus Block A" },
    "selfieUrl": "https://picsum.photos/seed/.../640/420", "photoCount": 3, "note": "..." } ] }
```
```http
GET /api/class-checkins/evidence/:timetableId?date=2026-06-13   # full doc (photos[], note, geo)
POST /api/class-checkins   # the mobile app starts/ends a class (writes a classcheckins row)
```

### 3.5 Faculty self endpoints (`role` = faculty/staff/hod)
```http
GET /api/portal/my/timetable                                   # my weekly slots
GET /api/portal/my/teaching-log?date=2026-06-13                # my classes + real status that day
GET /api/portal/my/class-evidence/:timetableId?date=2026-06-13 # my uploaded evidence for a class
GET /api/portal/my/outreach                                    # my outreach activities
GET /api/portal/my/attendance?month=2026-06                    # my attendance rows
```

---

## 4. Collections in the live DB (db: `test`)

These are the collections this module reads/writes. **“Demo seed”** = created by
`server/scripts/seedDemo.js`.

| Collection | Holds | Key fields | Seeded? |
|---|---|---|---|
| **`organizations`** | Institutes / HOI accounts (email login) | `email`, `name` | yes (1: `admin@example.org`) |
| **`students`** | Faculty / staff / HOD (UID login) | `uid`, `fullName`, `role`, `department`, `password`, `organization` | yes |
| **`timetables`** | Weekly recurring class slots | `faculty`→students, `organization`, `subject`, `type`, `day`, `start`, `end`, `room`, `academicYear`, `facultyLabel`, `deletedAt` | yes (3 academic years) |
| **`classcheckins`** | One class conducted/missed on a date (the *evidence*) | `timetable`→timetables, `faculty`, `date`, `status`, `photos[]`, `geo`, `note`, `headcount`, `actualStart/End`; unique on `(timetable, date)` | yes (last 8 days) |
| **`outreachactivities`** | Community/field outreach | `lead`→students, `organization`, `title`, `type`, `date`, `location`, `status`, `participants`, `gpsPoints`, `photoCount` | yes |
| `attendances` | Daily attendance events | `student`, `organization`, `type` (in/out/leave), `timestamp`, `authMethod`, `faceVerified` | yes |
| `auditlogs`, `dutyrosters`, `spotchecks`, `leaverequests`, `model_cheakoutrequests`, `holidays` | Other modules | — | yes |

> The 5 **bold** collections are everything the timetable/evidence/analytics/
> outreach features depend on.

---

## 5. Going live: drop the demo data, insert real data

The frontend does **not** change. You only swap what is in MongoDB.

### Option A — keep the demo until you’re ready, then replace per‑collection
Scope deletes by the demo org so you never touch other tenants:
```js
// mongosh  (after `use test`)
const org = db.organizations.findOne({ email: "admin@example.org" })._id;

// drop ONLY the timetable-module demo rows for that org:
db.timetables.deleteMany({ organization: org });
db.classcheckins.deleteMany({ organization: org });
db.outreachactivities.deleteMany({ organization: org });
// faculty accounts (optional — this also removes their logins!):
db.students.deleteMany({ organization: org, password: "Test@123" });
```
Then insert your real rows (same shapes as §4). Example — one real class:
```js
db.timetables.insertOne({
  organization: org,
  faculty: db.students.findOne({ uid: "<realUid>" })._id,
  subject: "Kayachikitsa", type: "lecture", day: 0,
  start: "09:00", end: "10:00", room: "Lecture Hall 1",
  academicYear: "2025-2026", facultyLabel: "Dr Real Name",
  deletedAt: null, createdAt: new Date(), updatedAt: new Date()
});
```
Real evidence is written automatically by the **mobile app** via
`POST /api/class-checkins` (start/end), so `classcheckins` fills itself in
production — no manual inserts needed.

### Option B — drop the whole collection and let production traffic refill it
```js
db.timetables.drop();        // recreated on next insert
db.classcheckins.drop();
db.outreachactivities.drop();
```
Use this only on a dedicated/empty environment (it removes ALL tenants’ rows).

### Re‑seed a fresh demo at any time
```bash
cd server
node scripts/seedDemo.js
```
Idempotent for timetable + faculty (it deletes the org’s demo rows and reinserts).
It prints the faculty demo login, e.g.:
```
>>> FACULTY DEMO LOGIN → <faculty-name> · UID: <faculty-uid> · Password: Test@123 · Dept: Kayachikitsa
```

---

## 6. Demo logins & flow

| Role | Login | Password |
|---|---|---|
| **HOI** (institute) | `admin@example.org` | `Test@123` |
| **Faculty** (<faculty-name>) | UID `<faculty-uid>` | `Test@123` |
| Super Admin | `superadmin` | `process.env.SUPER_ADMIN_KEY` |

Run it:
```bash
cd server && npm start      # API on :5001
cd client && npm start      # client (proxy → :5001)
```

End‑to‑end sync demo:
1. **HOI** → Timetable → filter “<faculty-name>” → his real classes appear.
   Past days are greyed; **today** is highlighted; past slots show **real**
   conducted/missed + geo + selfie (from `classcheckins`). Open one → real photos.
2. **HOI** → *Assign Class* to Varnit → it persists (`POST /api/timetables`).
3. **Faculty** (new tab, UID `<faculty-uid>`) → *My Timetable* → the same class is
   there (same `timetables` doc → identical status). *Outreach Activities* shows
   his real activity from `outreachactivities`.
4. **Teaching Analytics** (HOI, expand the panel) → Daily/Weekly numbers come from
   real `classcheckins` via `/api/timetables/analytics`.

---

## 7. Files changed for this integration

**Backend**
- `server/models/Timetable.js` — added `'activity'` to the `type` enum.
- `server/routes/timetables.js` — `POST/PUT` now persist `academicYear` +
  `facultyLabel`; new `GET /api/timetables/analytics`.
- `server/routes/classCheckins.js` — `/log` rows enriched with `geo`, `selfieUrl`,
  `photoCount`, `note`, `headcount`.
- `server/routes/portal.js` — new faculty endpoints: `GET /my/teaching-log`,
  `GET /my/class-evidence/:timetableId`, `GET /my/outreach`.
- `server/scripts/seedDemo.js` — `Dr Anand P` → `<faculty-name>`, collision‑safe
  UIDs, Varnit gets outreach, prints the demo login.

**Frontend**
- `client/src/lib/teachingLog.js` — fetch helpers for the real teaching log/evidence.
- `client/src/pages/TimetableManagement.js` — DB‑driven CRUD + real card status +
  past‑greyed/today‑highlight + analytics filters.
- `client/src/pages/portal/FacultyTimetable.js` — DB timetable + real status +
  week nav + past‑grey/today.
- `client/src/components/ClassEvidenceModal.jsx` — renders real `classcheckins`
  evidence when present.
- `client/src/components/DayScheduleModal.jsx` — accepts real live rows.
- `client/src/components/TimetableAnalytics.jsx` — consumes `/api/timetables/analytics`.
- `client/src/pages/portal/FacultyOutreach.js` — consumes `/api/portal/my/outreach`.
- `client/src/data/timetableData.js` — **now unused** (was the old hard‑coded
  source); safe to delete once you’re happy everything reads from the DB.
```
