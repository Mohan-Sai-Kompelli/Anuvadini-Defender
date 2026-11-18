const Organization = require('../models/Organization');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');

/**
 * Shared "campus" office geofence pool.
 *
 * Anuvadini, NETF and IUAC share offices: an employee of ANY of these three orgs
 * may mark attendance at ANY of their offices — and ONLY at those offices. Other
 * organizations in the database are NOT part of this pool and are unaffected.
 *
 * We resolve membership by org NAME (case-insensitive) so it keeps working even
 * if the underlying _ids change between environments.
 *
 * Office sources per campus org:
 *   - legacy single `location` { latitude, longitude }
 *   - `locations[]` multi-location array (coordinates + geofenceRadius)
 * Offices at the same coordinates are de-duplicated.
 *
 * Cached briefly so a busy check-in window doesn't re-query Mongo on every mark.
 */

// NOTE: `/^home$/i` is a LOCAL TEST addition so the "home" org (a dev account at
// a home address) is treated as a campus premises and can mark attendance.
// REMOVE before shipping — production must only allow Anuvadini / NETF / IUAC.
const CAMPUS_ORG_PATTERNS = [/anuvadini/i, /netf/i, /iuac/i, /^home$/i];

// Default campus-office geofence radius (metres) when an org/location doesn't set
// its own. Widened from 100→300 on 2026-07-08: at 100 m, people standing at the
// Anuvadini building were bouncing between ~50 m (pass) and ~120–195 m (fail) purely
// from GPS jitter, so genuine on-campus users got "outside location" after a
// successful face check. 300 m absorbs that drift while still rejecting the km-scale
// off-site attempts (face + spot-checks are the real anti-proxy controls, not this
// coarse gate). A per-org Area_radius / per-location geofenceRadius still overrides
// this and can only WIDEN it (see findNearestOffice).
const DEFAULT_CAMPUS_RADIUS_M = 300;

function isCampusOrgName(name) {
  const n = name || '';
  return CAMPUS_ORG_PATTERNS.some((re) => re.test(n));
}

// The three canonical campus premises the user wants shown in history. An office
// is mapped to ONE of these by matching its own name first, then its owning org
// name — so Anuvadini's sub-location "NETF AN" (physically the NETF building,
// same coordinates as the NETF org) resolves to "NETF", and "AICTE" (an
// Anuvadini sub-location) resolves to "Anuvadini". Order matters: NETF is
// checked before Anuvadini so "NETF AN under Anuvadini" wins as NETF.
const CANONICAL_CAMPUSES = [
  { name: 'IUAC', re: /iuac/i },
  { name: 'NETF', re: /netf/i },
  { name: 'Anuvadini', re: /anuvadini/i },
];

/**
 * Collapse an office (its location name + owning org name) to one of the three
 * canonical premises: 'Anuvadini' | 'NETF' | 'IUAC'. Falls back to the raw org
 * name if somehow none match (shouldn't happen for the campus pool).
 */
function canonicalCampusName(office) {
  const hay = `${(office && office.name) || ''} ${(office && office.orgName) || ''}`;
  const hit = CANONICAL_CAMPUSES.find((c) => c.re.test(hay));
  return hit ? hit.name : (office && (office.orgName || office.name)) || null;
}

let _cache = null;
let _cacheAt = 0;
const TTL_MS = 60 * 1000;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isUsableCoord(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    !(lat === 0 && lon === 0)
  );
}

/**
 * @returns {Promise<{ offices: Array<{orgId,orgName,name,latitude,longitude,radius}>, orgIds: Set<string> }>}
 *   offices — every distinct campus office; orgIds — ids of the campus orgs (so a
 *   caller can tell whether a given student belongs to the campus group).
 */
async function getCampusContext({ force = false } = {}) {
  const now = Date.now();
  if (!force && _cache && now - _cacheAt < TTL_MS) return _cache;

  const orgs = await Organization.find({ isActive: true })
    .select('name location locations Area_radius')
    .lean();

  const campusOrgs = orgs.filter((o) => isCampusOrgName(o.name));

  const offices = [];
  const orgIds = new Set();
  const seenCoord = new Set();

  const addOffice = (orgId, orgName, name, lat, lon, radius) => {
    if (!isUsableCoord(lat, lon)) return;
    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (seenCoord.has(key)) return;
    seenCoord.add(key);
    const office = { orgId, orgName, name: name || orgName, latitude: lat, longitude: lon, radius: radius || DEFAULT_CAMPUS_RADIUS_M };
    office.campus = canonicalCampusName(office); // 'Anuvadini' | 'NETF' | 'IUAC'
    offices.push(office);
  };

  for (const org of campusOrgs) {
    orgIds.add(String(org._id));
    const baseRadius = org.Area_radius || DEFAULT_CAMPUS_RADIUS_M;

    if (org.location) {
      addOffice(
        String(org._id),
        org.name,
        (org.location.address && String(org.location.address)) || org.name,
        org.location.latitude,
        org.location.longitude,
        baseRadius
      );
    }
    for (const loc of org.locations || []) {
      if (loc.isActive === false) continue;
      const c = loc.coordinates || {};
      addOffice(String(org._id), org.name, loc.name, c.latitude, c.longitude, loc.geofenceRadius || baseRadius);
    }
  }

  _cache = { offices, orgIds };
  _cacheAt = now;
  return _cache;
}

/**
 * Nearest campus office to a point + whether the point is in range.
 * extraRadius is a per-user floor (student.Area_radius) — it can only widen.
 * @returns {null | { office, distance, allowed, withinRange }}
 */
