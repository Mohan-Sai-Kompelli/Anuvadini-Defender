import React, { useMemo } from 'react';
import {
  X,
  MapPin,
  Camera,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Navigation,
} from 'lucide-react';

// ─── Dummy evidence generator (UI preview) ───────────────────────────────────
// Deterministic per class+date so the same slot always shows the same
// "uploaded" photos, note and coordinates. Replace with the class check-in /
// consultation evidence API when available.

const CAMPUS = { lat: 26.8718, lng: 75.7906, place: 'Anuvadini Campus' };

const seedNum = (str) => {
  let h = 7;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
};

const NOTES = {
  lecture: [
    'Covered the scheduled unit as per syllabus. 42 of 48 students present; concluded with a short Q&A.',
    'Lecture completed with case-based discussion. Assignment topics shared with the class.',
    'Revision lecture conducted; doubts session held in the last 15 minutes.',
  ],
  practical: [
    'Demonstration completed; students performed supervised hands-on practice in batches.',
    'Practical conducted as scheduled. Hands-on exercise completed.',
    'Lab session completed; records of 3 students pending submission.',
  ],
  clinical: [
    'Field session completed. Case study discussed with interns.',
    'Site visit completed; records reviewed and updated.',
    'Field teaching session — case taking demonstrated to final-year batch.',
  ],
};

const pad2 = (n) => String(n).padStart(2, '0');

const addMin = (hhmm, delta) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + delta;
  return `${pad2(Math.floor(t / 60) % 24)}:${pad2(t % 60)}`;
};

