import React, { useState, useMemo } from 'react';
import {
  X, MapPin, Camera, ShieldCheck, CheckCircle2, XCircle,
  Clock, FileText, Navigation, Users, AlertTriangle,
  PlayCircle, ChevronLeft, ChevronRight, Download,
  GraduationCap, BookOpen, Stethoscope, FlaskConical,
  Timer, Building2, User, CalendarDays,
} from 'lucide-react';

// ─── Deterministic seeded dummy evidence ─────────────────────────────────────

const seed = (str) => {
  let h = 17;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
};

const FACULTY_NOTES = {
  Lecture: [
    'Covered syllabus topic as scheduled. 38 of 44 students present. Q&A held in last 10 minutes; good participation noted.',
    'Lecture completed with case-based discussion. Students engaged well. Supplementary reading list distributed.',
    'Revision session conducted. Doubts resolved; 5 students stayed back for additional guidance.',
    'Unit completed. Assessment scheduled for next class. Attendance satisfactory.',
  ],
  Practical: [
    'Demonstration completed in batches. All students performed the procedure under supervision. Lab records updated.',
    'Practical conducted as per schedule. Hands-on exercise completed. 2 student records pending submission.',
    'Hands-on session completed. Students showed good understanding of the technique. Equipment sanitised post-session.',
  ],
  Clinical: [
    'Field session completed. Case study discussed with interns.',
    'Site visit completed; records reviewed and updated.',
    'Clinical teaching session completed. 14 patients attended; case presentations given by 3 interns.',
    'Field teaching conducted. Procedure demonstrated to final-year batch.',
  ],
};

const TYPE_ICONS = {
  Lecture: BookOpen,
  Practical: FlaskConical,
  Clinical: Stethoscope,
};

function buildTeachingEvidence(row) {
  const h = seed(`${row.id}-${row.faculty}`);
  const hue = 160 + (h % 80);
  const typeKey = row.type || 'Lecture';
  const notes = FACULTY_NOTES[typeKey] || FACULTY_NOTES.Lecture;
  const note = notes[h % notes.length];
  const headcount = typeKey === 'Clinical' ? 8 + (h % 20) : 30 + (h % 18);
  const lat = (26.8718 + ((h % 90) - 45) * 0.00005).toFixed(5);
  const lng = (75.7906 + (((h >> 4) % 90) - 45) * 0.00005).toFixed(5);
  const accuracy = 4 + (h % 8);
  const geofenceDist = 5 + (h % 30);
  const hashStr = `${((h * 2654435761) >>> 0).toString(16).padStart(8, '0')}…${(((h * 40503) >>> 0) & 0xffff).toString(16).padStart(4, '0')}`;

  const PHOTO_KINDS = typeKey === 'Clinical'
    ? ['selfie', 'patients', 'ward', 'register']
    : typeKey === 'Practical'
    ? ['selfie', 'lab', 'procedure', 'register']
    : ['selfie', 'classroom', 'board', 'register'];

  const PHOTO_LABELS = {
    selfie:    'Check-in selfie — start of class',
    classroom: 'Classroom — students present',
    board:     'Board / topic written',
    register:  'Attendance register signed',
    lab:       'Lab setup — practical ready',
    procedure: 'Procedure demonstration',
    ward:      'Site visit in progress',
    patients:  'Consultation area — patients present',
  };

  const photos = PHOTO_KINDS.map((kind, i) => ({
    label: PHOTO_LABELS[kind] || kind,
    kind,
    geo: `${lat}, ${lng}`,
    place: row.room,
    time: row.actualStart ? addMinStr(row.actualStart, i * 15) : '—',
  }));

  return { note, headcount, lat, lng, accuracy, geofenceDist, hash: hashStr, photos, typeKey };
}