function findNearestOffice(offices, lat, lon, extraRadius = 0) {
  let best = null;
  for (const o of offices) {
    if (!isUsableCoord(o.latitude, o.longitude)) continue;
    const distance = haversineMeters(lat, lon, o.latitude, o.longitude);
    if (!best || distance < best.distance) best = { office: o, distance };
  }
  if (!best) return null;
  const allowed = Math.max(best.office.radius || DEFAULT_CAMPUS_RADIUS_M, extraRadius || 0);
  return { ...best, allowed, withinRange: best.distance <= allowed };
}

/**
 * THE single source of truth for scoping an Attendance query when the
 * requesting org is one of the shared campus branches (Anuvadini/NETF/IUAC).
 *
 * A branch's numbers = its OWN staff (so an employee who never left their home
 * branch still counts, including as absent) PLUS anyone — from ANY of the
 * three campus orgs — who PHYSICALLY MARKED at this branch's premises (their
 * markedOffice.name matches this branch's canonical campus name). So an IUAC
 * employee who marks at Anuvadini shows up in Anuvadini's numbers (with the
 * Office column showing where they're actually from/went), while an IUAC
 * employee who never visits Anuvadini does NOT clutter Anuvadini's report.
 * Applied symmetrically to all three branches — final design confirmed with
 * the user 2026-07-22 (supersedes the earlier home-org-only-only version).
 *
 * @param {string|ObjectId} organizationId - the org whose dashboard/report this is
 * @param {Object} [extraStudentFilter] - additional student constraint to AND in
 *   (e.g. an HOD's department scope: { student: { $in: [...] } }). When this
 *   already names a student set, campus expansion is skipped (that set is
 *   already the authoritative roster).
 * @returns {Promise<{ orgFilter: Object|ObjectId, studentClause: Object, rosterIds: ObjectId[]|null }>}
 *   Spread orgFilter/studentClause into the Attendance query:
 *   `{ organization: orgFilter, ...studentClause, ... }`. `rosterIds` is the
 *   same student id list (real ObjectId instances, not strings — safe to use
 *   directly in both Mongoose queries AND raw .aggregate() pipelines) — reuse
 *   it for a companion Student roster query (`_id: { $in: rosterIds }`) so
 *   absent/total counts include visitors
 *   too; null when not campus-scoped (caller keeps its own single-org roster).
 */
// Anuvadini is the HQ/master of the campus: its dashboard is a full rollup of
// EVERY campus org's ENTIRE attendance, regardless of which office it was
// physically marked at — not just marks made at Anuvadini's own premises.
// NETF and IUAC stay "branch-scoped" (home staff + whoever marked AT that
// specific branch). Confirmed with the user 2026-07-22 (supersedes the
// earlier fully-symmetric marked-at-only design for all three).
const CAMPUS_MASTER_NAME = 'Anuvadini';

const mongoose = require('mongoose');

async function campusScopedAttendanceFilter(organizationId, extraStudentFilter = {}) {
  const orgIdStr = String(organizationId);
  const { orgIds: campusOrgIds } = await getCampusContext();
  const isCampus = campusOrgIds.has(orgIdStr);

  if (!isCampus || extraStudentFilter.student) {
    const rawOrgId = typeof organizationId === 'string' ? new mongoose.Types.ObjectId(organizationId) : organizationId;
    return { orgFilter: rawOrgId, studentClause: { ...extraStudentFilter }, rosterIds: null };
  }

  const campusOrgIdList = Array.from(campusOrgIds).map(id => typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id);
  const org = await Organization.findById(organizationId).select('name').lean();
  const thisCampusName = canonicalCampusName({ name: org && org.name, orgName: org && org.name });

  if (thisCampusName === CAMPUS_MASTER_NAME) {
    // HQ rollup: every active student across all three campus orgs, no
    // markedOffice filtering — Anuvadini sees IUAC's and NETF's attendance in
    // full, wherever it was physically marked.
    //
    // rosterIds are kept as real ObjectId instances (NOT .map(String)) — this
    // studentClause gets spread into both Mongoose .find()/.countDocuments()
    // calls (which cast strings fine) AND raw .aggregate() pipelines
    // (attendance.js has several), which do NOT cast query values against the
    // schema at all. A string _id/student id inside an aggregate $match
    // silently compares against BSON ObjectId documents and matches nothing —
    // the campus rollup would look "empty" specifically on every
    // aggregate-based report while working fine on the simpler ones.
    const rosterIds = await Student.distinct('_id', { organization: { $in: campusOrgIdList }, isActive: true });
    return {
      orgFilter: { $in: campusOrgIdList },
      studentClause: { student: { $in: rosterIds } },
      rosterIds,
    };
  }

  // Branch-scoped (NETF / IUAC): this org's own staff + anyone from any
  // campus org who physically marked AT this branch.
  const [homeRosterIds, visitorIds] = await Promise.all([
    Student.distinct('_id', { organization: organizationId, isActive: true }),
    thisCampusName
      ? Attendance.distinct('student', {
          organization: { $in: campusOrgIdList },
          'markedOffice.name': thisCampusName,
        })
      : Promise.resolve([]),
  ]);
  // Dedupe by string key (ObjectId instances aren't reference-equal even for
  // the same id) but keep real ObjectId instances in the final array — see
  // the comment above for why plain strings break aggregate-based reports.
  const seen = new Map();
  for (const id of [...homeRosterIds, ...visitorIds]) {
    const key = String(id);
    if (!seen.has(key)) seen.set(key, id);
  }
  const rosterIds = Array.from(seen.values());

  return {
    orgFilter: { $in: campusOrgIdList },
    studentClause: { student: { $in: rosterIds } },
    rosterIds,
  };
}

module.exports = {
  getCampusContext,
  findNearestOffice,
  isCampusOrgName,
  canonicalCampusName,
  haversineMeters,
  campusScopedAttendanceFilter,
};
