import React, { useState } from 'react';
import {
  X, MapPin, Camera, ShieldCheck, CheckCircle2, XCircle,
  Clock, FileText, Navigation, Users, Route,
  AlertTriangle, PlayCircle, Calendar, Building2,
  User, Download, ChevronLeft, ChevronRight,
  Stethoscope, Activity, Heart, TreePine, Syringe,
} from 'lucide-react';


// ─── Real photo URLs per kind ─────────────────────────────────────────────────

const KIND_PHOTOS = {
  selfie: [
    'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=640&h=420&fit=crop',
  ],
  camp: [
    'https://images.unsplash.com/photo-1631815589968-fdb09a223b1e?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1504813184591-01572f98c85f?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=640&h=420&fit=crop',
  ],
  screening: [
    'https://images.unsplash.com/photo-1579154204601-01588f351e67?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=640&h=420&fit=crop',
  ],
  medicine: [
    'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1526256262350-7da7584cf5eb?w=640&h=420&fit=crop',
  ],
  group: [
    'https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1544027993-37dbfe43562a?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=640&h=420&fit=crop',
  ],
  closing: [
    'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1527525443983-6e60c75fff46?w=640&h=420&fit=crop',
  ],
  team: [
    'https://images.unsplash.com/photo-1527525443983-6e60c75fff46?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=640&h=420&fit=crop',
  ],
  docs: [
    'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1568667256549-094345857637?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=640&h=420&fit=crop',
  ],
  dental: [
    'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1588776814546-1ffbb2b1b0a2?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1629909615957-5b5c8a4ff453?w=640&h=420&fit=crop',
  ],
  lab: [
    'https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=640&h=420&fit=crop',
  ],
  yoga: [
    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1599447421416-3414500d18a5?w=640&h=420&fit=crop',
  ],
  gps: [
    'https://images.unsplash.com/photo-1569336415962-a4bd9f69c8bf?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=640&h=420&fit=crop',
  ],
  feedback: [
    'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=640&h=420&fit=crop',
  ],
  supplies: [
    'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=640&h=420&fit=crop',
  ],
  vehicle: [
    'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=640&h=420&fit=crop',
    'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=640&h=420&fit=crop',
  ],
};

