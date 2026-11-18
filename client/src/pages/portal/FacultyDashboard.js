import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  CalendarCheck,
  CalendarX,
  Percent,
  LogIn,
  LogOut,
  Clock,
  RefreshCw,
  ShieldCheck,
  Building2,
  TrendingUp,
  GraduationCap,
} from 'lucide-react';
import { StatCard, EmptyState, SkeletonCard } from '../../components/ui';
import AttendanceTrendMountain from '../../components/dashboard/AttendanceTrendMountain';

const monthLabel = (m) => {
  if (!m) return '';
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, mm - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const statusBadge = (status) => {
  const map = {
    present: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/50 dark:bg-emerald-950/30 dark:text-emerald-400',
    absent: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/50 dark:bg-rose-950/30 dark:text-rose-450',
    leave: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/50 dark:bg-amber-950/30 dark:text-amber-400',
  };
  return map[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-350';
};

const FacultyDashboard = () => {
  const [profile, setProfile] = useState(null);
  const [month, setMonth] = useState('');
  const [summary, setSummary] = useState(null);
  const [today, setToday] = useState(null);
  const [trend, setTrend] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load profile + latest-data month once, then data for the selected month.
  const loadProfile = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/portal/me');
      setProfile(data.profile);
      const m = data.context?.latestActivityMonth || new Date().toISOString().slice(0, 7);
      setMonth(m);
    } catch (e) {
      toast.error('Failed to load profile');
    }
  }, []);

  const loadMonth = useCallback(async (m) => {
    if (!m) return;
    setLoading(true);
    try {
      const [sumRes, trendRes, attRes] = await Promise.all([
        axios.get('/api/portal/my/summary', { params: { month: m } }),
        axios.get('/api/portal/my/trend', { params: { months: 6 } }),
        axios.get('/api/portal/my/attendance', { params: { month: m } }),
      ]);
      setSummary(sumRes.data.summary);
      setToday(sumRes.data.today);
      setTrend(trendRes.data.series || []);
      setRows(attRes.data.rows || []);
    } catch (e) {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (month) loadMonth(month);
  }, [month, loadMonth]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header / profile band */}
      <div className="relative overflow-hidden rounded-[1.35rem] border border-emerald-900/10 bg-gradient-to-br from-[#18233D] via-[#315CE8] to-[#0B1220] p-4 text-white shadow-lg shadow-emerald-950/15 sm:rounded-3xl sm:p-6">
        {/* Decorative background glows */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl" />
        
        {/* Chrome scan line */}
        <div className="chrome-scan" />

        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[3px]"
          style={{ background: 'linear-gradient(90deg, #4A74F0, #6F8DF0, #2748C4)' }} />

        <div className="relative z-10 flex w-full flex-col items-stretch justify-between gap-5 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-col items-center gap-3 text-center md:flex-row md:text-left">
            <div className="h-14 w-14 rounded-2xl sm:h-16 sm:w-16 bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-inner shrink-0">
              <GraduationCap className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/20">
                {profile?.role === 'staff' ? 'Staff Member' : 'Faculty Member'}
              </span>
              <h1 className="mt-1.5 text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">{profile?.fullName || '—'}</h1>
              <p className="mx-auto mt-2 flex max-w-[17rem] flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] font-semibold leading-5 text-emerald-100/75 md:mx-0 md:max-w-none md:justify-start md:text-xs">
                <span>{profile?.designation || '—'}</span>
                {profile?.department && <span>· {profile.department}</span>}
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {profile?.organization?.name}
                </span>
                <span>· UID {profile?.uid}</span>
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-md sm:w-auto sm:min-w-[18rem]">
            <label className="col-span-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200/90">Select Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-white/10 bg-white/15 px-3 py-2 text-sm font-bold text-white outline-none backdrop-blur placeholder-white/70 focus:ring-2 focus:ring-emerald-400 [color-scheme:dark]"
            />
            <button
              onClick={() => loadMonth(month)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all cursor-pointer border border-white/5"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5 animate-[spin_8s_linear_infinite]" />
            </button>
          </div>
        </div>
      </div>

      {/* Today status strip */}
      <div
        className="relative overflow-hidden rounded-[1.35rem] p-4 sm:rounded-3xl sm:p-6"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.85))',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.85)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 56px -28px rgba(10,20,36,0.18)',
        }}
      >
        {/* Status-dependent top accent */}
        <div
          className="absolute top-0 left-0 right-0 h-[3px]"
          style={{
            background: today?.status === 'present'
              ? 'linear-gradient(90deg, #4A74F0, #2748C4)'
              : today?.status === 'absent'
              ? 'linear-gradient(90deg, #f43f5e, #e11d48)'
              : today?.status === 'leave'
              ? 'linear-gradient(90deg, #eab308, #d97706)'
              : 'linear-gradient(90deg, #94a3b8, #64748b)'
          }}
        />
        <span className="shine-overlay-anuvadini rounded-3xl opacity-30 pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {/* Pulsing dot container */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800/40 rounded-2xl px-4 py-2.5">
              <span className={`pulse-dot-anuvadini ${
                today?.status === 'present' ? 'text-emerald-500' :
                today?.status === 'absent' ? 'text-rose-500' :
                today?.status === 'leave' ? 'text-amber-500' : 'text-slate-400'
              }`} />
              <span className="text-xs font-extrabold uppercase tracking-widest text-slate-700 dark:text-slate-200">
                {today?.status ? today.status.toUpperCase() : 'NO LOGS'}
              </span>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today's Attendance Status</span>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/30">
                <LogIn className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Check-in</div>
                <div className="text-sm font-extrabold text-slate-700 dark:text-slate-100 mt-0.5">{today?.inTime || '—'}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-450 flex items-center justify-center border border-rose-100 dark:border-rose-900/30">
                <LogOut className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Check-out</div>
                <div className="text-sm font-extrabold text-slate-700 dark:text-slate-100 mt-0.5">{today?.outTime || '—'}</div>
              </div>
            </div>

            {today?.method && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/30">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Method</div>
                  <div className="text-sm font-extrabold text-slate-700 dark:text-slate-100 mt-0.5">Face</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      {loading && !summary ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="Present Days" value={summary?.presentDays ?? 0} icon={CalendarCheck} accent="success"
            deltaLabel={`of ${summary?.workingDays ?? 0} working days`} />
          <StatCard label="Absent Days" value={summary?.absentDays ?? 0} icon={CalendarX} accent="danger"
            deltaLabel={monthLabel(month)} />
          <StatCard label="Attendance Rate" value={`${summary?.attendanceRate ?? 0}%`} icon={Percent} accent="primary" />
          <StatCard label="Avg In / Out" value={`${summary?.avgInTime ?? '—'} · ${summary?.avgOutTime ?? '—'}`}
            icon={Clock} accent="info" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Trend */}
        <div
          className="relative flex flex-col overflow-hidden rounded-[1.35rem] p-4 sm:rounded-3xl sm:p-6 lg:col-span-2"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.80))',
            backdropFilter: 'blur(24px) saturate(160%)',
            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            border: '1px solid rgba(255,255,255,0.85)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 56px -28px rgba(10,20,36,0.18)',
          }}
        >
          {/* Top accent */}
          <div className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: 'linear-gradient(90deg, #315CE8, #4A74F0)' }} />
          <span className="shine-overlay-anuvadini rounded-3xl opacity-40 pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-3 border-b border-slate-100 pb-4 mb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl grid place-items-center bg-emerald-50 border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-4.5 h-4.5" />
              </div>
              <div>
                <div className="kicker-label text-slate-400">ANALYTICS · PERFORMANCE</div>
                <h3 className="font-bold text-[16px] text-slate-800 dark:text-slate-100 leading-tight mt-0.5"
                  style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
                  Attendance Trend
                </h3>
              </div>
            </div>
            <span className="self-start rounded-full bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-450 sm:text-[11px]">Present days / month</span>
          </div>

          <div className="relative z-10 flex-1 flex items-center justify-center">
            {trend.length === 0 ? (
              <EmptyState title="No data" description="No attendance recorded in this window." />
            ) : (
              <div className="flex h-56 w-full items-center justify-center sm:h-72">
                <AttendanceTrendMountain
                  data={trend || []}
                  xKey="month"
                  series={[
                    { key: 'presentDays', label: 'Present Days', color: '#315CE8', gradStart: '#315CE8', gradStop: '#4A74F0' }
                  ]}
                  height={240}
                />
              </div>
            )}
          </div>
        </div>

        {/* Month snapshot */}
        <div
          className="relative flex flex-col overflow-hidden rounded-[1.35rem] p-4 sm:rounded-3xl sm:p-6"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.80))',
            backdropFilter: 'blur(24px) saturate(160%)',
            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            border: '1px solid rgba(255,255,255,0.85)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 56px -28px rgba(10,20,36,0.18)',
          }}
        >
          {/* Top accent */}
          <div className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: 'linear-gradient(90deg, #eab308, #d97706)' }} />
          <span className="shine-overlay-anuvadini rounded-3xl opacity-40 pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-3 border-b border-slate-100 pb-4 mb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl grid place-items-center bg-amber-50 border border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/30 text-amber-600 dark:text-amber-400 font-bold">
                <CalendarCheck className="w-4.5 h-4.5" />
              </div>
              <div>
                <div className="kicker-label text-slate-400">METRIC BREAKDOWN</div>
                <h3 className="font-bold text-[16px] text-slate-800 dark:text-slate-100 leading-tight mt-0.5"
                  style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
                  Month Snapshot
                </h3>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex-grow flex flex-col justify-center">
            <dl className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400 font-semibold">Working days</dt>
                <dd className="font-extrabold text-slate-800 dark:text-slate-100 text-base">{summary?.workingDays ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400 font-semibold">Present</dt>
                <dd className="font-extrabold text-emerald-600 text-base">{summary?.presentDays ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400 font-semibold">Absent</dt>
                <dd className="font-extrabold text-rose-600 text-base">{summary?.absentDays ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400 font-semibold">On leave</dt>
                <dd className="font-extrabold text-amber-600 text-base">{summary?.leaveDays ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-700">
                <dt className="text-slate-500 dark:text-slate-400 font-bold">Attendance rate</dt>
                <dd className="font-black text-emerald-700 dark:text-emerald-400 text-lg">{summary?.attendanceRate ?? 0}%</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Recent attendance */}
      <div
        className="relative flex flex-col overflow-hidden rounded-[1.35rem] sm:rounded-3xl"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.80))',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.85)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 56px -28px rgba(10,20,36,0.18)',
        }}
      >
        {/* Top accent */}
        <div className="absolute top-0 left-0 right-0 h-[3px]"
          style={{ background: 'linear-gradient(90deg, #315CE8, #6F8DF0, #8b5cf6)' }} />
        <span className="shine-overlay-anuvadini rounded-3xl opacity-40 pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-3 border-b border-slate-100/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl grid place-items-center bg-emerald-50 border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold">
              <CalendarCheck className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="kicker-label text-slate-400">LOGS · AUDIT REGISTRY</div>
              <h3 className="font-bold text-[16px] text-slate-850 dark:text-slate-100 leading-tight mt-0.5"
                style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
                Daily Attendance Log
              </h3>
            </div>
          </div>
          <span className="self-start rounded-full bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-450 sm:text-xs">{monthLabel(month)}</span>
        </div>

        <div className="relative z-10 flex-1">
          {rows.length === 0 ? (
            <div className="p-10">
              <EmptyState title="No attendance" description="No check-ins recorded for this month." />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-b-3xl">
              <table className="min-w-full divide-y divide-slate-100/60 text-sm dark:divide-slate-800/40">
                <thead className="bg-slate-50/50 dark:bg-slate-900/20">
                  <tr>
                    {['Date', 'Check-in', 'Check-out', 'Hours Worked', 'Method', 'Verified', 'Status'].map((h, i) => (
                      <th
                        key={i}
                        className="px-6 py-4.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-450 dark:text-slate-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-850">
                  {rows.map((r) => (
                    <tr
                      key={r.date}
                      className="transition-all duration-250 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 group"
                    >
                      <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200">
                        {new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', weekday: 'short' })}
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                        {r.firstIn || '—'}
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                        {r.lastOut || '—'}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                        {r.hoursWorked != null ? `${r.hoursWorked}h` : '—'}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-350">
                        {r.method ? 'Face' : '—'}
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold">
                        {r.faceVerified ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                            <ShieldCheck className="h-4 w-4" /> Yes
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadge(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        Attendance is captured via the SAACMS mobile app (face / biometric + geo-fence). This portal is read-only.
      </p>
    </div>
  );
};

export default FacultyDashboard;

