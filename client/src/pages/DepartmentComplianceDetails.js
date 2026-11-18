import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft,
  Users,
  Download,
  Building2,
  User,
  ChevronRight,
  Search,
  Calendar,
  BookOpen,
  Shield,
  Target,
  Clock,
  Timer,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Button, Card, EmptyState, Skeleton, SkeletonCard } from '../components/ui';
import { downloadCsv } from '../lib/csvExport';

const RATING_BADGE = {
  'A+': 'bg-success-50 text-success-700 ring-1 ring-success-200/50 dark:bg-success-950/30 dark:text-success-400',
  A: 'bg-success-50 text-success-700 ring-1 ring-success-200/50 dark:bg-success-950/30 dark:text-success-400',
  'B+': 'bg-warning-50 text-warning-700 ring-1 ring-warning-200/50 dark:bg-warning-950/30 dark:text-warning-400',
  B: 'bg-warning-50 text-warning-700 ring-1 ring-warning-200/50 dark:bg-warning-950/30 dark:text-warning-400',
  C: 'bg-danger-50 text-danger-700 ring-1 ring-danger-200/50 dark:bg-danger-950/30 dark:text-danger-400',
};


export default function DepartmentComplianceDetails() {
  const { departmentId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('6m');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        if (!data) {
          setLoading(true);
          window.scrollTo(0, 0);
        }
        const response = await axios.get(`/api/compliance/departments/${departmentId}?timeframe=${timeframe}`);
        setData(response.data.department);
      } catch (err) {
        toast.error('Failed to load department compliance details');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, timeframe]);

  const filteredStaff = React.useMemo(() => {
    if (!data?.staffList) return [];
    if (!searchQuery.trim()) return data.staffList;
    const q = searchQuery.toLowerCase();
    return data.staffList.filter(
      (staff) =>
        (staff.name || '').toLowerCase().includes(q) ||
        (staff.uid || '').toLowerCase().includes(q) ||
        (staff.designation || '').toLowerCase().includes(q)
    );
  }, [data?.staffList, searchQuery]);

  if (loading) {
    return (
      <div className="min-h-screen space-y-6 bg-slate-50 p-4 dark:bg-slate-900 sm:p-6">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Skeleton className="h-4 w-12" />
          <ChevronRight className="h-3.5 w-3.5" />
          <Skeleton className="h-4 w-24" />
          <ChevronRight className="h-3.5 w-3.5" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-10 w-64 rounded" />
          <Skeleton className="h-10 w-36 rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SkeletonCard className="h-48 col-span-1" />
          <SkeletonCard className="h-48 col-span-2" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonCard className="h-80" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-900 sm:p-6 flex flex-col justify-center items-center gap-4">
        <EmptyState
          icon={Building2}
          title="Department not found"
          message="The requested department compliance records could not be resolved."
        />
        <Button onClick={() => navigate('/compliance')} icon={ArrowLeft}>
          Back to Compliance Analytics
        </Button>
      </div>
    );
  }

  const cardConfigs = [
    {
      id: 'attendance',
      label: 'Attendance',
      subtitle: 'Presence & Punctuality',
      value: data.attendance || 0,
      icon: Calendar,
      iconBg: 'from-emerald-50 to-emerald-100/80 dark:from-emerald-950 dark:to-emerald-900/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      barColor: 'bg-emerald-500',
      trend: '5%',
      trendType: 'up',
      cardBg: 'bg-[#F3F6FF] border-[#D9E4FF] dark:bg-[#101827]/10 dark:border-emerald-900/30',
    },
    {
      id: 'teaching',
      label: 'Teaching Log',
      subtitle: 'Classes & Lectures',
      value: data.teaching || 0,
      icon: BookOpen,
      iconBg: 'from-blue-50 to-blue-100/80 dark:from-blue-950 dark:to-blue-900/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
      textColor: 'text-blue-600 dark:text-blue-400',
      barColor: 'bg-blue-500',
      trend: '6%',
      trendType: 'down',
      cardBg: 'bg-[#F3F7FF] border-[#D6E4FF] dark:bg-[#1e3a8a]/10 dark:border-blue-900/30',
    },
    {
      id: 'spotCheck',
      label: 'Spot-Check Response',
      subtitle: 'Timely Actions',
      value: data.spotCheck || 0,
      icon: Shield,
      iconBg: 'from-orange-50 to-orange-100/80 dark:from-orange-950 dark:to-orange-900/40',
      iconColor: 'text-orange-600 dark:text-orange-400',
      textColor: 'text-orange-600 dark:text-orange-400',
      barColor: 'bg-orange-500',
      trend: '2%',
      trendType: 'down',
      cardBg: 'bg-[#FFF6F0] border-[#FFE2D1] dark:bg-[#7c2d12]/10 dark:border-orange-900/30',
    },
    {
      id: 'overall',
      label: 'Overall Compliance',
      subtitle: 'Composite Score',
      value: data.overall ?? data.score ?? 0,
      icon: Target,
      iconBg: 'from-teal-50 to-teal-100/80 dark:from-teal-950 dark:to-teal-900/40',
      iconColor: 'text-teal-600 dark:text-teal-400',
      textColor: 'text-teal-600 dark:text-teal-400',
      barColor: 'bg-teal-500',
      cardBg: 'bg-[#F3F6FF] border-[#D9E4FF] dark:bg-[#17213a]/10 dark:border-teal-900/30',
    },
    {
      id: 'punctuality',
      label: 'Punctuality',
      subtitle: 'On-time Check-ins',
      value: data.punctuality || 0,
      icon: Clock,
      iconBg: 'from-pink-50 to-pink-100/80 dark:from-pink-950 dark:to-pink-900/40',
      iconColor: 'text-pink-600 dark:text-pink-400',
      textColor: 'text-pink-600 dark:text-pink-400',
      barColor: 'bg-pink-500',
      cardBg: 'bg-[#FFF4F8] border-[#FFD6E8] dark:bg-[#831843]/10 dark:border-pink-900/30',
    },
    {
      id: 'participation',
      label: 'Staff Participation',
      subtitle: 'Active This Month',
      value: data.participation || 0,
      icon: Users,
      iconBg: 'from-amber-50 to-amber-100/80 dark:from-amber-950 dark:to-amber-900/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
      textColor: 'text-amber-600 dark:text-amber-400',
      barColor: 'bg-amber-500',
      cardBg: 'bg-[#FFF9EE] border-[#FFEBC2] dark:bg-[#78350f]/10 dark:border-amber-900/30',
    },
    {
      id: 'fullDay',
      label: 'Full-Day Completion',
      subtitle: 'Stayed a full shift',
      value: data.fullDay || 0,
      icon: Timer,
      iconBg: 'from-cyan-50 to-cyan-100/80 dark:from-cyan-950 dark:to-cyan-900/40',
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      textColor: 'text-cyan-600 dark:text-cyan-400',
      barColor: 'bg-cyan-500',
      cardBg: 'bg-[#F3F6FF] border-[#DDE6FF] dark:bg-[#164e63]/10 dark:border-cyan-900/30',
    },
  ];

  // Radar — the department's "compliance shape" across every signal at a glance.
  const radarData = [
    { dimension: 'Attendance', score: data.attendance || 0 },
    { dimension: 'Teaching', score: data.teaching || 0 },
    { dimension: 'Spot-Check', score: data.spotCheck || 0 },
    { dimension: 'Punctuality', score: data.punctuality || 0 },
    { dimension: 'Full Day', score: data.fullDay || 0 },
  ];

  // Donut — how the department's staff are distributed by compliance health.
  const STATUS_META = [
    { key: 'Excellent', color: '#6AA51F' },
    { key: 'Satisfactory', color: '#F59E0B' },
    { key: 'Needing Attention', color: '#EF4444' },
  ];
  const staffList = data.staffList || [];
  const staffDist = STATUS_META.map((s) => ({
    name: s.key,
    color: s.color,
    value: staffList.filter((m) => m.status === s.key).length,
  }));
  const staffTotal = staffList.length;

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-4 dark:bg-slate-900 sm:p-6">

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-slate-500">
        <Link to="/dashboard" className="hover:text-primary-600 transition-colors">Dashboard</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to="/compliance" className="hover:text-primary-600 transition-colors">Compliance Analytics</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-slate-700 dark:text-slate-300">{data.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/compliance')}
            className="!p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Back to Compliance Analytics"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              {data.name} Analytics
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-slate-400" />
                <span className="font-semibold text-slate-700 dark:text-slate-300">{data.code}</span>
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="flex items-center gap-1.5">
                <User className="h-4 w-4 text-primary-500" />
                <span>HOD: <strong className="text-slate-750 dark:text-slate-200">{data.hod}</strong></span>
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-slate-400" />
                <span>Staff: <strong className="text-slate-750 dark:text-slate-200">{data.activeStaff} / {data.staff}</strong> (Active/Total)</span>
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Rating:</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold capitalize ${RATING_BADGE[data.rating] || 'bg-slate-100 text-slate-700'}`}>
                  {data.rating}
                </span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            icon={Download}
            onClick={() => {
              if (!filteredStaff.length) {
                toast.error('No staff data to export');
                return;
              }
              downloadCsv(
                `${(data.name || 'department').toLowerCase().replace(/\s+/g, '-')}-compliance_${new Date().toISOString().slice(0, 10)}.csv`,
                filteredStaff,
                [
                  { label: 'Name', get: (s) => s.name },
                  { label: 'UID', get: (s) => s.uid },
                  { label: 'Designation', get: (s) => s.designation },
                  { label: 'Role', get: (s) => s.role },
                  { label: 'Attendance %', get: (s) => s.attendance ?? '' },
                  { label: 'Compliance %', get: (s) => s.compliance ?? '' },
                ]
              );
              toast.success('Department report downloaded');
            }}
          >
            Export Report
          </Button>
        </div>
      </div>

      {/* Redesigned Compliance Scorecard Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-[24px] p-6 shadow-sm">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">Compliance Scorecard</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">Departmental operations evaluated against target compliance criteria.</p>
          </div>
          <div
            className="flex items-center gap-1.5 self-start sm:self-auto"
            title="Overall = average of Attendance, Teaching & Spot-Check response. Rating bands: A+ ≥90 · A ≥80 · B+ ≥70 · B ≥60 · C <60."
          >
            <Info className="h-3.5 w-3.5 text-slate-400" />
            <span className="mr-0.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">Rating scale</span>
            {[
              { g: 'A+', c: 'bg-success-100 text-success-700 dark:bg-success-950/40 dark:text-success-400' },
              { g: 'A', c: 'bg-success-100 text-success-700 dark:bg-success-950/40 dark:text-success-400' },
              { g: 'B+', c: 'bg-warning-100 text-warning-700 dark:bg-warning-950/40 dark:text-warning-400' },
              { g: 'B', c: 'bg-warning-100 text-warning-700 dark:bg-warning-950/40 dark:text-warning-400' },
              { g: 'C', c: 'bg-danger-100 text-danger-700 dark:bg-danger-950/40 dark:text-danger-400' },
            ].map((r) => (
              <span key={r.g} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${r.c}`}>
                {r.g}
              </span>
            ))}
          </div>
        </div>

        {/* 4x2 Responsive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {cardConfigs.map((cfg, idx) => {
            const val = cfg.value;
            return (
              <div
                key={cfg.id}
                className={`relative overflow-hidden rounded-[22px] border p-5 shadow-sm hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 ease-in-out group cursor-pointer ${cfg.cardBg}`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between relative z-10">
                  <div className="flex items-center gap-3">
                    {/* Premium Icon Container */}
                    <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center bg-gradient-to-br ${cfg.iconBg} shadow-sm group-hover:scale-105 transition-transform duration-300`}>
                      <cfg.icon className={`w-5.5 h-5.5 ${cfg.iconColor}`} />
                    </div>
                    {/* Title & Description */}
                    <div className="flex flex-col justify-center">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight leading-snug">{cfg.label}</span>
                      <span className="block text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">{cfg.subtitle}</span>
                    </div>
                  </div>
                </div>

                {/* Percentage */}
                <div className="mt-5 relative z-10 flex items-baseline">
                  <span className={`text-4xl font-extrabold tracking-tight leading-none ${cfg.textColor}`}>
                    {val}%
                  </span>
                </div>

                {/* Progress Bar Container */}
                <div className="mt-4 relative z-10 w-full">
                  <div className="h-1.5 w-full bg-slate-200/70 dark:bg-slate-800/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${cfg.barColor}`}
                      style={{ width: `${val}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compliance shape (radar) + staff health distribution (donut) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card title="Compliance Balance" className="lg:col-span-3">
          <p className="-mt-1 mb-3 text-xs text-slate-400 dark:text-slate-500">
            How evenly the department performs across every compliance signal — a fuller, more even
            hexagon means consistent operations with no weak spots.
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid className="stroke-slate-200 dark:stroke-slate-700" stroke="currentColor" />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: '#64748B' }} />
                <PolarRadiusAxis domain={[0, 100]} angle={90} tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Radar name="Score %" dataKey="score" stroke="#315CE8" fill="#315CE8" fillOpacity={0.35} strokeWidth={2} />
                <Tooltip formatter={(v) => `${v}%`} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Staff Compliance Health" className="lg:col-span-2">
          <p className="-mt-1 mb-3 text-xs text-slate-400 dark:text-slate-500">
            Share of staff by individual compliance score.
          </p>
          {staffTotal === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-slate-400">
              No staff records for this department.
            </div>
          ) : (
            <div className="flex h-72 flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height="75%">
                <PieChart>
                  <Pie
                    data={staffDist}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="58%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {staffDist.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v} staff`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                {staffDist.map((s) => (
                  <span key={s.name} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                    <strong className="text-slate-800 dark:text-slate-100">
                      {staffTotal ? Math.round((s.value / staffTotal) * 100) : 0}%
                    </strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Analytics & Trends Chart */}
      <Card
        title={`Department Compliance Trend (${timeframe === '1w' ? 'Last Week' : timeframe === '4w' ? 'Last 4 Weeks' : timeframe === '6m' ? '6 Months' : '9 Months'})`}
        action={
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="rounded-md border border-slate-350 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="1w">Last Week</option>
            <option value="4w">Last 4 Weeks</option>
            <option value="6m">Last 6 Months</option>
            <option value="9m">Last 9 Months</option>
          </select>
        }
      >
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.trends} margin={{ top: 10, right: 16, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" stroke="currentColor" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94A3B8" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94A3B8" unit="%" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="attendance" name="Attendance %" stroke="#315CE8" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="teaching" name="Teaching Compliance %" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="spotCheck" name="Spot-Check %" stroke="#A855F7" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="overall" name="Overall Compliance %" stroke="#EC4899" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Staff Analytics Table */}
      <Card
        title="Staff Performance Directory"
        action={
          <div className="relative w-48 sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">Staff Name</th>
                <th className="px-3 py-3">UID</th>
                <th className="px-3 py-3">Designation</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Attendance</th>
                <th className="px-3 py-3">Compliance Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">
                    No staff members match "{searchQuery}"
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => (
                  <tr
                    key={staff.id}
                    className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <td className="px-5 py-3 font-semibold text-slate-900 dark:text-slate-100">
                      {staff.name}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{staff.uid}</td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-350">{staff.designation}</td>
                    <td className="px-3 py-3 uppercase text-xs font-bold text-slate-400 tracking-wider">{staff.role}</td>
                    <td className="px-3 py-3 font-bold text-primary-600 dark:text-primary-400">{staff.attendance}%</td>
                    <td className="px-3 py-3 font-bold text-slate-800 dark:text-slate-200">{staff.compliance}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
