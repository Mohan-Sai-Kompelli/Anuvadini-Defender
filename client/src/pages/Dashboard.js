import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Users,
  Calendar,
  Clock,
  User,
  UserX,
  UserCheck,
  UserMinus,
  RefreshCw,
  BarChart3,
  TrendingUp,
  Grid3X3,
  Timer,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import ReactApexChart from "react-apexcharts";
import axios from "axios";
import toast from "react-hot-toast";
import LazyOnVisible from '../components/LazyOnVisible';
import PerformanceMonitor from '../components/PerformanceMonitor';
import useDashboardScroll from '../hooks/useDashboardScroll';
import PageHeader from '../components/app/PageHeader';
import KpiCard from '../components/app/KpiCard';
import AttendanceTrendCard from '../components/dashboard/AttendanceTrendCard';
import AttendanceCalendar from '../components/dashboard/AttendanceCalendar';
import {
  Button,
  EmptyState,
  ErrorBoundary,
  Skeleton,
  SkeletonCard,
  SkeletonTable,
} from '../components/ui';
import {
  useChartTheme,
  CHART_COLORS,
  CATEGORY_COLORS,
  HEATMAP_RANGES,
  HEATMAP_COLORS,
} from '../components/dashboard/chartTheme';

// Lazy load heavy components
const DashboardHeader = lazy(() => import('../components/dashboard/DashboardHeader'));
const SummaryCards = lazy(() => import('../components/dashboard/SummaryCards'));
const TimeSlotSummary = lazy(() => import('../components/dashboard/TimeSlotSummary'));
const DepartmentSlotSummary = lazy(() => import('../components/dashboard/DepartmentSlotSummary'));
const DepartmentStatsSummary = lazy(() => import('../components/dashboard/DepartmentStatsSummary'));
const DepartmentStatsCharts = lazy(() => import('../components/dashboard/DepartmentStatsCharts'));
const DashboardFilters = lazy(() => import('../components/dashboard/DashboardFilters'));
const LiveAttendanceChart = lazy(() => import('../components/dashboard/LiveAttendanceChart'));
const RecentActivityTable = lazy(() => import('../components/dashboard/RecentActivityTable'));
const QuickActionsGrid = lazy(() => import('../components/dashboard/QuickActionsGrid'));
const LeaveDetailsModal = lazy(() => import('../components/dashboard/LeaveDetailsModal'));
const SaacmsOverview = lazy(() => import('../components/dashboard/SaacmsOverview'));
const AttendanceUnitBlocks = lazy(() => import('../components/dashboard/AttendanceUnitBlocks'));
const AttendanceTrendMountain = lazy(() => import('../components/dashboard/AttendanceTrendMountain'));
const AttendanceAnalyticsPanel = lazy(() => import('../components/dashboard/AttendanceAnalyticsPanel'));
const AnuvadiniAdvancedCharts = lazy(() => import('../components/dashboard/AnuvadiniAdvancedCharts'));
const ScoreSummaryCard = lazy(() => import('../components/dashboard/ScoreSummaryCard'));

// Section motion is now scroll-driven (useDashboardScroll), so the per-block reveal wrapper just passes children through.
const ScrollReveal = ({ children }) => <>{children}</>;