function makePhotoUrl(photo, idx) {
  // Real uploaded photos carry a data-URI in `.image`; seeded previews resolve
  // to a stock URL by kind.
  if (photo && (photo.image || photo.uri)) return photo.image || photo.uri;
  const pool = KIND_PHOTOS[photo.kind] || KIND_PHOTOS.camp;
  return pool[idx % pool.length];
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_META = {
  pending: { label: 'Pending approval', color: 'orange', Icon: Clock },
  in_progress: { label: 'In progress', color: 'blue', Icon: PlayCircle },
  completed: { label: 'Completed', color: 'teal', Icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'red', Icon: XCircle },
  no_response: { label: 'No Response', color: 'slate', Icon: AlertTriangle },
  no_response_reviewed: { label: 'No Response Reviewed', color: 'slate', Icon: ShieldCheck },
};

const TYPE_ICONS = {
  'Health Camp': Stethoscope,
  'Screening': Activity,
  'Awareness': Heart,
  'Camp Support': Syringe,
  'Default': TreePine,
};

// ─── PHOTO GALLERY ─────────────────────────────────────────────────────────────

function PhotoGallery({ photos }) {
  const [selected, setSelected] = useState(0);
  const current = photos[selected];
  const uri = makePhotoUrl(current, selected);

  return (
    <div>
      {/* Main image */}
      <div className="relative rounded-xl overflow-hidden bg-slate-100 mb-3" style={{ height: 280 }}>
        <img src={uri} alt={current.label} className="w-full h-full object-cover" />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
          <div className="text-white text-sm font-medium">{current.label}</div>
          <div className="text-white/75 text-xs mt-0.5 flex items-center gap-2">
            {current.geo ? (
              <><Navigation className="h-3 w-3" /> {current.geo}</>
            ) : current.place ? (
              <><MapPin className="h-3 w-3" /> {current.place}</>
            ) : null}
            {current.time && (
              <>
                <span>·</span>
                <Clock className="h-3 w-3" /> {current.time}
              </>
            )}
          </div>
        </div>
        {/* Nav arrows */}
        {photos.length > 1 && (
          <>
            <button
              onClick={() => setSelected((s) => (s - 1 + photos.length) % photos.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSelected((s) => (s + 1) % photos.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
        {/* Counter */}
        <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
          {selected + 1} / {photos.length}
        </div>
      </div>
      {/* Thumbnails */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${selected === i ? 'border-teal-500 scale-105' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            style={{ width: 72, height: 50 }}
          >
            <img src={makePhotoUrl(p, i)} alt={p.label} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────

// Build the evidence view from ONLY what the app actually captured for this
// activity — real uploaded photos, the participant/GPS/photo counts, the
// faculty's note and the evidence hash. Nothing is fabricated: a field the app
// didn't fill simply doesn't appear (or shows an honest placeholder), so an
// in-progress activity with sparse data is shown as sparse.
function buildActivityEvidence(activity) {
  const photos = (activity.photoList || [])
    .filter((p) => p && (p.image || p.uri))
    .map((p, i) => ({
      label: p.label || `Evidence photo ${i + 1}`,
      image: p.image || p.uri,
      place: activity.location,
    }));
  return {
    photos,
    participantsCount: activity.participants || 0,
    photoCount: activity.photos || 0,
    gpsPoints: activity.gpsPoints || 0,
    note: activity.description || activity.purpose || '',
    hash: activity.evidenceHashFull || null,
  };
}

// Stagger downloads so the browser doesn't block a burst of simultaneous
// "multiple file download" requests (Chrome/Firefox both throttle these).
async function downloadAllPhotos(photos, activityTitle) {
  for (let i = 0; i < photos.length; i += 1) {
    const p = photos[i];
    const link = document.createElement('a');
    link.href = p.image;
    link.download = `${(activityTitle || 'outreach-photo').replace(/[^a-z0-9]+/gi, '-')}-${i + 1}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (i < photos.length - 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

function printEvidenceReport(activity, evidence) {
  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const checklist = [
    { label: evidence.gpsPoints > 0 ? `GPS trail captured (${evidence.gpsPoints} pts)` : 'GPS trail captured', ok: evidence.gpsPoints > 0 },
    { label: `${evidence.photoCount} photo${evidence.photoCount === 1 ? '' : 's'} uploaded`, ok: evidence.photoCount > 0 },
    { label: 'Activity note recorded', ok: !!evidence.note },
    { label: 'SHA-256 hash computed', ok: !!evidence.hash },
  ];
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <html>
      <head>
        <title>Evidence Report — ${activity.title}</title>
        <style>
          body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #1e293b; padding: 32px; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          .meta { color: #64748b; font-size: 13px; margin-bottom: 20px; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          td { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
          td:first-child { color: #64748b; width: 180px; }
          .check { padding: 4px 0; font-size: 13px; }
          .ok { color: #2748C4; }
          .no { color: #94a3b8; }
          .hash { font-family: monospace; font-size: 11px; word-break: break-all; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; }
          .photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
          .photos img { width: 140px; height: 100px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <h1>${activity.title}</h1>
        <div class="meta">${activity.lead || ''} · ${activity.department || ''} · ${fmt(activity.date)}</div>
        <table>
          <tr><td>Status</td><td>${activity.status}</td></tr>
          <tr><td>Participants</td><td>${evidence.participantsCount}</td></tr>
          <tr><td>Note</td><td>${evidence.note || '—'}</td></tr>
        </table>
        <div>
          ${checklist.map((c) => `<div class="check ${c.ok ? 'ok' : 'no'}">${c.ok ? '✔' : '✘'} ${c.label}</div>`).join('')}
        </div>
        <p><strong>SHA-256 Evidence Bundle Hash</strong></p>
        <div class="hash">${evidence.hash || 'Not yet generated — evidence bundle is still being collected.'}</div>
        ${evidence.photos.length ? `<div class="photos">${evidence.photos.map((p) => `<img src="${p.image}" alt="${p.label}" />`).join('')}</div>` : ''}
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

export default function OutreachDetailModal({ open, onClose, activity, readOnly = false, onMarkReviewed }) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!open || !activity) return null;

  const evidence =
    activity.status === 'completed' || activity.status === 'in_progress' || activity.status === 'no_response' || activity.status === 'no_response_reviewed'
      ? buildActivityEvidence(activity)
      : null;
  const hasEvidence = !!evidence;
  const sm = STATUS_META[activity.status] || STATUS_META.pending;
  const TypeIcon = TYPE_ICONS[activity.type] || TYPE_ICONS.Default;

  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // Tabs are data-driven: only surface a section if the app captured data for it.
  const TABS = [{ id: 'overview', label: 'Overview' }];
  if (hasEvidence) {
    if (evidence.photos.length > 0) TABS.push({ id: 'photos', label: `Photos (${evidence.photos.length})` });
    if (evidence.participantsCount > 0) TABS.push({ id: 'patients', label: 'Participants' });
    TABS.push({ id: 'evidence', label: 'Evidence' });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}
      >

        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`rounded-xl p-2.5 flex-shrink-0 ${activity.status === 'completed' ? 'bg-teal-100' :
                  activity.status === 'in_progress' ? 'bg-blue-100' :
                    activity.status === 'rejected' ? 'bg-red-100' :
                      activity.status === 'no_response' || activity.status === 'no_response_reviewed' ? 'bg-slate-100' : 'bg-orange-100'
                }`}>
                <TypeIcon className={`h-5 w-5 ${activity.status === 'completed' ? 'text-teal-600' :
                    activity.status === 'in_progress' ? 'text-blue-600' :
                      activity.status === 'rejected' ? 'text-red-600' :
                        activity.status === 'no_response' || activity.status === 'no_response_reviewed' ? 'text-slate-600' : 'text-orange-600'
                  }`} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 leading-tight">{activity.title}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                  <span className="text-sm text-slate-500 flex items-center gap-1">
                    <User className="h-3.5 w-3.5" /> {activity.lead}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-sm text-slate-500 flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" /> {activity.department}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-sm text-slate-500 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> {fmtDate(activity.date)}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Status + key metrics strip */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${activity.status === 'completed' ? 'bg-teal-50 text-teal-700 border-teal-200' :
                activity.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  activity.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                    activity.status === 'no_response' || activity.status === 'no_response_reviewed' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                    'bg-orange-50 text-orange-700 border-orange-200'
              }`}>
              <sm.Icon className="h-3.5 w-3.5" /> {sm.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
              {activity.type}
            </span>
            {activity.participants > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                <Users className="h-3.5 w-3.5" /> {activity.participants} participants
              </span>
            )}
            {activity.photos > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                <Camera className="h-3.5 w-3.5" /> {activity.photos} photos
              </span>
            )}
            {activity.gpsPoints > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                <Route className="h-3.5 w-3.5" /> {activity.gpsPoints} GPS pts
              </span>
            )}
          </div>

          {/* Tabs */}
          {hasEvidence && (
            <div className="flex gap-1 mt-3 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === tab.id
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-5" data-lenis-prevent>

          {/* No evidence state */}
          {!hasEvidence && (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-orange-400 mb-2" />
              <div className="font-semibold text-slate-700 text-sm">No evidence uploaded yet</div>
              <div className="text-xs text-slate-500 mt-1">
                {activity.status === 'pending'
                  ? 'Activity is pending approval. Evidence will be collected on the day.'
                  : activity.status === 'rejected'
                    ? 'Activity was rejected. No evidence was collected.'
                    : 'Evidence will appear here once the activity begins.'}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-left max-w-sm mx-auto">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Location</div>
                  <div className="text-sm font-medium text-slate-700 mt-0.5 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" /> {activity.location}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Scheduled Date</div>
                  <div className="text-sm font-medium text-slate-700 mt-0.5">{fmtDate(activity.date)}</div>
                </div>
              </div>
            </div>
          )}

          {(activity.status === 'no_response' || activity.status === 'no_response_reviewed') && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <AlertTriangle className="h-4 w-4 text-slate-500" />
                Outreach Missed Approval Details
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium text-slate-500">Activity Name</div>
                  <div className="font-semibold text-slate-800">{activity.title}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Lead</div>
                  <div className="font-semibold text-slate-800">{activity.lead}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Department</div>
                  <div className="font-semibold text-slate-800">{activity.department || '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Scheduled Date</div>
                  <div className="font-semibold text-slate-800">{fmtDate(activity.date)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Submitted On</div>
                  <div className="font-semibold text-slate-800">{activity.createdAt ? fmtDate(activity.createdAt) : '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">No Response Marked At</div>
                  <div className="font-semibold text-slate-800">{activity.noResponseAt ? fmtDate(activity.noResponseAt) : '—'}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs font-medium text-slate-500">Reason</div>
                  <div className="font-semibold text-slate-800">
                    {activity.noResponseReason || 'HOD did not approve/reject before scheduled date'}
                  </div>
                </div>
                {(activity.description || activity.purpose) && (
                  <div className="sm:col-span-2">
                    <div className="text-xs font-medium text-slate-500">Description</div>
                    <div className="text-slate-700">{activity.description || activity.purpose}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── OVERVIEW TAB ── */}
          {hasEvidence && activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Key stats — real counts captured by the app */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Participants', value: evidence.participantsCount, color: 'teal' },
                  { label: 'Photos uploaded', value: evidence.photoCount, color: 'blue' },
                  { label: 'GPS waypoints', value: evidence.gpsPoints, color: 'purple' },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`rounded-xl bg-${color}-50 border border-${color}-100 p-3`}>
                    <div className={`text-xs text-${color}-600 font-medium mb-1`}>{label}</div>
                    <div className={`text-2xl font-bold text-${color}-700`}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Location + note */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="text-sm font-semibold text-slate-700">Activity Details</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-slate-500">Location</div>
                      <div className="font-medium text-slate-700">{activity.location}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-slate-500">Date</div>
                      <div className="font-medium text-slate-700">{fmtDate(activity.date)}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 sm:col-span-2">
                    <FileText className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-slate-500">Activity note</div>
                      <div className="text-slate-700 italic">
                        {evidence.note ? `"${evidence.note}"` : 'No note recorded yet.'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* GPS trail summary — only when waypoints were actually captured */}
              {evidence.gpsPoints > 0 ? (
                <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                  <div className="flex items-center gap-2 mb-1 font-semibold text-teal-700 text-sm">
                    <Route className="h-4 w-4" /> GPS Trail
                  </div>
                  <div className="text-sm text-teal-700">
                    <span className="text-2xl font-bold">{evidence.gpsPoints}</span> waypoints captured live during the activity.
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 flex items-center gap-2">
                  <Route className="h-4 w-4 text-slate-400" /> GPS trail not yet recorded for this activity.
                </div>
              )}
            </div>
          )}

          {/* ── PHOTOS TAB ── */}
          {hasEvidence && activeTab === 'photos' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Camera className="h-4 w-4 text-teal-600" />
                  {evidence.photos.length} photo{evidence.photos.length === 1 ? '' : 's'} uploaded from the app
                </div>
                <button
                  onClick={() => downloadAllPhotos(evidence.photos, activity.title)}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  <Download className="h-3.5 w-3.5" /> Download all
                </button>
              </div>
              <PhotoGallery photos={evidence.photos} />
            </div>
          )}

          {/* ── PARTICIPANTS TAB ── */}
          {hasEvidence && activeTab === 'patients' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-5 flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <Users className="h-6 w-6 text-teal-600" />
                </div>
                <div>
                  <div className="text-3xl font-bold text-teal-700">{evidence.participantsCount}</div>
                  <div className="text-sm text-teal-600">participants registered for this activity</div>
                </div>
              </div>
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                The app records the headcount for this activity. A per-participant register
                (names, age, services) was not captured.
              </div>
            </div>
          )}

          {/* ── EVIDENCE TAB ── */}
          {hasEvidence && activeTab === 'evidence' && (
            <div className="space-y-4">
              {/* Verification strip */}
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                <div className="flex items-center gap-2 mb-3 font-semibold text-teal-700 text-sm">
                  <ShieldCheck className="h-4 w-4" /> Evidence captured so far
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { label: evidence.gpsPoints > 0 ? `GPS trail captured (${evidence.gpsPoints} pts)` : 'GPS trail captured', ok: evidence.gpsPoints > 0 },
                    { label: `${evidence.photoCount} photo${evidence.photoCount === 1 ? '' : 's'} uploaded`, ok: evidence.photoCount > 0 },
                    { label: 'Activity note recorded', ok: !!evidence.note },
                    { label: 'SHA-256 hash computed', ok: !!evidence.hash },
                  ].map(({ label, ok }) => (
                    <div key={label} className={`flex items-center gap-2 text-sm ${ok ? 'text-teal-700' : 'text-slate-400'}`}>
                      {ok ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Hash */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500 mb-1 font-medium">SHA-256 Evidence Bundle Hash</div>
                <div className="font-mono text-xs text-slate-700 break-all bg-white rounded-lg border border-slate-200 px-3 py-2">
                  {evidence.hash || 'Not yet generated — evidence bundle is still being collected.'}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  This hash covers all photos, GPS trail, timestamps and the activity note. Any tampering will change this value.
                </div>
              </div>

              {/* Download report */}
              <button
                onClick={() => printEvidenceReport(activity, evidence)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal-300 bg-teal-50 py-4 text-sm font-semibold text-teal-700 hover:bg-teal-100 transition-colors"
              >
                <Download className="h-4 w-4" /> Download Evidence Report (PDF)
              </button>
            </div>
          )}

        </div>
        {(activity.status === 'no_response' || activity.status === 'no_response_reviewed') && (
          <div className="flex flex-col gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            {activity.status === 'no_response' && (
              <>
                <button
                  onClick={() => onMarkReviewed?.(activity)}
                  disabled={readOnly}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white ${readOnly ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-800'}`}
                >
                  <CheckCircle2 className="h-4 w-4" /> Mark Reviewed
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