function addMinStr(hhmm, delta) {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + delta;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Map a REAL ClassCheckin document into the modal's evidence shape. Uses only
// the values uploaded from the app — real photos render directly (data-URIs),
// and anything not captured falls back to a graceful placeholder.
function realToTeaching(real, row) {
  const fmt = (n) => (n == null ? null : Number(n).toFixed(5));
  const geo = real.geo || {};
  const coordLabel = geo.latitude != null ? `${fmt(geo.latitude)}, ${fmt(geo.longitude)}` : row.room || '';
  const photos = (real.photos || [])
    .filter((p) => p && (p.image || p.uri))
    .map((p, i) => ({
      label: p.label || `Evidence photo ${i + 1}`,
      image: p.image || p.uri,
      geo: coordLabel,
      place: geo.place || row.room,
      time: real.actualStart ? addMinStr(real.actualStart, i * 10) : '—',
    }));
  return {
    isReal: true,
    note: real.note || '',
    headcount: real.headcount != null ? real.headcount : null,
    lat: fmt(geo.latitude),
    lng: fmt(geo.longitude),
    accuracy: geo.accuracy != null ? Math.round(geo.accuracy) : null,
    geofenceDist: geo.distanceM != null ? Math.round(geo.distanceM) : null,
    verified: !!geo.verified,
    faceVerified: !!real.faceVerified,
    hash: real.evidenceHash || null,
    photos,
    typeKey: row.type || 'Lecture',
  };
}

// ─── Real photo URLs per kind ─────────────────────────────────────────────────

const KIND_PHOTOS = {
  selfie: [
    'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=640&h=420&fit=crop',
  ],
  classroom: [
    'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1544717305-2782549b5136?w=640&h=420&fit=crop',
  ],
  board: [
    'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1558021212-51b6ecfa0db9?w=640&h=420&fit=crop',
  ],
  register: [
    'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1568667256549-094345857637?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=640&h=420&fit=crop',
  ],
  lab: [
    'https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=640&h=420&fit=crop',
  ],
  procedure: [
    'https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1579154204601-01588f351e67?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=640&h=420&fit=crop',
  ],
  ward: [
    'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=640&h=420&fit=crop',
  ],
  patients: [
    'https://images.unsplash.com/photo-1631815589968-fdb09a223b1e?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1504813184591-01572f98c85f?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1551190822-a9333d879b1f?w=640&h=420&fit=crop',
  ],
};

function makePhotoUrl(photo, idx) {
  const pool = KIND_PHOTOS[photo.kind] || KIND_PHOTOS.classroom;
  return pool[idx % pool.length];
}

// ─── Photo gallery ─────────────────────────────────────────────────────────────

// Real uploaded photos carry a data-URI in `.image`; seeded previews resolve to
// a stock URL by kind.
const photoSrc = (photo, idx) => photo.image || makePhotoUrl(photo, idx);

function PhotoGallery({ photos }) {
  const [sel, setSel] = useState(0);
  const cur = photos[sel];
  const uri = photoSrc(cur, sel);

  return (
    <div>
      <div className="relative rounded-xl overflow-hidden bg-slate-100 mb-3" style={{ height: 280 }}>
        <img src={uri} alt={cur.label} className="w-full h-full object-cover" />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
          <div className="text-white text-sm font-medium">{cur.label}</div>
          <div className="text-white/75 text-xs mt-0.5 flex items-center gap-2">
            <Navigation className="h-3 w-3" /> {cur.geo}
            <span>·</span>
            <Clock className="h-3 w-3" /> {cur.time}
          </div>
        </div>
        {photos.length > 1 && (
          <>
            <button onClick={() => setSel(s => (s - 1 + photos.length) % photos.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setSel(s => (s + 1) % photos.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
        <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
          {sel + 1} / {photos.length}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <button key={i} onClick={() => setSel(i)}
            className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
              sel === i ? 'border-teal-500 scale-105' : 'border-transparent opacity-65 hover:opacity-100'
            }`} style={{ width: 72, height: 50 }}>
            <img src={photoSrc(p, i)} alt={p.label} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────

const STATUS_META = {
  conducted: { label: 'Conducted',          color: 'teal',   Icon: CheckCircle2 },
  ongoing:   { label: 'Ongoing',            color: 'blue',   Icon: PlayCircle },
  deviation: { label: 'Duration deviation', color: 'orange', Icon: AlertTriangle },
  missed:    { label: 'Missed',             color: 'red',    Icon: XCircle },
};

const getColorClasses = (color) => {
  const map = {
    teal: {
      bgLight: 'bg-teal-50 dark:bg-teal-950/20',
      borderLight: 'border-teal-100 dark:border-teal-900/30',
      text: 'text-teal-600 dark:text-teal-400',
      textVal: 'text-teal-700 dark:text-teal-300',
      borderSolid: 'border-teal-500',
      bgSolid: 'bg-teal-500'
    },
    blue: {
      bgLight: 'bg-blue-50 dark:bg-blue-950/20',
      borderLight: 'border-blue-100 dark:border-blue-900/30',
      text: 'text-blue-600 dark:text-blue-400',
      textVal: 'text-blue-700 dark:text-blue-300',
      borderSolid: 'border-blue-500',
      bgSolid: 'bg-blue-500'
    },
    slate: {
      bgLight: 'bg-slate-50 dark:bg-slate-800/40',
      borderLight: 'border-slate-100 dark:border-slate-700/30',
      text: 'text-slate-600 dark:text-slate-400',
      textVal: 'text-slate-700 dark:text-slate-350',
      borderSolid: 'border-slate-500',
      bgSolid: 'bg-slate-500'
    },
    orange: {
      bgLight: 'bg-orange-50 dark:bg-orange-950/20',
      borderLight: 'border-orange-100 dark:border-orange-900/30',
      text: 'text-orange-600 dark:text-orange-400',
      textVal: 'text-orange-700 dark:text-orange-300',
      borderSolid: 'border-orange-500',
      bgSolid: 'bg-orange-500'
    }
  };
  return map[color] || map.slate;
};

// Stagger downloads so the browser doesn't block a burst of simultaneous
// "multiple file download" requests (Chrome/Firefox both throttle these).
async function downloadAllPhotos(photos, subject) {
  for (let i = 0; i < photos.length; i += 1) {
    const link = document.createElement('a');
    link.href = photoSrc(photos[i], i);
    link.download = `${(subject || 'teaching-photo').replace(/[^a-z0-9]+/gi, '-')}-${i + 1}.jpg`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (i < photos.length - 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

function printTeachingReport(row, evidence, dateLabel) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <html>
      <head>
        <title>Teaching Log Report — ${row.subject}</title>
        <style>
          body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #1e293b; padding: 32px; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          .meta { color: #64748b; font-size: 13px; margin-bottom: 20px; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          td { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
          td:first-child { color: #64748b; width: 180px; }
          .hash { font-family: monospace; font-size: 11px; word-break: break-all; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; }
          .photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
          .photos img { width: 140px; height: 100px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <h1>${row.subject}</h1>
        <div class="meta">${row.faculty || ''} · ${row.room || ''} · ${dateLabel || ''}</div>
        <table>
          <tr><td>Status</td><td>${row.status}</td></tr>
          <tr><td>Scheduled duration</td><td>${row.scheduledMin ?? '—'} min</td></tr>
          <tr><td>Actual duration</td><td>${row.durationMin ?? '—'} min</td></tr>
          <tr><td>Headcount</td><td>${evidence.headcount ?? '—'}</td></tr>
          <tr><td>Faculty note</td><td>${evidence.note || '—'}</td></tr>
          <tr><td>GPS</td><td>${evidence.lat && evidence.lng ? `${evidence.lat}, ${evidence.lng}` : '—'}</td></tr>
        </table>
        <p><strong>Evidence Hash</strong></p>
        <div class="hash">${evidence.hash || 'Not yet generated.'}</div>
        ${evidence.photos.length ? `<div class="photos">${evidence.photos.map((p, i) => `<img src="${photoSrc(p, i)}" alt="${p.label}" />`).join('')}</div>` : ''}
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

export default function TeachingDetailModal({ open, onClose, row, realEvidence, dateLabel }) {
  const [activeTab, setActiveTab] = useState('overview');
  const evidence = useMemo(() => {
    if (!row) return null;
    if (realEvidence) return realToTeaching(realEvidence, row);
    return buildTeachingEvidence(row);
  }, [row, realEvidence]);

  if (!open || !row) return null;

  const sm = STATUS_META[row.status] || STATUS_META.conducted;
  const isMissed  = row.status === 'missed';
  const hasEvidence = !isMissed;
  const TypeIcon = TYPE_ICONS[row.type] || GraduationCap;

  const TABS = hasEvidence
    ? [
        { id: 'overview', label: 'Overview' },
        { id: 'photos',   label: `Photos (${evidence.photos.length})` },
        { id: 'timing',   label: 'Timing' },
        { id: 'evidence', label: 'Evidence' },
      ]
    : [{ id: 'overview', label: 'Overview' }];

  const actualDuration = row.durationMin;
  const deviation = actualDuration != null ? actualDuration - row.scheduledMin : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl max-h-[85%] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`rounded-xl p-2.5 flex-shrink-0 ${
                isMissed ? 'bg-red-100' :
                row.status === 'deviation' ? 'bg-orange-100' :
                row.status === 'ongoing' ? 'bg-blue-100' : 'bg-teal-100'
              }`}>
                <TypeIcon className={`h-5 w-5 ${
                  isMissed ? 'text-red-600' :
                  row.status === 'deviation' ? 'text-orange-600' :
                  row.status === 'ongoing' ? 'text-blue-600' : 'text-teal-600'
                }`} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 leading-tight">{row.subject}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                  <span className="text-sm text-slate-500 flex items-center gap-1">
                    <User className="h-3.5 w-3.5" /> {row.faculty}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-sm text-slate-500 flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" /> {row.department}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-sm text-slate-500 flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" /> {dateLabel}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onClose}
              className="flex-shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
              isMissed ? 'bg-red-50 text-red-700 border-red-200' :
              row.status === 'deviation' ? 'bg-orange-50 text-orange-700 border-orange-200' :
              row.status === 'ongoing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                         'bg-teal-50 text-teal-700 border-teal-200'
            }`}>
              <sm.Icon className="h-3.5 w-3.5" /> {sm.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
              <TypeIcon className="h-3 w-3" /> {row.type}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
              <MapPin className="h-3 w-3" /> {row.room}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
              <Clock className="h-3 w-3" /> {row.scheduled}
            </span>
          </div>

          {/* Tabs */}
          {hasEvidence && (
            <div className="flex gap-1 mt-3 overflow-x-auto">
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === tab.id ? 'bg-teal-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div data-lenis-prevent className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Missed state */}
          {isMissed && (
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-red-200 bg-red-50 p-8 text-center">
                <XCircle className="mx-auto h-10 w-10 text-red-400 mb-3" />
                <div className="font-semibold text-red-700 text-base">Class Not Conducted</div>
                <div className="text-sm text-red-500 mt-1">No check-in, photos or notes were uploaded for this session.</div>
                <div className="text-xs text-slate-500 mt-2">Admin was automatically notified. Slot marked as missed in the teaching log.</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Subject', value: row.subject },
                  { label: 'Type', value: row.type },
                  { label: 'Room', value: row.room },
                  { label: 'Scheduled', value: row.scheduled },
                  { label: 'GPS verified', value: 'No' },
                  { label: 'Selfie uploaded', value: 'No' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl bg-slate-50 border border-slate-250 p-3 dark:bg-slate-900/40 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
                    <div className="font-semibold text-slate-700 mt-0.5 text-sm dark:text-slate-300">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── OVERVIEW ── */}
          {hasEvidence && activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Stats grid */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {[
                  { label: row.type === 'Clinical' ? 'Patients' : 'Students', value: evidence.headcount != null ? evidence.headcount : '—', color: 'teal' },
                  { label: 'Photos', value: evidence.photos.length, color: 'blue' },
                  { label: 'Scheduled', value: `${row.scheduledMin} min`, color: 'slate' },
                  {
                    label: 'Actual',
                    value: actualDuration != null ? `${actualDuration} min` : 'Ongoing',
                    color: deviation != null && Math.abs(deviation) > 15 ? 'orange' : 'teal',
                  },
                ].map(({ label, value, color }) => {
                  const cc = getColorClasses(color);
                  return (
                    <div key={label} className={`rounded-xl ${cc.bgLight} border ${cc.borderLight} p-3`}>
                      <div className={`text-xs ${cc.text} font-medium mb-1`}>{label}</div>
                      <div className={`text-2xl font-bold ${cc.textVal}`}>{value}</div>
                    </div>
                  );
                })}
              </div>

              {/* Class details */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="text-sm font-semibold text-slate-700">Session Details</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-slate-500">Room / Venue</div>
                      <div className="font-medium text-slate-700">{row.room}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-slate-500">Actual time</div>
                      <div className="font-medium text-slate-700">
                        {row.actualStart ? `${row.actualStart} – ${row.actualEnd || '…'}` : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-slate-500">GPS verified</div>
                      <div className={`font-medium ${row.geoVerified ? 'text-teal-600' : 'text-red-500'}`}>
                        {row.geoVerified ? `Yes — inside ${row.room} geofence` : 'Not verified'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Camera className="h-4 w-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-slate-500">Selfie uploaded</div>
                      <div className={`font-medium ${row.selfie ? 'text-teal-600' : 'text-red-500'}`}>
                        {row.selfie ? 'Yes — face & liveness verified' : 'Not uploaded'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Faculty note */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-slate-700">
                  <FileText className="h-4 w-4 text-teal-600" /> Faculty Note
                </div>
                <p className="text-slate-700 italic text-sm">
                  {evidence.note ? `"${evidence.note}"` : 'No note was recorded for this session.'}
                </p>
                {evidence.headcount != null && (
                  <div className="text-xs text-slate-400 mt-2">
                    {evidence.typeKey === 'Clinical'
                      ? `${evidence.headcount} patients attended this session`
                      : `${evidence.headcount} students present`}
                  </div>
                )}
              </div>

              {/* Duration deviation alert */}
              {row.status === 'deviation' && deviation != null && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-orange-700 text-sm">Duration Deviation Flagged</div>
                    <div className="text-sm text-orange-600 mt-0.5">
                      Class ran for <strong>{actualDuration} min</strong> vs scheduled <strong>{row.scheduledMin} min</strong>
                      {' '}({deviation > 0 ? '+' : ''}{deviation} min deviation).
                      HOD has been notified.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PHOTOS ── */}
          {hasEvidence && activeTab === 'photos' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Camera className="h-4 w-4 text-teal-600" />
                  {evidence.photos.length} geo-tagged photos — SAACMS verified
                </div>
                <button
                  onClick={() => downloadAllPhotos(evidence.photos, row.subject)}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  <Download className="h-3.5 w-3.5" /> Download all
                </button>
              </div>
              {evidence.photos.length > 0 ? (
                <PhotoGallery photos={evidence.photos} />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  No photos were uploaded for this session.
                </div>
              )}
            </div>
          )}

          {/* ── TIMING ── */}
          {hasEvidence && activeTab === 'timing' && (
            <div className="space-y-4">
              {/* Timeline */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-700 mb-4">Session Timeline</div>
                <div className="relative pl-6 space-y-5">
                  {[
                    { time: row.actualStart || row.scheduled.split(' – ')[0], label: 'Check-in recorded', detail: `GPS verified at ${row.room}`, ok: !!row.actualStart, color: 'teal' },
                    { time: addMinStr(row.actualStart, 2), label: 'Selfie uploaded', detail: 'Face & liveness verified by AI', ok: row.selfie, color: 'teal' },
                    { time: addMinStr(row.actualStart, Math.floor(row.scheduledMin / 2)), label: 'Mid-session GPS ping', detail: 'Still inside classroom geofence', ok: row.geoVerified, color: 'teal' },
                    { time: row.actualEnd || '—', label: 'Session ended', detail: row.actualEnd ? `Duration: ${row.durationMin} min` : 'Not yet ended', ok: !!row.actualEnd, color: 'teal' },
                    { time: addMinStr(row.actualEnd, 3), label: 'Notes submitted', detail: 'Faculty note & headcount recorded', ok: !!row.actualEnd, color: 'teal' },
                  ].map(({ time, label, detail, ok, color }, i) => {
                    const cc = getColorClasses(color);
                    return (
                      <div key={i} className="flex gap-3">
                        <div className={`absolute left-0 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white ${ok ? cc.borderSolid : 'border-slate-300'}`}
                          style={{ top: i * 52 + 2 }}>
                          {ok
                            ? <div className={`h-2.5 w-2.5 rounded-full ${cc.bgSolid}`} />
                            : <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />}
                        </div>
                        <div className="ml-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-slate-500">{time}</span>
                            <span className={`text-sm font-medium ${ok ? 'text-slate-800' : 'text-slate-400'}`}>{label}</span>
                          </div>
                          <div className={`text-xs mt-0.5 ${ok ? 'text-slate-500' : 'text-slate-300'}`}>{detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Geo details */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Navigation className="h-4 w-4 text-teal-600" /> Geolocation Details
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Coordinates</div>
                    <div className="font-mono text-xs text-slate-700 mt-0.5">
                      {evidence.lat && evidence.lng
                        ? `${evidence.lat}, ${evidence.lng}${evidence.accuracy != null ? ` (±${evidence.accuracy}m)` : ''}`
                        : 'Not recorded'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Geofence distance</div>
                    <div className="font-medium text-teal-600 mt-0.5">
                      {evidence.geofenceDist != null ? `${evidence.geofenceDist}m from ${row.room} centre` : `Inside ${row.room}`}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
                    <div className="text-xs text-slate-500">Verification</div>
                    <div className="flex items-center gap-2 mt-0.5 text-teal-600 font-medium text-sm">
                      <CheckCircle2 className="h-4 w-4" /> Inside {row.room} geofence — GPS check passed
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── EVIDENCE ── */}
          {hasEvidence && activeTab === 'evidence' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                <div className="flex items-center gap-2 mb-3 font-semibold text-teal-700 text-sm">
                  <ShieldCheck className="h-4 w-4" /> Evidence Verification Checklist
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { label: 'Check-in selfie uploaded', ok: row.selfie },
                    { label: 'GPS inside geofence', ok: row.geoVerified },
                    { label: 'Face & liveness AI verified', ok: row.selfie },
                    { label: 'Timestamp tamper check passed', ok: !!row.actualStart },
                    { label: 'Faculty note submitted', ok: !!row.actualEnd },
                    { label: 'SHA-256 hash computed', ok: !!row.actualStart },
                  ].map(({ label, ok }) => (
                    <div key={label} className={`flex items-center gap-2 text-sm ${ok ? 'text-teal-700' : 'text-red-500'}`}>
                      {ok ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500 mb-1 font-medium">SHA-256 Evidence Hash</div>
                <div className="font-mono text-xs text-slate-700 break-all bg-white rounded-lg border border-slate-200 px-3 py-2">
                  {evidence.hash || 'Not yet generated'}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  Covers selfie, GPS coordinates, faculty note and timestamps. Any modification invalidates this hash.
                </div>
              </div>

              <button
                onClick={() => printTeachingReport(row, evidence, dateLabel)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal-300 bg-teal-50 py-4 text-sm font-semibold text-teal-700 hover:bg-teal-100 transition-colors"
              >
                <Download className="h-4 w-4" /> Download Teaching Log Report (PDF)
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
