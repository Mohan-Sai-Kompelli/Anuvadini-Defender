# GPS Tracking Features

Four features work together on every incoming ping to make location tracking accurate and reliable.

---

## Feature 1 — Accuracy Filter

### What it does
Drops any GPS ping where the phone's self-reported accuracy is worse than **60 metres** before any other processing happens.

### Why
GPS accuracy degrades indoors, in basements, or when the phone has poor satellite visibility. A ping with accuracy = 200 m means the phone is saying "I think I'm somewhere within a 200 m circle" — useless for a 100 m campus geofence. Passing it through would move the staff pin wildly and potentially trigger false breach alerts.

### Code
```js
// locationTrackingService.js
const MAX_ACCURACY_M = 60;

if (typeof accuracy === 'number' && accuracy > MAX_ACCURACY_M) {
  console.log(`[Tracking] ping discarded — accuracy ${Math.round(accuracy)} m > ${MAX_ACCURACY_M} m limit`);
  return { success: true, discarded: true, insidePremises: null, events: [] };
}
```

The response is still `success: true` so the app does not retry in a tight loop.

### Dilip J example

Dilip's phone is indoors near a concrete pillar. GPS chip reports:
```
latitude:  28.519477
longitude: 77.164982
accuracy:  85 m        ← worse than 60 m limit
```
Result: ping discarded. `LiveLocation` doc unchanged. Map pin stays at last known good position. Server logs:
```
[Tracking] ping discarded — accuracy 85 m > 60 m limit (student 6a2c5fd07dc095f72f41f036)
```

Next ping 10 seconds later, outdoors:
```
accuracy: 18 m         ← passes filter → processing continues
```

### Threshold choice
60 m is deliberately looser than the 100 m campus radius so most real-world mid-range Android readings (typically 15–55 m outdoors) pass through. Tightening to 30 m would discard too many valid pings on budget devices. Loosening to 100 m would let campus-sized errors through.

---

## Feature 2 — Kalman Smoothing

### What it does
Blends each new raw GPS fix with the previous best estimate using a **1D Kalman filter applied independently on latitude and longitude**. The result is a smoothed coordinate that resists sudden jumps while still tracking real movement.

### Why
GPS chips on phones jitter even when the person is standing still — readings bounce ±10–30 m between consecutive fixes. Without smoothing, the trail polyline looks jagged, `distanceTraveledM` is inflated (every jitter adds distance), and the live map pin twitches unnecessarily.

### Math (plain English)

Two values are maintained per axis (lat / lon):
- `x` — best current estimate of the real coordinate
- `p` — uncertainty in that estimate (metres-equivalent)

On every ping:

**PREDICT** — uncertainty grows because the person may have moved:
```
p_predicted = p + Q        (Q = 1.0 m per fix, tuned for walking staff)
```

**UPDATE** — blend estimate with new GPS measurement:
```
K     = p_predicted / (p_predicted + R)    (Kalman gain, 0–1)
x_new = x + K × (gps_reading − x)
p_new = (1 − K) × p_predicted
```
Where `R` = GPS accuracy reported by the chip (metres). Lower R = more trust in the new reading.

When `R` is small (good GPS, e.g. 10 m): `K → 1` → snap to the GPS fix.
When `R` is large (poor GPS, e.g. 55 m): `K → 0` → barely move from the estimate.

### Code
```js
// utils/kalmanFilter.js
const PROCESS_NOISE_M = 1.0;   // Q — raise to 3–5 for faster movers
const DEFAULT_ACCURACY_M = 30; // R fallback when phone doesn't report accuracy

function smooth(studentId, latitude, longitude, accuracy) {
  const R = (typeof accuracy === 'number' && accuracy > 0) ? accuracy : DEFAULT_ACCURACY_M;

  if (!states.has(studentId)) {
    // First fix — initialise directly from GPS, gain = 1.0 (full trust)
    states.set(studentId, { lat: { x: latitude, p: R }, lon: { x: longitude, p: R } });
    return { latitude, longitude, kalmanGain: 1.0 };
  }

  const st = states.get(studentId);
  const pLat = st.lat.p + PROCESS_NOISE_M;   // PREDICT
  const kLat = pLat / (pLat + R);            // Kalman gain
  st.lat.x  = st.lat.x + kLat * (latitude  - st.lat.x);  // UPDATE
  st.lat.p  = (1 - kLat) * pLat;
  // same for longitude ...
  return { latitude: st.lat.x, longitude: st.lon.x, kalmanGain };
}
```

State is **in-memory per Node process**, keyed by `studentId`. It resets on server restart or explicit `kalmanFilter.reset(studentId)` (called on checkout/stop so the next check-in starts fresh).

### Dilip J example

Dilip is standing at the campus gate (true position ≈ 28.535361, 77.154972). Three consecutive GPS readings arrive:

