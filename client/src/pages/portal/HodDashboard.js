import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  UserCheck,
  UserX,
  Plane,
  Clock,
  Percent,
  RefreshCw,
  GraduationCap,
  ArrowRight,
  LogIn,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { StatCard, Card, EmptyState, SkeletonCard } from '../../components/ui';
import AttendanceUnitBlocks from '../../components/dashboard/AttendanceUnitBlocks';
import AttendanceTrendMountain from '../../components/dashboard/AttendanceTrendMountain';

const COLORS = ['#0ea5e9', '#8FD13C', '#f59e0b', '#ef4444', '#8b5cf6', '#6F8DF0', '#ec4899', '#64748b'];

const statusBadge = (status) =>
  status === 'present'
    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/50 dark:bg-emerald-950/30 dark:text-emerald-400'
    : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/50 dark:bg-rose-950/30 dark:text-rose-450';

const HodDashboard = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [date, setDate] = useState('');
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get('/api/portal/me');
        setProfile(data.profile);
        const d = data.context?.latestDeptActivityDate || new Date().toISOString().slice(0, 10);
        setDate(d);
        setMonth(data.context?.latestDeptActivityMonth || d.slice(0, 7));
      } catch {
        toast.error('Failed to load profile');
      }
    })();
  }, []);

  const load = useCallback(async (d, m) => {
    if (!d) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/portal/hod/dashboard', { params: { date: d, month: m } });
      setData(res.data);
    } catch {
      toast.error('Failed to load department dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (date && month) load(date, month);
  }, [date, month, load]);

  const o = data?.overview || {};
  const trendData = (data?.last10Days || []).map((t) => ({
    date: new Date(t.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    Present: t.present,
    Absent: t.absent,
  }));
  const monthlyData = (data?.monthlyTrend || []).map((t) => ({ label: `${t.month} '${String(t.year).slice(2)}`, Present: t.present }));
  const inOutData = (data?.timeWiseInOut || []).map((t) => ({ name: t.name.replace(' (Late)', ''), 'Check-in': t.checkIn, 'Check-out': t.checkOut }));
  const timeWise = (data?.timeWise || []).filter((t) => t.value > 0);
  const gender = data?.genderDistribution || [];
  const authMethods = data?.authMethodDistribution || [];
  const members = data?.members || [];
  const recent = data?.recentActivity || [];
  const leaves = data?.leaves || [];

  return (
    <div className="space-y-6">
      {/* Header band */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-[#315CE8] via-[#101827] to-[#0B1220] shadow-lg p-6 text-white">
        {/* Decorative background glows */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-amber-500/10 blur-2xl" />
        
        {/* Chrome scan line */}
        <div className="chrome-scan" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-300">
              <GraduationCap className="h-4 w-4" /> Head of Department
            </p>
            <h1 className="mt-1 text-2xl font-black font-display">{profile?.department || '—'} Department</h1>
            <p className="mt-1 text-sm text-emerald-100/80">
              {profile?.fullName} · {profile?.designation} · {profile?.organization?.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-emerald-200/70 font-semibold uppercase tracking-wider">As of</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="rounded-xl border-0 bg-white/10 px-3 py-1.5 text-sm text-white backdrop-blur focus:ring-2 focus:ring-emerald-400 [color-scheme:dark]" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-emerald-200/70 font-semibold uppercase tracking-wider">Month</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                className="rounded-xl border-0 bg-white/10 px-3 py-1.5 text-sm text-white backdrop-blur focus:ring-2 focus:ring-emerald-400 [color-scheme:dark]" />
            </div>
            <button onClick={() => load(date, month)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all cursor-pointer" title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Members" value={o.totalMembers ?? 0} icon={Users} accent="primary"
            deltaLabel={`${o.faculty ?? 0} fac · ${o.staff ?? 0} staff`} />
          <StatCard label="Present" value={o.presentToday ?? 0} icon={UserCheck} accent="success" deltaLabel="selected day" />
          <StatCard label="Absent" value={o.absentToday ?? 0} icon={UserX} accent="danger" deltaLabel="selected day" />
          <StatCard label="On Leave" value={o.onLeaveToday ?? 0} icon={Plane} accent="warning" />
          <StatCard label="Late" value={o.lateToday ?? 0} icon={Clock} accent="info" deltaLabel="after 09:30" />
          <StatCard label="Month Rate" value={`${o.monthlyRate ?? 0}%`} icon={Percent} accent="primary" />
        </div>
      )}

      {/* 3D Unit Blocks Representation */}
      {!loading && data && (
        <AttendanceUnitBlocks
          present={o.presentToday ?? 0}
          absent={o.absentToday ?? 0}
          leave={o.onLeaveToday ?? 0}
          unapproved={o.lateToday ?? 0}
          onShowDetails={(key) => navigate(key === 'present' ? '/portal/attendance' : '/portal/members')}
        />
      )}

      {/* Time analytics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Check-in Time Distribution (selected day)">
          {timeWise.length === 0 ? (
            <EmptyState title="No check-ins" description="No check-ins on this day." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={timeWise} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => e.value}>
                    {timeWise.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Check-in vs Check-out by Time Slot">
          {inOutData.every((d) => !d['Check-in'] && !d['Check-out']) ? (
            <EmptyState title="No data" description="No activity on this day." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inOutData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Check-in" fill="#8FD13C" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Check-out" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Distributions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Gender Distribution (department)">
          {gender.length === 0 ? (
            <EmptyState title="No members" description="" />
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={gender} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={85} label={(e) => `${e.name}: ${e.value}`}>
                    {gender.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Attendance Verification (month)">
          {(() => {
            const totalCheckins = authMethods.reduce((s, m) => s + (m.value || 0), 0);
            return totalCheckins === 0 ? (
              <EmptyState title="No check-ins" description="No attendance captured this month." />
            ) : (
              <div className="flex h-60 flex-col items-center justify-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                  <ShieldCheck className="h-10 w-10" />
                </div>
                <p className="mt-4 text-4xl font-black text-slate-900 dark:text-slate-100">{totalCheckins.toLocaleString()}</p>
                <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Face-verified check-ins</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">100% captured via Face Recognition — the only enrolled biometric.</p>
              </div>
            );
          })()}
        </Card>
      </div>

      {/* Trends */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Last 10 Days — Present vs Absent">
          <div className="h-64 flex items-center justify-center">
            <AttendanceTrendMountain
              data={trendData || []}
              xKey="date"
              series={[
                { key: 'Present', label: 'Present', color: '#315CE8', gradStart: '#315CE8', gradStop: '#4A74F0' },
                { key: 'Absent', label: 'Absent', color: '#dc2626', gradStart: '#dc2626', gradStop: '#f43f5e' }
              ]}
              height={220}
            />
          </div>
        </Card>

        <Card title="12-Month Attendance Trend (present member-days)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="Present" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Recent activity + pending leaves */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Recent Activity (selected day)" className="lg:col-span-2" noPadding>
          {recent.length === 0 ? (
            <div className="p-5"><EmptyState title="No activity" description="No check-ins/outs on this day." /></div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50/50 text-left text-xs font-bold uppercase tracking-wider text-slate-400 backdrop-blur dark:bg-slate-900/40 dark:text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Member</th>
                    <th className="px-5 py-3 font-semibold">Event</th>
                    <th className="px-5 py-3 font-semibold">Time</th>
                    <th className="px-5 py-3 font-semibold">Method</th>
                    <th className="px-5 py-3 font-semibold">Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/20">
                  {recent.map((r, i) => (
                    <tr key={i} className="hover:bg-emerald-50/20 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-5 py-2.5">
                        <div className="font-medium text-slate-800 dark:text-slate-100">{r.name}</div>
                        <div className="text-xs text-slate-400">{r.designation}</div>
                      </td>
                      <td className="px-5 py-2.5">
                        {r.type === 'in' ? (
                          <span className="inline-flex items-center gap-1 text-success-600"><LogIn className="h-3.5 w-3.5" /> Check-in</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-danger-600"><LogOut className="h-3.5 w-3.5" /> Check-out</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">{r.time}</td>
                      <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">{r.method ? 'Face' : '—'}</td>
                      <td className="px-5 py-2.5">{r.faceVerified ? <ShieldCheck className="h-4 w-4 text-success-600" /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Pending Leave Approvals" action={
          <button onClick={() => navigate('/hod/leaves')} className="text-xs font-semibold text-primary-600 hover:text-primary-500">View all</button>
        }>
          {leaves.length === 0 ? (
            <EmptyState title="None pending" description="No leave awaiting action." />
          ) : (
            <ul className="space-y-3">
              {leaves.slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5 last:border-0 dark:border-slate-700/60">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{l.memberName}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{l.reason || 'Leave'}</p>
                  </div>
                  <span className="shrink-0 rounded-pill bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">pending</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Members table */}
      <Card title="Faculty & Staff — Department Roster" noPadding action={
        <button onClick={() => navigate('/hod/members')} className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-500">
          Full list <ArrowRight className="h-3.5 w-3.5" />
        </button>
      }>
        {members.length === 0 ? (
          <div className="p-5"><EmptyState title="No members" description="No active members in this department." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/50 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:bg-slate-900/40 dark:text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Designation</th>
                  <th className="px-5 py-3 font-semibold">Check-in</th>
                  <th className="px-5 py-3 font-semibold">Check-out</th>
                  <th className="px-5 py-3 font-semibold">Present Days</th>
                  <th className="px-5 py-3 font-semibold">Month %</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/20">
                {members.map((m) => (
                  <tr key={m.id} className="cursor-pointer hover:bg-emerald-50/20 dark:hover:bg-slate-800/20 transition-colors" onClick={() => navigate(`/hod/members?focus=${m.id}`)}>
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {m.fullName}
                      {m.isHod && <span className="ml-2 rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">HOD</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{m.designation || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{m.today.inTime || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{m.today.outTime || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{m.monthPresentDays}</td>
                    <td className="px-5 py-3 font-semibold text-slate-700 dark:text-slate-200">{m.monthRate}%</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold ${statusBadge(m.today.status)}`}>{m.today.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        Department-scoped view · all figures computed live from {profile?.department} attendance · read-only (capture happens in the mobile app).
      </p>
    </div>
  );
};

export default HodDashboard;
