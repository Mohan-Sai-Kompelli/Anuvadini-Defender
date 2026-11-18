import React, { useEffect, useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  Search, Camera, Clock, X, ChevronRight, ShieldAlert, Building2,
  Image as ImageIcon, Users, CalendarDays, BadgeCheck, Network,
  CheckCircle2, XCircle, CreditCard, Briefcase, Activity, ExternalLink,
  MapPin, Navigation, Fingerprint, Gauge, AlertTriangle, ShieldCheck,
  ShieldX, ScanFace, Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, EmptyState, StatCard } from '../../components/ui';
import { reportAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

/* ───────────────────────── helpers ───────────────────────── */

const TYPE_BADGE = {
  checkin:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  checkout:  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  spotcheck: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  class:     'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  registration: 'bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
  other:     'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};
// Left-accent + hover-ring colour per capture type.
const TYPE_ACCENT = {
  checkin:   'border-emerald-400 dark:border-emerald-500/60',
  checkout:  'border-amber-400 dark:border-amber-500/60',
  spotcheck: 'border-violet-400 dark:border-violet-500/60',
  class:     'border-sky-400 dark:border-sky-500/60',
  registration: 'border-primary-400 dark:border-primary-500/60',
  other:     'border-slate-300 dark:border-slate-600',
};
const TYPE_RING = {
  checkin:   'group-hover:ring-emerald-400/60',
  checkout:  'group-hover:ring-amber-400/60',
  spotcheck: 'group-hover:ring-violet-400/60',
  class:     'group-hover:ring-sky-400/60',
  registration: 'group-hover:ring-primary-400/60',
  other:     'group-hover:ring-slate-300',
};
const TYPE_LABEL = { checkin: 'Check-in', checkout: 'Check-out', spotcheck: 'Spot-check', class: 'Class', registration: 'Registration', other: 'Other' };

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};
const pctText = (n) => (n == null ? '—' : `${n}%`);

const initialsOf = (name) =>
  (name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';

// Full label including the spot-check random/manual trigger.
const captureTypeLabel = (cap) => {
  if (cap.type === 'spotcheck') {
    const tb = cap.detail?.triggeredBy;
    if (tb === 'manual') return 'Spot-check · Manual';
    if (tb === 'random') return 'Spot-check · Random';
    return 'Spot-check';
  }
  return TYPE_LABEL[cap.type] || cap.type;
};

// Exact "Mon, 15 Jun 2026, 14:09:48" — prefer the DB timestamp, else date + filename time.
const fmtFullTime = (cap) => {
  if (cap.detail?.timestamp) {
    const dt = new Date(cap.detail.timestamp);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleString(undefined, {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    }
  }
  const d = cap.date ? fmtDate(cap.date) : '';
  return `${d}${d && cap.time ? ' · ' : ''}${cap.time || ''}` || '—';
};

const coord = (n) => (n == null ? null : Number(n).toFixed(6));
const mapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

const livenessLabel = (lv) => {
  if (!lv || typeof lv !== 'object') return null;
  if (typeof lv.passed === 'boolean') return lv.passed ? 'Passed' : 'Failed';
  if (typeof lv.isLive === 'boolean') return lv.isLive ? 'Live' : 'Not live';
  if (typeof lv.verdict === 'string') return lv.verdict;
  if (typeof lv.score === 'number') return `Score ${lv.score}`;
  return 'Recorded';
};

const RISK_STYLE = {
  critical: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  high:     'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  medium:   'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  low:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  clean:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  unknown:  'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

const SOURCE_LABEL = { attendance: 'Attendance record', spotcheck: 'Spot-check record', class: 'Class check-in' };

const rateTone = (n) =>
  n == null ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  : n >= 85 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  : n >= 60 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
  : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300';

/* ───────────────────────── shared UI atoms ───────────────────────── */

const Avatar = ({ name, className = '' }) => (
  <span className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-emerald-600 font-bold uppercase text-white shadow-sm shadow-primary-600/30 ${className}`}>
    {initialsOf(name)}
  </span>
);

const RateBadge = ({ value }) => (
  <span className={`inline-flex min-w-[3rem] items-center justify-center rounded-lg px-2 py-1 text-xs font-bold tabular-nums ${rateTone(value)}`}>
    {pctText(value)}
  </span>
);

const PassFailBar = ({ pass = 0, fail = 0 }) => {
  const total = pass + fail;
  const pp = total ? (pass / total) * 100 : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-rose-200/70 dark:bg-rose-500/20">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pp}%` }} />
      </div>
      <span className="tabular-nums">
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">{pass}</span>
        <span className="text-slate-300 dark:text-slate-600"> / </span>
        <span className="font-semibold text-rose-600 dark:text-rose-400">{fail}</span>
      </span>
    </div>
  );
};

// Circular progress donut (SVG, no deps).
const Ring = ({ value = 0, size = 64, stroke = 6, trackClass = 'text-slate-200 dark:text-slate-700', barClass = 'text-emerald-500', label }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className={trackClass} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} className={`${barClass} transition-all duration-700`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{label}</span>
    </div>
  );
};