| Ping | Raw lat | Raw lon | accuracy | Kalman gain | Smoothed lat | Smoothed lon |
|------|---------|---------|----------|-------------|--------------|--------------|
| 1 (first fix) | 28.535361 | 77.154972 | 18 m | 1.000 | 28.535361 | 77.154972 |
| 2 (jitter) | 28.535580 | 77.155210 | 22 m | 0.955 | 28.535570 | 77.155198 |
| 3 (bad indoor) | 28.537100 | 77.157800 | 55 m | 0.480 | 28.536323 | 77.156481 |

Ping 3 is a bad reading (55 m accuracy, phone briefly lost satellites). Raw GPS would jump ~300 m. Kalman gain of 0.48 means only 48% of that jump is accepted → smoothed position shifts ~144 m instead of ~300 m.

Server log for ping 3:
```
[Kalman] Dr Dilip J: raw=(28.537100,77.157800) → smoothed=(28.536323,77.156481) gain=0.480 acc=55m
```

### Raw vs Smoothed in the portal
The Full Report page stores both coordinates in `LocationTrail`:
- `latitude / longitude` = Kalman-smoothed (used for all geofence decisions)
- `rawLatitude / rawLongitude` = original GPS

Toggle **"Show Raw GPS"** in the report to overlay the dashed violet raw path on the map. Large divergence between the two lines = noisy GPS session; small divergence = clean outdoor signal.

---

## Feature 3 — Haversine Geofence (Inside / Outside)

### What it does
After every ping, computes the great-circle distance between the staff member's smoothed position and the campus centre. Compares it to the campus radius to determine `insidePremises`.

### Why
A simple bounding-box check fails near poles or for non-square campuses. Haversine gives the true curved-earth distance in metres, matching exactly how the attendance check-in geofence works — so "check-in allowed radius" and "live map inside radius" are the same boundary.

### Code
```js
// utils/geofence.js
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // earth radius metres
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// locationTrackingService.js
const EXIT_BUFFER_M = 25; // hysteresis — must go 25 m past radius before flagging exit

distanceM = haversineMeters(latitude, longitude, premises.latitude, premises.longitude);

if (firstFix) {
  insidePremises = distanceM <= premises.radius;
} else if (wasInside && distanceM > premises.radius + EXIT_BUFFER_M) {
  insidePremises = false;   // crossed out + 25 m buffer
} else if (!wasInside && distanceM <= premises.radius) {
  insidePremises = true;    // came back in
} else {
  insidePremises = wasInside; // no change — hysteresis
}
```

### Premises resolution
```js
// utils/geofence.js — resolvePremises()
// Radius priority: student.Area_radius → org.Area_radius → 100 m default
const radius = student.Area_radius || org.Area_radius || 100;
```

Each staff member can have their own allowed radius (e.g. field doctors get 500 m, lab staff get 100 m).

### EXIT_BUFFER_M — why 25 m hysteresis
Without a buffer, a person standing exactly on the boundary causes rapid inside/outside flipping as GPS jitters ±10 m. The 25 m buffer means they must be at `radius + 25 m = 125 m` from centre before an exit is even considered. Re-entry only requires crossing back inside `radius = 100 m`. This asymmetry prevents flapping.

### Dilip J example

Campus centre: `28.535361, 77.154972`. Radius: `100 m`.

Dilip's actual position today: `28.519477, 77.164982` (Kalman-smoothed).

```
distanceM = haversineMeters(28.519477, 77.164982, 28.535361, 77.154972)
          = 2019 m
```

`2019 m > 100 m + 25 m (125 m)` → `insidePremises = false`.

Live map shows Dilip's pin in **red** (outside). Distance from campus shown as **2.02 km**.

If Dilip walks back to `28.535200, 77.154800` (just inside gate):
```
distanceM = haversineMeters(28.535200, 77.154800, 28.535361, 77.154972)
          = 24 m
```
`24 m ≤ 100 m` → `insidePremises = true`. Pin goes **green**.

---

## Feature 4 — Exit Verification (3-Ping Rule)

### What it does
When a ping lands outside the geofence, the server does **not** immediately fire a breach alert. Instead it asks the app for 3 consecutive **hard-refresh** GPS fixes (bypassing the OS location cache). Only if all 3 land outside is the exit confirmed and the alert sent.

### Why
GPS multipath near a building wall can briefly throw a reading 150–300 m outside even when the person is standing in the campus car park. A single outside ping would generate a false "staff left premises" push notification to the HOD. The 3-ping rule ensures the person genuinely moved out, not just suffered a momentary GPS glitch.

### Flow

