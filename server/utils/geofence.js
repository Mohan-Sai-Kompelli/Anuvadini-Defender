// Geofence helpers — the "premises" is the same circle attendance check-in uses:
// the organization's location centre + the staff member's allowed radius.

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // metres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Resolve the premises geofence (centre + radius) for a student. Mirrors the
 * check-in geofence: organization.location coordinates + student.Area_radius.
 * Returns null when the org has no usable coordinates.
 */
function resolvePremises(organization, student) {
  const loc = organization && organization.location;
  if (
    !loc ||
    loc.latitude == null ||
    loc.longitude == null ||
    (Number(loc.latitude) === 0 && Number(loc.longitude) === 0)
  ) {
    return null;
  }
  const radius =
    (student && student.Area_radius) ||
    (organization && organization.Area_radius) ||
    100;
  return { latitude: Number(loc.latitude), longitude: Number(loc.longitude), radius };
}

module.exports = { haversineMeters, resolvePremises };