const SearchInput = ({ value, onChange, placeholder }) => (
  <div className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm transition-colors focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-500/15 dark:border-slate-700 dark:bg-slate-900 sm:w-72">
    <Search className="h-4 w-4 text-slate-400" />
    <input value={value} onChange={onChange} placeholder={placeholder}
      className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200" />
  </div>
);

// Gradient page header used across all three levels.
const Hero = ({ icon: Icon, eyebrow, title, subtitle, right, children }) => (
  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-700 via-primary-600 to-emerald-600 p-6 text-white shadow-elevation-3 animate-fade-in">
    <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-24 left-1/4 h-52 w-52 rounded-full bg-emerald-300/20 blur-3xl" />
    <div className="relative flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        {Icon && (
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <Icon className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">{eyebrow}</div>}
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-white/80">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
    {children && <div className="relative mt-5">{children}</div>}
  </div>
);

const RowSkeleton = ({ rows = 6 }) => (
  <div className="space-y-2 p-4">
    {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-12 rounded-lg shimmer" />)}
  </div>
);

/* ───────────────────────── detail rows ───────────────────────── */

const DetailRow = ({ icon: Icon, label, children }) => (
  <div className="flex items-start gap-3 py-2.5">
    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
    <div className="min-w-0 flex-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 break-words text-sm text-slate-700 dark:text-slate-200">{children}</div>
    </div>
  </div>
);

// One capture thumbnail (image + pass/fail + score + time).
const CaptureThumb = ({ cap, onOpen }) => {
  const [errored, setErrored] = useState(false);
  const pass = cap.result === 'pass';
  const fail = cap.result === 'fail';
  // Retroactive anti-spoof verdict (present only after a scan was run).
  const spoof = cap.spoof;
  const isFake = spoof?.isFake === true;
  const isUncertain = spoof?.isUncertain === true;
  const isReal = spoof?.available === true && !isFake && !isUncertain;
  return (
    <button
      onClick={() => onOpen(cap)}
      className={`group sheen relative aspect-square overflow-hidden rounded-2xl bg-slate-100 text-left shadow-sm ring-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevation-3 dark:bg-slate-800 ${isFake ? 'ring-rose-500' : isUncertain ? 'ring-amber-400' : 'ring-transparent'} ${TYPE_RING[cap.type] || TYPE_RING.other}`}
    >
      {errored ? (
        <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600"><ImageIcon className="h-8 w-8" /></div>
      ) : (
        <img src={reportAPI.imageSrc(cap.imageUrl)} alt={cap.time || 'capture'} loading="lazy" onError={() => setErrored(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
      )}
      {(pass || fail) && (
        <span className={`absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-md backdrop-blur ${pass ? 'bg-emerald-500/90 text-white' : 'bg-rose-500/90 text-white'}`}>
          {pass ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {pass ? 'Pass' : 'Fail'}{cap.score != null ? ` ${cap.score.toFixed(2)}` : ''}
        </span>
      )}
      {/* Anti-spoof verdict (top-right), shown once a scan has run. */}
      {isFake && (
        <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-md ring-1 ring-white/40">
          <ShieldX className="h-3 w-3" /> FAKE
        </span>
      )}
      {isUncertain && (
        <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-md ring-1 ring-white/40" title={`Borderline — review manually${spoof?.score != null ? ` (real-face score ${spoof.score.toFixed(2)})` : ''}`}>
          <AlertTriangle className="h-3 w-3" /> ?
        </span>
      )}
      {isReal && (
        <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md backdrop-blur" title="Anti-spoof: real live face">
          <ShieldCheck className="h-3 w-3" />
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2 py-1.5 text-[10px] font-semibold text-white">
        <Clock className="h-3 w-3" />{cap.time || '—'}
        {cap.detail?.latitude != null && <MapPin className="ml-auto h-3 w-3" title="Location recorded" />}
      </span>
    </button>
  );
};

// Full-size capture lightbox with a detailed metadata report.
const Lightbox = ({ cap, onClose }) => {
  const [errored, setErrored] = useState(false);
  const d = cap.detail || {};
  const pass = cap.result === 'pass';
  const fail = cap.result === 'fail';
  const isReg = cap.type === 'registration';
  const lat = d.latitude, lng = d.longitude;
  const hasLoc = lat != null && lng != null;
  const live = livenessLabel(d.liveness);
  const risk = d.injectionRisk;
  const typeLabel = captureTypeLabel(cap);
  const sourceLabel = isReg ? 'Enrollment image' : (SOURCE_LABEL[d.source] || 'Disk capture · no DB match');
  const fileName = cap.file ? cap.file.split('/').pop() : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-elevation-4 dark:bg-slate-900 md:flex-row">
        {/* Image */}
        <div className="flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950 p-4 md:w-1/2">
          {errored ? (
            <div className="flex h-40 w-40 flex-col items-center justify-center gap-1 text-slate-500">
              <ImageIcon className="h-10 w-10" />
              <span className="text-[11px] font-medium">No image</span>
            </div>
          ) : (
            <img src={reportAPI.imageSrc(cap.imageUrl)} alt={typeLabel} onError={() => setErrored(true)}
              className="max-h-[40vh] w-auto rounded-lg object-contain shadow-lg md:max-h-[80vh]" />
          )}
        </div>

        {/* Detail */}
        <div className="flex max-h-[50vh] flex-1 flex-col overflow-y-auto md:max-h-[90vh] md:w-1/2">
          <div className="h-1 shrink-0 bg-gradient-to-r from-primary-500 to-emerald-500" />
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-slate-700/60">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${TYPE_BADGE[cap.type] || TYPE_BADGE.other}`}>{typeLabel}</span>
              {(pass || fail) && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${pass ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'}`}>
                  {pass ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                  {pass ? 'Verified' : 'Failed'}
                </span>
              )}
              {cap.spoof?.isFake && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-extrabold text-white" title={cap.spoof.score != null ? `real-face score ${cap.spoof.score.toFixed(2)}` : undefined}>
                  <ShieldX className="h-3.5 w-3.5" /> Fake · phone/screen
                </span>
              )}
              {cap.spoof?.isUncertain && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" title={cap.spoof.score != null ? `real-face score ${cap.spoof.score.toFixed(2)} — borderline` : undefined}>
                  <AlertTriangle className="h-3.5 w-3.5" /> Unsure · review
                </span>
              )}
              {cap.spoof?.available && !cap.spoof?.isFake && !cap.spoof?.isUncertain && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" title={cap.spoof.score != null ? `real-face score ${cap.spoof.score.toFixed(2)}` : undefined}>
                  <ShieldCheck className="h-3.5 w-3.5" /> Real face
                </span>
              )}
            </div>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
          </div>

          <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
            <DetailRow icon={CalendarDays} label="Date & time">{fmtFullTime(cap)}</DetailRow>

            {(cap.score != null || d.verificationScore != null) && (
              <DetailRow icon={Gauge} label="Match score">
                {cap.score != null ? cap.score.toFixed(2) : Number(d.verificationScore).toFixed(2)}
                {cap.score != null && d.verificationScore != null && Math.abs(cap.score - d.verificationScore) > 0.001
                  ? ` · engine ${Number(d.verificationScore).toFixed(2)}` : ''}
              </DetailRow>
            )}

            {hasLoc ? (
              <DetailRow icon={MapPin} label="Location">
                <div className="font-mono text-[13px]">{coord(lat)}, {coord(lng)}</div>
                {d.place && <div className="text-xs text-slate-500 dark:text-slate-400">{d.place}</div>}
                {d.distance != null && <div className="text-xs text-slate-500 dark:text-slate-400">{Math.round(d.distance)} m from campus</div>}
                <a href={mapsUrl(lat, lng)} target="_blank" rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400">
                  <Navigation className="h-3.5 w-3.5" /> Open in Google Maps
                </a>
              </DetailRow>
            ) : !isReg ? (
              <DetailRow icon={MapPin} label="Location"><span className="text-slate-400">Not recorded</span></DetailRow>
            ) : null}

            {live && <DetailRow icon={ShieldCheck} label="Liveness">{live}</DetailRow>}

            {risk && risk.level && (
              <DetailRow icon={AlertTriangle} label="Device risk">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${RISK_STYLE[risk.level] || RISK_STYLE.unknown}`}>
                  {risk.level}{typeof risk.score === 'number' ? ` · ${risk.score}` : ''}
                </span>
                {Array.isArray(risk.reasons) && risk.reasons.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {risk.reasons.map((r, i) => (
                      <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{String(r).replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                )}
              </DetailRow>
            )}

            {d.faceVerified != null && !isReg && (
              <DetailRow icon={d.faceVerified ? CheckCircle2 : XCircle} label="Face verified">{d.faceVerified ? 'Yes' : 'No'}</DetailRow>
            )}
            {d.authMethod && <DetailRow icon={Fingerprint} label="Auth method"><span>Face</span></DetailRow>}
            {d.subject && <DetailRow icon={Briefcase} label="Subject">{d.subject}</DetailRow>}
            {d.status && <DetailRow icon={Activity} label="Status"><span className="capitalize">{d.status}</span></DetailRow>}
          </div>

          <div className="mt-auto px-5 py-3 text-[11px] text-slate-400">
            {sourceLabel}{fileName ? ` · ${fileName}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
};

const Breadcrumb = ({ trail }) => (
  <nav className="flex flex-wrap items-center gap-1 text-sm">
    {trail.map((node, i) => (
      <React.Fragment key={i}>
        {i > 0 && <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />}
        {node.onClick ? (
          <button onClick={node.onClick} className="rounded-md px-1.5 py-0.5 font-medium text-primary-600 transition-colors hover:bg-primary-50 hover:underline dark:text-primary-400 dark:hover:bg-primary-900/20">{node.label}</button>
        ) : (
          <span className="px-1.5 font-semibold text-slate-700 dark:text-slate-200">{node.label}</span>
        )}
      </React.Fragment>
    ))}
  </nav>
);

/* ───────────────────────── Level 0: Network ───────────────────────── */

const NetworkView = ({ onPickInstitute }) => {
  const [overview, setOverview] = useState(null);
  const [institutes, setInstitutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [net, inst] = await Promise.all([reportAPI.network(), reportAPI.institutes()]);
        setOverview(net.overview || null);
        setInstitutes(inst.organizations || []);
      } catch {
        toast.error('Failed to load network insights');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = institutes.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <Hero
        icon={Network}
        eyebrow="Biometric Authentication"
        title="Face Report"
        subtitle="Network insights, then drill into any institute → employee → their date-wise face captures with location & verification detail."
      />

      {/* Network KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Institutes" value={overview?.totalOrgs ?? '—'} icon={Building2} accent="primary" />
        <StatCard label="Total staff" value={overview?.totalStaff ?? '—'} icon={Users} accent="info" />
        <StatCard label="Active staff" value={overview?.activeStaff ?? '—'} icon={Activity} accent="success" />
        <StatCard label="Present today" value={overview?.presentToday ?? '—'} icon={BadgeCheck} accent="success" />
        <StatCard label="Today rate" value={pctText(overview?.todayRate)} icon={Activity} accent="primary" />
        <StatCard label="Month rate" value={pctText(overview?.monthRate)} icon={CalendarDays} accent="info" />
      </div>

      <Card
        title={<h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Institutes <span className="ml-1 text-xs font-normal text-slate-400">({filtered.length})</span></h3>}
        action={<SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search institutes" />}
        noPadding headerClassName="!py-3"
      >
        {loading ? (
          <RowSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Building2} title="No institutes" description="No organizations match your search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:bg-slate-800/60">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Institute</th>
                  <th className="px-4 py-2.5 font-semibold">State</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Staff</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Present today</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Today</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Month</th>
                  <th className="px-4 py-2.5 font-semibold">Last activity</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((o) => (
                  <tr key={o.id} onClick={() => onPickInstitute({ id: o.id, name: o.name })}
                    className="group cursor-pointer transition-colors hover:bg-primary-50/40 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={o.name} className="h-9 w-9 text-[11px]" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-800 dark:text-slate-100">{o.name}</div>
                          <div className="text-[11px] font-normal capitalize text-slate-400">{(o.type || '').replace(/_/g, ' ') || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{o.state}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{o.staff}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{o.presentToday}</td>
                    <td className="px-4 py-3 text-right"><RateBadge value={o.todayRate} /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{pctText(o.monthRate)}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{o.lastActivity}</td>
                    <td className="px-4 py-3 text-right"><ChevronRight className="ml-auto h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-500" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

/* ───────────────────────── Level 1: Institute ───────────────────────── */

const InstituteView = ({ institute, onBack, onPickEmployee }) => {
  const [detail, setDetail] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [meta, setMeta] = useState({ total: 0, withCaptures: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { enterInstituteView } = useAuth();

  const openHoiReport = () => {
    enterInstituteView(institute);
    navigate('/dashboard');
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [det, emp] = await Promise.all([
          reportAPI.institute(institute.id).catch(() => null),
          reportAPI.employees(institute.id),
        ]);
        setDetail(det?.stats ? det : null);
        setEmployees(emp.employees || []);
        setMeta({ total: emp.total || 0, withCaptures: emp.withCaptures || 0 });
      } catch {
        toast.error('Failed to load institute report');
      } finally {
        setLoading(false);
      }
    })();
  }, [institute.id]);

  const s = detail?.stats;
  const filtered = employees.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()) || (e.uid || '').includes(q));

  return (
    <div className="space-y-6">
      <Breadcrumb trail={[{ label: 'Network', onClick: onBack }, { label: institute.name }]} />

      <Hero
        icon={Building2}
        eyebrow="Institute"
        title={institute.name}
        subtitle={`${meta.total} staff · ${meta.withCaptures} with face captures`}
        right={
          <button
            onClick={openHoiReport}
            className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/25"
          >
            <ExternalLink className="h-4 w-4" /> Open full Admin report
          </button>
        }
      />

      {/* Admin-style institute stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Staff" value={s?.staff ?? '—'} icon={Users} accent="primary" />
        <StatCard label="Active" value={s?.activeStaff ?? '—'} icon={Activity} accent="info" />
        <StatCard label="Present today" value={s?.presentToday ?? '—'} icon={BadgeCheck} accent="success" />
        <StatCard label="Absent today" value={s?.absentToday ?? '—'} icon={XCircle} accent="danger" />
        <StatCard label="Today rate" value={pctText(s?.todayRate)} icon={Activity} accent="primary" />
        <StatCard label="Month rate" value={pctText(s?.monthRate)} icon={CalendarDays} accent="info" />
      </div>

      <Card
        title={<h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Employees <span className="ml-1 text-xs font-normal text-slate-400">({filtered.length})</span></h3>}
        action={<SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or ID" />}
        noPadding headerClassName="!py-3"
      >
        {loading ? (
          <RowSkeleton rows={8} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="No employees" description="No staff match your search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:bg-slate-800/60">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Employee</th>
                  <th className="px-4 py-2.5 font-semibold">Department</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Captures</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Pass / Fail</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Reg.</th>
                  <th className="px-4 py-2.5 font-semibold">Last capture</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((e) => (
                  <tr key={e.id} onClick={() => onPickEmployee({ id: e.id, name: e.name })}
                    className="group cursor-pointer transition-colors hover:bg-primary-50/40 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={e.name} className="h-9 w-9 text-[11px]" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-800 dark:text-slate-100">{e.name}</div>
                          <div className="text-[11px] text-slate-400">{e.designation ? `${e.designation} · ` : ''}{e.uid || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{e.department || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">{e.captureCount}</td>
                    <td className="px-4 py-3 text-right text-xs">
                      {e.captureCount > 0 ? <PassFailBar pass={e.passCount} fail={e.failCount} /> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">{e.registrationCount > 0 ? <BadgeCheck className="mx-auto h-4 w-4 text-emerald-500" /> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{e.lastCaptureDate || '—'}</td>
                    <td className="px-4 py-3 text-right"><ChevronRight className="ml-auto h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-500" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

/* ───────────────────────── Level 2: Employee ───────────────────────── */

const HeroStat = ({ value, label }) => (
  <div className="rounded-xl bg-white/10 px-3.5 py-2 text-center ring-1 ring-white/15 backdrop-blur">
    <div className="text-lg font-bold leading-none">{value}</div>
    <div className="mt-1 text-[10px] uppercase tracking-wide text-white/70">{label}</div>
  </div>
);

const EmployeeView = ({ employee, institute, onBackNetwork, onBackInstitute }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState(null);
  // Retroactive anti-spoof scan: map of capture file → verdict, plus run-state.
  const [spoofMap, setSpoofMap] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await reportAPI.captures(employee.id));
    } catch {
      toast.error('Failed to load captures');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [employee.id]);
  useEffect(() => { load(); }, [load]);

  // Reset any prior scan when switching employees.
  useEffect(() => { setSpoofMap(null); setScanSummary(null); }, [employee.id]);

  // Run the on-server anti-spoof model over this employee's stored captures and
  // overlay a FAKE badge on any marked with a phone-screen / photo replay.
  const runAntiSpoof = useCallback(async () => {
    setScanning(true);
    try {
      const res = await reportAPI.antispoofScan(employee.id);
      const map = {};
      (res.results || []).forEach((r) => { map[r.file] = r; });
      setSpoofMap(map);
      setScanSummary(res.summary || null);
      const fake = res.summary?.fake || 0;
      const uncertain = res.summary?.uncertain || 0;
      if (fake > 0) toast.error(`${fake} fake (phone/screen) capture${fake === 1 ? '' : 's'} detected${uncertain ? `, ${uncertain} unsure` : ''}`);
      else if ((res.summary?.scanned || 0) === 0) toast('No images could be scanned (face engine offline?)', { icon: '⚠️' });
      else if (uncertain > 0) toast(`${uncertain} borderline capture${uncertain === 1 ? '' : 's'} to review`, { icon: '⚠️' });
      else toast.success('All captures look real');
    } catch (e) {
      toast.error('Anti-spoof scan failed');
    } finally {
      setScanning(false);
    }
  }, [employee.id]);

  const emp = data?.employee;
  const totals = data?.totals || { total: 0, pass: 0, fail: 0 };
  const decided = totals.pass + totals.fail;
  const passRate = decided ? Math.round((totals.pass / decided) * 100) : null;

  // Verdicts STORED at mark-time (baked into each capture by the server) — these
  // make the FAKE/unsure/real badges appear automatically on load. A manual
  // re-scan (spoofMap) takes precedence over the stored verdict when present.
  const storedMap = useMemo(() => {
    const m = {};
    data?.days?.forEach((d) => d.types.forEach((t) => t.captures.forEach((c) => {
      if (c.spoof && c.spoof.available) m[c.file] = c.spoof;
    })));
    return m;
  }, [data]);
  const effectiveMap = spoofMap || storedMap;
  // Auto-summary from whichever map is in effect (stored on load, or re-scan).
  const summaryCounts = useMemo(() => {
    const vals = Object.values(effectiveMap);
    if (!vals.length) return null;
    return {
      scanned: vals.length,
      fake: vals.filter((v) => v.isFake).length,
      uncertain: vals.filter((v) => v.isUncertain).length,
      truncated: !!scanSummary?.truncated,
    };
  }, [effectiveMap, scanSummary]);

  return (
    <div className="space-y-6">
      <Breadcrumb trail={[
        { label: 'Network', onClick: onBackNetwork },
        { label: institute.name, onClick: onBackInstitute },
        { label: employee.name },
      ]} />

      {/* Employee header (gradient) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-700 via-primary-600 to-emerald-600 p-6 text-white shadow-elevation-3 animate-fade-in">
        <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/4 h-52 w-52 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold uppercase ring-1 ring-white/25 backdrop-blur">
              {initialsOf(emp?.name || employee.name)}
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">{emp?.name || employee.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 font-medium text-white/90 ring-1 ring-white/15"><CreditCard className="h-3.5 w-3.5" />{emp?.uid || '—'}</span>
                {emp?.designation && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 font-medium text-white/90 ring-1 ring-white/15"><Briefcase className="h-3.5 w-3.5" />{emp.designation}</span>}
                {emp?.department && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 font-medium text-white/90 ring-1 ring-white/15"><Building2 className="h-3.5 w-3.5" />{emp.department}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <Ring value={passRate || 0} size={64} trackClass="text-white/25" barClass="text-white" label={<span className="text-white">{passRate == null ? '—' : `${passRate}%`}</span>} />
              <span className="mt-1 text-[10px] uppercase tracking-wide text-white/70">Pass rate</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <HeroStat value={totals.total} label="Captures" />
              <HeroStat value={totals.pass} label="Passed" />
              <HeroStat value={totals.fail} label="Failed" />
            </div>
          </div>
        </div>

        {/* Anti-spoof scan action */}
        <div className="relative mt-5 flex flex-wrap items-center gap-3 border-t border-white/15 pt-4">
          <button
            onClick={runAntiSpoof}
            disabled={scanning || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-rose-600 shadow-md transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
            {scanning ? 'Checking faces…' : spoofMap ? 'Re-check Faces' : 'Re-scan Older Faces'}
          </button>
          <span className="text-xs text-white/80">
            New captures are auto-checked at mark time. Re-scan to (re)check older ones.
          </span>
          {summaryCounts && !scanning && (
            <span
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold shadow ${
                summaryCounts.fake > 0 ? 'bg-rose-600 text-white' : summaryCounts.uncertain > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
              }`}
            >
              {summaryCounts.fake > 0 ? <ShieldX className="h-3.5 w-3.5" /> : summaryCounts.uncertain > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {summaryCounts.fake > 0
                ? `${summaryCounts.fake} fake${summaryCounts.uncertain > 0 ? `, ${summaryCounts.uncertain} unsure` : ''} of ${summaryCounts.scanned} checked`
                : summaryCounts.uncertain > 0
                  ? `${summaryCounts.uncertain} unsure of ${summaryCounts.scanned} checked`
                  : `All ${summaryCounts.scanned} look real`}
              {summaryCounts.truncated ? ' · first 200' : ''}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: 16 }).map((_, i) => <div key={i} className="aspect-square rounded-2xl shimmer" />)}
        </div>
      ) : !data || (data.days.length === 0 && data.registration.length === 0) ? (
        <Card><EmptyState icon={Camera} title="No face captures yet"
          description="This employee has no stored recognition images. Captures appear here as they check in/out, are spot-checked, or are (re)registered." /></Card>
      ) : (
        <>
          {/* Registration images */}
          {data.registration.length > 0 && (
            <Card title="Registration" headerClassName="!py-3">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
                {data.registration.map((r, i) => (
                  <CaptureThumb key={i} cap={{ ...r, type: 'registration', result: null }} onOpen={(c) => setFocus(c)} />
                ))}
              </div>
            </Card>
          )}

          {/* Date-wise captures */}
          {data.days.map((day) => {
            const dayCount = day.types.reduce((n, t) => n + t.captures.length, 0);
            return (
              <Card key={day.date} noPadding>
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800/60">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300"><CalendarDays className="h-4 w-4" /></span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fmtDate(day.date)}</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-400">{dayCount} image{dayCount === 1 ? '' : 's'}</span>
                </div>
                <div className="space-y-3 p-4">
                  {day.types.map((t) => (
                    <div key={t.type} className={`rounded-xl border-l-4 bg-slate-50/50 p-3 dark:bg-slate-900/30 ${TYPE_ACCENT[t.type] || TYPE_ACCENT.other}`}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TYPE_BADGE[t.type] || TYPE_BADGE.other}`}>{t.label}</span>
                        <span className="text-[11px] text-slate-400">{t.captures.length} image{t.captures.length === 1 ? '' : 's'}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
                        {t.captures.map((c, i) => (
                          <CaptureThumb key={i} cap={{ ...c, type: t.type, date: day.date, spoof: effectiveMap[c.file] }} onOpen={(cap) => setFocus(cap)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </>
      )}

      {focus && <Lightbox cap={focus} onClose={() => setFocus(null)} />}
    </div>
  );
};

/* ───────────────────────── Container ───────────────────────── */

const SuperAdminFaceCaptures = () => {
  const [institute, setInstitute] = useState(null);
  const [employee, setEmployee] = useState(null);

  if (employee && institute) {
    return (
      <EmployeeView
        employee={employee}
        institute={institute}
        onBackNetwork={() => { setEmployee(null); setInstitute(null); }}
        onBackInstitute={() => setEmployee(null)}
      />
    );
  }
  if (institute) {
    return (
      <InstituteView
        institute={institute}
        onBack={() => setInstitute(null)}
        onPickEmployee={setEmployee}
      />
    );
  }
  return <NetworkView onPickInstitute={setInstitute} />;
};

export default SuperAdminFaceCaptures;