function photoUri({ kind, hue, title, stamp1, stamp2 }) {
  let scene = '';
  if (kind === 'selfie') {
    scene =
      `<circle cx='320' cy='168' r='64' fill='hsl(${hue},32%,40%)'/>` +
      `<path d='M196 340 Q320 232 444 340 Z' fill='hsl(${hue},32%,40%)'/>`;
  } else if (kind === 'room') {
    scene = [200, 258, 316]
      .map((y) =>
        [70, 220, 370, 500]
          .map((x) => `<rect x='${x}' y='${y}' width='92' height='30' rx='5' fill='hsl(${hue},28%,48%)'/>`)
          .join('')
      )
      .join('');
  } else if (kind === 'clinic') {
    scene =
      `<rect x='90' y='220' width='190' height='86' rx='10' fill='hsl(${hue},28%,48%)'/>` +
      `<rect x='104' y='232' width='44' height='28' rx='6' fill='hsl(${hue},35%,72%)'/>` +
      `<rect x='360' y='220' width='190' height='86' rx='10' fill='hsl(${hue},28%,48%)'/>` +
      `<rect x='374' y='232' width='44' height='28' rx='6' fill='hsl(${hue},35%,72%)'/>`;
  } else {
    scene =
      `<rect x='150' y='86' width='340' height='200' rx='8' fill='hsl(${hue},20%,92%)' stroke='hsl(${hue},25%,45%)' stroke-width='5'/>` +
      [126, 162, 198, 234]
        .map((y) => `<rect x='180' y='${y}' width='${280 - (y % 70)}' height='10' rx='5' fill='hsl(${hue},22%,62%)'/>`)
        .join('');
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='420'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue},45%,82%)'/>` +
    `<stop offset='1' stop-color='hsl(${hue + 28},42%,64%)'/>` +
    `</linearGradient></defs>` +
    `<rect width='640' height='420' fill='url(#g)'/>` +
    scene +
    `<text x='320' y='56' text-anchor='middle' font-family='sans-serif' font-size='25' font-weight='600' fill='rgba(15,23,42,0.55)'>${title}</text>` +
    `<rect x='0' y='344' width='640' height='76' fill='rgba(15,23,42,0.62)'/>` +
    `<text x='18' y='376' font-family='sans-serif' font-size='17' fill='white'>📍 ${stamp1}</text>` +
    `<text x='18' y='402' font-family='sans-serif' font-size='15' fill='rgba(255,255,255,0.85)'>${stamp2}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildEvidence(data) {
  const h = seedNum(`${data.id}-${data.dateLabel}`);
  const kindKey = (data.type || 'lecture').toLowerCase();
  const isClinic = kindKey === 'clinical';

  const lat = (CAMPUS.lat + ((h % 90) - 45) * 0.00001).toFixed(5);
  const lng = (CAMPUS.lng + (((h >> 4) % 90) - 45) * 0.00001).toFixed(5);
  const accuracy = 5 + (h % 9);
  const geofenceDist = 8 + (h % 38);
  const startedAt = addMin(data.start, 1 + (h % 6));
  const endedAt = addMin(data.end, (h % 5) - 2);
  const notesPool = NOTES[kindKey] || NOTES.lecture;
  const headcount = isClinic ? 6 + (h % 22) : 28 + (h % 24);
  const hash = `${((h * 2654435761) >>> 0).toString(16).padStart(8, '0')}…${(((h * 40503) >>> 0) & 0xffff).toString(16).padStart(4, '0')}`;

  const stamp1 = `${lat}, ${lng} ±${accuracy}m · ${data.room}`;
  const stamp2 = `${data.dateLabel} · ${startedAt} · SAACMS geo-tag verified`;
  const hue = 150 + (h % 140);

  const photos = [
    {
      label: 'Geo-tagged selfie — start of class',
      uri: photoUri({ kind: 'selfie', hue, title: `Selfie · ${data.room}`, stamp1, stamp2 }),
    },
    isClinic
      ? {
          label: 'Consultation area photo',
          uri: photoUri({ kind: 'clinic', hue: hue + 40, title: `Consultation area · ${data.room}`, stamp1, stamp2 }),
        }
      : {
          label: 'Classroom wide shot',
          uri: photoUri({ kind: 'room', hue: hue + 40, title: `Classroom · ${data.room}`, stamp1, stamp2 }),
        },
    isClinic
      ? {
          label: 'Duty register (redacted)',
          uri: photoUri({ kind: 'board', hue: hue + 80, title: 'Duty register', stamp1, stamp2 }),
        }
      : {
          label: 'Board / demonstration photo',
          uri: photoUri({ kind: 'board', hue: hue + 80, title: 'Board work', stamp1, stamp2 }),
        },
  ];

  return {
    status: data.status || (h % 7 === 0 ? 'missed' : 'conducted'),
    photos,
    note: notesPool[h % notesPool.length],
    headcount,
    isClinic,
    geo: { lat, lng, accuracy, geofenceDist, place: CAMPUS.place, verified: true },
    startedAt,
    endedAt,
    faceVerified: true,
    hash,
  };
}

// Map a REAL ClassCheckin document (from the evidence API) into the shape the
// modal renders. Only values actually uploaded from the app are used — nothing
// is fabricated; anything missing renders as a graceful placeholder.
function realToEvidence(real, data) {
  const fmt = (n) => (n == null ? null : Number(n).toFixed(5));
  const isClinic = (data.type || '').toLowerCase() === 'clinical';
  const geo = real.geo || {};
  const fallbackLabels = isClinic
    ? ['Geo-tagged selfie — start of session', 'Consultation area photo', 'Duty register (redacted)']
    : ['Geo-tagged selfie — start of class', 'Classroom wide shot', 'Board / demonstration photo'];
  const photos = (real.photos || [])
    .filter((p) => p && (p.image || p.uri))
    .map((p, i) => ({ label: p.label || fallbackLabels[i] || `Photo ${i + 1}`, uri: p.image || p.uri }));
  const hash = real.evidenceHash
    ? `${String(real.evidenceHash).slice(0, 8)}…${String(real.evidenceHash).slice(-4)}`
    : null;
  return {
    isReal: true,
    status: real.status === 'missed' ? 'missed' : 'conducted',
    photos,
    note: real.note || '',
    headcount: real.headcount != null ? real.headcount : null,
    isClinic,
    geo: {
      lat: fmt(geo.latitude),
      lng: fmt(geo.longitude),
      accuracy: geo.accuracy != null ? Math.round(geo.accuracy) : null,
      geofenceDist: geo.distanceM != null ? Math.round(geo.distanceM) : null,
      place: geo.place || '',
      verified: !!geo.verified,
    },
    startedAt: real.actualStart || null,
    endedAt: real.actualEnd || null,
    faceVerified: !!real.faceVerified,
    hash,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evidence viewer for a completed class / clinical session: geo-tagged photos,
 * the faculty's note, GPS details and verification status.
 * `data`: { id, subject, faculty, type, room, dateLabel, start, end, status? }
 * `realEvidence`: the uploaded ClassCheckin doc when available — preferred over
 *   the deterministic preview so live classes show their actual photos/note/geo.
 */
const ClassEvidenceModal = ({ open, onClose, data, realEvidence }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const evidence = useMemo(() => {
    if (!data) return null;
    if (realEvidence) return realToEvidence(realEvidence, data);
    return buildEvidence(data);
  }, [data, realEvidence]);

  React.useEffect(() => {
    setIsExpanded(false);
  }, [open, data]);

  if (!open || !data || !evidence) return null;

  const missed = evidence.status === 'missed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        data-lenis-prevent
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 shadow-elevation-3 dark:bg-slate-800 dark:shadow-elevation-3-dark sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Class evidence"
      >
        {/* Header */}
        <div className="mb-2 flex items-start justify-between gap-3 sm:mb-1">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {data.subject}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {data.faculty} · {data.room} · {data.dateLabel} · {data.start}–{data.end}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status */}
        <div className="mb-4">
          {missed ? (
            <span className="inline-flex items-center gap-1 rounded-pill bg-danger-50 px-2.5 py-0.5 text-xs font-medium text-danger-700 dark:bg-danger-900/40 dark:text-danger-400">
              <XCircle className="h-3 w-3" aria-hidden="true" /> Missed — no evidence uploaded
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-pill bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-700 dark:bg-success-900/40 dark:text-success-400">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Conducted — evidence verified
            </span>
          )}
        </div>

        {missed ? (
          <div className="rounded-md border border-dashed border-slate-300 p-8 text-center dark:border-slate-600">
            <XCircle className="mx-auto mb-2 h-8 w-8 text-danger-400" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              No check-in, photos or notes were uploaded for this class.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              The slot was flagged as missed in the teaching log and the Admin was alerted.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Photos */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Camera className="h-4 w-4 text-primary-600 dark:text-primary-300" aria-hidden="true" />
                Uploaded photos ({evidence.photos.length})
              </h3>
              {evidence.photos.length > 0 ? (
                <div>
                  {!isExpanded && evidence.photos.length > 2 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
                      <figure className="relative">
                        <img
                          src={evidence.photos[0].uri}
                          alt={evidence.photos[0].label}
                          className="aspect-[3/2] w-full rounded-md border border-slate-200 object-cover dark:border-slate-700"
                        />
                        <figcaption className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                          {evidence.photos[0].label}
                        </figcaption>
                      </figure>
                      <figure className="relative">
                        <img
                          src={evidence.photos[1].uri}
                          alt={evidence.photos[1].label}
                          className="aspect-[3/2] w-full rounded-md border border-slate-200 object-cover dark:border-slate-700"
                        />
                        <figcaption className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                          {evidence.photos[1].label}
                        </figcaption>
                      </figure>
                      <button
                        onClick={() => setIsExpanded(true)}
                        className="group relative flex aspect-[3/2] w-full flex-col items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-900/90 text-white transition-all hover:bg-slate-900/80 dark:border-slate-700 col-span-2 sm:col-span-1"
                      >
                        {evidence.photos[2] && (
                          <img
                            src={evidence.photos[2].uri}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover opacity-40 blur-[2px] transition-transform group-hover:scale-105"
                          />
                        )}
                        <div className="relative z-10 text-center p-2">
                          <span className="text-xl font-bold font-sans">
                            +{evidence.photos.length - 2} more
                          </span>
                          <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-slate-300 font-semibold">
                            Click to view all
                          </span>
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {evidence.photos.map((p, i) => (
                          <figure key={`${p.label}-${i}`}>
                            <img
                              src={p.uri}
                              alt={p.label}
                              className="aspect-[3/2] w-full rounded-md border border-slate-200 object-cover dark:border-slate-700"
                            />
                            <figcaption className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {p.label}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                      {isExpanded && (
                        <button
                          onClick={() => setIsExpanded(false)}
                          className="mt-4 text-sm font-bold text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 flex items-center gap-1 cursor-pointer hover:underline"
                        >
                          Show less
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  No photos were uploaded for this class.
                </p>
              )}
            </div>

            {/* Faculty note */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <FileText className="h-4 w-4 text-primary-600 dark:text-primary-300" aria-hidden="true" />
                {evidence.isClinic ? "Doctor's note" : "Faculty's note"}
              </h3>
              <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                {evidence.note ? `“${evidence.note}”` : 'No note was recorded for this class.'}
              </p>
              {evidence.headcount != null && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {evidence.isClinic
                    ? `${evidence.headcount} patients attended`
                    : `${evidence.headcount} students present`}
                </p>
              )}
            </div>

            {/* Geolocation */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <MapPin className="h-4 w-4 text-primary-600 dark:text-primary-300" aria-hidden="true" />
                Geolocation
              </h3>
              <div className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Navigation className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span className="font-mono text-xs">
                    {evidence.geo.lat && evidence.geo.lng
                      ? `${evidence.geo.lat}, ${evidence.geo.lng}${evidence.geo.accuracy != null ? ` (±${evidence.geo.accuracy} m)` : ''}`
                      : 'Location not recorded'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  {evidence.geo.place || data.room}
                </div>
                {evidence.geo.verified ? (
                  <div className="flex items-center gap-2 text-success-600 dark:text-success-400 sm:col-span-2">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Inside {data.room} geofence{evidence.geo.geofenceDist != null ? ` — ${evidence.geo.geofenceDist} m from centre` : ''}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 sm:col-span-2">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Geofence not verified for this check-in
                  </div>
                )}
              </div>
            </div>

            {/* Timing + verification */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-4 text-xs dark:border-slate-700">
              <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                Actual: {evidence.startedAt || '—'} – {evidence.endedAt || '—'} (scheduled {data.start}–{data.end})
              </span>
              {evidence.faceVerified ? (
                <span className="inline-flex items-center gap-1 text-success-600 dark:text-success-400">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Face &amp; liveness verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500">
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Face not verified
                </span>
              )}
              {evidence.geo.verified ? (
                <span className="inline-flex items-center gap-1 text-success-600 dark:text-success-400">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> GPS verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500">
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> GPS not verified
                </span>
              )}
              {evidence.hash && (
                <span
                  className="inline-flex items-center gap-1 font-mono text-slate-500 dark:text-slate-400"
                  title="SHA-256 of the evidence bundle — tamper-evident"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-success-600 dark:text-success-400" aria-hidden="true" />
                  {evidence.hash}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassEvidenceModal;
