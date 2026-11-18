import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Landmark,
  Search,
  Building2,
  TrendingUp,
  AlertTriangle,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ShieldCheck,
  ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Button, Card, EmptyState, StatCard, Skeleton, SkeletonCard } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { downloadCsv } from '../lib/csvExport';

const RATING_BADGE = {
  'A+': 'bg-success-50 text-success-700 ring-1 ring-success-200/50 dark:bg-success-950/30 dark:text-success-400',
  A: 'bg-success-50 text-success-700 ring-1 ring-success-200/50 dark:bg-success-950/30 dark:text-success-400',
  'B+': 'bg-warning-50 text-warning-700 ring-1 ring-warning-200/50 dark:bg-warning-950/30 dark:text-warning-400',
  B: 'bg-warning-50 text-warning-700 ring-1 ring-warning-200/50 dark:bg-warning-950/30 dark:text-warning-400',
  C: 'bg-danger-50 text-danger-700 ring-1 ring-danger-200/50 dark:bg-danger-950/30 dark:text-danger-400',
};

const DEPT_COLORS = [
  '#8B5CF6', // Purple
  '#3B82F6', // Blue
  '#EC4899', // Pink
  '#6F8DF0', // Cyan
  '#6366F1', // Indigo
  '#F43F5E', // Rose
  '#D946EF', // Fuchsia
  '#64748B', // Slate
];