const Dashboard = () => {
  const [scrollRoot, setScrollRoot] = useState(null);
  useDashboardScroll(scrollRoot);
  const navigate = useNavigate();
  const { isAuthenticated, user, userType, role, viewAsOrg, loading: authLoading } = useAuth();
  const chartTheme = useChartTheme();

  const [stats, setStats] = useState(null);
  const [attendanceData, setAttendanceData] = useState([]);
  const [timeWiseData, setTimeWiseData] = useState([]);
  const [timeWiseInOut, setTimeWiseInOut] = useState([]);
  const [timeWiseTotals, setTimeWiseTotals] = useState({ in: 0, out: 0 });
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [genderDistribution, setGenderDistribution] = useState([]);
  const [genderLoading, setGenderLoading] = useState(false);
  const [authMethodDistribution, setAuthMethodDistribution] = useState([]);
  const [authMethodLoading, setAuthMethodLoading] = useState(false);
  // Leave requests state
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [spotCheckTrend, setSpotCheckTrend] = useState([]);
  // Simplified filter state management
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [dateRange, setDateRange] = useState({
    startDate: `${new Date().getFullYear()}-${String(
      new Date().getMonth() + 1
    ).padStart(2, "0")}-01`,
    endDate: `${new Date().getFullYear()}-${String(
      new Date().getMonth() + 1
    ).padStart(2, "0")}-${new Date().getDate()}`,
  });

  const handleDownloadAttendance = async () => {
    try {
      const params = new URLSearchParams();
      params.set('mode', slotMode);
      if (slotMode === 'day') {
        params.set('date', slotDate);
      } else if (slotMode === 'week') {
        params.set('week', slotWeek);
      } else if (slotMode === 'month') {
        params.set('month', slotMonth);
      }
      const url = `/api/attendance/export?${params.toString()}`;
      const response = await axios.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const filename = `attendance_${slotMode}_${slotMode === 'day' ? slotDate : slotMode === 'week' ? slotWeek : slotMonth}.csv`;
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Error downloading attendance CSV:', error);
      toast.error('Failed to download report');
    }
  };

  const handleDownloadCheckout = async () => {
    try {
      const params = new URLSearchParams();
      params.set('mode', slotMode);
      params.set('type', 'out');
      if (slotMode === 'day') {
        params.set('date', slotDate);
      } else if (slotMode === 'week') {
        params.set('week', slotWeek);
      } else if (slotMode === 'month') {
        params.set('month', slotMonth);
      }
      const url = `/api/attendance/export?${params.toString()}`;
      const response = await axios.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const filename = `checkout_${slotMode}_${slotMode === 'day' ? slotDate : slotMode === 'week' ? slotWeek : slotMonth}.csv`;
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Error downloading checkout CSV:', error);
      toast.error('Failed to download checkout report');
    }
  };

  // Simplified filter states - only 3 options
  const [filterMode, setFilterMode] = useState('month'); // 'today', 'week', 'month', 'custom'
  const [filterLoading, setFilterLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false); // Controls filter visibility

  // Custom date range states
  const [customDateRange, setCustomDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [overallRate, setOverallRate] = useState({ present: 0, absent: 0, totalStudents: 0, attendanceRate: 0 });
  const [overallRateLoading, setOverallRateLoading] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [heatmapSlots, setHeatmapSlots] = useState([]);
  const [heatmapDepartments, setHeatmapDepartments] = useState([]);
  const [heatmapSeries, setHeatmapSeries] = useState([]);
  const [selectedHeatmapDept, setSelectedHeatmapDept] = useState(null);
  const [selectedHeatmapSlot, setSelectedHeatmapSlot] = useState(null);
  // Select which field to use on Y-axis for heatmap grouping
  const defaultGroupBy = useMemo(() => {
    const type = organization?.organizationType;
    if (type === 'school' || type === 'institute') return 'class';
    if (type === 'government_office' || type === 'Government') return 'bureau';
    return 'department';
  }, [organization]);
  const [heatmapGroupBy, setHeatmapGroupBy] = useState('department');

  // Keep heatmap grouping in sync with organization type on load
  useEffect(() => {
    const initial = defaultGroupBy;
    if (initial && heatmapGroupBy !== initial) {
      setHeatmapGroupBy(initial);
      // proactively build fallback with the correct grouping
      buildHeatmapFallback(initial);
    }
  }, [defaultGroupBy]);
  const [expandedSlotDetails, setExpandedSlotDetails] = useState({ slot: null, type: null, items: [] });
  const [absentStudents, setAbsentStudents] = useState([]);
  const [absentLoading, setAbsentLoading] = useState(false);
  const [absentError, setAbsentError] = useState(null);
  // Tile selection: show employees with their timing
  const [tileEmployees, setTileEmployees] = useState([]);
  const [tileEmployeesLoading, setTileEmployeesLoading] = useState(false);
  const [tileEmployeesError, setTileEmployeesError] = useState(null);
  const [liveAttendanceData, setLiveAttendanceData] = useState([]);
  const [liveAttendanceLoading, setLiveAttendanceLoading] = useState(true);
  // Pagination for checkout-sorted table
  const [visibleCheckoutCount, setVisibleCheckoutCount] = useState(5);
  const [visiblePendingCount, setVisiblePendingCount] = useState(5);
  const [recentActivityTab, setRecentActivityTab] = useState('top'); // 'top' | 'pending'

  // Recent Activity date filter states
  const [recentActivityDateRange, setRecentActivityDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [recentActivityLoading, setRecentActivityLoading] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [filteredAttendanceData, setFilteredAttendanceData] = useState([]);

  // Search filter states for Recent Activity
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryPending, setSearchQueryPending] = useState('');

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        !event.target ||
        event.target === document.documentElement ||
        event.target === document.body ||
        !document.body.contains(event.target)
      ) {
        return;
      }
      if (showCalendar && !event.target.closest('.calendar-container')) {
        setShowCalendar(false);
      }
    };

    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
      if (window.__lenis) {
        window.__lenis.stop();
      }
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        if (window.__lenis) {
          window.__lenis.start();
        }
      };
    }
  }, [showCalendar]);

  // Build heatmap client-side when backend lacks data
  const buildHeatmapFallback = async (groupByParam) => {
    try {
      const defaultSlots = [
        '8:00–8:30', '8:30–9:00', '9:00–9:30', '9:30–10:00', '10:00–10:30', '10:30–11:00', '11:00+'
      ];
      const parseSlotRange = (label) => {
        try {
          if (label.endsWith('+')) {
            const [h, m] = label.replace('+', '').split(':').map((v) => parseInt(v, 10));
            return { start: h * 60 + (m || 0), end: 24 * 60 };
          }
          const sep = label.includes('–') ? '–' : '-';
          const [startStr, endStr] = label.split(sep).map((s) => s.trim());
          const [sh, sm] = startStr.split(':').map((v) => parseInt(v, 10));
          const [eh, em] = endStr.split(':').map((v) => parseInt(v, 10));
          return { start: sh * 60 + (sm || 0), end: eh * 60 + (em || 0) };
        } catch (_) { return { start: 0, end: 24 * 60 }; }
      };
      const slotRanges = defaultSlots.map(parseSlotRange);

      const today = new Date().toISOString().split('T')[0];
      const [studentsRes, dailyRes] = await Promise.all([
        axios.get('/api/students', { params: { limit: 10000 } }),
        axios.get('/api/attendance/reports/daily', { params: { date: today } }).catch(() => ({ data: {} })),
      ]);

      const students = studentsRes?.data?.students || [];
      const attendance = dailyRes?.data?.report?.attendance || [];
      const type = organization?.organizationType;
      const effectiveGroupBy = groupByParam || heatmapGroupBy || defaultGroupBy || 'department';
      const getGroup = (s) => {
        if (effectiveGroupBy === 'class') return s.class || 'Unassigned';
        if (effectiveGroupBy === 'bureau') return s.bureau || 'Unassigned';
        if (effectiveGroupBy === 'gender') return s.gender || 'Unassigned';
        return s.department || 'Unassigned';
      };

      const studentIdToGroup = new Map();
      const groupsSet = new Set();
      students.forEach((s) => {
        const g = getGroup(s);
        groupsSet.add(g);
        const id = s._id || s.id || s.uid;
        if (id) studentIdToGroup.set(id, g);
      });
      const groups = Array.from(groupsSet);
      if (groups.length === 0) return;

      const groupToCounts = new Map(groups.map((g) => [g, new Array(defaultSlots.length).fill(0)]));
      attendance.forEach((r) => {
        if (!(r?.type === 'in' || r?.checkIn)) return;
        const sid = r?.student?._id || r?.studentId || r?.uid;
        if (!sid) return;
        const g = studentIdToGroup.get(sid) || 'Unassigned';
        if (!groupToCounts.has(g)) groupToCounts.set(g, new Array(defaultSlots.length).fill(0));
        const ts = r?.timestamp || r?.checkIn?.time;
        if (!ts) return;
        const d = new Date(ts);
        const mins = d.getHours() * 60 + d.getMinutes();
        const slotIndex = slotRanges.findIndex((rng) => mins >= rng.start && mins < rng.end);
        const idx = slotIndex >= 0 ? slotIndex : defaultSlots.length - 1;
        const arr = groupToCounts.get(g);
        arr[idx] = (arr[idx] || 0) + 1;
        groupToCounts.set(g, arr);
      });

      const series = Array.from(groupToCounts.entries()).map(([name, counts]) => ({ name, data: counts }));
      setHeatmapSlots(defaultSlots);
      setHeatmapDepartments(groups);
      setHeatmapSeries(series);
    } catch (e) {
      console.error('Failed to build heatmap fallback:', e);
    }
  };

  const loadEmployeesForTile = async (groupName, slotLabel) => {
    try {
      setTileEmployeesLoading(true);
      setTileEmployeesError(null);
      setTileEmployees([]);

      const parseSlotRange = (label) => {
        try {
          if (label.endsWith('+')) {
            const [h, m] = label.replace('+', '').split(':').map((v) => parseInt(v, 10));
            return { start: h * 60 + (m || 0), end: 24 * 60 };
          }
          const sep = label.includes('–') ? '–' : '-';
          const [startStr, endStr] = label.split(sep).map((s) => s.trim());
          const [sh, sm] = startStr.split(':').map((v) => parseInt(v, 10));
          const [eh, em] = endStr.split(':').map((v) => parseInt(v, 10));
          return { start: sh * 60 + (sm || 0), end: eh * 60 + (em || 0) };
        } catch (_) { return { start: 0, end: 24 * 60 }; }
      };
      const { start, end } = parseSlotRange(slotLabel || '0:00+');

      const today = new Date().toISOString().split('T')[0];
      const [studentsRes, dailyRes] = await Promise.all([
        axios.get('/api/students', { params: { limit: 10000 } }),
        axios.get('/api/attendance/reports/daily', { params: { date: today } }).catch(() => ({ data: {} })),
      ]);

      const students = studentsRes?.data?.students || [];
      const attendance = dailyRes?.data?.report?.attendance || [];

      // Filter students by group
      const matchesGroup = (s) => {
        if (heatmapGroupBy === 'class') return (s.class || 'Unassigned') === groupName;
        if (heatmapGroupBy === 'bureau') return (s.bureau || 'Unassigned') === groupName;
        if (heatmapGroupBy === 'gender') return (s.gender || 'Unassigned') === groupName;
        return (s.department || 'Unassigned') === groupName;
      };
      const groupStudents = students.filter(matchesGroup);
      const groupIds = new Set(groupStudents.map((s) => s._id || s.id || s.uid).filter(Boolean));

      // Build per-student timing within slot
      const byStudent = new Map();
      attendance.forEach((r) => {
        const sid = r?.student?._id || r?.studentId || r?.uid;
        if (!sid || !groupIds.has(sid)) return;
        const ts = r?.timestamp || r?.checkIn?.time || r?.checkOut?.time;
        if (!ts) return;
        const d = new Date(ts);
        const mins = d.getHours() * 60 + d.getMinutes();
        if (!(mins >= start && mins < end)) return;
        const base = byStudent.get(sid) || { student: r.student, inTs: null, outTs: null };
        if (r.type === 'in' || r.checkIn) {
          const inTs = r?.checkIn?.time || r?.timestamp || r?.checkInTime;
          if (inTs && (!base.inTs || new Date(inTs) < new Date(base.inTs))) base.inTs = inTs;
        }
        if (r.type === 'out' || r.checkOut) {
          const outTs = r?.checkOut?.time || r?.timestamp || r?.checkOutTime;
          if (outTs && (!base.outTs || new Date(outTs) > new Date(base.outTs))) base.outTs = outTs;
        }
        base.student = base.student || r.student;
        byStudent.set(sid, base);
      });

      let toDisplay = Array.from(byStudent.values())
        .map((v) => {
          const format = (ts) => {
            if (!ts) return null;
            const d = new Date(ts);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          };
          return {
            name: v?.student?.fullName || 'Unknown',
            id: v?.student?._id,
            uid: v?.student?.uid,
            inTime: format(v.inTs),
            outTime: format(v.outTs),
          };
        })
        .sort((a, b) => {
          const at = a.inTime ? a.inTime : '99:99';
          const bt = b.inTime ? b.inTime : '99:99';
          return at.localeCompare(bt);
        });

      // Fallback: if no entries were captured for the slot, show all group employees with today timings
      if (toDisplay.length === 0) {
        const today = new Date().toISOString().split('T')[0];
        const dailyAll = await axios.get('/api/attendance/reports/daily', { params: { date: today } }).catch(() => ({ data: {} }));
        const allAttendance = dailyAll?.data?.report?.attendance || [];
        const perStudent = new Map();
        allAttendance.forEach((r) => {
          const sid = r?.student?._id || r?.studentId || r?.uid;
          if (!sid || !groupIds.has(sid)) return;
          const base = perStudent.get(sid) || { student: r.student, inTs: null, outTs: null };
          if (r.type === 'in' || r.checkIn) {
            const inTs = r?.checkIn?.time || r?.timestamp || r?.checkInTime;
            if (inTs && (!base.inTs || new Date(inTs) < new Date(base.inTs))) base.inTs = inTs;
          }
          if (r.type === 'out' || r.checkOut) {
            const outTs = r?.checkOut?.time || r?.timestamp || r?.checkOutTime;
            if (outTs && (!base.outTs || new Date(outTs) > new Date(base.outTs))) base.outTs = outTs;
          }
          base.student = base.student || r.student;
          perStudent.set(sid, base);
        });
        const format = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
        toDisplay = Array.from(perStudent.values()).map(v => ({
          name: v?.student?.fullName || 'Unknown',
          id: v?.student?._id,
          uid: v?.student?.uid,
          inTime: format(v.inTs),
          outTime: format(v.outTs)
        })).sort((a, b) => {
          const at = a.inTime ? a.inTime : '99:99';
          const bt = b.inTime ? b.inTime : '99:99';
          return at.localeCompare(bt);
        });
      }

      setTileEmployees(toDisplay);
    } catch (e) {
      console.error('Failed to load employees for tile:', e);
      setTileEmployeesError('Failed to load employees for selected slot');
    } finally {
      setTileEmployeesLoading(false);
    }
  };

  // Per-student first check-in and latest check-out for ranking by total hours
  const topDurationData = useMemo(() => {
    const dataToUse = filteredAttendanceData.length > 0 ? filteredAttendanceData : attendanceData;
    if (!dataToUse || dataToUse.length === 0) return [];
    const byStudent = new Map();
    for (const r of dataToUse) {
      const studentId = r?.student?._id || r?.studentId || r?.uid;
      if (!studentId) continue;
      const base = byStudent.get(studentId) || { student: r.student, inTs: null, outTs: null, authMethod: r.authMethod };
      const inCandidate = r?.checkIn?.time || (r?.type === 'in' ? (r?.timestamp || r?.checkInTime) : null);
      const outCandidate = r?.checkOut?.time || (r?.type === 'out' ? (r?.timestamp || r?.checkOutTime) : null);
      if (inCandidate && (!base.inTs || new Date(inCandidate) < new Date(base.inTs))) {
        base.inTs = inCandidate;
      }
      if (outCandidate && (!base.outTs || new Date(outCandidate) > new Date(base.outTs))) {
        base.outTs = outCandidate;
      }
      base.authMethod = base.authMethod || r.authMethod;
      base.student = base.student || r.student;
      byStudent.set(studentId, base);
    }
    const arr = Array.from(byStudent.values()).map((v) => {
      const hasIn = !!v.inTs;
      const hasOut = !!v.outTs;
      const totalMs = hasIn && hasOut ? (new Date(v.outTs) - new Date(v.inTs)) : 0;
      return { ...v, hasIn, hasOut, totalMs };
    });
    return arr.sort((a, b) => b.totalMs - a.totalMs);
  }, [attendanceData]);

  useEffect(() => {
    setVisibleCheckoutCount(5);
  }, [topDurationData]);

  const pendingDurationData = useMemo(() => {
    if (!topDurationData || topDurationData.length === 0) return [];
    const eightHoursMs = 8 * 3600000;
    const now = Date.now();
    const awaiting = topDurationData
      .filter((p) => p.hasIn && !p.hasOut)
      .map((p) => {
        const elapsedMs = Math.max(0, now - new Date(p.inTs).getTime());
        const remainingMs = Math.max(0, eightHoursMs - elapsedMs);
        return { ...p, kind: 'awaiting', elapsedMs, remainingMs };
      });
    const early = topDurationData
      .filter((p) => p.hasIn && p.hasOut && p.totalMs > 0 && p.totalMs < eightHoursMs)
      .map((p) => {
        const remainingMs = eightHoursMs - p.totalMs;
        return { ...p, kind: 'early_checkout', elapsedMs: p.totalMs, remainingMs };
      });
    // Sort groups individually by remaining descending (max remaining first); show early first, then awaiting
    const earlySorted = [...early].sort((a, b) => b.remainingMs - a.remainingMs);
    const awaitingSorted = [...awaiting].sort((a, b) => b.remainingMs - a.remainingMs);
    return [...earlySorted, ...awaitingSorted];
  }, [topDurationData]);

  // Filtered data for search functionality
  const filteredTopDurationData = useMemo(() => {
    if (!searchQuery.trim()) return topDurationData;

    const query = searchQuery.toLowerCase().trim();
    return topDurationData.filter((item) => {
      const student = item.student;
      if (!student) return false;

      return (
        student.fullName?.toLowerCase().includes(query) ||
        student.uid?.toLowerCase().includes(query) ||
        (student.bureau && student.bureau.toLowerCase().includes(query)) ||
        (student.department && student.department.toLowerCase().includes(query)) ||
        (student.class && student.class.toLowerCase().includes(query))
      );
    });
  }, [topDurationData, searchQuery]);

  const filteredPendingDurationData = useMemo(() => {
    if (!searchQueryPending.trim()) return pendingDurationData;

    const query = searchQueryPending.toLowerCase().trim();
    return pendingDurationData.filter((item) => {
      const student = item.student;
      if (!student) return false;

      return (
        student.fullName?.toLowerCase().includes(query) ||
        student.uid?.toLowerCase().includes(query) ||
        (student.bureau && student.bureau.toLowerCase().includes(query)) ||
        (student.department && student.department.toLowerCase().includes(query)) ||
        (student.class && student.class.toLowerCase().includes(query))
      );
    });
  }, [pendingDurationData, searchQueryPending]);

  // Top 5 earliest check-ins today
  const earlyBirds = useMemo(() => {
    const dataToUse = filteredAttendanceData.length > 0 ? filteredAttendanceData : attendanceData;
    if (!dataToUse || dataToUse.length === 0) return [];

    const todayIso = new Date().toISOString().split('T')[0];
    const byStudent = new Map();

    for (const r of dataToUse) {
      const studentId = r?.student?._id || r?.studentId || r?.uid;
      if (!studentId) continue;

      const inCandidate = r?.checkIn?.time || (r?.type === 'in' ? (r?.timestamp || r?.checkInTime) : null);
      if (!inCandidate) continue;

      const inDate = new Date(inCandidate);
      if (Number.isNaN(inDate.getTime())) continue;

      // Keep only today's entries
      if (inDate.toISOString().split('T')[0] !== todayIso) continue;

      const existing = byStudent.get(studentId);
      if (!existing || inDate < new Date(existing.inTs)) {
        byStudent.set(studentId, {
          student: r.student,
          inTs: inCandidate
        });
      }
    }

    return Array.from(byStudent.values())
      .sort((a, b) => new Date(a.inTs) - new Date(b.inTs))
      .slice(0, 5);
  }, [attendanceData, filteredAttendanceData]);

  useEffect(() => {
    setVisiblePendingCount(5);
  }, [pendingDurationData]);

  // Reset visible counts when search queries change
  useEffect(() => {
    setVisibleCheckoutCount(5);
  }, [searchQuery]);

  useEffect(() => {
    setVisiblePendingCount(5);
  }, [searchQueryPending]);
  const [liveAttendanceError, setLiveAttendanceError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [attendanceStats, setAttendanceStats] = useState({
    trendData: [],
    kpis: {
      averageInTime: "00:00",
      averageOutTime: "00:00",
    },
  });
  const [statsLoading, setStatsLoading] = useState(false);
  const [slotSummary, setSlotSummary] = useState([]);
  const [slotSummaryOut, setSlotSummaryOut] = useState([]);
  const [deptSummary, setDeptSummary] = useState([]);
  const [deptDetailedStats, setDeptDetailedStats] = useState([]);
  const [noCheckInCount, setNoCheckInCount] = useState(0);
  const [pairedTotals, setPairedTotals] = useState({ both: 0, noCheckout: 0 });
  const [slotDate, setSlotDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [slotAttendanceData, setSlotAttendanceData] = useState([]);
  const [slotMode, setSlotMode] = useState('day'); // 'day' | 'week' | 'month'
  const [slotWeek, setSlotWeek] = useState(() => {
    const d = new Date();
    const dayNum = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayNum + 1);
    const yearStart = new Date(monday.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((monday - yearStart) / 86400000) + 1) / 7);
    return `${monday.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  });
  const [slotMonth, setSlotMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [slotAbsentStudents, setSlotAbsentStudents] = useState([]);
  const [slotAbsentLoading, setSlotAbsentLoading] = useState(false);
  const [slotAbsentError, setSlotAbsentError] = useState(null);
  const [showSlotAbsentStudents, setShowSlotAbsentStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [todayPresentCount, setTodayPresentCount] = useState(0);
  const [todayAbsentCount, setTodayAbsentCount] = useState(0);
  const [todayLeaveCount, setTodayLeaveCount] = useState(0);
  const [todayUnapprovedCount, setTodayUnapprovedCount] = useState(0);

  // Modal states
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const handleShowDetails = (type) => {
    try {
      const today = slotDate || new Date().toISOString().split('T')[0];
      if (type === 'leave') {
        setShowLeaveModal(true);
        return;
      }
      if (type === 'unapproved') {
        navigate('/registration-images');
        return;
      }
      if (type === 'present' || type === 'absent') {
        navigate(`/status-list?status=${encodeURIComponent(type)}&date=${encodeURIComponent(today)}`);
        return;
      }
    } catch (_) {
      // no-op
    }
  };

  // Sample stock (candlestick) data for the stock chart

  // Simplified filter utility functions
  const getCurrentDateRange = () => {
    const today = new Date();

    switch (filterMode) {
      case 'today':
        const todayStr = today.toISOString().split('T')[0];
        return {
          startDate: todayStr,
          endDate: todayStr
        };
      case 'week':
        // Get start of current week (Monday)
        const dayOfWeek = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

        // Get end of current week (Sunday)
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        return {
          startDate: monday.toISOString().split('T')[0],
          endDate: sunday.toISOString().split('T')[0]
        };
      case 'month':
        const startDate = formatDateYMD(selectedYear, selectedMonth, 1);
        const endDate = formatDateYMD(selectedYear, selectedMonth, getLastDayOfMonth(selectedYear, selectedMonth));
        return { startDate, endDate };
      case 'custom':
        // Validate custom date range
        if (customDateRange.startDate && customDateRange.endDate) {
          // Ensure start date is not after end date
          if (new Date(customDateRange.startDate) > new Date(customDateRange.endDate)) {
            return {
              startDate: customDateRange.endDate,
              endDate: customDateRange.startDate
            };
          }
          return customDateRange;
        }
        // Fallback to current month if custom range is incomplete
        const fallbackStart = formatDateYMD(selectedYear, selectedMonth, 1);
        const fallbackEnd = formatDateYMD(selectedYear, selectedMonth, getLastDayOfMonth(selectedYear, selectedMonth));
        return { startDate: fallbackStart, endDate: fallbackEnd };
      default:
        return dateRange;
    }
  };

  // Human-readable label for the trend charts, reflecting the active filter so
  // the title matches what's actually plotted (no longer a fixed "Last 10 Days").
  const getTrendPeriodLabel = () => {
    const now = new Date();
    switch (filterMode) {
      case 'today':
        return 'Today';
      case 'week':
        return 'This Week';
      case 'month': {
        const isCurrent = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
        const monthName = new Date(selectedYear, selectedMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return isCurrent ? `${monthName} (to date)` : monthName;
      }
      case 'custom':
        if (customDateRange.startDate && customDateRange.endDate) {
          return `${customDateRange.startDate} – ${customDateRange.endDate}`;
        }
        return 'Selected range';
      default:
        return 'Last 10 Days';
    }
  };

  const applyFilters = async () => {
    setFilterLoading(true);
    const currentRange = getCurrentDateRange();
    setDateRange(currentRange);

    try {
      await loadDashboardBundle({ startDate: currentRange.startDate, endDate: currentRange.endDate, date: currentRange.startDate });
      await loadSlotSummaryForDate(slotDate, slotMode);
    } catch (error) {
      console.error('Error applying filters:', error);
      toast.error('Failed to apply filters');
    } finally {
      setFilterLoading(false);
    }
  };

  const resetFilters = async () => {
    const today = new Date();
    setFilterMode('month');
    setSelectedMonth(today.getMonth());
    setSelectedYear(today.getFullYear());

    // Reset custom date range
    setCustomDateRange({
      startDate: '',
      endDate: ''
    });

    try {
      setFilterLoading(true);
      const currentRange = getCurrentDateRange();
      setDateRange(currentRange);
      await loadDashboardBundle({ startDate: currentRange.startDate, endDate: currentRange.endDate, date: currentRange.startDate });
      await loadSlotSummaryForDate(slotDate, slotMode);
    } catch (error) {
      console.error('Error resetting filters:', error);
    } finally {
      setFilterLoading(false);
    }
  };

  const setQuickFilter = async (mode) => {
    console.log('Setting filter mode to:', mode);
    setFilterMode(mode);

    // Auto-apply filters when switching modes
    try {
      setFilterLoading(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      const currentRange = getCurrentDateRange();
      setDateRange(currentRange);
      await loadDashboardBundle({ startDate: currentRange.startDate, endDate: currentRange.endDate, date: currentRange.startDate });
      await loadSlotSummaryForDate(slotDate, slotMode);
    } catch (error) {
      console.error('Error applying filters:', error);
    } finally {
      setFilterLoading(false);
    }
  };

  const handleCustomDateChange = (field, value) => {
    setCustomDateRange(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const applyCustomDateRange = async () => {
    if (!customDateRange.startDate || !customDateRange.endDate) {
      toast.error('Please select both start and end dates');
      return;
    }

    // Validate date range
    const startDate = new Date(customDateRange.startDate);
    const endDate = new Date(customDateRange.endDate);

    if (startDate > endDate) {
      toast.error('Start date cannot be after end date');
      return;
    }

    // Check if date range is not too far in the future
    const today = new Date();
    if (startDate > today) {
      toast.error('Start date cannot be in the future');
      return;
    }

    setFilterMode('custom');
    await applyFilters();
  };

  // Recent Activity date filtering functions
  const fetchRecentActivityData = async (dateRange) => {
    try {
      setRecentActivityLoading(true);
      const response = await axios.get('/api/attendance/reports/daily', {
        params: {
          date: dateRange.startDate
        },
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const attendanceData = response.data.report.attendance || [];
      setAttendanceData(attendanceData);
      setFilteredAttendanceData(attendanceData);
    } catch (error) {
      console.error('Error fetching recent activity data:', error);
      toast.error('Failed to load recent activity data');
      setFilteredAttendanceData([]);
    } finally {
      setRecentActivityLoading(false);
    }
  };

  const handleRecentActivityCustomDateChange = (field, value) => {
    setRecentActivityDateRange(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSingleDateSelection = async (date) => {
    if (!date) {
      toast.error('Please select a date');
      return;
    }

    setRecentActivityLoading(true);
    try {
      // Set both start and end date to the same selected date
      setRecentActivityDateRange({
        startDate: date,
        endDate: date
      });

      // Fetch data for the selected date using the correct endpoint
      const response = await axios.get(`/api/attendance/reports/daily?date=${date}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (response.data.success) {
        // Transform the data to match the expected format
        const attendanceData = response.data.report.attendance || [];
        setAttendanceData(attendanceData);
        setFilteredAttendanceData(attendanceData);
        toast.success(`Attendance data loaded for ${new Date(date).toLocaleDateString()}`);
      } else {
        toast.error(response.data.message || 'Failed to load attendance data');
      }
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      toast.error('Failed to load attendance data');
    } finally {
      setRecentActivityLoading(false);
    }
  };

  const applyRecentActivityCustomDateRange = async () => {
    if (!recentActivityDateRange.startDate || !recentActivityDateRange.endDate) {
      toast.error('Please select both start and end dates');
      return;
    }

    const startDate = new Date(recentActivityDateRange.startDate);
    const endDate = new Date(recentActivityDateRange.endDate);

    if (startDate > endDate) {
      toast.error('Start date cannot be after end date');
      return;
    }

    await fetchRecentActivityData(recentActivityDateRange);
  };


  const fetchSpotCheckTrend = async ({ startDate, endDate } = {}) => {
    try {
      const params = {};
      if (startDate) params.from = startDate;
      if (endDate) params.to = endDate;
      const res = await axios.get('/api/spot-checks/report', { params });
      if (res.data?.success) {
        setSpotCheckTrend(res.data?.trend || []);
      }
    } catch (e) {
      console.error('Failed to load spot checks trend:', e);
    }
  };

  // Consolidated data loader used across page
  const loadDashboardBundle = async ({ date, startDate, endDate } = {}) => {
    try {
      setLoading(true);
      await fetchSpotCheckTrend({ startDate, endDate });
      const params = new URLSearchParams();
      params.set('date', date || new Date().toISOString().split('T')[0]);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await axios.get(`/api/attendance/dashboard?${params.toString()}`);
      const d = res.data?.data || {};

      setAttendanceData(d.dailyReport?.attendance || []);
      // Only set present/absent from bundle if fetchDashboardData has not already run
      // (fetchDashboardData is the authoritative source; bundle is used for filter-driven reloads)
      setTodayPresentCount(d.dailyReport?.presentCount || 0);
      setTodayAbsentCount(d.dailyReport?.absentCount || 0);
      // Leave count: prefer bundle value; fetchDashboardData will override via stats on initial load
      setTodayLeaveCount(d.leaveRequests?.count || 0);

      // Store the actual request data for modal display
      setLeaveRequests(d.leaveRequests?.requests || []);

      setGenderDistribution(d.genderDistribution || []);
      setAuthMethodDistribution(d.authMethodDistribution || []);
      setOverallRate(d.overallRate || { present: 0, absent: 0, totalStudents: 0, attendanceRate: 0 });

      setTimeWiseData(d.timeWise?.timeSlots || []);
      setTimeWiseInOut(d.timeWiseInOut?.timeSlots || []);
      setTimeWiseTotals(d.timeWiseInOut?.totals || { in: 0, out: 0 });

      const hm = d.heatmap || {};
      setHeatmapSlots(hm.slots || []);
      setHeatmapDepartments(hm.departments || []);
      setHeatmapSeries((hm.matrix || []).map(r => ({ name: r.department, data: r.values })));

      setLiveAttendanceData(d.liveAttendance || []);
      setLastUpdated(new Date());

      setChartData(d.last10Days || []);
      setAttendanceStats(prev => ({
        ...prev,
        trendData: (d.last10Days || []).map(x => ({
          date: x.date,
          present: x.count || 0,
          absent: Math.max((x.totalStudents || 0) - (x.count || 0), 0),
          late: x.late || 0,
          total: x.totalStudents || 0,
          isToday: x.isToday,
          isWeekend: x.isWeekend
        }))
      }));
    } catch (e) {
      console.error('Failed to load dashboard bundle:', e);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const currentRange = getCurrentDateRange();
    loadDashboardBundle({ startDate: currentRange.startDate, endDate: currentRange.endDate });
    // Also compute KPIs (avg in/out/auth) on mount
    fetchAttendanceStatistics();
    return () => { };
  }, []);

  // Fetch approved leave requests on component mount
  useEffect(() => {
    console.log('Dashboard mounted. Auth status:', { isAuthenticated, authLoading, user: !!user });
    if (isAuthenticated && !authLoading) {
      fetchApprovedRequests();
      fetchDashboardData();
    } else if (!authLoading && !isAuthenticated) {
      console.log('User not authenticated, redirecting to login...');
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Optimized auto-refresh - only when dashboard is visible
  useEffect(() => {
    let interval;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        interval = setInterval(() => {
          fetchLiveAttendanceData();
        }, 60000); // Reduced to 60 seconds to save resources
      }
    };

    // Start interval if page is visible
    if (!document.hidden) {
      interval = setInterval(() => {
        fetchLiveAttendanceData();
      }, 60000);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (filterMode === 'month' && selectedMonth !== undefined && selectedYear !== undefined) {
      const startDate = formatDateYMD(selectedYear, selectedMonth, 1);
      const lastDay = getLastDayOfMonth(selectedYear, selectedMonth);
      const endDate = formatDateYMD(selectedYear, selectedMonth, lastDay);

      // Update the dateRange state to reflect the selected month
      const newDateRange = {
        startDate: startDate,
        endDate: endDate,
      };
      setDateRange(newDateRange);

      // Fetch auth method distribution with the new date range
      fetchAuthMethodDistribution();
      // Fetch overall attendance rate with the new date range
      fetchOverallAttendanceRate(newDateRange);
    }
  }, [selectedMonth, selectedYear, filterMode]);

  // Auto-apply filters when filter mode changes
  useEffect(() => {
    if (filterMode === 'today' || filterMode === 'week') {
      const currentRange = getCurrentDateRange();
      setDateRange(currentRange);
      fetchGenderDistribution(currentRange);
      fetchAuthMethodDistribution(currentRange);
      fetchOverallAttendanceRate(currentRange);
    }
  }, [filterMode]);

  // Helper function to format date properly without timezone issues
  const formatDateYMD = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
  };

  // Helper function to get last day of month
  const getLastDayOfMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Helpers for week/month inputs
  const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const getISOWeekString = (dateObj) => {
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  };
  const getDateFromWeekValue = (weekVal) => {
    try {
      const [yearStr, wStr] = weekVal.split('-W');
      const year = parseInt(yearStr, 10);
      const week = parseInt(wStr, 10);
      const simple = new Date(year, 0, 1 + (week - 1) * 7);
      const dow = simple.getDay();
      const ISOweekStart = new Date(simple);
      const diff = (dow <= 4 ? dow - 1 : dow - 8);
      ISOweekStart.setDate(simple.getDate() - diff);
      return formatYMD(ISOweekStart);
    } catch {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  };

  // Helpers for slot bounds and filtering details
  const getSlotBounds = (label) => {
    switch (label) {
      case 'Before 9:00':
        return { from: 0, to: 540 };
      case '9:00-9:29':
        return { from: 540, to: 570 };
      case '9:30-9:59':
        return { from: 570, to: 600 };
      case '10:00-10:59':
        return { from: 600, to: 660 };
      case 'After 11:00':
        return { from: 660, to: 1440 };
      // Checkout (PM) buckets
      case 'Before 4:00 PM':
        return { from: 0, to: 960 };
      case '4:00-4:29 PM':
        return { from: 960, to: 990 };
      case '4:30-4:59 PM':
        return { from: 990, to: 1020 };
      case '5:00-5:29 PM':
        return { from: 1020, to: 1050 };
      case 'After 5:30 PM':
        return { from: 1050, to: 1440 };
      default:
        return { from: 0, to: 1440 };
    }
  };

  const getMinutesFromTimestamp = (ts) => {
    const d = new Date(ts);
    return d.getHours() * 60 + d.getMinutes();
  };

  const showSlotDetails = (slotLabel, type) => {
    const source = (slotAttendanceData && slotAttendanceData.length > 0) ? slotAttendanceData : attendanceData;
    if (!source || source.length === 0) {
      setExpandedSlotDetails({ slot: slotLabel, type, items: [] });
      return;
    }
    const bounds = getSlotBounds(slotLabel);
    const checkoutThresholdMinutes = 660; // 11:00 AM
    let items = [];
    if (type === 'noCheckout') {
      // Build per-student first-in and last-out
      const byStudent = new Map();
      for (const r of source) {
        const sid = r.student?._id || r.student;
        if (!sid) continue;
        if (!byStudent.has(sid)) byStudent.set(sid, { inTime: null, outTime: null, name: r.student?.fullName, uid: r.student?.uid, inTsRaw: null, studentId: sid });
        const entry = byStudent.get(sid);
        if (r.type === 'in') {
          if (!entry.inTime || new Date(r.timestamp) < new Date(entry.inTime)) { entry.inTime = new Date(r.timestamp).toLocaleTimeString(); entry.inTsRaw = r.timestamp; }
        }
        if (r.type === 'out') {
          if (!entry.outTime || new Date(r.timestamp) > new Date(entry.outTime)) entry.outTime = new Date(r.timestamp).toLocaleTimeString();
        }
      }
      items = Array.from(byStudent.values())
        .filter(e => e.inTsRaw && !e.outTime)
        .filter(e => {
          const mins = getMinutesFromTimestamp(e.inTsRaw);
          return mins >= bounds.from && mins < bounds.to;
        })
        .map((e, idx) => ({
          id: idx,
          name: e.name || 'Unknown',
          uid: e.uid || '',
          time: e.inTime,
          studentId: e.studentId || null
        }))
        .sort((a, b) => a.time.localeCompare(b.time));
    } else if (type === 'out' || type === 'veryLate') {
      // Show only the last checkout per student for the selected date, attributed to their check-in slot
      // Filter to students whose first check-in falls within the selected slot and whose last checkout is >= 11:00
      const byStudent = new Map();
      for (const r of source) {
        const sid = r?.student?._id || r?.student;
        if (!sid) continue;
        if (!byStudent.has(sid)) byStudent.set(sid, { inTs: null, outTs: null, name: r.student?.fullName, uid: r.student?.uid, studentId: sid });
        const entry = byStudent.get(sid);
        if (r.type === 'in') {
          if (!entry.inTs || new Date(r.timestamp) < new Date(entry.inTs)) entry.inTs = r.timestamp;
        }
        if (r.type === 'out') {
          if (!entry.outTs || new Date(r.timestamp) > new Date(entry.outTs)) entry.outTs = r.timestamp;
        }
      }
      items = Array.from(byStudent.values())
        .filter(e => e.inTs && e.outTs)
        .filter(e => {
          const inMins = getMinutesFromTimestamp(e.inTs);
          const outMins = getMinutesFromTimestamp(e.outTs);
          return inMins >= bounds.from && inMins < bounds.to && outMins >= checkoutThresholdMinutes;
        })
        .map((e, idx) => ({
          id: idx,
          name: e.name || 'Unknown',
          uid: e.uid || '',
          time: new Date(e.outTs).toLocaleTimeString(),
          studentId: e.studentId || null
        }))
        .sort((a, b) => a.time.localeCompare(b.time));
    } else {
      items = source
        .filter(r => r && r.type === type && (typeof r.timestamp === 'string' || r.timestamp))
        .filter(r => {
          const mins = getMinutesFromTimestamp(r.timestamp);
          return mins >= bounds.from && mins < bounds.to;
        })
        .map(r => ({
          id: r._id,
          name: r.student?.fullName || 'Unknown',
          uid: r.student?.uid || '',
          time: new Date(r.timestamp).toLocaleTimeString(),
          studentId: r.student?._id || null
        }))
        .sort((a, b) => a.time.localeCompare(b.time));
    }

    setExpandedSlotDetails(prev => {
      // toggle if clicking same slot/type
      if (prev.slot === slotLabel && prev.type === type) {
        return { slot: null, type: null, items: [] };
      }
      return { slot: slotLabel, type, items };
    });
  };

  // Reload the trend for the currently selected period (today/week/month/custom).
  // The bundle endpoint owns the trend computation and caps it at today, so the
  // chart always matches the active filter instead of a fixed last-10-days.
  const fetchChartData = async () => {
    setChartLoading(true);
    try {
      const currentRange = getCurrentDateRange();
      await loadDashboardBundle({ startDate: currentRange.startDate, endDate: currentRange.endDate, date: currentRange.startDate });
    } catch (error) {
      console.error('Error fetching chart data:', error);
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  };


  // Use chartData if available, otherwise use empty array
  const data = chartData;

  // Optimized data fetching with caching and batch requests
  const fetchDashboardData = async () => {
    try {
      console.log('[Dashboard] Fetching dashboard data...');
      // Batch critical data first — allSettled so one failing call doesn't
      // blank the whole dashboard.
      const [statsResult, attendanceResult, profileResult, absencesResult] = await Promise.allSettled([
        axios.get('/api/organization/stats', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get('/api/attendance/reports/daily', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get('/api/organization/profile', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get('/api/absences', {
          params: { date: new Date().toISOString().split('T')[0] },
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      const statsResponse = statsResult.status === 'fulfilled' ? statsResult.value : null;
      const attendanceResponse = attendanceResult.status === 'fulfilled' ? attendanceResult.value : null;
      const profileResponse = profileResult.status === 'fulfilled' ? profileResult.value : null;
      const absencesResponse = absencesResult.status === 'fulfilled' ? absencesResult.value : null;

      [statsResult, attendanceResult, profileResult, absencesResult].forEach((r) => {
        if (r.status === 'rejected') console.error('[Dashboard] request failed:', r.reason);
      });
      if (!statsResponse && !attendanceResponse && !profileResponse) {
        toast.error('Failed to load dashboard data');
      }

      // Set critical data immediately
      if (statsResponse?.data?.stats) {
        const statsData = statsResponse.data.stats;
        // Stats is the authoritative source for leave count (it queries DB directly for today)
        setTodayLeaveCount(statsData.todayLeave || 0);
        if (typeof statsData.unregisteredCount === 'number') {
          setTodayUnapprovedCount(statsData.unregisteredCount);
        }
        setStats(statsData);
      }
      axios.get('/api/portal/staff/registration-overview').then((res) => {
        const data = res?.data;
        if (data && typeof data.total === 'number') {
          setTodayUnapprovedCount(Math.max(0, (data.total || 0) - (data.withImage || 0)));
        }
      }).catch(() => {});
      if (attendanceResponse?.data?.report) {
        // Only update attendanceData list here for the activity table.
        // Present/absent counts are owned by loadDashboardBundle to avoid race conditions.
        const todayAttendance = attendanceResponse.data.report.attendance || [];
        setAttendanceData(todayAttendance);
      }
      if (profileResponse?.data?.organization) {
        setOrganization(profileResponse.data.organization);
      }

      // Load secondary data asynchronously (each request settles independently)
      Promise.allSettled([
        axios.get('/api/attendance/reports/time-wise'),
        axios.get('/api/attendance/reports/time-wise-in-out'),
        axios.get('/api/attendance/department-time-heatmap')
      ]).then(([timeWiseResult, timeWiseInOutResult, heatmapResult]) => {
        if (timeWiseResult.status === 'fulfilled') {
          setTimeWiseData(timeWiseResult.value.data.data.timeSlots || []);
        } else {
          console.error('Error loading time-wise data:', timeWiseResult.reason);
        }
        if (timeWiseInOutResult.status === 'fulfilled') {
          const timeWiseInOutResponse = timeWiseInOutResult.value;
          setTimeWiseInOut((timeWiseInOutResponse.data && timeWiseInOutResponse.data.data && timeWiseInOutResponse.data.data.timeSlots) || []);
          setTimeWiseTotals((timeWiseInOutResponse.data && timeWiseInOutResponse.data.data && timeWiseInOutResponse.data.data.totals) || { in: 0, out: 0 });
        } else {
          console.error('Error loading time-wise in/out data:', timeWiseInOutResult.reason);
        }

        if (heatmapResult.status === 'fulfilled') {
          // Heatmap mapping
          const heatmapResponse = heatmapResult.value;
          const hm = heatmapResponse.data?.success
            ? heatmapResponse.data
            : { data: heatmapResponse.data };
          const slots = hm.slots || hm.data?.slots || [];
          // Prefer departments, then classes, then bureaus
          const deptOrClassOrBureau = hm.departments || hm.classes || hm.bureaus || hm.data?.departments || hm.data?.classes || hm.data?.bureaus || [];
          const matrix = hm.matrix || hm.data?.matrix || [];
          const series = matrix.map((r) => ({
            name: r.department || r.class || r.bureau || r.gender,
            data: r.values,
          }));
          if (slots.length && deptOrClassOrBureau.length && series.length) {
            setHeatmapSlots(slots);
            setHeatmapDepartments(deptOrClassOrBureau);
            setHeatmapSeries(series);
          } else {
            // Fallback if backend did not return usable data
            buildHeatmapFallback();
          }
        } else {
          console.error('Error loading heatmap data:', heatmapResult.reason);
          // Build client-side fallback if request fails
          buildHeatmapFallback();
        }
      });

      // Initialize slot summary for selected date (defaults to today)
      loadSlotSummaryForDate(slotDate, slotMode);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const getDatesForMode = (dateStr, mode) => {
    // Day: expect YYYY-MM-DD
    if (mode === 'day') {
      // Normalize to YYYY-MM-DD in case a week (YYYY-Www) or month (YYYY-MM) value is passed
      try {
        let normalized = dateStr;
        // If week string like 2025-W40 is passed, convert to Monday date
        if (/^\d{4}-W\d{2}$/.test(dateStr)) {
          normalized = getDateFromWeekValue(dateStr);
        } else if (/^\d{4}-\d{2}$/.test(dateStr)) {
          // If month string like 2025-09, default to first day of the month
          normalized = `${dateStr}-01`;
        } else {
          const d = new Date(dateStr);
          if (!Number.isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            normalized = `${y}-${m}-${day}`;
          } else {
            // Fallback to today if invalid
            const t = new Date();
            normalized = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
          }
        }
        return [normalized];
      } catch {
        return [dateStr];
      }
    }

    // Week: input is HTML week value YYYY-Www. Convert to Monday date first.
    if (mode === 'week') {
      const mondayStr = /\d{4}-W\d{2}/.test(dateStr) ? getDateFromWeekValue(dateStr) : dateStr;
      const base = new Date(mondayStr);
      if (Number.isNaN(base.getTime())) return [dateStr];
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
      return dates;
    }

    // Month: input is YYYY-MM. Build dates across entire month.
    if (mode === 'month') {
      let y; let mIndex;
      if (/^\d{4}-\d{2}$/.test(dateStr)) {
        const [yy, mm] = dateStr.split('-').map(Number);
        y = yy; mIndex = mm - 1;
      } else {
        const base = new Date(dateStr);
        if (Number.isNaN(base.getTime())) return [dateStr];
        y = base.getFullYear(); mIndex = base.getMonth();
      }
      const last = new Date(y, mIndex + 1, 0).getDate();
      const dates = [];
      for (let d = 1; d <= last; d++) {
        dates.push(`${y}-${String(mIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
      return dates;
    }

    return [dateStr];
  };

  const loadSlotSummaryForDate = async (dateStr, mode = slotMode) => {
    try {
      // Fetch daily report(s) for given date or range depending on mode
      const dateList = getDatesForMode(dateStr, mode);
      const responses = await Promise.all(
        dateList.map(d => axios.get('/api/attendance/reports/daily', { params: { date: d } }).catch(() => ({ data: {} })))
      );
      const list = responses.flatMap(r => r?.data?.report?.attendance || []);
      setSlotAttendanceData(list);

      // Compute per-student pairing and slot-level summary for in/out/no-checkout
      const slotLabelsIn = ['Before 9:00', '9:00-9:29', '9:30-9:59', '10:00-10:59', 'After 11:00'];
      const countsIn = new Map(slotLabelsIn.map(l => [l, { name: l, checkIn: 0, checkOut: 0, noCheckout: 0, veryLate: 0 }]));
      const slotLabelsOut = ['Before 4:30 PM', '4:30-4:59 PM', '5:00-5:29 PM', '5:30-6:00 PM', 'After 6:00 PM'];
      const countsOut = new Map(slotLabelsOut.map(l => [l, { name: l, checkIn: 0, checkOut: 0 }]));
      const byStudent = new Map();
      for (const r of list) {
        const sid = r.student?._id || r.student;
        if (!sid) continue;
        const dayKey = r.timestamp ? new Date(r.timestamp).toISOString().split('T')[0] : '';
        const key = `${sid}_${dayKey}`;
        if (!byStudent.has(key)) byStudent.set(key, { inTime: null, outTime: null });
        const entry = byStudent.get(key);
        if (r.type === 'in') {
          if (!entry.inTime || new Date(r.timestamp) < new Date(entry.inTime)) entry.inTime = r.timestamp;
        }
        if (r.type === 'out') {
          if (!entry.outTime || new Date(r.timestamp) > new Date(entry.outTime)) entry.outTime = r.timestamp;
        }
      }
      let both = 0; let noCheckout = 0;
      const toLabelIn = (ts) => {
        const m = getMinutesFromTimestamp(ts);
        if (m < 540) return 'Before 9:00';
        if (m >= 540 && m < 570) return '9:00-9:29';
        if (m >= 570 && m < 600) return '9:30-9:59';
        if (m >= 600 && m < 660) return '10:00-10:59';
        return 'After 11:00';
      };
      const toLabelOut = (ts) => {
        const m = getMinutesFromTimestamp(ts);
        if (m < 990) return 'Before 4:30 PM';
        if (m >= 990 && m < 1020) return '4:30-4:59 PM';
        if (m >= 1020 && m < 1050) return '5:00-5:29 PM';
        if (m >= 1050 && m < 1080) return '5:30-6:00 PM';
        return 'After 6:00 PM';
      };
      const checkoutThresholdMinutes = 660; // 11:00 AM
      for (const [, e] of byStudent) {
        if (e.inTime) {
          const lIn = toLabelIn(e.inTime);
          countsIn.get(lIn).checkIn += 1;
          if (e.outTime) {
            both += 1;
            // Attribute checkout to the check-in slot, but count only if last checkout >= 11:00
            const outMins = getMinutesFromTimestamp(e.outTime);
            if (outMins >= checkoutThresholdMinutes) {
              countsIn.get(lIn).checkOut += 1;
              countsIn.get(lIn).veryLate += 1; // keep separate column for late checkouts
            }
          } else {
            noCheckout += 1;
            countsIn.get(lIn).noCheckout += 1;
          }
        }
      }
      // Independently count all checkouts into PM buckets using each student's latest checkout only
      for (const [, e] of byStudent) {
        if (e.outTime) {
          const lOut = toLabelOut(e.outTime);
          const bucket = countsOut.get(lOut);
          if (bucket) bucket.checkOut += 1;
        }
      }
      setPairedTotals({ both, noCheckout });
      setSlotSummary(slotLabelsIn.map(l => countsIn.get(l)));
      setSlotSummaryOut(slotLabelsOut.map(l => countsOut.get(l)));
      setExpandedSlotDetails({ slot: null, type: null, items: [] });

      // Calculate Absenties and Department Stats for the selected date range
      try {
        const studentsRes = await axios.get('/api/students', { params: { limit: 10000 } });
        const allStudents = studentsRes.data?.students || [];

        // Which field actually holds this org's grouping ("Department-wise"
        // widgets are generic, but different organizationTypes tag staff under
        // different fields — school/institute use `class`, government_office
        // uses `bureau`, everyone else uses `department`. This MUST match the
        // convention used elsewhere in the app (heatmap grouping, StudentReport)
        // — hardcoding `department` here left the whole section permanently
        // empty for a government_office org whose staff are tagged via `bureau`.
        const orgType = organization?.organizationType;
        const groupField = (orgType === 'school' || orgType === 'institute')
          ? 'class'
          : (orgType === 'government_office' || orgType === 'Government')
            ? 'bureau'
            : 'department';
        const groupOptionsFromOrg = groupField === 'class'
          ? organization?.classes
          : groupField === 'bureau'
            ? (organization?.bureaus?.length ? organization.bureaus : organization?.bureau)
            : organization?.departments;

        // The org's configured groupField (department/bureau/class per
        // organizationType) may simply be blank on the actual Student records
        // (data entry gap — the field exists on the schema but was never
        // filled in for this org's staff). Previously a falsy groupField
        // value meant that student was silently DROPPED from every
        // department-wise widget — with enough staff missing it, the whole
        // section renders "No department data available" even though
        // students and attendance both clearly exist (per the summary tiles
        // above). Fall back to whichever of department/bureau/class IS set,
        // and failing that, bucket them under "Unassigned" so they're still
        // visible instead of vanishing.
        const resolveDept = (s) =>
          s?.[groupField] || s?.department || s?.bureau || s?.class || 'Unassigned';

        // Compute department (or bureau/class) wise summary
        const depts = (groupOptionsFromOrg?.length
          ? groupOptionsFromOrg
          : Array.from(new Set(allStudents.map(s => resolveDept(s)))).sort())
          .filter(d => {
            const clean = d.trim().toLowerCase();
            return clean !== 'hd h' && clean !== 'jbagbu';
          });

        const deptEmployeeCounts = {};
        allStudents.forEach(s => {
          const d = resolveDept(s);
          deptEmployeeCounts[d] = (deptEmployeeCounts[d] || 0) + 1;
        });

        const deptData = {};
        for (const d of depts) {
          deptData[d] = {
            department: d,
            totalEmployees: deptEmployeeCounts[d] || 0,
            onTimeIn: 0,
            lateIn: 0,
            veryLateIn: 0,
            earlyLeaveOut: 0,
            earlyOut: 0,
            onTimeOut: 0
          };
        }

        const studentDeptMap = new Map();
        allStudents.forEach(s => {
          if (s._id) {
            studentDeptMap.set(s._id.toString(), resolveDept(s));
          }
        });

        for (const [sid, entry] of byStudent) {
          const deptName = studentDeptMap.get(sid.toString()) || resolveDept(entry.studentObj);
          if (!deptName) continue;
          
          const cleanName = deptName.trim().toLowerCase();
          if (cleanName === 'hd h' || cleanName === 'jbagbu') continue;

          if (!deptData[deptName]) {
            deptData[deptName] = {
              department: deptName,
              totalEmployees: deptEmployeeCounts[deptName] || 0,
              onTimeIn: 0,
              lateIn: 0,
              veryLateIn: 0,
              earlyLeaveOut: 0,
              earlyOut: 0,
              onTimeOut: 0
            };
          }

          if (entry.inTime) {
            const lIn = toLabelIn(entry.inTime);
            if (lIn === 'Before 9:00' || lIn === '9:00-9:29') {
              deptData[deptName].onTimeIn += 1;
            } else if (lIn === '9:30-9:59') {
              deptData[deptName].lateIn += 1;
            } else {
              deptData[deptName].veryLateIn += 1;
            }
          }

          if (entry.outTime) {
            const lOut = toLabelOut(entry.outTime);
            if (lOut === 'Before 4:30 PM' || lOut === '4:30-4:59 PM') {
              deptData[deptName].earlyLeaveOut += 1;
            } else if (lOut === '5:00-5:29 PM') {
              deptData[deptName].earlyOut += 1;
            } else {
              deptData[deptName].onTimeOut += 1;
            }
          }
        }
        setDeptSummary(Object.values(deptData));

        const presentOrRecordedIds = new Set(
          list
            .map(r => r?.student?._id)
            .filter(Boolean)
        );
        const absent = allStudents.filter(s => !presentOrRecordedIds.has(s._id));
        setSlotAbsentStudents(absent);

        // Compute total missing check-in instances across all dates in the selected period
        let totalNoInCount = 0;
        for (const d of dateList) {
          const inIdsOnDate = new Set(
            list
              .filter(r => r?.type === 'in' && r?.timestamp && new Date(r.timestamp).toISOString().split('T')[0] === d)
              .map(r => r?.student?._id || r?.student)
              .filter(Boolean)
          );
          const absentOnDate = allStudents.filter(s => !inIdsOnDate.has(s._id));
          totalNoInCount += absentOnDate.length;
        }
        setNoCheckInCount(totalNoInCount);

        // --- Fetch Approved Leaves and Field Requests for Detailed Stats ---
        let approvedLeaves = [];
        let approvedFields = [];

        try {
          const leavesRes = await axios.get('/api/leave-requests/approved');
          if (leavesRes.data?.success) {
            approvedLeaves = leavesRes.data.data?.leaveRequests || [];
          }
        } catch (err) {
          console.error('Failed to load approved leaves:', err);
        }

        try {
          const fieldsRes = await axios.get('/api/field-requests/all', { params: { status: 'approved', limit: 10000 } });
          if (fieldsRes.data?.success) {
            approvedFields = fieldsRes.data.data?.requests || [];
          }
        } catch (err) {
          console.error('Failed to load approved field requests:', err);
        }

        // Initialize department detailed stats structure. Include "Unassigned"
        // unconditionally even when the org has an explicit configured
        // department list — resolveDept() falls back to it for any student
        // whose configured groupField is blank, and without a bucket ready for
        // it here those students would still be silently dropped from this
        // (second) widget even though deptSummary above already accounts for
        // them.
        const deptDetailedData = {};
        for (const d of [...depts, 'Unassigned']) {
          if (deptDetailedData[d]) continue;
          deptDetailedData[d] = {
            department: d,
            totalEmployees: deptEmployeeCounts[d] || 0,
            presentCount: 0,
            absentCount: 0,
            onFieldCount: 0,
            onLeaveCount: 0,
            presentEmployees: [],
            absentEmployees: [],
            onFieldEmployees: [],
            onLeaveEmployees: [],
          };
        }

        // Map containing student ID -> Set of dates they checked in
        const studentCheckedInDates = new Map();
        for (const r of list) {
          const sid = (r.student?._id || r.student)?.toString();
          if (!sid) continue;
          const rDate = new Date(r.timestamp);
          if (isNaN(rDate.getTime())) continue;
          const rDateStr = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
          if (!studentCheckedInDates.has(sid)) {
            studentCheckedInDates.set(sid, new Set());
          }
          studentCheckedInDates.get(sid).add(rDateStr);
        }

        const isCovered = (startVal, endVal, currentStr) => {
          if (!startVal || !endVal) return false;
          const start = new Date(startVal);
          const end = new Date(endVal);
          const current = new Date(currentStr);
          start.setHours(0,0,0,0);
          end.setHours(0,0,0,0);
          current.setHours(0,0,0,0);
          return current >= start && current <= end;
        };

        // For each day, determine each student's status
        const dailyStatuses = {};
        
        for (const dStr of dateList) {
          dailyStatuses[dStr] = {};
          
          for (const student of allStudents) {
            const sid = student._id.toString();
            const dept = resolveDept(student);
            if (!dept || !deptDetailedData[dept]) continue;
            
            let status = 'absent';
            let detail = '';
            
            if (studentCheckedInDates.has(sid) && studentCheckedInDates.get(sid).has(dStr)) {
              status = 'present';
            } else {
              const activeField = approvedFields.find(req => req.student?._id?.toString() === sid && isCovered(req.startDate, req.endDate, dStr));
              if (activeField) {
                status = 'field';
                detail = activeField.eventTitle || 'Field duty';
              } else {
                const activeLeave = approvedLeaves.find(req => req.student?._id?.toString() === sid && isCovered(req.leaveDates?.start, req.leaveDates?.end, dStr));
                if (activeLeave) {
                  status = 'leave';
                  detail = activeLeave.leaveDetails || 'On leave';
                }
              }
            }
            
            dailyStatuses[dStr][sid] = { status, detail };
            
            if (status === 'present') {
              deptDetailedData[dept].presentCount += 1;
            } else if (status === 'field') {
              deptDetailedData[dept].onFieldCount += 1;
            } else if (status === 'leave') {
              deptDetailedData[dept].onLeaveCount += 1;
            } else {
              deptDetailedData[dept].absentCount += 1;
            }
          }
        }

        const numDays = dateList.length || 1;
        
        for (const student of allStudents) {
          const sid = student._id.toString();
          const dept = resolveDept(student);
          if (!dept || !deptDetailedData[dept]) continue;

          const statuses = dateList.map(dStr => dailyStatuses[dStr]?.[sid]).filter(Boolean);
          
          if (statuses.some(s => s.status === 'present')) {
            deptDetailedData[dept].presentEmployees.push(student);
          }
          const fieldDay = statuses.find(s => s.status === 'field');
          if (fieldDay) {
            deptDetailedData[dept].onFieldEmployees.push({
              ...student,
              eventTitle: fieldDay.detail
            });
          }
          const leaveDay = statuses.find(s => s.status === 'leave');
          if (leaveDay) {
            deptDetailedData[dept].onLeaveEmployees.push({
              ...student,
              leaveDetails: leaveDay.detail
            });
          }
          if (statuses.some(s => s.status === 'absent')) {
            deptDetailedData[dept].absentEmployees.push(student);
          }
        }

        for (const d of Object.keys(deptDetailedData)) {
          deptDetailedData[d].presentCount = Math.round((deptDetailedData[d].presentCount / numDays) * 10) / 10;
          deptDetailedData[d].absentCount = Math.round((deptDetailedData[d].absentCount / numDays) * 10) / 10;
          deptDetailedData[d].onFieldCount = Math.round((deptDetailedData[d].onFieldCount / numDays) * 10) / 10;
          deptDetailedData[d].onLeaveCount = Math.round((deptDetailedData[d].onLeaveCount / numDays) * 10) / 10;
        }

        setDeptDetailedStats(Object.values(deptDetailedData));

      } catch (err) {
        console.error('Failed to load Absenties and Detailed Stats:', err);
        setSlotAbsentStudents([]);
        setNoCheckInCount(0);
        setDeptSummary([]);
        setDeptDetailedStats([]);
      }
    } catch (err) {
      console.error('Failed to load slot summary for date:', err);
      toast.error('Failed to load slot summary for selected date');
    }
  };

  // Keep time-slot summaries in sync when mode or its date value changes
  useEffect(() => {
    try {
      const key = slotMode === 'day' ? slotDate : (slotMode === 'week' ? slotWeek : slotMonth);
      if (key) {
        loadSlotSummaryForDate(key, slotMode);
      }
    } catch (e) {
      console.error('Auto-refresh time slot summary failed:', e);
    }
  }, [slotMode, slotDate, slotWeek, slotMonth]);

  // Auto-refresh slot summaries every 60s when viewing today's day mode
  useEffect(() => {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let intervalId;
    if (slotMode === 'day' && slotDate === todayStr) {
      intervalId = setInterval(() => {
        loadSlotSummaryForDate(todayStr, 'day');
      }, 60000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [slotDate, slotMode]);

  const fetchGenderDistribution = async (filters = null) => {
    try {
      setGenderLoading(true);
      const params = filters || getCurrentDateRange();
      const response = await axios.get('/api/attendance/student-gender-distribution', {
        params
      });
      setGenderDistribution(response.data.data || []);
    } catch (error) {
      console.error("Error fetching gender distribution:", error);
      toast.error("Failed to load gender distribution");
    } finally {
      setGenderLoading(false);
    }
  };

  const fetchAuthMethodDistribution = async (filters = null) => {
    try {
      setAuthMethodLoading(true);
      const params = filters || getCurrentDateRange();
      const response = await axios.get('/api/attendance/student-auth-method', {
        params
      });
      setAuthMethodDistribution(response.data.data || []);
    } catch (error) {
      console.error("Error fetching auth method distribution:", error);
      toast.error("Failed to load auth method distribution");
    } finally {
      setAuthMethodLoading(false);
    }
  };

  // Fetch approved leave requests
  const fetchApprovedRequests = async () => {
    setRequestsLoading(true);
    try {
      const response = await axios.get('/api/leave-requests/approved');
      const data = response.data.data;
      setLeaveRequests(data.leaveRequests || []);
    } catch (error) {
      console.error("Error fetching approved requests:", error.response?.data || error.message);
    } finally {
      setRequestsLoading(false);
    }
  };

  const fetchOverallAttendanceRate = async (filters = null) => {
    try {
      setOverallRateLoading(true);
      const params = filters || getCurrentDateRange();
      const response = await axios.get('/api/attendance/student-overall-attendance-rate', {
        params
      });
      setOverallRate(response.data.data || { present: 0, absent: 0, totalStudents: 0, attendanceRate: 0 });
    } catch (error) {
      console.error("Error fetching overall attendance rate:", error);
      toast.error("Failed to load overall attendance rate");
    } finally {
      setOverallRateLoading(false);
    }
  };

  // Optional slot-aware absent loader for heatmap selections
  const loadAbsentStudentsForDepartment = async (groupName, slotLabel = null) => {
    try {
      setAbsentLoading(true);
      setAbsentError(null);
      setAbsentStudents([]);

      const [dailyReportRes, studentsRes] = await Promise.all([
        axios.get("/api/attendance/reports/daily", {
          params: {
            department: heatmapGroupBy === 'department' ? groupName : (organization?.organizationType === 'private_company' ? groupName : undefined),
            class: heatmapGroupBy === 'class' ? groupName : ((organization?.organizationType === 'school' || organization?.organizationType === 'institute') ? groupName : undefined),
            bureau: heatmapGroupBy === 'bureau' ? groupName : ((organization?.organizationType === 'government_office' || organization?.organizationType === 'Government') ? groupName : undefined),
            gender: heatmapGroupBy === 'gender' ? groupName : undefined,
          },
        }),
        axios.get("/api/students", {
          params: {
            department: heatmapGroupBy === 'department' ? groupName : (organization?.organizationType === 'private_company' ? groupName : undefined),
            class: heatmapGroupBy === 'class' ? groupName : ((organization?.organizationType === 'school' || organization?.organizationType === 'institute') ? groupName : undefined),
            bureau: heatmapGroupBy === 'bureau' ? groupName : ((organization?.organizationType === 'government_office' || organization?.organizationType === 'Government') ? groupName : undefined),
            gender: heatmapGroupBy === 'gender' ? groupName : undefined,
            limit: 10000
          },
        }),
      ]);

      const allStudents = studentsRes.data?.students || [];
      let attendanceRecords = dailyReportRes?.data?.report?.attendance || [];

      // If a time slot is selected, filter attendance records to that slot window
      if (slotLabel) {
        const parseSlotRange = (label) => {
          // Expected formats like '8:00–8:30', '10:30–11:00', '11:00+'
          try {
            if (label.endsWith('+')) {
              const [h, m] = label.replace('+', '').split(':').map((v) => parseInt(v, 10));
              return { startMinutes: h * 60 + (m || 0), endMinutes: 24 * 60 };
            }
            const sep = label.includes('–') ? '–' : '-';
            const [startStr, endStr] = label.split(sep).map((s) => s.trim());
            const [sh, sm] = startStr.split(':').map((v) => parseInt(v, 10));
            const [eh, em] = endStr.split(':').map((v) => parseInt(v, 10));
            return { startMinutes: sh * 60 + (sm || 0), endMinutes: eh * 60 + (em || 0) };
          } catch (_) {
            return { startMinutes: 0, endMinutes: 24 * 60 };
          }
        };
        const { startMinutes, endMinutes } = parseSlotRange(slotLabel);
        attendanceRecords = attendanceRecords.filter((r) => {
          const ts = r?.timestamp || r?.checkIn?.time || r?.checkOut?.time;
          if (!ts) return false;
          const d = new Date(ts);
          const mins = d.getHours() * 60 + d.getMinutes();
          return mins >= startMinutes && mins < endMinutes;
        });
      }

      const presentOrRecordedIds = new Set(
        attendanceRecords.map((r) => r?.student?._id || r?.studentId || r?.uid).filter(Boolean)
      );

      const absent = allStudents.filter((s) => !presentOrRecordedIds.has(s._id || s.id || s.uid));
      setAbsentStudents(absent);
    } catch (err) {
      console.error('Failed to load Absenties:', err);
      setAbsentError('Failed to load Absenties');
    } finally {
      setAbsentLoading(false);
    }
  };

  const loadAbsentStudentsForSlot = async () => {
    try {
      setSlotAbsentLoading(true);
      setSlotAbsentError(null);
      setSlotAbsentStudents([]);

      // Get all students
      const studentsRes = await axios.get('/api/students', { params: { limit: 10000 } });
      const allStudents = studentsRes.data?.students || [];

      // Get attendance records for the selected date range
      const dateList = getDatesForMode(slotDate, slotMode);
      const responses = await Promise.all(
        dateList.map(d => axios.get('/api/attendance/reports/daily', { params: { date: d } }).catch(() => ({ data: {} })))
      );
      const attendanceRecords = responses.flatMap(r => r?.data?.report?.attendance || []);

      // Find students who have no attendance records for the selected date(s)
      const presentOrRecordedIds = new Set(
        attendanceRecords
          .map(r => r?.student?._id)
          .filter(Boolean)
      );

      const absent = allStudents.filter(s => !presentOrRecordedIds.has(s._id));
      setSlotAbsentStudents(absent);
      setShowSlotAbsentStudents(true);
    } catch (err) {
      console.error('Failed to load Absenties for slot:', err);
      setSlotAbsentError('Failed to load Absenties');
    } finally {
      setSlotAbsentLoading(false);
    }
  };

  const fetchLiveAttendanceData = async () => {
    try {
      setLiveAttendanceLoading(true);
      setLiveAttendanceError(null);
      setLiveAttendanceData([]);

      const response = await axios.get("/api/attendance/live-activity");
      setLiveAttendanceData(response.data.data || []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching live attendance data:", error);
      setLiveAttendanceError("Failed to load live attendance data");
    } finally {
      setLiveAttendanceLoading(false);
    }
  };

  // Helper function to categorize attendance records. Currently unreferenced —
  // the trend now comes from the dashboard bundle — but kept for reuse.
  // eslint-disable-next-line no-unused-vars
  const categorizeAttendance = (attendanceRecords, totalStudents, dateStr) => {
    // Group records by student ID - using the same logic as other parts of the app
    const studentRecords = new Map();

    attendanceRecords.forEach(record => {
      const studentId = record?.student?._id || record?.studentId || record?.uid;
      if (!studentId) return;

      if (!studentRecords.has(studentId)) {
        studentRecords.set(studentId, {
          studentId,
          inTs: null,
          outTs: null,
          student: record.student
        });
      }

      const studentData = studentRecords.get(studentId);

      if (record.type === 'in') {
        if (!studentData.inTs || new Date(record.timestamp) < new Date(studentData.inTs)) {
          studentData.inTs = record.timestamp;
        }
      }

      if (record.type === 'out') {
        if (!studentData.outTs || new Date(record.timestamp) > new Date(studentData.outTs)) {
          studentData.outTs = record.timestamp;
        }
      }
    });

    let present = 0;
    let absent = 0;
    let late = 0;

    // Process each student's records
    studentRecords.forEach(studentData => {
      const hasCheckIn = !!studentData.inTs;
      const hasCheckOut = !!studentData.outTs;

      if (hasCheckIn || hasCheckOut) {
        // Student has marked check-in or check-out - they are present
        present++;

        // Check if they were late (check-in after 9:30 AM)
        if (hasCheckIn) {
          const checkInTime = new Date(studentData.inTs);
          const checkInHour = checkInTime.getHours();
          const checkInMinute = checkInTime.getMinutes();
          const checkInMinutes = checkInHour * 60 + checkInMinute;
          const lateThreshold = 9 * 60 + 30; // 9:30 AM in minutes

          if (checkInMinutes > lateThreshold) {
            late++;
          }
        }
      } else {
        // Student has neither check-in nor check-out - they are absent
        absent++;
      }
    });

    // Add students who have no records at all as absent
    const studentsWithRecords = studentRecords.size;
    const studentsWithoutRecords = Math.max(0, totalStudents - studentsWithRecords);
    absent += studentsWithoutRecords;

    console.log(`Categorization for ${dateStr}:`, {
      totalStudents,
      studentsWithRecords,
      studentsWithoutRecords,
      present,
      absent,
      late,
      attendanceRecordsCount: attendanceRecords.length
    });

    return { present, absent, late };
  };

  // Helper function to calculate average in/out times
  const calculateAverageTimes = (attendanceRecords) => {
    const checkInTimes = [];
    const checkOutTimes = [];

    attendanceRecords.forEach(record => {
      if (record.type === 'in' || record.checkIn) {
        const checkInTime = record.checkIn?.time || record.timestamp || record.checkInTime;
        if (checkInTime) {
          checkInTimes.push(new Date(checkInTime));
        }
      }

      if (record.type === 'out' || record.checkOut) {
        const checkOutTime = record.checkOut?.time || record.timestamp || record.checkOutTime;
        if (checkOutTime) {
          checkOutTimes.push(new Date(checkOutTime));
        }
      }
    });

    const formatTime = (times) => {
      if (times.length === 0) return "N/A";

      const totalMinutes = times.reduce((sum, time) => {
        return sum + time.getHours() * 60 + time.getMinutes();
      }, 0);

      const avgMinutes = Math.round(totalMinutes / times.length);
      const hours = Math.floor(avgMinutes / 60);
      const minutes = avgMinutes % 60;

      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };

    return {
      averageInTime: formatTime(checkInTimes),
      averageOutTime: formatTime(checkOutTimes)
    };
  };

  const fetchAttendanceStatistics = async () => {
    try {
      setStatsLoading(true);

      // Trend data is owned by loadDashboardBundle (it follows the selected
      // filter and is capped at today). This function only computes the avg
      // in/out KPIs so it no longer overwrites the trend with a fixed 10-day window.

      // Calculate average in/out times from today's attendance records
      let todayRecords = attendanceData || [];

      // If no attendance data is available, try to fetch today's data
      if (todayRecords.length === 0) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const todayResponse = await axios.get(`/api/attendance/reports/daily?date=${today}`, {
            timeout: 3000
          });
          todayRecords = todayResponse.data.report?.attendance || [];
        } catch (error) {
          console.error('Error fetching today\'s attendance data:', error);
          todayRecords = [];
        }
      }

      const { averageInTime, averageOutTime } = calculateAverageTimes(todayRecords);

      setAttendanceStats(prev => ({
        ...prev,
        kpis: {
          averageInTime,
          averageOutTime
        }
      }));

    } catch (error) {
      console.error("Error fetching attendance statistics:", error);
      toast.error("Failed to load attendance statistics");
    } finally {
      setStatsLoading(false);
    }
  };


  const COLORS = CATEGORY_COLORS;
  const genderTotal = genderDistribution.reduce((sum, d) => sum + (d.value || 0), 0);

  // Helper function to get the correct label based on organization type
  const getOrganizationLabel = () => {
    if (!organization) return "Organization";

    switch (organization.organizationType) {
      case "school":
      case "institute":
        return "Class";
      case "private_company":
        return "Department";
      case "government_office":
        return "Bureau";
      default:
        return "Organization";
    }
  };

  // Totals for slot summary (computed from slotSummary state)
  const slotTotals = useMemo(() => {
    try {
      if (!slotSummary || slotSummary.length === 0) return { in: 0, out: 0, no: 0, absent: 0 };
      return slotSummary.reduce((acc, s) => {
        return {
          in: acc.in + (s.checkIn || 0),
          out: acc.out + (s.checkOut || 0),
          no: acc.no + (s.noCheckout || 0),
          absent: slotAbsentStudents.length || 0
        };
      }, { in: 0, out: 0, no: 0, absent: slotAbsentStudents.length || 0 });
    } catch (_) {
      return { in: 0, out: 0, no: 0, absent: 0 };
    }
  }, [slotSummary, slotAbsentStudents]);

  const slotTotalsOut = useMemo(() => {
    try {
      if (!slotSummaryOut || slotSummaryOut.length === 0) return { out: 0 };
      return slotSummaryOut.reduce((acc, s) => {
        return { out: acc.out + (s.checkOut || 0) };
      }, { out: 0 });
    } catch (_) {
      return { out: 0 };
    }
  }, [slotSummaryOut]);

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={2} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonTable rows={5} cols={3} />
          <SkeletonTable rows={5} cols={3} />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={User}
        title="Not signed in"
        message="Please log in to access the dashboard."
      />
    );
  }

  return (
    <ErrorBoundary>
      <div ref={setScrollRoot} className="space-y-6">
        <PageHeader
          title="Attendance Overview"
          subtitle="A clear view of attendance across your team."
          meta={lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : null}
        />

        {/* Dashboard Filters */}
        <ScrollReveal y={20} duration={600} delay={80} blur={0}>
          <Suspense fallback={<Skeleton className="h-16 w-full" />}>
            <DashboardFilters
              showFilters={showFilters}
              setShowFilters={setShowFilters}
              filterMode={filterMode}
              setQuickFilter={(mode) => {
                setQuickFilter(mode);
                // keep slotMode in sync for time-slot widgets
                setSlotMode(mode === 'today' ? 'day' : mode);
              }}
              filterLoading={filterLoading}
              resetFilters={resetFilters}
              selectedMonth={selectedMonth}
              setSelectedMonth={(m) => { setSelectedMonth(m); setSlotMonth(`${selectedYear}-${String(m + 1).padStart(2, '0')}`); }}
              selectedYear={selectedYear}
              setSelectedYear={(y) => { setSelectedYear(y); setSlotMonth(`${y}-${String(selectedMonth + 1).padStart(2, '0')}`); }}
              applyFilters={() => {
                applyFilters();
                // refresh both time-slot summaries for current selection
                loadSlotSummaryForDate(
                  filterMode === 'today' ? slotDate : (filterMode === 'week' ? slotWeek : slotMonth),
                  filterMode === 'today' ? 'day' : (filterMode === 'week' ? 'week' : 'month')
                );
              }}
              customDateRange={customDateRange}
              handleCustomDateChange={handleCustomDateChange}
              applyCustomDateRange={applyCustomDateRange}
            />
          </Suspense>
        </ScrollReveal>

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard index={0} label="Today's present" value={todayPresentCount} icon={UserCheck} tone="brand" hint="Marked in today" spark={chartData.filter((x) => !x.isWeekend).map((x) => x.count || 0)} onClick={() => handleShowDetails('present')} />
          <KpiCard index={1} label="Today's absent" value={todayAbsentCount} icon={UserX} tone="err" hint="Not marked in today" onClick={() => handleShowDetails('absent')} />
          <KpiCard index={2} label="On approved leave" value={todayLeaveCount} icon={Calendar} tone="info" hint="Approved leave today" onClick={() => handleShowDetails('leave')} />
          <KpiCard index={3} label="Not registered on app" value={todayUnapprovedCount} icon={UserMinus} tone="warn" hint="Face or app setup pending" onClick={() => handleShowDetails('unapproved')} />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <AttendanceTrendCard chartData={chartData} loading={filterLoading} />
          <AttendanceCalendar />
        </div>

        {/* SAACMS module tiles (academics, outreach, anti-fraud, leave, compliance) */}
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <SaacmsOverview />
        </Suspense>

        {/* Check-in/out Time Slot Summary */}
        <ScrollReveal y={44} duration={780} delay={0} blur={6}>
          <LazyOnVisible fallback={<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>}>
            <div className="space-y-4">
              {/* Unified Global Filter Toolbar */}
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-100/90 via-teal-50 to-emerald-100/90 dark:border-emerald-500/40 dark:from-emerald-950/80 dark:via-slate-900 dark:to-teal-950/80 shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30 shrink-0">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Time Slot Summary & Analytics
                    </h3>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Check-in & Check-out time window distribution
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {/* Period Switcher */}
                  <div className="flex items-center gap-1 rounded-xl bg-white/90 p-1 border border-emerald-200/80 dark:border-slate-700 dark:bg-slate-900 shadow-xs">
                    {['day', 'week', 'month'].map((mode) => (
                      <button
                        key={mode}
                        onClick={async () => {
                          setSlotMode(mode);
                          const val = mode === 'day' ? slotDate : mode === 'week' ? slotWeek : slotMonth;
                          await loadSlotSummaryForDate(val, mode);
                        }}
                        className={`rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                          slotMode === mode
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Date Input */}
                  <div className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-900 shadow-xs">
                    <Calendar className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <input
                      type={slotMode === 'day' ? 'date' : slotMode === 'week' ? 'week' : 'month'}
                      value={slotMode === 'day' ? slotDate : slotMode === 'week' ? slotWeek : slotMonth}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={async (e) => {
                        if (slotMode === 'day') setSlotDate(e.target.value);
                        else if (slotMode === 'week') setSlotWeek(e.target.value);
                        else setSlotMonth(e.target.value);
                        await loadSlotSummaryForDate(e.target.value, slotMode);
                      }}
                      className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Side-by-side Time Slot Cards */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* In Time Slot Summary */}
                <div className="h-full flex flex-col">
                  <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                    <TimeSlotSummary
                      title="Check-in Time Slot Summary"
                      slotDate={slotDate}
                      slotWeek={slotWeek}
                      slotMonth={slotMonth}
                      slotMode={slotMode}
                      setSlotDate={setSlotDate}
                      setSlotWeek={setSlotWeek}
                      setSlotMonth={setSlotMonth}
                      setSlotMode={setSlotMode}
                      loadSlotSummaryForDate={loadSlotSummaryForDate}
                      getDateFromWeekValue={getDateFromWeekValue}
                      handleDownload={handleDownloadAttendance}
                      slotTotals={slotTotals}
                      noCheckInCount={noCheckInCount}
                      slotSummary={slotSummary}
                      navigate={navigate}
                      type="checkin"
                      compact
                      hideFilters
                      className="h-full"
                    />
                  </Suspense>
                </div>

                {/* Out Time Slot Summary */}
                <div className="h-full flex flex-col">
                  <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                    <TimeSlotSummary
                      title="Check-out Time Slot Summary"
                      slotDate={slotDate}
                      slotWeek={slotWeek}
                      slotMonth={slotMonth}
                      slotMode={slotMode}
                      setSlotDate={setSlotDate}
                      setSlotWeek={setSlotWeek}
                      setSlotMonth={setSlotMonth}
                      setSlotMode={setSlotMode}
                      loadSlotSummaryForDate={loadSlotSummaryForDate}
                      getDateFromWeekValue={getDateFromWeekValue}
                      handleDownload={handleDownloadCheckout}
                      slotTotals={slotTotalsOut}
                      noCheckInCount={pairedTotals.noCheckout}
                      slotSummary={slotSummaryOut}
                      navigate={navigate}
                      type="checkout"
                      compact
                      hideFilters
                      className="h-full"
                    />
                  </Suspense>
                </div>
              </div>
            </div>
          </LazyOnVisible>
        </ScrollReveal>

        {/* Department-wise Attendance Summary */}
        {(userType === 'hoi' || userType === 'superadmin') && (
          <>
            <ScrollReveal y={44} duration={780} delay={0} blur={6}>
              <LazyOnVisible fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
                <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
                  <DepartmentSlotSummary
                    deptSummary={deptSummary}
                    slotDate={slotDate}
                    slotWeek={slotWeek}
                    slotMonth={slotMonth}
                    slotMode={slotMode}
                    setSlotDate={setSlotDate}
                    setSlotWeek={setSlotWeek}
                    setSlotMonth={setSlotMonth}
                    setSlotMode={setSlotMode}
                    loadSlotSummaryForDate={loadSlotSummaryForDate}
                  />
                </Suspense>
              </LazyOnVisible>
            </ScrollReveal>

            <ScrollReveal y={44} duration={780} delay={100} blur={6}>
              <LazyOnVisible fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
                <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
                  <DepartmentStatsSummary
                    deptDetailedStats={deptDetailedStats}
                    slotMode={slotMode}
                    slotDate={slotDate}
                  />
                </Suspense>
              </LazyOnVisible>
            </ScrollReveal>

            <ScrollReveal y={44} duration={780} delay={150} blur={6}>
              <LazyOnVisible fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
                <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
                  <DepartmentStatsCharts
                    deptDetailedStats={deptDetailedStats}
                    slotMode={slotMode}
                    slotDate={slotDate}
                  />
                </Suspense>
              </LazyOnVisible>
            </ScrollReveal>
          </>
        )}

        {/* ── NATS Maps Level Advanced Charts ── */}
        <div className="space-y-6">
          {/* Card 1: Mirror Bars */}
          <ScrollReveal y={50} duration={800} delay={0} blur={7}>
            <LazyOnVisible fallback={<Skeleton className="h-[460px] w-full rounded-3xl" />}>
              <Suspense fallback={<Skeleton className="h-[460px] w-full rounded-3xl" />}>
                <AnuvadiniAdvancedCharts
                  type="mirror"
                  todayPresentCount={todayPresentCount}
                  todayAbsentCount={todayAbsentCount}
                  todayLeaveCount={todayLeaveCount}
                  todayUnapprovedCount={todayUnapprovedCount}
                  attendanceStats={attendanceStats}
                  slotSummary={slotSummary}
                  chartData={chartData}
                />
              </Suspense>
            </LazyOnVisible>
          </ScrollReveal>

          {/* Card 2: Depth Columns */}
          <ScrollReveal y={50} duration={800} delay={0} blur={7}>
            <LazyOnVisible fallback={<Skeleton className="h-[400px] w-full rounded-3xl" />}>
              <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-3xl" />}>
                <AnuvadiniAdvancedCharts
                  type="depth"
                  todayPresentCount={todayPresentCount}
                  todayAbsentCount={todayAbsentCount}
                  todayLeaveCount={todayLeaveCount}
                  todayUnapprovedCount={todayUnapprovedCount}
                  attendanceStats={attendanceStats}
                  slotSummary={slotSummary}
                  chartData={chartData}
                  spotCheckTrend={spotCheckTrend}
                />
              </Suspense>
            </LazyOnVisible>
          </ScrollReveal>

          {/* Card 3: Attendance Landscape */}
          <ScrollReveal y={50} duration={800} delay={0} blur={7}>
            <LazyOnVisible fallback={<Skeleton className="h-[460px] w-full rounded-3xl" />}>
              <Suspense fallback={<Skeleton className="h-[460px] w-full rounded-3xl" />}>
                <AnuvadiniAdvancedCharts
                  type="landscape"
                  todayPresentCount={todayPresentCount}
                  todayAbsentCount={todayAbsentCount}
                  todayLeaveCount={todayLeaveCount}
                  todayUnapprovedCount={todayUnapprovedCount}
                  attendanceStats={attendanceStats}
                  slotSummary={slotSummary}
                  chartData={chartData}
                />
              </Suspense>
            </LazyOnVisible>
          </ScrollReveal>

          {/* ── Analytics Panel: Radar + Trend Chart ── */}
          <ScrollReveal y={46} duration={780} delay={0} blur={6}>
            <LazyOnVisible fallback={<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full"><Skeleton className="h-[460px] w-full rounded-3xl" /><Skeleton className="h-[460px] w-full rounded-3xl" /></div>}>
              <Suspense fallback={<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full"><Skeleton className="h-[460px] w-full rounded-3xl" /><Skeleton className="h-[460px] w-full rounded-3xl" /></div>}>
                <AttendanceAnalyticsPanel
                  todayPresentCount={todayPresentCount}
                  todayAbsentCount={todayAbsentCount}
                  overallRate={overallRate}
                  attendanceStats={attendanceStats}
                  slotTotals={slotTotals}
                  genderDistribution={genderDistribution}
                  authMethodDistribution={authMethodDistribution}
                  chartData={chartData}
                  liveAttendanceData={liveAttendanceData}
                  earlyBirds={earlyBirds}
                />
              </Suspense>
            </LazyOnVisible>
          </ScrollReveal>

          <ScrollReveal y={40} duration={750} delay={0} blur={5}>
            <LazyOnVisible fallback={<Skeleton className="h-[460px] w-full rounded-3xl" />}>
              <div className="w-full">
                <Suspense fallback={<Skeleton className="h-[460px] w-full rounded-3xl" />}>
                  <ScoreSummaryCard
                    todayPresentCount={todayPresentCount}
                    todayAbsentCount={todayAbsentCount}
                    todayLeaveCount={todayLeaveCount}
                    todayUnapprovedCount={todayUnapprovedCount}
                    overallRate={overallRate}
                    attendanceStats={attendanceStats}
                    slotTotals={slotTotals}
                    statsLoading={statsLoading}
                    onRefresh={async () => {
                      const currentRange = getCurrentDateRange();
                      await loadDashboardBundle({ startDate: currentRange.startDate, endDate: currentRange.endDate, date: currentRange.startDate });
                      await fetchAttendanceStatistics();
                    }}
                  />
                </Suspense>
              </div>
            </LazyOnVisible>
          </ScrollReveal>

          <ScrollReveal y={40} duration={760} delay={0} blur={5}>
            <LazyOnVisible fallback={<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Skeleton className="h-96 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>}>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Gender Distribution — Premium Bento */}
                <div className="h-full flex flex-col">
                  <div
                    className="relative rounded-3xl overflow-hidden flex flex-col bento-hover-anuvadini h-full"
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
                      style={{ background: 'linear-gradient(90deg, #8b5cf6, #a78bfa, #c4b5fd)' }} />
                    {/* Atmospheric glow */}
                    <div className="absolute -right-10 -top-10 w-28 h-28 rounded-full pointer-events-none"
                      style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)', filter: 'blur(18px)' }} />

                    <div className="p-6 flex flex-col h-full">
                      {/* Header */}
                      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                        <div className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0"
                          style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}>
                          <User className="w-4 h-4 text-violet-600" />
                        </div>
                        <div>
                          <div className="kicker-label text-slate-400">DEMOGRAPHICS · GENDER SPLIT</div>
                          <h3 className="font-bold text-[16px] text-slate-800 dark:text-slate-100 leading-tight mt-0.5"
                            style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
                            Gender Distribution
                          </h3>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col justify-between mt-4">
                        {genderLoading ? (
                          <SkeletonCard lines={5} />
                        ) : genderDistribution.length > 0 ? (
                          <div>
                            <ResponsiveContainer width="100%" height={300}>
                              <PieChart>
                                <Pie
                                  data={genderDistribution}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`}
                                  outerRadius={80}
                                  fill="#8884d8"
                                  dataKey="value"
                                >
                                  {genderDistribution.map((entry, index) => (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={COLORS[index % COLORS.length]}
                                    />
                                  ))}
                                </Pie>
                                <Tooltip
                                  contentStyle={chartTheme.tooltipStyle}
                                  itemStyle={chartTheme.tooltipItemStyle}
                                  formatter={(value, name) => [
                                    `${value} (${genderTotal ? ((value / genderTotal) * 100).toFixed(1) : 0}%)`,
                                    name
                                  ]}
                                />
                              </PieChart>
                            </ResponsiveContainer>

                            {/* Gender summary tiles */}
                            <div className="grid grid-cols-2 gap-3 mt-4">
                              {genderDistribution.map((item, index) => (
                                <div
                                  key={item.name}
                                  className="text-center p-3.5 rounded-2xl transition-colors duration-200"
                                  style={{
                                    background: `${COLORS[index % COLORS.length]}0f`,
                                    border: `1px solid ${COLORS[index % COLORS.length]}25`,
                                  }}
                                >
                                  <div className="flex items-center justify-center gap-2 mb-1.5">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                    <span className="text-[12px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">{item.name}</span>
                                  </div>
                                  <div className="text-2xl font-black tabular-nums" style={{ color: COLORS[index % COLORS.length], fontFamily: "'Geist','Inter',sans-serif" }}>{item.value}</div>
                                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Students</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <EmptyState
                            icon={User}
                            title="No gender data"
                            message="Gender distribution will appear here once students are registered."
                          />
                        )}
                      </div>
                    </div>
                    <span className="shine-overlay-anuvadini rounded-3xl opacity-40" />
                  </div>
                </div>

                {/* Daily Attendance Trend — Premium Bento */}
                <div className="h-full flex flex-col">
                  <div
                    className="relative rounded-3xl overflow-hidden flex flex-col bento-hover-anuvadini h-full"
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
                      style={{ background: 'linear-gradient(90deg, #6F8DF0, #93AEFB, #BFD0FF)' }} />
                    {/* Atmospheric glow */}
                    <div className="absolute -right-10 -top-10 w-28 h-28 rounded-full pointer-events-none"
                      style={{ background: 'radial-gradient(circle, rgba(111, 141, 240,0.12), transparent 70%)', filter: 'blur(18px)' }} />

                    <div className="p-6 flex flex-col h-full">
                      {/* Header */}
                      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0"
                            style={{ background: 'rgba(111, 141, 240,0.12)', border: '1px solid rgba(111, 141, 240,0.25)' }}>
                            <TrendingUp className="w-4 h-4 text-cyan-600" />
                          </div>
                          <div>
                            <div className="kicker-label text-slate-400">TREND · 10-DAY WINDOW</div>
                            <h3 className="font-bold text-[16px] text-slate-800 dark:text-slate-100 leading-tight mt-0.5"
                              style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
                              Daily Attendance Trend
                            </h3>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          loading={chartLoading}
                          onClick={async () => {
                            setChartLoading(true);
                            const currentRange = getCurrentDateRange();
                            await loadDashboardBundle({ startDate: currentRange.startDate, endDate: currentRange.endDate, date: currentRange.startDate });
                            setChartLoading(false);
                          }}
                        >
                          {chartLoading ? 'Refreshing...' : 'Refresh'}
                        </Button>
                      </div>

                      <div className="flex-1 flex flex-col justify-between mt-4">
                        {chartLoading ? (
                          <SkeletonCard lines={6} />
                        ) : data.length > 0 ? (
                          <div>
                            {/* Summary Stats */}
                            <div className="grid grid-cols-3 gap-4 mb-4 p-3 glass-soft bg-slate-50/20 rounded-xl">
                              <div className="text-center">
                                <div className="text-2xl font-bold text-primary-600 dark:text-primary-300">
                                  {data.reduce((sum, item) => sum + item.count, 0)}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Total Check-ins</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-success-600 dark:text-success-400">
                                  {Math.round(data.reduce((sum, item) => sum + item.attendanceRate, 0) / data.length)}%
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Avg. Rate</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-info-600 dark:text-info-400">
                                  {Math.max(...data.map(item => item.count))}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Peak Day</div>
                              </div>
                            </div>

                            <ResponsiveContainer width="100%" height={350}>
                              <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
                                <XAxis
                                  dataKey="date"
                                  tick={chartTheme.axisTick}
                                  tickLine={chartTheme.tickLine}
                                  tickFormatter={(value) => {
                                    const date = new Date(value);
                                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                  }}
                                />
                                <YAxis
                                  tick={chartTheme.axisTick}
                                  tickLine={chartTheme.tickLine}
                                  label={{ value: 'Students', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: chartTheme.axisColor } }}
                                />
                                <Tooltip
                                  contentStyle={chartTheme.tooltipStyle}
                                  labelStyle={chartTheme.tooltipLabelStyle}
                                  labelFormatter={(value) => {
                                    const date = new Date(value);
                                    return date.toLocaleDateString('en-US', {
                                      weekday: 'long',
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric'
                                    });
                                  }}
                                  formatter={(value, name, props) => [
                                    <div key="tooltip-content">
                                      <div className="font-semibold text-slate-800 dark:text-slate-100">{value} students</div>
                                      {props.payload.totalStudents > 0 && (
                                        <div className="text-sm text-slate-600 dark:text-slate-400">
                                          {props.payload.attendanceRate}% attendance rate
                                        </div>
                                      )}
                                      {props.payload.isToday && (
                                        <div className="text-xs text-primary-600 dark:text-primary-300 font-medium">Today</div>
                                      )}
                                      {props.payload.isWeekend && (
                                        <div className="text-xs text-warning-600 font-medium">Weekend</div>
                                      )}
                                      {props.payload.error && (
                                        <div className="text-xs text-danger-600 font-medium">Data unavailable</div>
                                      )}
                                    </div>
                                  ]}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="count"
                                  stroke={CHART_COLORS.primary}
                                  strokeWidth={3}
                                  dot={(props) => {
                                    const { cx, cy, payload } = props;
                                    return (
                                      <circle
                                        cx={cx}
                                        cy={cy}
                                        r={payload.isToday ? 6 : 4}
                                        fill={payload.isToday ? CHART_COLORS.primaryDeep : payload.isWeekend ? CHART_COLORS.warning : CHART_COLORS.primary}
                                        stroke={payload.isToday ? CHART_COLORS.primaryDeep : payload.isWeekend ? '#D97706' : CHART_COLORS.primaryDark}
                                        strokeWidth={2}
                                      />
                                    );
                                  }}
                                  activeDot={{
                                    r: 8,
                                    stroke: CHART_COLORS.primaryDark,
                                    strokeWidth: 3,
                                    fill: CHART_COLORS.primary
                                  }}
                                />
                              </LineChart>
                            </ResponsiveContainer>

                            {/* Legend */}
                            <div className="flex items-center justify-center space-x-6 mt-4 text-xs text-slate-600 dark:text-slate-400">
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-full bg-primary-500"></div>
                                <span>Regular Days</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-full bg-warning-500"></div>
                                <span>Weekends</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-full bg-primary-800"></div>
                                <span>Today</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <EmptyState
                            icon={BarChart3}
                            title="No attendance data available"
                            message="Daily check-in counts will appear here once data is recorded."
                            action={
                              <Button variant="outline" size="sm" onClick={fetchChartData}>
                                Try Again
                              </Button>
                            }
                          />
                        )}
                      </div>
                    </div>
                    <span className="shine-overlay-anuvadini rounded-3xl opacity-40" />
                  </div>
                </div>
              </div>
            </LazyOnVisible>
          </ScrollReveal>

          <ScrollReveal y={44} duration={780} delay={0} blur={6}>
            <LazyOnVisible fallback={<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Skeleton className="h-96 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>}>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Department Heatmap — Premium Bento */}
                <div className="h-full flex flex-col">
                  <div
                    className="relative rounded-3xl overflow-hidden flex flex-col bento-hover-anuvadini h-full"
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
                      style={{ background: 'linear-gradient(90deg, #f43f5e, #fb7185, #fda4af)' }} />
                    {/* Atmospheric glow */}
                    <div className="absolute -right-10 -top-10 w-28 h-28 rounded-full pointer-events-none"
                      style={{ background: 'radial-gradient(circle, rgba(244,63,94,0.10), transparent 70%)', filter: 'blur(18px)' }} />

                    <div className="p-6 flex flex-col h-full">
                      {/* Header */}
                      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0"
                            style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.25)' }}>
                            <Grid3X3 className="w-4 h-4 text-rose-500" />
                          </div>
                          <div>
                            <div className="kicker-label text-slate-400">HEATMAP · DEPT ANALYSIS</div>
                            <h3 className="font-bold text-[16px] text-slate-800 dark:text-slate-100 leading-tight mt-0.5"
                              style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
                              {(() => {
                                const labelMap = { department: 'Department', class: 'Class', bureau: 'Bureau', gender: 'Gender' };
                                const label = labelMap[heatmapGroupBy] || labelMap[defaultGroupBy] || 'Department';
                                return `${label} vs Timing Heatmap`;
                              })()}
                            </h3>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Group by</label>
                          <select
                            className="text-[12px] font-semibold border border-slate-200 dark:border-slate-600 bg-white/70 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-400/40 transition-all"
                            value={heatmapGroupBy}
                            onChange={(e) => {
                              const value = e.target.value;
                              setHeatmapGroupBy(value);
                              buildHeatmapFallback(value);
                            }}
                          >
                            <option value="department">Department</option>
                            <option value="class">Class</option>
                            <option value="bureau">Bureau</option>
                            <option value="gender">Gender</option>
                          </select>
                        </div>
                      </div>
                      <div className="card-body flex-1 flex flex-col justify-between">
                        <ReactApexChart
                          options={{
                            chart: {
                              type: 'heatmap',
                              height: 320,
                              toolbar: {
                                show: false
                              },
                              events: {
                                dataPointSelection: (event, chartContext, config) => {
                                  const seriesIndex = config.seriesIndex;
                                  const dataPointIndex = config.dataPointIndex;
                                  const departmentName = (heatmapSeries[seriesIndex] && heatmapSeries[seriesIndex].name) || heatmapDepartments[seriesIndex];
                                  const slotLabel = heatmapSlots[dataPointIndex];
                                  if (departmentName) {
                                    setSelectedHeatmapDept(departmentName);
                                    setSelectedHeatmapSlot(slotLabel || null);
                                    loadAbsentStudentsForDepartment(departmentName, slotLabel || null);
                                    loadEmployeesForTile(departmentName, slotLabel || null);
                                    setTimeout(() => {
                                      const el = document.getElementById('heatmap-slot-details');
                                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }, 100);
                                  }
                                }
                              }
                            },
                            dataLabels: {
                              enabled: true,
                              style: {
                                colors: [chartTheme.isDark ? '#F1F5F9' : '#0F172A']
                              },
                              formatter: (val) => (val ?? 0)
                            },
                            colors: HEATMAP_COLORS,
                            xaxis: {
                              categories: heatmapSlots.length ? heatmapSlots : [
                                '8:00–8:30',
                                '8:30–9:00',
                                '9:00–9:30',
                                '9:30–10:00',
                                '10:00–10:30',
                                '10:30–11:00',
                                '11:00+'
                              ],
                              labels: {
                                style: {
                                  colors: chartTheme.axisColor,
                                  fontSize: '12px'
                                },
                                rotate: -35,
                                trim: true
                              }
                            },
                            yaxis: {
                              categories: heatmapDepartments.length ? heatmapDepartments : (heatmapGroupBy === 'class' ? ['Class A', 'Class B', 'Class C'] : (heatmapGroupBy === 'bureau' ? ['Bureau 1', 'Bureau 2'] : (heatmapGroupBy === 'gender' ? ['male', 'female', 'other'] : ['Dept A', 'Dept B', 'Dept C']))),
                              labels: {
                                style: {
                                  colors: chartTheme.axisColor,
                                  fontSize: '12px'
                                }
                              }
                            },
                            plotOptions: {
                              heatmap: {
                                radius: 6,
                                enableShades: true,
                                shadeIntensity: 0.35,
                                distributed: false,
                                useFillColorAsStroke: false,
                                colorScale: {
                                  ranges: HEATMAP_RANGES
                                }
                              }
                            },
                            tooltip: {
                              theme: chartTheme.isDark ? 'dark' : 'light',
                              custom: function ({ series, seriesIndex, dataPointIndex, w }) {
                                const dept = (heatmapSeries[seriesIndex] && heatmapSeries[seriesIndex].name) || heatmapDepartments[seriesIndex];
                                const slot = heatmapSlots[dataPointIndex];
                                const val = (series && series[seriesIndex] && series[seriesIndex][dataPointIndex]) ?? 0;
                                return `<div class="px-3 py-2 text-sm"><div class="font-medium text-slate-900 dark:text-slate-100">${dept || ''}</div><div class="text-slate-600 dark:text-slate-400">${slot || ''}</div><div class="mt-1 text-primary-600 dark:text-primary-300 font-semibold">${val} students</div></div>`;
                              }
                            },
                            legend: {
                              show: true,
                              position: 'bottom',
                              horizontalAlign: 'center',
                              labels: {
                                colors: chartTheme.axisColor
                              }
                            },
                            grid: {
                              padding: { left: 4, right: 8, top: 8, bottom: 8 },
                              strokeDashArray: 3
                            },
                            states: {
                              hover: {
                                filter: { type: 'lighten', value: 0.1 }
                              },
                              active: {
                                filter: { type: 'darken', value: 0.2 }
                              }
                            }
                          }}
                          series={heatmapSeries.length ? heatmapSeries : [
                            { name: 'tech', data: [5, 6, 7, 8, 4, 3, 2] },
                            { name: 'marketing', data: [3, 2, 1, 4, 5, 6, 7] },
                            { name: 'sales', data: [6, 7, 5, 4, 8, 7, 6] }
                          ]}
                          type="heatmap"
                          height={320}
                        />
                        {selectedHeatmapDept && (
                          <div id="heatmap-slot-details" className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 scroll-mt-6">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-md font-semibold text-slate-900 dark:text-slate-100">
                                Absenties in {selectedHeatmapDept} {selectedHeatmapSlot ? `(${selectedHeatmapSlot})` : ''} - Today
                              </h4>
                            </div>
                            {absentLoading ? (
                              <SkeletonTable rows={3} cols={2} />
                            ) : absentError ? (
                              <div className="text-danger-600 dark:text-danger-400 text-sm">{absentError}</div>
                            ) : (
                              <div className="overflow-x-auto">
                                {absentStudents.length === 0 ? (
                                  <EmptyState
                                    icon={UserX}
                                    title="No absentees found"
                                    message="Everyone in this group has an attendance record for today."
                                  />
                                ) : (
                                  <table className="table dark:divide-slate-700">
                                    <thead className="table-header dark:bg-slate-800">
                                      <tr>
                                        <th className="table-header-cell dark:text-slate-400">Student</th>
                                        <th className="table-header-cell dark:text-slate-400">UID</th>
                                      </tr>
                                    </thead>
                                    <tbody className="table-body dark:bg-slate-800 dark:divide-slate-700">
                                      {absentStudents.map((s) => (
                                        <tr
                                          key={s._id}
                                          className="hover:bg-danger-50 dark:hover:bg-danger-900/20 cursor-pointer transition-colors duration-150 motion-reduce:transition-none group"
                                          onClick={() => navigate(`/student-report/${s._id}`)}
                                          role="button"
                                          tabIndex={0}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              e.preventDefault();
                                              navigate(`/student-report/${s._id}`);
                                            }
                                          }}
                                          title="Click to view student details"
                                        >
                                          <td className="table-cell dark:text-slate-100">
                                            <div className="flex items-center">
                                              <div className="h-8 w-8 rounded-full bg-danger-100 dark:bg-danger-900/40 flex items-center justify-center mr-3">
                                                <span className="text-sm font-medium text-danger-600 dark:text-danger-300">
                                                  {s.fullName?.charAt(0)}
                                                </span>
                                              </div>
                                              <span>{s.fullName}</span>
                                            </div>
                                          </td>
                                          <td className="table-cell dark:text-slate-100">{s.uid}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {selectedHeatmapDept && (
                          <div className="mt-6">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-md font-semibold text-slate-900 dark:text-slate-100">
                                Employees in {selectedHeatmapDept} {selectedHeatmapSlot ? `(${selectedHeatmapSlot})` : ''}
                              </h4>
                            </div>
                            {tileEmployeesLoading ? (
                              <SkeletonTable rows={3} cols={4} />
                            ) : tileEmployeesError ? (
                              <div className="text-danger-600 dark:text-danger-400 text-sm">{tileEmployeesError}</div>
                            ) : (
                              <div className="overflow-x-auto">
                                {tileEmployees.length === 0 ? (
                                  <EmptyState
                                    icon={Users}
                                    title="No employees found"
                                    message="No employees were recorded for this slot."
                                  />
                                ) : (
                                  <table className="table dark:divide-slate-700">
                                    <thead className="table-header dark:bg-slate-800">
                                      <tr>
                                        <th className="table-header-cell dark:text-slate-400">Employee</th>
                                        <th className="table-header-cell dark:text-slate-400">UID</th>
                                        <th className="table-header-cell dark:text-slate-400">In</th>
                                        <th className="table-header-cell dark:text-slate-400">Out</th>
                                      </tr>
                                    </thead>
                                    <tbody className="table-body dark:bg-slate-800 dark:divide-slate-700">
                                      {tileEmployees.map((e) => (
                                        <tr
                                          key={e.id || e.uid}
                                          className="hover:bg-primary-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors duration-150 motion-reduce:transition-none group"
                                          onClick={() => e.id && navigate(`/student-report/${e.id}`)}
                                          role="button"
                                          tabIndex={0}
                                          onKeyDown={(ev) => {
                                            if ((ev.key === 'Enter' || ev.key === ' ') && e.id) {
                                              ev.preventDefault();
                                              navigate(`/student-report/${e.id}`);
                                            }
                                          }}
                                          title="Click to view student details"
                                        >
                                          <td className="table-cell dark:text-slate-100">
                                            <div className="flex items-center">
                                              <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center mr-3">
                                                <span className="text-sm font-medium text-primary-600 dark:text-primary-300">
                                                  {e.name?.charAt(0)}
                                                </span>
                                              </div>
                                              <span>{e.name}</span>
                                            </div>
                                          </td>
                                          <td className="table-cell dark:text-slate-100">{e.uid || '-'}</td>
                                          <td className="table-cell dark:text-slate-100">{e.inTime || '-'}</td>
                                          <td className="table-cell dark:text-slate-100">{e.outTime || '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="shine-overlay-anuvadini rounded-3xl opacity-40" />
                </div>

                {/* In-Time Statistics — Premium Bento */}
                <div className="h-full flex flex-col">
                  <div
                    className="relative rounded-3xl overflow-hidden flex flex-col bento-hover-anuvadini h-full"
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
                      style={{ background: 'linear-gradient(90deg, #315CE8, #4A74F0, #6F8DF0)' }} />
                    {/* Atmospheric glow */}
                    <div className="absolute -right-10 -top-10 w-28 h-28 rounded-full pointer-events-none"
                      style={{ background: 'radial-gradient(circle, rgba(74, 116, 240,0.12), transparent 70%)', filter: 'blur(18px)' }} />

                    <div className="p-6 flex flex-col h-full">
                      {/* Header */}
                      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                        <div className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0"
                          style={{ background: 'rgba(74, 116, 240,0.12)', border: '1px solid rgba(74, 116, 240,0.25)' }}>
                          <Timer className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                          <div className="kicker-label text-slate-400">TIME ANALYSIS · TODAY</div>
                          <h3 className="font-bold text-[16px] text-slate-800 dark:text-slate-100 leading-tight mt-0.5"
                            style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
                            In-Time Distribution
                          </h3>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col justify-between mt-4">
                        {timeWiseData && timeWiseData.length > 0 ? (
                          (() => {
                            const filteredData = timeWiseData.filter(item => item.value > 0);
                            const hasData = filteredData.length > 0;

                            return hasData ? (
                              <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                  <Pie
                                    data={filteredData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percentage }) => `${name} (${percentage}%)`}
                                    outerRadius={100}
                                    fill="#8884d8"
                                    dataKey="value"
                                    minAngle={5}
                                  >
                                    {filteredData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                                    ))}
                                  </Pie>
                                  <Tooltip
                                    contentStyle={chartTheme.tooltipStyle}
                                    itemStyle={chartTheme.tooltipItemStyle}
                                    formatter={(value, name) => [`${value} students`, name]}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                            ) : (
                              <EmptyState
                                icon={Clock}
                                title="No check-ins today"
                                message="Time statistics will appear once employees check in."
                              />
                            );
                          })()
                        ) : (
                          <EmptyState
                            icon={Clock}
                            title="No check-in data"
                            message="Time statistics will appear once students check in today."
                          />
                        )}
                      </div>
                    </div>
                    <span className="shine-overlay-anuvadini rounded-3xl opacity-40" />
                  </div>
                </div>
              </div>
            </LazyOnVisible>
          </ScrollReveal>
        </div>

        <ScrollReveal y={38} duration={740} delay={0} blur={5}>
          <LazyOnVisible fallback={<Skeleton className="h-96 w-full" />}>
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <RecentActivityTable
                recentActivityTab={recentActivityTab}
                setRecentActivityTab={setRecentActivityTab}
                showCalendar={showCalendar}
                setShowCalendar={setShowCalendar}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                handleSingleDateSelection={handleSingleDateSelection}
                recentActivityLoading={recentActivityLoading}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchQueryPending={searchQueryPending}
                setSearchQueryPending={setSearchQueryPending}
                filteredTopDurationData={filteredTopDurationData}
                filteredPendingDurationData={filteredPendingDurationData}
                visibleCheckoutCount={visibleCheckoutCount}
                setVisibleCheckoutCount={setVisibleCheckoutCount}
                visiblePendingCount={visiblePendingCount}
                setVisiblePendingCount={setVisiblePendingCount}
                organization={organization}
              />
            </Suspense>
          </LazyOnVisible>
        </ScrollReveal>

        {/* Quick Actions */}
        <ScrollReveal y={32} duration={700} delay={0} blur={3}>
          <LazyOnVisible fallback={<Skeleton className="h-32 w-full" />}>
            <Suspense fallback={<Skeleton className="h-32 w-full" />}>
              <QuickActionsGrid />
            </Suspense>
          </LazyOnVisible>
        </ScrollReveal>

        {/* Leave Requests */}
        <ScrollReveal y={30} duration={700} delay={0} blur={3}>
          <div className="grid grid-cols-1 gap-6">
            {/* Leave Requests */}
            <div
              className="relative rounded-3xl overflow-hidden flex flex-col bento-hover-anuvadini p-6"
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
                style={{ background: 'linear-gradient(90deg, #f59e0b, #eab308, #d97706)' }} />
              <span className="shine-overlay-anuvadini rounded-3xl opacity-40" />

              <div className="relative flex items-center justify-between mb-5 z-10">
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0"
                    style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}
                  >
                    <Calendar className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <div className="kicker-label text-slate-400">LEAVE REGISTRY · TODAY'S LOGS</div>
                    <h3 className="font-bold text-[16px] text-slate-800 dark:text-slate-100 leading-tight mt-0.5"
                      style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
                      Leave Requests
                    </h3>
                  </div>
                </div>

                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-1 rounded-full border border-amber-250/20">
                  {leaveRequests.length} Approved
                </span>
              </div>

              <div className="relative z-10">
                {requestsLoading ? (
                  <SkeletonCard lines={3} />
                ) : leaveRequests.length > 0 ? (
                  <div className="space-y-3 max-h-64 overflow-y-auto" data-lenis-prevent>
                    {leaveRequests.slice(0, 10).map((request) => (
                      <div key={request._id} className="border-l-4 border-amber-500 pl-4 py-3 bg-amber-50/30 dark:bg-amber-950/10 rounded-r-2xl border border-slate-100/50 dark:border-slate-800/50 hover:bg-amber-50/50 transition-colors">
                        <div className="flex justify-between items-center">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                              {request.student?.fullName || 'Unknown Student'}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 truncate">
                              {request.leaveDetails || 'No details specified'}
                            </p>
                            <p className="text-slate-400 dark:text-slate-550 text-[10px] font-bold uppercase tracking-wider mt-1">
                              {new Date(request.leaveDates.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - {new Date(request.leaveDates.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </p>
                          </div>
                          <span className="inline-flex rounded-full px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 ring-1 ring-emerald-250/30 dark:bg-emerald-950/30 dark:text-emerald-400">
                            Approved
                          </span>
                        </div>
                      </div>
                    ))}
                    {leaveRequests.length > 10 && (
                      <p className="text-[11px] font-bold text-slate-400 text-center pt-2.5 uppercase tracking-widest">
                        Showing 10 of {leaveRequests.length} requests
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2.5 py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-250/25">
                      <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-705 dark:text-slate-200">No approved leave requests</p>
                    <p className="text-xs text-slate-450 dark:text-slate-500 mt-0.5">
                      Approved student/faculty leaves for today will appear here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Performance Monitor (Development Only) */}
        <PerformanceMonitor />

        {/* Leave Details Modal */}
        <Suspense fallback={null}>
          <LeaveDetailsModal
            isOpen={showLeaveModal}
            onClose={() => setShowLeaveModal(false)}
            title="Today's Leave Requests"
            requests={leaveRequests}
            type="leave"
          />
        </Suspense>

      </div>
    </ErrorBoundary>
  );
};

export default Dashboard;
