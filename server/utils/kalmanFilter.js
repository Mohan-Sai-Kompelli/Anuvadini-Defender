/**
 * Per-student 2D Kalman filter for GPS smoothing.
 *
 * Each student gets an independent state { lat, lon } stored in-memory.
 * State persists across HTTP requests for the lifetime of the Node process
 * (GPS fixes arrive every 15 s so the in-memory map stays small).
 *
 * Math in plain English:
 *   We maintain two values per axis (lat / lon):
 *     x  = our best current estimate of the real coordinate
 *     p  = how uncertain we are about x (in metres-equivalent)
 *
 *   On every new GPS fix we do two steps:
 *
 *   PREDICT: uncertainty grows slightly because the person may have moved.
 *     p_new = p + Q          (Q = process noise, ~1 m/fix for walking staff)
 *
 *   UPDATE: blend our estimate with the new measurement, weighted by GPS accuracy.
 *     K      = p_new / (p_new + R)   (Kalman gain: 0 = ignore GPS, 1 = trust GPS fully)
 *     x_new  = x + K * (measured - x)
 *     p_new  = (1 - K) * p_new
 *
 *   When GPS accuracy is great (R small):  K → 1  → snap to measurement.
 *   When GPS accuracy is bad  (R large):   K → 0  → stick to our estimate.
 *
 * Practical effect:
 *   A 200 m accuracy ping (indoor multipath) gets Kalman gain ≈ 0.02
 *   → our estimate barely moves. The 12-km spike from the screenshots
 *   would shift the smoothed position by only ~240 m, not 12 km.
 */

// Process noise in metres per fix.  1.0 is appropriate for slow-walking staff;
// raise to 3-5 for faster movers if you see over-smoothing.
const PROCESS_NOISE_M = 1.0;

// Default measurement noise when the GPS chip does not report accuracy.
const DEFAULT_ACCURACY_M = 30;

// In-memory state: studentId (string) → { lat: {x, p}, lon: {x, p} }
const states = new Map();

/**
 * Feed one GPS fix through the Kalman filter.
 *
 * @param {string} studentId
 * @param {number} latitude   raw GPS latitude
 * @param {number} longitude  raw GPS longitude
 * @param {number|null} accuracy  GPS self-reported accuracy in metres (lower = better)
 * @returns {{ latitude: number, longitude: number, kalmanGain: number }}
 *          Smoothed coordinates + the gain used (for logging/debugging).
 */
function smooth(studentId, latitude, longitude, accuracy) {
  const id = String(studentId);
  const R = (typeof accuracy === 'number' && accuracy > 0) ? accuracy : DEFAULT_ACCURACY_M;

  if (!states.has(id)) {
    // First fix for this student — initialise directly from GPS.
    states.set(id, {
      lat: { x: latitude,  p: R },
      lon: { x: longitude, p: R },
    });
    return { latitude, longitude, kalmanGain: 1.0 };
  }

  const st = states.get(id);

  // ── PREDICT ────────────────────────────────────────────────────────────────
  const pLat = st.lat.p + PROCESS_NOISE_M;
  const pLon = st.lon.p + PROCESS_NOISE_M;

  // ── UPDATE ─────────────────────────────────────────────────────────────────
  const kLat = pLat / (pLat + R);
  const kLon = pLon / (pLon + R);

  st.lat.x = st.lat.x + kLat * (latitude  - st.lat.x);
  st.lon.x = st.lon.x + kLon * (longitude - st.lon.x);
  st.lat.p = (1 - kLat) * pLat;
  st.lon.p = (1 - kLon) * pLon;

  // Average gain across both axes for logging.
  const kalmanGain = parseFloat(((kLat + kLon) / 2).toFixed(3));

  return { latitude: st.lat.x, longitude: st.lon.x, kalmanGain };
}

/**
 * Reset a student's Kalman state.
 * Call on checkout / live-location stop so the next check-in starts fresh.
 */
function reset(studentId) {
  states.delete(String(studentId));
}

/**
 * Peek at the current state without updating it (useful for debugging).
 */
function getState(studentId) {
  return states.get(String(studentId)) || null;
}

module.exports = { smooth, reset, getState };