function MobileSelect({ value, options, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <div
      className={`relative min-w-0 ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-[2.25rem] w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-left text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{selected?.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                option.value === value
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
              role="option"
              aria-selected={option.value === value}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ value }) {
  const isNoData = value == null;
  const color =
    isNoData ? 'bg-slate-200 dark:bg-slate-700' : value >= 85 ? 'bg-success-500' : value >= 70 ? 'bg-warning-500' : 'bg-danger-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-pill bg-slate-100 dark:bg-slate-700">
        <div className={`h-full rounded-pill ${color}`} style={{ width: `${isNoData ? 0 : value}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{isNoData ? '—' : `${value}%`}</span>
    </div>
  );
}
function DepartmentMobileCard({ department, onOpen }) {
  const trendTone =
    department.trend > 0
      ? 'text-success-600 dark:text-success-400'
      : department.trend < 0
      ? 'text-danger-600 dark:text-danger-400'
      : 'text-slate-500 dark:text-slate-400';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:border-primary-200 hover:shadow-elevation-1 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-extrabold text-slate-900 dark:text-slate-100">{department.name}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-400 dark:text-slate-500">{department.code}</p>
        </div>
        <span className={`shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-bold ${RATING_BADGE[department.rating] || 'bg-slate-100 text-slate-700'}`}>
          {department.rating}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Staff</p>
          <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{department.staff}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Trend</p>
          <p className={`mt-1 inline-flex items-center gap-1 text-sm font-black ${trendTone}`}>
            {department.trend > 0 ? <ArrowUpRight className="h-4 w-4" /> : department.trend < 0 ? <ArrowDownRight className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            {department.trend > 0 ? '+' : ''}{department.trend}%
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Attendance</span>
          <ScoreBar value={department.attendance} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Teaching</span>
          <ScoreBar value={department.teaching} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Spot-check</span>
          <ScoreBar value={department.spotCheck} />
        </div>
      </div>
    </button>
  );
}
export default function ComplianceAnalytics() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [timeframe, setTimeframe] = useState('6m');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedField, setSelectedField] = useState('all');
  const [trendViewType, setTrendViewType] = useState('signals'); // 'signals' or 'departments'
  const [trendDepartments, setTrendDepartments] = useState([]);

  useEffect(() => {
    window.scrollTo(0, 0);
    (async () => {
      try {
        setLoading(true);
        const d = await axios.get('/api/compliance/departments');
        setDepartments(d.data.departments || []);
      } catch (err) {
        toast.error('Failed to load compliance data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        let url = `/api/compliance/trend?timeframe=${timeframe}`;
        if (startDate && endDate) {
          url += `&startDate=${startDate}&endDate=${endDate}`;
        }
        if (trendViewType === 'departments') {
          url += `&byDepartment=true`;
        }
        const t = await axios.get(url);
        setTrend(t.data.trend || []);
        if (t.data.departments) {
          setTrendDepartments(t.data.departments);
        }
      } catch (err) {
        toast.error('Failed to load trend data');
      }
    })();
  }, [timeframe, startDate, endDate, trendViewType]);

  const rows = useMemo(
    () =>
      departments.filter((d) => {
        if (ratingFilter !== 'all' && d.rating !== ratingFilter) return false;
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q);
      }),
    [departments, query, ratingFilter]
  );

  const stats = useMemo(() => {
    if (departments.length === 0) {
      return {
        departments: 0,
        staff: 0,
        avgAttendance: 0,
        avgTeaching: 0,
        alerts: 0,
      };
    }
    const avg = (key) => {
      const valid = departments.filter((d) => d[key] != null);
      if (valid.length === 0) return 0;
      return Math.round(valid.reduce((sum, d) => sum + d[key], 0) / valid.length);
    };
    const alerts = departments.filter((d) => d.rating === 'C' || (d.trend != null && d.trend < -2)).length;
    return {
      departments: departments.length,
      staff: departments.reduce((sum, d) => sum + (d.staff || 0), 0),
      avgAttendance: avg('attendance'),
      avgTeaching: avg('teaching'),
      alerts,
    };
  }, [departments]);

  // Per-department comparison across the four compliance signals.
  const deptComparison = useMemo(
    () =>
      departments.map((d) => ({
        name: d.name.length > 12 ? `${d.name.slice(0, 11)}…` : d.name,
        fullName: d.name,
        Attendance: d.attendance || 0,
        Teaching: d.teaching || 0,
        'Spot-check': d.spotCheck || 0,
      })),
    [departments]
  );

  // How the institute's departments are distributed across ratings.
  const ratingDist = useMemo(() => {
    const COLORS = { 'A+': '#6AA51F', A: '#8FD13C', 'B+': '#F59E0B', B: '#FBBF24', C: '#EF4444' };
    return ['A+', 'A', 'B+', 'B', 'C']
      .map((r) => ({ name: r, value: departments.filter((d) => d.rating === r).length, color: COLORS[r] }))
      .filter((x) => x.value > 0);
  }, [departments]);

  if (loading) {
    return (
      <div className="w-full min-w-0 space-y-4 overflow-hidden sm:space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div>
              <Skeleton className="h-7 w-48 rounded" />
              <Skeleton className="mt-1.5 h-4 w-72 rounded" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <SkeletonCard key={i} className={i === 4 ? 'min-[360px]:col-span-2 lg:col-span-1' : ''} />
          ))}
        </div>
        <SkeletonCard className="h-80" />
        <SkeletonCard className="h-48" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 overflow-hidden sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <div className="shrink-0 rounded-lg bg-primary-600 p-2.5 text-white">
            <Landmark className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              Compliance Analytics
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
              Anuvadini view — department-level compliance trends and rating-linked metrics.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          icon={Download}
          onClick={() => {
            if (rows.length === 0) {
              toast.error('No departments to export');
              return;
            }
            downloadCsv(
              `compliance-report_${new Date().toISOString().slice(0, 10)}.csv`,
              rows,
              [
                { label: 'Department', get: (d) => d.name },
                { label: 'Code', get: (d) => d.code },
                { label: 'Attendance %', get: (d) => d.attendance ?? '' },
                { label: 'Teaching %', get: (d) => d.teaching ?? '' },
                { label: 'Spot-check %', get: (d) => d.spotCheck ?? '' },
                { label: 'Rating', get: (d) => d.rating ?? '' },
                { label: 'Trend', get: (d) => d.trend ?? '' },
              ]
            );
            toast.success('Compliance report downloaded');
          }}
          className="w-full sm:w-auto"
        >
          Export inspection report
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Departments monitored" value={stats.departments} icon={Building2} />
        <StatCard label="Total staff covered" value={stats.staff.toLocaleString()} icon={ShieldCheck} />
        <StatCard label="Avg attendance" value={`${stats.avgAttendance}%`} icon={TrendingUp} />
        <StatCard label="Avg teaching compliance" value={`${stats.avgTeaching}%`} icon={TrendingUp} />
        <StatCard
          label="Depts needing attention"
          value={stats.alerts}
          icon={AlertTriangle}
          accent="warning"
          className="min-[360px]:col-span-2 lg:col-span-1"
        />
      </div>

      {/* Trend chart */}
      <Card
        title={`Institute-wide compliance trend (${startDate && endDate ? `${startDate} to ${endDate}` : timeframe === '1w' ? 'Last Week' : timeframe === '1m' ? 'Last Month' : timeframe === '4w' ? 'Last 4 Weeks' : '6 Months'})`}
        action={
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center lg:gap-3">
            <label className="flex min-w-0 items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="flex min-w-0 items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <MobileSelect
              value={timeframe}
              onChange={(next) => {
                setTimeframe(next);
                setStartDate('');
                setEndDate('');
              }}
              options={[
                { value: '1w', label: 'Last Week' },
                { value: '1m', label: 'Last Month' },
                { value: '4w', label: 'Last 4 Weeks' },
                { value: '6m', label: 'Last 6 Months' },
              ]}
              className="w-full lg:w-44"
            />
            {role !== 'hod' && (
              <MobileSelect
                value={trendViewType}
                onChange={setTrendViewType}
                options={[
                  { value: 'signals', label: 'View: Compliance Signals' },
                  { value: 'departments', label: 'View: Departments Overall' },
                ]}
                className="w-full lg:w-56"
              />
            )}
            {trendViewType === 'signals' && (
              <MobileSelect
                value={selectedField}
                onChange={setSelectedField}
                options={[
                  { value: 'all', label: 'All Fields' },
                  { value: 'attendance', label: 'Attendance' },
                  { value: 'teaching', label: 'Teaching' },
                ]}
                className="w-full lg:w-40"
              />
            )}
          </div>
        }
      >
        <div className="h-72 min-w-0 sm:h-80">
          {trend.length === 0 ? (
            <EmptyState title="No trend data available" description="Data will appear once monthly metrics are populated." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                <defs>
                  <linearGradient id="grad_attendance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#315CE8" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#315CE8" stopOpacity={0.01}/>
                  </linearGradient>
                  <linearGradient id="grad_teaching" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.01}/>
                  </linearGradient>
                  {DEPT_COLORS.map((color, idx) => (
                    <linearGradient key={idx} id={`grad_dept_${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.25}/>
                      <stop offset="95%" stopColor={color} stopOpacity={0.01}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" stroke="currentColor" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94A3B8" unit="%" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {trendViewType === 'signals' ? (
                  <>
                    {(selectedField === 'all' || selectedField === 'attendance') && (
                      <Area type="monotone" dataKey="attendance" name="Attendance" stroke="#315CE8" strokeWidth={2.5} fill="url(#grad_attendance)" dot={{ r: 3 }} />
                    )}
                    {(selectedField === 'all' || selectedField === 'teaching') && (
                      <Area type="monotone" dataKey="teaching" name="Teaching" stroke="#F59E0B" strokeWidth={2.5} fill="url(#grad_teaching)" dot={{ r: 3 }} />
                    )}
                  </>
                ) : (
                  (trendDepartments.length > 0 ? trendDepartments : departments.map(d => d.name)).map((deptName, idx) => (
                    <Area
                      key={deptName}
                      type="monotone"
                      dataKey={deptName}
                      name={deptName}
                      stroke={DEPT_COLORS[idx % DEPT_COLORS.length]}
                      strokeWidth={2.5}
                      fill={`url(#grad_dept_${idx % DEPT_COLORS.length})`}
                      dot={{ r: 3 }}
                    />
                  ))
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Department-wise breakdown: signal comparison + rating distribution */}
      {departments.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="Department performance by signal" className="lg:col-span-2">
            <div className="h-80 min-w-0 overflow-x-auto">
              <div className="h-full min-w-[520px] sm:min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptComparison} margin={{ top: 8, right: 8, bottom: 0, left: -24 }} barGap={2} barCategoryGap="22%">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" stroke="currentColor" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94A3B8" interval={0} angle={deptComparison.length > 5 ? -20 : 0} textAnchor={deptComparison.length > 5 ? 'end' : 'middle'} height={deptComparison.length > 5 ? 48 : 30} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94A3B8" unit="%" />
                  <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                    formatter={(v, n) => [`${v}%`, n]}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Attendance" fill="#315CE8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Teaching" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Spot-check" fill="#A855F7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
          </Card>

          <Card title="Rating distribution">
            <p className="-mt-1 mb-2 text-xs text-slate-400 dark:text-slate-500">
              Departments grouped by rating band.
            </p>
            {ratingDist.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-slate-400">No rated departments yet.</div>
            ) : (
              <div className="flex h-72 min-w-0 flex-col items-center justify-center">
                <ResponsiveContainer width="100%" height="75%">
                  <PieChart>
                    <Pie data={ratingDist} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
                      {ratingDist.map((r) => (
                        <Cell key={r.name} fill={r.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${v} dept${v === 1 ? '' : 's'}`, `Rating ${n}`]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                  {ratingDist.map((r) => (
                    <span key={r.name} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      {r.name}
                      <strong className="text-slate-800 dark:text-slate-100">{r.value}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Combined Filters & Department table card */}
      <Card
        title={
          <div className="grid w-full grid-cols-1 gap-3 py-1 sm:grid-cols-[minmax(8rem,12rem)_minmax(12rem,16rem)] sm:items-end sm:justify-between">
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                Rating
              </span>
              <MobileSelect
                value={ratingFilter}
                onChange={setRatingFilter}
                options={[
                  { value: 'all', label: 'All ratings' },
                  { value: 'A+', label: 'A+' },
                  { value: 'A', label: 'A' },
                  { value: 'B+', label: 'B+' },
                  { value: 'B', label: 'B' },
                  { value: 'C', label: 'C' },
                ]}
                className="mt-1 w-full"
              />
            </div>
            <div className="relative min-w-0">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400"
                aria-hidden="true"
              />
              <input
                placeholder="Search department"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
        }
        noPadding
        bodyClassName="!p-0"
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No departments match"
            message="Adjust the filters to see department compliance data."
          />
        ) : (
          <>
          <div className="space-y-3 p-3 sm:hidden">
            {rows.map((d) => (
              <DepartmentMobileCard
                key={d.id}
                department={d}
                onOpen={() => navigate(`/hoi/compliance-analytics/department/${d.id}`)}
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-3 py-3">Staff</th>
                  <th className="px-3 py-3">Attendance</th>
                  <th className="px-3 py-3">Teaching</th>
                  <th className="px-3 py-3">Spot-check response</th>
                  <th className="px-3 py-3">Rating</th>
                  <th className="px-5 py-3">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {rows.map((d) => (
                  <tr
                    key={d.id}
                    className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                    onClick={() => navigate(`/hoi/compliance-analytics/department/${d.id}`)}
                  >
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {d.name}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{d.code}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300 font-semibold">{d.staff}</td>
                    <td className="px-3 py-3">
                      <ScoreBar value={d.attendance} />
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBar value={d.teaching} />
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBar value={d.spotCheck} />
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-pill px-2.5 py-0.5 text-xs font-bold ${RATING_BADGE[d.rating] || 'bg-slate-100 text-slate-700'}`}
                      >
                        {d.rating}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          d.trend > 0
                            ? 'text-success-600 dark:text-success-400'
                            : d.trend < 0
                            ? 'text-danger-600 dark:text-danger-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                        title="Change vs. last month"
                      >
                        {d.trend > 0 ? (
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : d.trend < 0 ? (
                          <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {d.trend > 0 ? '+' : ''}
                        {d.trend}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      {/* Anuvadini Board — national data & API access */}
      {/* <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title={
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <FileCheck className="h-4 w-4 text-primary-600 dark:text-primary-300" aria-hidden="true" />
              Anuvadini Board — inspection-ready reports
            </h3>
          }
        >
          <ul className="mb-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success-600 dark:text-success-400" aria-hidden="true" />
              All reports server-generated, hash-signed and tamper-proof
            </li>
            <li className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary-600 dark:text-primary-300" aria-hidden="true" />
              Aggregate national data across 700+ affiliated colleges, 24×7
            </li>
            <li className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary-600 dark:text-primary-300" aria-hidden="true" />
              Rating-linked metrics feed the rating system
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={Download}
              onClick={() => toast.success('National inspection report queued (signed PDF) — demo')}
            >
              Generate national report
            </Button>
            <Button
              variant="outline"
              icon={Download}
              onClick={() => toast.success('Aggregate dataset export queued (XLSX) — demo')}
            >
              Export XLSX
            </Button>
          </div>
        </Card>
      </div> */}
    </div>
  );
}



