import React, { useState, useEffect, useCallback } from 'react';
import {
  UserX,
  RefreshCw,
  AlertTriangle,
  CalendarDays,
  Search,
  ScanLine,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { absenceAPI } from '../services/api';
import {
  Button,
  Card,
  SkeletonTable,
} from '../components/ui';

const REASON_LABEL = {
  no_checkin_no_leave: 'No check-in, no approved leave',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
}


const getName = (a) => (typeof a.student === 'object' && a.student?.fullName) || a.name || a.fullName || 'Unknown';
const getUid = (a) => (typeof a.student === 'object' && a.student?.uid) || a.uid || '';
const getDept = (a) => (typeof a.student === 'object' && a.student?.department) || a.department || '-';

function AbsenceMobileCard({ absence }) {
  const name = getName(absence);
  const uid = getUid(absence);
  const dept = getDept(absence);
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-slate-900 dark:text-slate-100">{name}</p>
          <p className="mt-0.5 break-all text-xs font-semibold text-slate-500 dark:text-slate-400">{uid || 'No UID'}</p>
        </div>
        {absence.notifiedHOI ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Alerted
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">No alert</span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="font-bold uppercase tracking-wider text-slate-400">Department</p>
          {dept}
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="font-bold uppercase tracking-wider text-slate-400">Flagged</p>
          <p className="mt-1 font-bold text-slate-700 dark:text-slate-200">{fmtTime(absence.createdAt) || 'N/A'}</p>
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
        {REASON_LABEL[absence.reason] || absence.reason || 'Absent'}
      </div>
    </div>
  );
}
export default function Absences() {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await absenceAPI.list({ date });
      if (res && res.success) {
        setData(res);
      } else {
        setError((res && res.error) || 'Failed to load absences');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load absences');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const res = await absenceAPI.detect({ date });
      if (res && res.success) {
        toast.success(`Detection complete - ${res.absentCount ?? 0} unapproved absentee(s)`);
        setTimeout(load, 600);
      } else {
        toast.error((res && res.error) || 'Detection failed');
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Detection failed');
    } finally {
      setDetecting(false);
    }
  };

  const absentees = (data?.absentees || []).filter((a) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const name = getName(a);
    const uid = getUid(a);
    const dept = getDept(a);
    return (
      name.toLowerCase().includes(q) ||
      uid.toLowerCase().includes(q) ||
      dept.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full min-w-0 space-y-4 overflow-hidden sm:space-y-6">
      <div className="relative overflow-hidden rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm shadow-rose-100/60 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-500 via-orange-400 to-teal-500" />
        <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-rose-100/70 blur-2xl dark:bg-rose-950/30" />
        <div className="relative flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-200 dark:shadow-none">
              <UserX className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">
                Absence Monitor
              </p>
              <h1 className="mt-1 text-2xl font-extrabold leading-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                Unapproved Absences
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                Staff with no check-in and no approved leave for the selected day.
              </p>
            </div>
          </div>
          <Button className="w-full justify-center rounded-2xl bg-primary-700 shadow-lg shadow-primary-200 hover:bg-primary-800 dark:shadow-none sm:w-auto" icon={ScanLine} loading={detecting} onClick={handleDetect}>
            {detecting ? 'Detecting...' : 'Run detection now'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-[28px] border-slate-200/80 shadow-sm" bodyClassName="!p-4 sm:!p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(11rem,14rem)_auto_1fr] sm:items-end">
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
              <CalendarDays className="mr-1 inline h-3 w-3" aria-hidden="true" /> Date
            </label>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 min-h-[2.75rem] w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <Button className="w-full justify-center rounded-2xl border-slate-200 sm:w-auto" variant="outline" icon={RefreshCw} loading={loading} onClick={load}>
            Refresh
          </Button>
          <div className="relative min-w-0">
            <Search
              className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              placeholder="Search name / UID / dept"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-[2.75rem] w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-danger-50 p-4 text-sm text-danger-700 dark:bg-danger-900/30 dark:text-danger-400">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {error}
        </div>
      )}
      {/* Count */}
      {data && (
        <div className="relative overflow-hidden rounded-[28px] border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Unapproved absentees
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {new Date(data.date || date).toLocaleDateString('en-GB')}
              </p>
              <p className="mt-3 text-4xl font-black leading-none text-slate-900 dark:text-slate-100">{data.count || 0}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
              <UserX className="h-6 w-6" aria-hidden="true" />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="rounded-[28px] border-slate-200/80 shadow-sm" bodyClassName="!p-0">
        {loading && !data ? (
          <SkeletonTable rows={5} cols={5} className="p-5" />
        ) : !loading && absentees.length === 0 ? (
          <div className="flex min-h-[210px] flex-col items-center justify-center px-5 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/50">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-sm font-extrabold text-slate-900 dark:text-slate-100">
              No unapproved absentees
            </h2>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500 dark:text-slate-400">
              Everyone is accounted for on this day.
            </p>
          </div>
        ) : (
          <><div className="space-y-3 p-3 sm:hidden">{absentees.map((a) => <AbsenceMobileCard key={a._id} absence={a} />)}</div><div className="hidden overflow-x-auto sm:block"><table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Staff</th>
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Reason</th>
                  <th className="px-3 py-3">Admin alerted</th>
                  <th className="px-5 py-3">Flagged at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {absentees.map((a) => {
                  const name = getName(a);
                  const uid = getUid(a);
                  const dept = getDept(a);
                  return (
                    <tr
                      key={a._id}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {name}
                        </div>
                        {uid && (
                          <div className="text-xs text-slate-400 dark:text-slate-500">{uid}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                        {dept}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center rounded-pill bg-danger-50 px-2.5 py-0.5 text-xs font-medium text-danger-700 dark:bg-danger-900/40 dark:text-danger-400">
                          {REASON_LABEL[a.reason] || a.reason || 'absent'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {a.notifiedHOI ? (
                          <span className="inline-flex items-center gap-1 text-xs text-success-600 dark:text-success-400">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> yes
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">no</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                        {fmtTime(a.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div></>
        )}
      </Card>
    </div>
  );
}


