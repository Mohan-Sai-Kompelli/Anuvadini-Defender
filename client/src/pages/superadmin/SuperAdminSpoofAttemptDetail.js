import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ShieldX, Building2, Clock, MapPin, UserX, Gauge, Smartphone,
  Image as ImageIcon,
} from 'lucide-react';
import { Card, EmptyState } from '../../components/ui';
import { spoofAttemptsAPI } from '../../services/api';

const TYPE_LABEL = { in: 'Check-in', out: 'Check-out', checkin: 'Check-in', checkout: 'Check-out', spotcheck: 'Spot-check', class: 'Class' };

const initialsOf = (name) =>
  (name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';

const fmtTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? '—'
    : dt.toLocaleString(undefined, {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
};

const fakeConfidence = (score) =>
  typeof score === 'number' ? Math.round((1 - Math.max(0, Math.min(1, score))) * 100) : null;

/*
 * Full-page evidence viewer for one fake-attendance attempt — opened by
 * clicking a card on the Spoof Detection list. Renders inside the normal
 * SuperAdminRoute/SuperAdminLayout shell, so the sidebar stays visible.
 *
 * The card that navigates here passes the full item via router `state` (no
 * extra network round-trip for the common in-app click). If that's missing
 * (e.g. the page was refreshed or opened directly by URL), it falls back to
 * refetching the list and finding the matching id.
 */
const SuperAdminSpoofAttemptDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [item, setItem] = useState(location.state?.item || null);
  const [loading, setLoading] = useState(!location.state?.item);
  const [notFound, setNotFound] = useState(false);
  const [imageErrored, setImageErrored] = useState(false);

  useEffect(() => {
    if (item) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await spoofAttemptsAPI.list({ pageSize: 200 });
        const found = (data.items || []).find((it) => String(it.id) === String(id));
        if (!alive) return;
        if (found) {
          setItem(found);
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error('[spoof-attempt-detail] load failed', err);
        if (alive) {
          toast.error('Failed to load this attempt');
          setNotFound(true);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, item]);

  const goBack = () => navigate('/superadmin/spoof-attempts');

  const backButton = (
    <button
      onClick={goBack}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      <ArrowLeft className="h-4 w-4" /> Back to Fake Attempts
    </button>
  );

  if (loading) {
    return (
      <div className="w-full min-w-0 space-y-5">
        {backButton}
        <div className="aspect-[3/4] max-w-md animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="w-full min-w-0 space-y-5">
        {backButton}
        <Card className="p-0">
          <EmptyState
            icon={ShieldX}
            title="Attempt not found"
            message="This fake-attendance attempt is no longer available — it may have expired or been cleared."
          />
        </Card>
      </div>
    );
  }

  const conf = fakeConfidence(item.score);

  return (
    <div className="w-full min-w-0 space-y-5 sm:space-y-6">
      {backButton}

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(280px,480px)_minmax(280px,1fr)]">
        {/* Evidence image — full size */}
        <Card className="overflow-hidden p-0">
          <div className="relative w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
            {imageErrored ? (
              <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 text-slate-300 dark:text-slate-600">
                <ImageIcon className="h-12 w-12" />
                <span className="text-xs">Image unavailable</span>
              </div>
            ) : (
              <img
                src={spoofAttemptsAPI.imageSrc(item)}
                alt={`Spoof attempt by ${item.personName}`}
                onError={() => setImageErrored(true)}
                className="max-h-[80vh] w-full object-contain"
              />
            )}
            {item.kind === 'impersonation' ? (
              <span
                className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-orange-600/90 px-2 py-0.5 text-[11px] font-bold text-white shadow"
                title="A genuine, LIVE face was captured — it just doesn't match this account's enrolled identity. Not a screen/photo replay."
              >
                <UserX className="h-3 w-3" /> IMPERSONATION
              </span>
            ) : (
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-red-600/90 px-2 py-0.5 text-[11px] font-bold text-white shadow">
                <ShieldX className="h-3 w-3" /> FAKE
              </span>
            )}
            {conf != null && (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                <Gauge className="h-3 w-3" /> {conf}%
              </span>
            )}
            {item.matched && (
              <span className="absolute bottom-3 left-3 right-3 inline-flex items-center justify-center gap-1 rounded-md bg-amber-500/90 px-2 py-1 text-[11px] font-bold text-white shadow">
                <UserX className="h-3 w-3" /> Identity matched
              </span>
            )}
          </div>
        </Card>

        {/* Meta */}
        <Card className="h-fit space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
              {initialsOf(item.personName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{item.personName}</p>
              {item.uid && <p className="truncate text-sm text-slate-400">{item.uid}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {TYPE_LABEL[item.type] || item.type}
            </span>
          </div>

          <p className="flex min-w-0 items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
            <Building2 className="h-4 w-4 flex-none" /> <span className="min-w-0 truncate">{item.institute}</span>
          </p>
          {item.deviceModel && (
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400" title="Device this capture came from — a repeat pattern on one model may be a camera-specific false positive, not a real spoof.">
              <Smartphone className="h-4 w-4 flex-none" />
              <span className="min-w-0 truncate">{item.manufacturer ? `${item.manufacturer} ` : ''}{item.deviceModel}</span>
            </p>
          )}
          <p className="flex min-w-0 items-start gap-1.5 text-sm leading-5 text-slate-500 dark:text-slate-400">
            <Clock className="mt-0.5 h-4 w-4 flex-none" /> <span className="min-w-0 break-words">{fmtTime(item.time)}</span>
          </p>
          {item.latitude != null && item.longitude != null && (
            <a
              href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              <MapPin className="h-4 w-4" /> View location
            </a>
          )}
        </Card>
      </div>
    </div>
  );
};

export default SuperAdminSpoofAttemptDetail;