```
Normal ping arrives, distanceM = 180 m (outside 100 m radius + 25 m buffer)
    │
    ▼
exitVerifyCount = 1
needsVerification = true
insidePremises set to false (map shows real position)
Response: { needsVerification: true }
    │
    ▼  App receives needsVerification → immediately takes fresh GPS fix (maximumAge: 0)
    │
Verification ping 1 arrives (isVerification: true), distanceM = 175 m
    exitVerifyCount = 2, needsVerification = true
    │
    ▼  App takes another fresh fix
    │
Verification ping 2 arrives (isVerification: true), distanceM = 182 m
    exitVerifyCount = 3 ≥ EXIT_CONFIRM_COUNT (3)
    verifiedExit = true
    exitVerifyCount reset to 0
    │
    ▼
breach event fired:
  - breachCountToday += 1
  - outsideSince = now
  - GeofenceAlert created in DB
  - Push notification → Dilip: "You left premises"
  - Push notification → HOD: "Dr Dilip J left premises (~180 m from campus)"
```

### Abort — any verification ping lands inside

```
Verification ping 1 arrives (isVerification: true), distanceM = 95 m (inside!)
    exitVerifyCount = 0
    insidePremises = true
    needsVerification = false
    → no alert, pin stays green
```

This handles the case where the first outside ping was GPS noise but the person never actually left.

### Code
```js
// locationTrackingService.js
const EXIT_CONFIRM_COUNT = 3;
const VERIFICATION_INTERVAL_MS = 5000; // liveLocationService.ts — 5 s between verify pings

if (wasInside && insidePremises === false) {
  if (isVerification) {
    exitVerifyCount += 1;
  } else {
    exitVerifyCount = 1; // first suspicious ping
  }

  if (exitVerifyCount >= EXIT_CONFIRM_COUNT) {
    verifiedExit = true;
    exitVerifyCount = 0;
  } else {
    needsVerification = true; // ask app for hard-refresh fix
  }
}
// verifiedExit = true → breach event fires in step 5
```

### Dilip J example

Dilip is at 2019 m from campus (genuinely outside). Timeline:

| Time | isVerification | distanceM | exitVerifyCount | Action |
|------|---------------|-----------|-----------------|--------|
| 14:22:00 | false | 2019 m | 1 | Map shows outside, verify requested |
| 14:22:05 | true | 2021 m | 2 | Still outside, another verify |
| 14:22:10 | true | 2018 m | 3 | **Exit confirmed** — alert fired |

Total time from first suspicious ping to alert: **~10 seconds**.

Server logs:
```
[Tracking] outside ping detected, starting verification for student 6a2c5fd07dc095f72f41f036 — distance 2019 m
[Tracking] exit verification 2/3 for student 6a2c5fd07dc095f72f41f036 — distance 2021 m
[Tracking] exit verification 3/3 for student 6a2c5fd07dc095f72f41f036 — distance 2018 m
[Tracking] genuine exit confirmed after 3 hard-refresh fixes for student 6a2c5fd07dc095f72f41f036
```

### What `exitVerifyCount` in the DB means

| Value | Meaning |
|-------|---------|
| 0 | No pending verification (inside, or just confirmed exit) |
| 1 | First outside ping seen, waiting for verification ping 1 |
| 2 | Verification ping 1 confirmed outside, waiting for ping 2 |
| 3+ | Never stored — immediately triggers confirmed exit and resets to 0 |

---

## How All 4 Work Together on a Single Ping

```
Incoming ping: lat=28.519477, lon=77.164982, accuracy=18, speed=1.4, isVerification=false

Step 1 — ACCURACY FILTER
  accuracy 18 m ≤ 60 m → PASS

Step 2 — KALMAN SMOOTHING
  raw:      (28.519477, 77.164982)
  smoothed: (28.519501, 77.164990)   kalmanGain = 0.820
  (smoothed coords used for everything below)

Step 3 — HAVERSINE GEOFENCE
  distanceM = haversineMeters(28.519501, 77.164990, 28.535361, 77.154972)
            = 2017 m
  2017 > 100 + 25 → insidePremises = false

Step 4 — EXIT VERIFICATION
  wasInside = true (previous ping was inside)
  insidePremises = false → suspicious
  isVerification = false → first suspicious ping
  exitVerifyCount = 1
  needsVerification = true
  (no breach alert yet)

Persisted to DB:
  LiveLocation.latitude  = 28.519501   (smoothed)
  LiveLocation.longitude = 77.164990   (smoothed)
  LiveLocation.distanceM = 2017
  LiveLocation.insidePremises = false
  LiveLocation.exitVerifyCount = 1

Trail saved:
  rawLatitude  = 28.519477   (original GPS)
  rawLongitude = 77.164982
  latitude     = 28.519501   (Kalman)
  longitude    = 77.164990
  speed        = 1.4 m/s

Response to app:
  { success: true, insidePremises: false, needsVerification: true, exitVerifyCount: 1 }
```

App immediately takes a fresh GPS fix and sends it back with `isVerification: true`. Two more outside verifications → breach alert fired.
