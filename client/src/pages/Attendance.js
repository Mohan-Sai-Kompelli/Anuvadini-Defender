import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Download,
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  MapPin
} from 'lucide-react';
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend
} from 'recharts';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import LiveAttendanceChart from '../components/dashboard/LiveAttendanceChart';
import { Button, StatCard, EmptyState, SkeletonCard, SkeletonTable } from '../components/ui';
import { useTheme } from '../ThemeContext';
import { useChartTheme } from '../components/dashboard/chartTheme';

// ─── Demo / fallback data — shown when the API returns empty ─────────────────
const DEMO_STAFF = [
  { _id: 'd1', fullName: 'Dr. Ramesh Patil',    uid: 'SAAC-101', department: 'Administration' },
  { _id: 'd2', fullName: 'Dr. Sunita Verma',    uid: 'SAAC-102', department: 'Finance' },
  { _id: 'd3', fullName: 'Dr. Anil Kumar',      uid: 'SAAC-103', department: 'Human Resources' },
  { _id: 'd4', fullName: 'Dr. Meera Iyer',      uid: 'SAAC-104', department: 'Engineering' },
  { _id: 'd5', fullName: 'Dr. Vikram Joshi',    uid: 'SAAC-105', department: 'Operations' },
  { _id: 'd6', fullName: 'Dr. Kavita Reddy',    uid: 'SAAC-106', department: 'Research' },
  { _id: 'd7', fullName: 'Dr. Arjun Nair',      uid: 'SAAC-107', department: 'Quality' },
  { _id: 'd8', fullName: 'Dr. Priya Sharma',    uid: 'SAAC-108', department: 'Training' },
  { _id: 'd9', fullName: 'Dr. Rajan Mehta',     uid: 'SAAC-109', department: 'Legal' },
  { _id: 'd10', fullName: 'Dr. Deepa Mishra',   uid: 'SAAC-110', department: 'Prasuti Tantra' },
  { _id: 'd11', fullName: 'Dr. Suresh Yadav',   uid: 'SAAC-111', department: 'Administration' },
  { _id: 'd12', fullName: 'Dr. Anjali Singh',   uid: 'SAAC-112', department: 'IT' },
];

const TODAY = new Date().toISOString().split('T')[0];

// Build a realistic demo daily report
const buildDemoDailyReport = () => {
  const checkIns = DEMO_STAFF.slice(0, 10); // 10 present
  const attendance = [];
  checkIns.forEach((s, i) => {
    const inH = 8 + Math.floor(i / 4);
    const inM = (i * 7) % 60;
    const outH = inH + 7 + (i % 2);
    const inTs = new Date(`${TODAY}T${String(inH).padStart(2,'0')}:${String(inM).padStart(2,'0')}:00`);
    const outTs = new Date(`${TODAY}T${String(Math.min(outH,18)).padStart(2,'0')}:${String((inM + 12) % 60).padStart(2,'0')}:00`);
    attendance.push({ _id: `ai${i}`, student: s, type: 'in',  timestamp: inTs.toISOString() });
    attendance.push({ _id: `ao${i}`, student: s, type: 'out', timestamp: outTs.toISOString() });
  });
  return {
    date: TODAY,
    uniqueCheckIns: 10,
    uniqueCheckOuts: 9,
    students: DEMO_STAFF,
    attendance,
  };
};

const DEMO_LIVE_ATTENDANCE = [
  { time: '08:00', count: 2 },
  { time: '08:30', count: 5 },
  { time: '09:00', count: 9 },
  { time: '09:30', count: 11 },
  { time: '10:00', count: 13 },
  { time: '10:30', count: 14 },
  { time: '11:00', count: 15 },
  { time: '11:30', count: 16 },
  { time: '12:00', count: 17 },
  { time: '12:45', count: 18 },
  { time: '13:50', count: 19 },
  { time: '14:55', count: 20 },
  { time: '16:00', count: 20 },
  { time: '17:05', count: 20 },
  { time: '18:10', count: 20 },
  { time: '18:15', count: 20 },
  { time: '20:55', count: 20 },
];

const DEMO_TIMESLOTS = [
  { name: 'Before 9:00', checkIn: 3, checkOut: 0 },
  { name: '9:00-9:29',   checkIn: 5, checkOut: 0 },
  { name: '9:30-9:59',   checkIn: 1, checkOut: 0 },
  { name: '10:00-10:59', checkIn: 1, checkOut: 0 },
  { name: 'After 11:00', checkIn: 0, checkOut: 0 },
];

const DEMO_RANGE_ROWS = DEMO_STAFF.map((s, i) => ({
  id: s._id,
  student: s,
  totalDays: 22,
  presentDays: 22 - i % 3,
  approvedLeave: i % 3 === 2 ? 1 : 0,
}));
// ─────────────────────────────────────────────────────────────────────────────

const Attendance = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const chartTheme = useChartTheme();
  const [attendanceData, setAttendanceData] = useState([]);
  const [dailyReport, setDailyReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const isSystemDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && isSystemDark);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [lastDayDate, setLastDayDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedRange, setSelectedRange] = useState('day'); // 'day' | 'week' | 'month'
  const [periodStats, setPeriodStats] = useState(null); // for week/month present/absent
  const [timeWiseData, setTimeWiseData] = useState([]);
  const [liveAttendanceData, setLiveAttendanceData] = useState([]);
  const [liveAttendanceLoading, setLiveAttendanceLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [rangeRows, setRangeRows] = useState([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeInOutData, setRangeInOutData] = useState([]);
  const [weekTrendData, setWeekTrendData] = useState([]);
  const [isTransitioning, setIsTransitioning] = useState(false); // New state for view transitions
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const d = new Date();
    const dayNum = d.getUTCDay() || 7;
    const iso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    iso.setUTCDate(iso.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(iso.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((iso - yearStart) / 86400000) + 1) / 7);
    return `${iso.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  });
  const [selectedMonthInput, setSelectedMonthInput] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
  });
  const [tableSearch, setTableSearch] = useState('');

  // Custom date-range detailed report (Admin): start/end + the fetched report.
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [rangeReport, setRangeReport] = useState(null); // { summary, days }
  const [rangeReportLoading, setRangeReportLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsTransitioning(true);
      try {
        if (selectedRange === 'day') {
          await fetchAttendanceData();
        } else if (selectedRange === 'week' || selectedRange === 'month') {
          await fetchPeriodStats();
        }
        // Add a small delay to prevent flickering for very fast loads
        await new Promise(resolve => setTimeout(resolve, 300));
      } finally {
        setIsTransitioning(false);
      }
    };
    
    fetchData();
  }, [selectedDate, selectedRange]);

  useEffect(() => {
    if (selectedRange === 'day') {
      fetchTimeWise();
      fetchLiveAttendance();
    }
  }, [selectedRange, selectedDate]);

  useEffect(() => {
    setPage(1);
    if (selectedRange === 'week' || selectedRange === 'month' || selectedRange === 'custom') {
      const fetchRangeData = async () => {
        setIsTransitioning(true);
        try {
          await Promise.all([fetchRangeTable(), fetchPeriodStats()]);
          await new Promise(resolve => setTimeout(resolve, 300));
        } finally {
          setIsTransitioning(false);
        }
      };
      fetchRangeData();
    }
  }, [selectedRange, selectedDate, customStart, customEnd]);

  // When week/month pickers change, normalize to anchor date for queries
  useEffect(() => {
    if (selectedRange === 'week' && selectedWeek) {
      try {
        const [yStr, wStr] = selectedWeek.split('-W');
        const y = parseInt(yStr, 10);
        const w = parseInt(wStr, 10);
        const jan4 = new Date(y, 0, 4);
        const day = jan4.getDay() || 7;
        const monday = new Date(jan4);
        monday.setDate(jan4.getDate() - day + 1 + (w - 1) * 7);
        const anchor = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
        setSelectedDate(anchor);
      } catch {}
    }
  }, [selectedRange, selectedWeek]);

  useEffect(() => {
    if (selectedRange === 'month' && selectedMonthInput) {
      try {
        const [yStr, mStr] = selectedMonthInput.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10) - 1;
        const first = new Date(y, m, 1);
        const anchor = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2,'0')}-${String(first.getDate()).padStart(2,'0')}`;
        setSelectedDate(anchor);
      } catch {}
    }
  }, [selectedRange, selectedMonthInput]);

  // Custom date-range detailed report — per-working-day present/absent/leave.
  useEffect(() => {
    if (selectedRange !== 'custom') return;
    if (!customStart || !customEnd) return;
    // Clear day/week/month state so only the custom report shows.
    setPeriodStats(null);
    setRangeRows([]);
    setRangeInOutData([]);
    let cancelled = false;
    (async () => {
      setRangeReportLoading(true);
      try {
        const res = await axios.get('/api/attendance/reports/range', {
          params: { start: customStart, end: customEnd },
        });
        if (!cancelled) setRangeReport(res.data || null);
      } catch (err) {
        if (!cancelled) {
          setRangeReport(null);
          toast.error('Failed to load custom-range report');
        }
      } finally {
        if (!cancelled) setRangeReportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRange, customStart, customEnd]);

  const fetchAttendanceData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ date: selectedDate });
      const response = await axios.get(`/api/attendance/reports/daily?${params}`);
      const report = response.data.report;
      const att = report?.attendance || [];
      // Always show the REAL (scoped) data — no demo fallback, so an empty day
      // correctly shows 0 rather than misleading placeholder numbers.
      setDailyReport(report || { date: selectedDate, uniqueCheckIns: 0, uniqueCheckOuts: 0, presentCount: 0, attendance: [] });
      setAttendanceData(att);
    } catch (error) {
      console.error('Error fetching attendance data:', error);
      setDailyReport({ date: selectedDate, uniqueCheckIns: 0, uniqueCheckOuts: 0, presentCount: 0, attendance: [] });
      setAttendanceData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeWise = async () => {
    try {
      const res = await axios.get('/api/attendance/reports/time-wise');
      const slots = res.data?.data?.timeSlots || [];
      setTimeWiseData(slots);
    } catch (error) {
      setTimeWiseData([]);
    }
  };

  const fetchLiveAttendance = async () => {
    try {
      setLiveAttendanceLoading(true);
      const res = await axios.get('/api/attendance/live-activity');
      const data = res.data?.data || [];
      setLiveAttendanceData(data);
    } catch (error) {
      setLiveAttendanceData([]);
    } finally {
      setLiveAttendanceLoading(false);
    }
  };

  const getDatesForRange = (dateStr, mode) => {
    if (mode === 'custom') {
      if (!customStart || !customEnd) return [];
      const start = new Date(customStart);
      const end = new Date(customEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
      const dates = [];
      const curr = new Date(start);
      while (curr <= end) {
        dates.push(`${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`);
        curr.setDate(curr.getDate() + 1);
      }
      return dates;
    }
    const base = new Date(dateStr);
    if (Number.isNaN(base.getTime())) return [];
    if (mode === 'week') {
      const day = base.getDay();
      const diffToMonday = (day + 6) % 7; // Monday = 0
      const monday = new Date(base);
      monday.setDate(base.getDate() - diffToMonday);
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
      return dates;
    }
    if (mode === 'month') {
      const y = base.getFullYear();
      const m = base.getMonth();
      const last = new Date(y, m + 1, 0).getDate();
      const dates = [];
      for (let d = 1; d <= last; d++) {
        dates.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
      return dates;
    }
    return [dateStr];
  };

  const isWorkingDay = (ymd) => {
    const d = new Date(ymd);
    const dow = d.getDay();
    return dow !== 0; // Mon–Sat
  };

  const fetchRangeTable = async () => {
    try {
      setRangeLoading(true);
      const allDates = getDatesForRange(selectedDate, selectedRange);
      const todayYMD = new Date().toISOString().split('T')[0];
      const pastDates = selectedRange === 'week'
        ? allDates.filter(d => d <= todayYMD)
        : allDates;
      // Working days count only past (non-future) working days to avoid counting future as absent
      const workingDates = pastDates.filter(isWorkingDay);

      // Fetch students and daily reports in parallel
      const studentsPromise = axios.get('/api/students', { params: { limit: 10000 } }).catch(() => ({ data: { students: [] } }));
      const reportsPromise = Promise.all(
        allDates.map(d => {
          const isFuture = d > todayYMD;
          if (selectedRange === 'week' && isFuture) {
            return Promise.resolve({ data: { report: { attendance: [] } } });
          }
          return axios.get('/api/attendance/reports/daily', { params: { date: d } }).catch(() => ({ data: {} }));
        })
      );
      const [studentsRes, reportResponses] = await Promise.all([studentsPromise, reportsPromise]);
      const students = studentsRes?.data?.students || [];

      // Build per-day present sets (students with both in and out)
      const presentPerDay = [];
      const inOutPerDay = [];
      const trendPerDay = [];
      // Per-student, per-date check-in/check-out TIMES — kept (not just counted)
      // so the export can show actual timing per day, not just P/A/L.
      const dailyTimesByStudent = new Map(); // sid -> { [date]: { inTs, outTs } }
      reportResponses.forEach((res, idx) => {
        const att = res?.data?.report?.attendance || [];
        const byStudent = new Map();
        let checkInCount = 0;
        let checkOutCount = 0;
        att.forEach(r => {
          const sid = r?.student?._id;
          if (!sid) return;
          const entry = byStudent.get(sid) || { inTs: null, outTs: null };
          if (r.type === 'in') {
            checkInCount += 1;
            if (!entry.inTs || new Date(r.timestamp) < new Date(entry.inTs)) entry.inTs = r.timestamp;
          }
          if (r.type === 'out') {
            checkOutCount += 1;
            if (!entry.outTs || new Date(r.timestamp) > new Date(entry.outTs)) entry.outTs = r.timestamp;
          }
          byStudent.set(sid, entry);
        });
        const presentSet = new Set();
        let lateCount = 0;
        byStudent.forEach((v, sid) => {
          if (!dailyTimesByStudent.has(sid)) dailyTimesByStudent.set(sid, {});
          dailyTimesByStudent.get(sid)[allDates[idx]] = { inTs: v.inTs, outTs: v.outTs };
          if (v.inTs && v.outTs) {
            presentSet.add(sid);
            const t = new Date(v.inTs);
            const minutes = t.getHours() * 60 + t.getMinutes();
            if (minutes >= 600) lateCount += 1; // late counted only among present (in & out)
          }
        });
        presentPerDay.push({ date: allDates[idx], set: presentSet });
        const d = new Date(allDates[idx]);
        const label = selectedRange === 'week'
          ? d.toLocaleDateString('en-US', { weekday: 'short' })
          : String(d.getDate());
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        inOutPerDay.push({ name: label, checkIn: checkInCount, checkOut: checkOutCount, isWeekend });
        const isFuture = allDates[idx] > todayYMD;
        trendPerDay.push({
          date: label,
          present: checkInCount,
          absent: checkOutCount,
          late: lateCount,
          isWeekend,
          fullDate: allDates[idx]
        });
      });

      const totalDays = workingDates.length;
      const rows = students.map(s => {
        const sid = s._id;
        const presentDays = presentPerDay.reduce((acc, obj) => {
          const dStr = obj.date;
          const isWorking = isWorkingDay(dStr);
          return acc + (isWorking && obj.set.has(sid) ? 1 : 0);
        }, 0);
        const approvedLeave = 0; // Placeholder – no org-wide leave API
        return {
          id: sid,
          student: s,
          totalDays,
          presentDays,
          approvedLeave,
          // Per-date check-in/check-out TIMES for this student — lets Export
          // show actual timing, not just present/absent day-counts.
          dailyTimes: dailyTimesByStudent.get(sid) || {}
        };
      });
      setRangeRows(rows);
      setRangeInOutData(inOutPerDay);
      if (selectedRange === 'week') setWeekTrendData(trendPerDay); else setWeekTrendData([]);
      // Returned (not just set as state) so a caller that needs it RIGHT NOW —
      // e.g. Export, which must never read state that's still one filter
      // change behind a not-yet-finished background fetch — can use the fresh
      // value directly instead of racing React's async state update.
      return { rows, allDates };
    } catch (error) {
      console.error('Error building range table:', error);
      setRangeRows([]);
      setRangeInOutData([]);
      setWeekTrendData([]);
    } finally {
      setRangeLoading(false);
    }
  };

  const fetchPeriodStats = async () => {
    try {
      setLoading(true);
      // Compute start and end based on selectedDate as anchor
      const anchor = new Date(selectedDate);
      let start;
      let end;
      if (selectedRange === 'custom') {
        if (!customStart || !customEnd) {
          setLoading(false);
          return;
        }
        start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
        end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
      } else if (selectedRange === 'week') {
        const d = new Date(anchor);
        const dow = d.getDay();
        const diff = (dow === 0 ? -6 : 1 - dow); // Monday as start
        const monday = new Date(d);
        monday.setDate(d.getDate() + diff);
        start = new Date(monday);
        start.setHours(0, 0, 0, 0);
        // Cap end at today for week-wise to avoid future days
        const plannedEnd = new Date(start);
        plannedEnd.setDate(plannedEnd.getDate() + 6);
        const today = new Date();
        const cap = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        end = plannedEnd > cap ? cap : plannedEnd;
      } else if (selectedRange === 'month') {
        start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
      }

      const params = new URLSearchParams({
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      });
      const res = await axios.get(`/api/attendance/student-overall-attendance-rate?${params}`);
      setPeriodStats(res.data.data);
    } catch (error) {
      console.error('Error fetching period stats:', error);
      toast.error('Failed to load period stats');
    } finally {
      setLoading(false);
    }
  };

  // `override` lets a caller (the export functions) build rows from a FRESHLY
  // fetched report instead of whatever's in component state — state can be one
  // filter change behind if Export is clicked before the debounced background
  // fetch for the new date/range finishes, which silently exported the
  // PREVIOUS date's data. Defaults to current state for normal on-screen use.
  const buildDayRows = (override) => {
    const src = override || { students: dailyReport?.students, attendance: attendanceData };
    const perStudent = new Map();
    const staffList = Array.isArray(src.students) ? src.students : [];

    for (const student of staffList) {
      if (!student?._id) continue;
      perStudent.set(student._id, {
        student,
        in: null,
        out: null,
        leave: null
      });
    }

    for (const r of (src.attendance || [])) {
      const sid = r?.student?._id;
      if (!sid) continue;
      const base = perStudent.get(sid) || { student: r.student, in: null, out: null, leave: null };
      if (r.type === 'in') {
        if (!base.in || new Date(r.timestamp) < new Date(base.in)) {
          base.in = r.timestamp;
          // Campus premises this CHECK-IN came from (Anuvadini / NETF / IUAC).
          base.officeIn = r.markedOffice?.name || null;
        }
      }
      if (r.type === 'out') {
        if (!base.out || new Date(r.timestamp) > new Date(base.out)) {
          base.out = r.timestamp;
          // Campus premises this CHECK-OUT came from — may differ from check-in
          // (checked in at Anuvadini, checked out at IUAC).
          base.officeOut = r.markedOffice?.name || null;
        }
      }
      if (r.type === 'leave') {
        base.leave = r.timestamp;
        if (r.student) base.student = { ...base.student, ...r.student };
      }
      perStudent.set(sid, base);
    }
    const rowsAll = Array.from(perStudent.entries()).map(([sid, v]) => {
      const hasIn = !!v.in;
      const hasOut = !!v.out;
      const onLeave = !!v.leave;
      const diffMs = (hasIn && hasOut) ? (new Date(v.out) - new Date(v.in)) : 0;
      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      const durationStr = hasIn && !hasOut
        ? 'In-progress'
        : (diffMs > 0 ? `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}` : '—');
      const checkOutStr = hasIn && !hasOut
        ? 'Pending'
        : (hasOut ? new Date(v.out).toLocaleTimeString() : '—');
      const displayDuration = onLeave ? 'On leave' : durationStr;
      const displayCheckOut = onLeave ? 'On leave' : checkOutStr;
      // Office display: if check-in and check-out came from DIFFERENT campus
      // premises, show BOTH labelled (in)/(out); if the same (or only one side
      // recorded), show the single office name.
      const officeIn = v.officeIn || null;
      const officeOut = v.officeOut || null;
      const officeDiffers = officeIn && officeOut && officeIn !== officeOut;
      const officeStr = officeDiffers
        ? `${officeIn} (in) / ${officeOut} (out)`
        : (officeIn || officeOut || '—');
      return {
        id: sid,
        student: v.student,
        name: v.student?.fullName || 'Unknown',
        uid: v.student?.uid || '',
        checkIn: v.in ? new Date(v.in).toLocaleTimeString() : '—',
        officeIn,
        officeOut,
        officeDiffers,
        office: officeStr,
        checkOut: displayCheckOut,
        duration: displayDuration,
        diff: displayDuration,
        absent: hasIn || onLeave ? 'No' : 'Yes',
        sortKey: hasIn ? diffMs : (onLeave ? -1 : -2)
      };
    });
    return rowsAll;
  };

  const fetchFreshDayReport = async (dateYMD) => {
    const res = await axios.get('/api/attendance/reports/daily', { params: { date: dateYMD } });
    const report = res.data?.report || {};
    return { students: report.students || [], attendance: report.attendance || [] };
  };

  const timeOrDash = (ts) => (ts ? new Date(ts).toLocaleTimeString() : '-');

  const downloadExcel = async () => {
    const escapeCell = (v) => {
      const s = String(v ?? '');
      const needsQuotes = s.includes(',') || s.includes('"') || s.includes('\n');
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const loadingToast = toast.loading('Preparing export...');
    try {
      if (selectedRange === 'custom') {
        const res = await axios.get('/api/attendance/reports/range', {
          params: { start: customStart, end: customEnd },
        });
        const fresh = res.data || {};
        const s = fresh.summary || {};
        const dates = fresh.dates || [];
        const students = fresh.students || [];
        const lines = [
          ['Attendance Register', `${customStart} to ${customEnd}`],
          ['Total Present', s.present ?? 0, 'Total Absent', s.absent ?? 0, 'Total Leave', s.leave ?? 0, 'Employees', s.totalEmployees ?? 0],
          [],
          ['Employee', 'Employee ID', ...dates.map((d) => d.date), 'Present', 'Absent', 'Leave'],
          ...students.map((st) => [
            st.name,
            st.uid,
            ...dates.map((d) => st.cells?.[d.date] || ''),
            st.present,
            st.absent,
            st.leave,
          ]),
        ];
        const csv = lines.map((row) => row.map(escapeCell).join(',')).join('\r\n');
        const bomCsv = '﻿' + csv;
        const link = document.createElement('a');
        link.setAttribute('href', encodeURI(`data:text/csv;charset=utf-8,${bomCsv}`));
        link.setAttribute('download', `attendance_register_${customStart}_to_${customEnd}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Register downloaded', { id: loadingToast });
        return;
      }

      let header = [];
      let rows = [];
      if (selectedRange === 'day') {
        const fresh = await fetchFreshDayReport(selectedDate);
        header = ['Employee', 'Employee ID', 'Check-in', 'Office', 'Check-out', 'Duration'];
        rows = buildDayRows(fresh).map(r => [r.name, r.uid, r.checkIn, r.office, r.checkOut, r.duration]);
      } else {
        const { rows: freshRows, allDates } = await fetchRangeTable();
        header = ['Employee', 'Employee ID', ...allDates.map(d => `${d} In`), ...allDates.map(d => `${d} Out`), 'Total Days', 'Present Days', 'Approved Leave', 'Absent'];
        rows = (freshRows || []).map(r => [
          r.student?.fullName || 'Unknown',
          r.student?.uid || '',
          ...allDates.map(d => timeOrDash(r.dailyTimes?.[d]?.inTs)),
          ...allDates.map(d => timeOrDash(r.dailyTimes?.[d]?.outTs)),
          r.totalDays ?? '',
          r.presentDays ?? '',
          r.approvedLeave ?? 0,
          Math.max((r.totalDays ?? 0) - (r.presentDays ?? 0) - (r.approvedLeave ?? 0), 0)
        ]);
      }
      const csv = [header, ...rows].map(row => row.map(escapeCell).join(',')).join('\r\n');
      const bomCsv = '﻿' + csv;
      const encodedUri = encodeURI(`data:text/csv;charset=utf-8,${bomCsv}`);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `attendance_${selectedRange}_${selectedDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('CSV report downloaded', { id: loadingToast });
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Export failed - please try again', { id: loadingToast });
    }
  };

  const downloadPDF = async () => {
    if (selectedRange === 'custom') {
      const res = await axios.get('/api/attendance/reports/range', {
        params: { start: customStart, end: customEnd },
      });
      const fresh = res.data || {};
      const s = fresh.summary || {};
      const dates = fresh.dates || [];
      const students = fresh.students || [];
      const headCols = dates.map((d) => `<th title="${d.date}">${d.day}</th>`).join('');
      const bodyRows = students
        .map((st) => {
          const cells = dates
            .map((d) => {
              const v = st.cells?.[d.date] || '';
              const c = v === 'P' ? '#2748C4' : v === 'A' ? '#e11d48' : v === 'L' ? '#7c3aed' : '#cbd5e1';
              return `<td style="color:${c};font-weight:700;">${v || '·'}</td>`;
            })
            .join('');
          return `<tr><td class="emp">${st.name}<br/><span class="uid">${st.uid}</span></td>${cells}<td class="tot">${st.present}</td><td class="tot">${st.absent}</td><td class="tot">${st.leave}</td></tr>`;
        })
        .join('');
      const html = `<!doctype html><html><head><meta charset="utf-8" />
        <title>Attendance Register ${customStart} to ${customEnd}</title>
        <style>
          @page { size: landscape; margin: 10mm; }
          body { font-family: Arial, sans-serif; color:#0f172a; }
          h1 { font-size: 16px; margin: 0 0 2px 0; }
          p { margin: 0 0 10px 0; color: #555; font-size:11px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #e5e7eb; padding: 2px 3px; font-size: 8px; text-align:center; }
          th { background: #f8fafc; }
          td.emp { text-align:left; white-space:nowrap; }
          td.emp .uid { color:#94a3b8; }
        </style></head><body>
        <h1>Attendance Register</h1>
        <p>${customStart} to ${customEnd} &bull; ${s.totalEmployees ?? 0} employees &bull; ${s.totalDays ?? 0} days &bull; Present ${s.present ?? 0} / Absent ${s.absent ?? 0} / Leave ${s.leave ?? 0}</p>
        <table>
          <thead><tr><th style="text-align:left;">Employee</th>${headCols}<th>P</th><th>A</th><th>L</th></tr></thead>
          <tbody>${bodyRows || '<tr><td>No data</td></tr>'}</tbody>
        </table>
        <script>window.onload=function(){window.print();setTimeout(()=>window.close(),400);};</script>
        </body></html>`;
      const w = window.open('', '_blank');
      if (!w) {
        toast.error('Pop-up blocked - allow pop-ups to download the PDF');
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      return;
    }
    const titleText = `Attendance - ${selectedRange}`;
    const subtitle = selectedRange === 'day' ? selectedDate : selectedRange === 'week' ? `Week of ${selectedDate}` : `Month of ${selectedDate}`;
    let thead = '';
    let tbody = '';
    if (selectedRange === 'day') {
      const fresh = await fetchFreshDayReport(selectedDate);
      thead = '<tr><th>Employee</th><th>Employee ID</th><th>Check-in</th><th>Office</th><th>Check-out</th><th>Duration</th></tr>';
      tbody = buildDayRows(fresh).map(r => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">${r.name}</td>
          <td style="padding:8px;border:1px solid #ddd;">${r.uid}</td>
          <td style="padding:8px;border:1px solid #ddd;">${r.checkIn}</td>
          <td style="padding:8px;border:1px solid #ddd;">${r.office}</td>
          <td style="padding:8px;border:1px solid #ddd;">${r.checkOut}</td>
          <td style="padding:8px;border:1px solid #ddd;">${r.duration}</td>
        </tr>`).join('');
    } else {
      const { rows: freshRows, allDates } = await fetchRangeTable();
      const dateHeadCols = allDates.map(d => `<th>${d} In</th><th>${d} Out</th>`).join('');
      thead = `<tr><th>Employee</th><th>Employee ID</th>${dateHeadCols}<th>Total Days</th><th>Present Days</th><th>Approved Leave</th><th>Absent</th></tr>`;
      tbody = (freshRows || []).map(r => {
        const dateCells = allDates.map(d => `
          <td style="padding:8px;border:1px solid #ddd;">${timeOrDash(r.dailyTimes?.[d]?.inTs)}</td>
          <td style="padding:8px;border:1px solid #ddd;">${timeOrDash(r.dailyTimes?.[d]?.outTs)}</td>`).join('');
        return `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">${r.student?.fullName || 'Unknown'}</td>
          <td style="padding:8px;border:1px solid #ddd;">${r.student?.uid || ''}</td>${dateCells}
          <td style="padding:8px;border:1px solid #ddd;">${r.totalDays ?? ''}</td>
          <td style="padding:8px;border:1px solid #ddd;">${r.presentDays ?? ''}</td>
          <td style="padding:8px;border:1px solid #ddd;">${r.approvedLeave ?? 0}</td>
          <td style="padding:8px;border:1px solid #ddd;">${Math.max((r.totalDays ?? 0) - (r.presentDays ?? 0) - (r.approvedLeave ?? 0), 0)}</td>
        </tr>`;
      }).join('');
    }
    const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${titleText}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          h1 { font-size: 18px; margin: 0 0 4px 0; }
          p { margin: 0 0 16px 0; color: #555; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
          th { background: #f5f5f5; text-align: left; }
        </style>
      </head>
      <body>
        <h1>${titleText}</h1>
        <p>${subtitle}</p>
        <table>
          <thead>${thead}</thead>
          <tbody>${tbody || '<tr><td colspan="6">No records</td></tr>'}</tbody>
        </table>
        <script>window.onload = function(){ window.print(); setTimeout(() => window.close(), 300); };</script>
      </body>
      </html>`;
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('Pop-up blocked - allow pop-ups to download the PDF');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const getRangeStartEnd = () => {
    const anchor = new Date(selectedDate);
    let start;
    let end;
    if (selectedRange === 'week') {
      const d = new Date(anchor);
      const dow = d.getDay();
      const diff = (dow === 0 ? -6 : 1 - dow);
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      start = new Date(monday);
      start.setHours(0, 0, 0, 0);
      // Cap end at today for week-wise
      const plannedEnd = new Date(start);
      plannedEnd.setDate(plannedEnd.getDate() + 6);
      const today = new Date();
      const cap = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      end = plannedEnd > cap ? cap : plannedEnd;
    } else if (selectedRange === 'month') {
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      start = new Date(anchor);
      start.setHours(0, 0, 0, 0);
      end = new Date(anchor);
      end.setHours(23, 59, 59, 999);
    }
    const fmt = (d) => d.toISOString().split('T')[0];
    return { startYMD: fmt(start), endYMD: fmt(end) };
  };

  const exportStudentCSV = async (studentId, studentName) => {
    try {
      let header = [];
      let rows = [];
      if (selectedRange === 'day') {
        // Export ALL details for the student on the selected date
        header = ['Date', 'Day', 'Time', 'Action', 'Method', 'Status', 'Total Records', 'Check-ins', 'Check-outs', 'Note'];
        const res = await axios.get(`/api/attendance/detailed-monthly/${studentId}`, {
          params: { startDate: selectedDate, endDate: selectedDate }
        });
        const daily = res?.data?.dailyBreakdown || [];
        rows = daily.flatMap(day => {
          const baseCols = [
            day.date ? `="${day.date}"` : '',
            day.dayName || ''
          ];
          const detailRows = (day.details && day.details.length > 0 ? day.details : [{ time: 'N/A', action: 'No attendance recorded', method: 'N/A' }]).map(dtl => ([
            ...baseCols,
            dtl.time || 'N/A',
            dtl.action || '',
            dtl.method && dtl.method !== 'N/A' ? 'Face' : (dtl.method || ''),
            day.status || '',
            String(day.totalRecords ?? ''),
            String(day.checkIns ?? ''),
            String(day.checkOuts ?? ''),
            day.note ?? ''
          ]));
          return detailRows;
        });
      } else {
        header = ['Date', 'Day', 'Check-in', 'Check-out', 'Total Hours', 'Status', 'Auth Method'];
        const { startYMD, endYMD } = getRangeStartEnd();
        const res = await axios.get(`/api/attendance/detailed-monthly/${studentId}`, {
          params: { startDate: startYMD, endDate: endYMD }
        });
        const daily = res?.data?.dailyBreakdown || [];
        // /detailed-monthly's actual day shape has no `checkIn`/`checkOut`/
        // `totalHours`/`authMethod` fields at all — those live inside
        // `details[]` (one entry per punch: {time, action, method}). Reading
        // the non-existent top-level fields (as this branch used to) always
        // evaluated to undefined, so Check-in/Check-out/Auth Method were
        // blank on every week/month/custom-range export (the "day" branch
        // above already reads `details` correctly — this branch just never
        // matched it).
        const toMinutes = (t) => {
          if (!t) return null;
          const m = /^(\d{1,2}):(\d{2})\s*([AP]M)?$/i.exec(t.trim());
          if (!m) return null;
          let h = parseInt(m[1], 10);
          const min = parseInt(m[2], 10);
          const ap = m[3]?.toUpperCase();
          if (ap === 'PM' && h !== 12) h += 12;
          if (ap === 'AM' && h === 12) h = 0;
          return h * 60 + min;
        };
        rows = daily.map(d => {
          const details = Array.isArray(d.details) ? d.details : [];
          const checkInDetail = details.find((e) => e.action === 'Check In');
          const checkOutDetail = details.find((e) => e.action === 'Check Out (Last)');
          const checkIn = checkInDetail?.time || '';
          const checkOut = checkOutDetail?.time || '';
          const inMin = toMinutes(checkIn);
          const outMin = toMinutes(checkOut);
          const totalHours = inMin != null && outMin != null && outMin >= inMin
            ? (Math.round(((outMin - inMin) / 60) * 100) / 100)
            : '';
          const authMethod = checkInDetail?.method || checkOutDetail?.method || '';
          return [
            d.date ? `="${d.date}"` : '',
            d.dayName || '',
            checkIn,
            checkOut,
            totalHours,
            d.status || '',
            authMethod && authMethod !== 'N/A' ? authMethod : ''
          ];
        });
      }
      const escapeCell = (v) => {
        const s = String(v ?? '');
        const needsQuotes = s.includes(',') || s.includes('"') || s.includes('\n');
        const escaped = s.replace(/"/g, '""');
        return needsQuotes ? `"${escaped}"` : escaped;
      };
      const csv = [header, ...rows].map(row => row.map(escapeCell).join(',')).join('\r\n');
      const bomCsv = `\uFEFF${csv}`;
      const encodedUri = encodeURI(`data:text/csv;charset=utf-8,${bomCsv}`);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      const fileId = selectedRange === 'day' ? selectedDate : `${getRangeStartEnd().startYMD}_to_${getRangeStartEnd().endYMD}`;
      link.setAttribute('download', `${(studentName || 'staff').replace(/\s+/g,'_')}_${fileId}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Exported CSV for ${studentName || 'staff'}`);
    } catch (err) {
      console.error('Export student CSV error:', err);
      toast.error('Failed to export student CSV');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={8} cols={5} />
          </div>
        </div>
      </div>
    );
  }

  if (isTransitioning) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Attendance Reports</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              View and manage attendance records
            </p>
          </div>
        </div>

        {/* Tabs and Date Filter */}
        <div className="card">
          <div className="card-body p-4 sm:p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex w-full overflow-x-auto scrollbar-none rounded-xl bg-slate-100/80 p-1 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50">
                <div className="flex flex-nowrap min-w-max gap-1">
                  {['day','week','month','custom'].map(r => {
                    const isActive = selectedRange === r;
                    const label = r === 'day' ? 'Date-wise' : r === 'week' ? 'Week-wise' : r === 'month' ? 'Month-wise' : 'Custom Range';
                    return (
                      <button
                        key={r}
                        onClick={() => {
                          if (r === 'day') {
                            setSelectedDate(lastDayDate);
                          }
                          setSelectedRange(r);
                        }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5 shrink-0 ${isActive ? 'bg-white text-emerald-700 shadow dark:bg-slate-800 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center w-full md:w-auto">
                <div className="relative w-full md:w-auto">
                  {selectedRange === 'day' && (
                    <>
                      <Calendar className="h-4 w-4 text-gray-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => { setSelectedDate(e.target.value); setLastDayDate(e.target.value); }}
                        className="w-full md:w-48 input pl-9 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </>
                  )}
                  {selectedRange === 'week' && (
                    <>
                      <Calendar className="h-4 w-4 text-gray-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="week"
                        value={selectedWeek}
                        onChange={(e) => setSelectedWeek(e.target.value)}
                        className="w-full md:w-48 input pl-9 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </>
                  )}
                  {selectedRange === 'month' && (
                    <>
                      <Calendar className="h-4 w-4 text-gray-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="month"
                        value={selectedMonthInput}
                        onChange={(e) => setSelectedMonthInput(e.target.value)}
                        className="w-full md:w-48 input pl-9 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </>
                  )}
                  {selectedRange === 'custom' && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                      <div className="relative w-full sm:w-40">
                        <Calendar className="h-4 w-4 text-gray-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input type="date" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} className="w-full input pl-9 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
                      </div>
                      <span className="text-xs font-bold text-gray-400 text-center">to</span>
                      <div className="relative w-full sm:w-40">
                        <Calendar className="h-4 w-4 text-gray-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input type="date" value={customEnd} min={customStart} onChange={(e) => setCustomEnd(e.target.value)} className="w-full input pl-9 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={8} cols={5} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100" style={{ fontFamily: "'Geist', sans-serif" }}>
            Attendance Reports
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            View and manage organizational biometric check-in/out records
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={downloadExcel}
            icon={Download}
            title="Download Excel (CSV)"
            className="flex-1 sm:flex-none justify-center border-slate-200 text-slate-700 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-200"
          >
            Download Excel
          </Button>
          <Button
            variant="outline"
            onClick={downloadPDF}
            icon={Download}
            title="Download PDF"
            className="flex-1 sm:flex-none justify-center border-slate-200 text-slate-700 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-200"
          >
            Download PDF
          </Button>
        </div>
      </div>

      {/* Tabs and Date Filter */}
      <div className="glass border border-slate-100/60 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/10 p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex w-full overflow-x-auto scrollbar-none rounded-xl bg-slate-100/80 p-1 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50">
            <div className="flex flex-nowrap min-w-max gap-1">
              {['day','week','month','custom'].map(r => {
                const isActive = selectedRange === r;
                const label = r === 'day' ? 'Date-wise' : r === 'week' ? 'Week-wise' : r === 'month' ? 'Month-wise' : 'Custom Range';
                return (
                  <button
                    key={r}
                    onClick={() => {
                      if (r === 'day') {
                        setSelectedDate(lastDayDate);
                      }
                      setSelectedRange(r);
                    }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5 shrink-0 ${
                      isActive 
                        ? 'bg-white text-emerald-700 shadow dark:bg-slate-800 dark:text-emerald-400' 
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center w-full md:w-auto">
            <div className="relative w-full md:w-auto">
              {selectedRange === 'day' && (
                <>
                  <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => { setSelectedDate(e.target.value); setLastDayDate(e.target.value); }}
                    className="w-full md:w-48 rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 py-2 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </>
              )}
              {selectedRange === 'week' && (
                <>
                  <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="week"
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className="w-full md:w-48 rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 py-2 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </>
              )}
              {selectedRange === 'month' && (
                <>
                  <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="month"
                    value={selectedMonthInput}
                    onChange={(e) => setSelectedMonthInput(e.target.value)}
                    className="w-full md:w-48 rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 py-2 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </>
              )}
              {selectedRange === 'custom' && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                  <div className="relative w-full sm:w-40">
                    <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input type="date" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 text-center">to</span>
                  <div className="relative w-full sm:w-40">
                    <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input type="date" value={customEnd} min={customStart} onChange={(e) => setCustomEnd(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>



      {/* Summary Cards */}
      {(selectedRange === 'day' ? dailyReport : periodStats) ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {selectedRange === 'day' && (
            <>
              {/* Check-ins Card */}
              <button
                type="button"
                onClick={() => navigate(`/checkin-details?date=${selectedDate}&mode=day&slot=ALL`)}
                className="group relative overflow-hidden rounded-2xl p-5 text-left border shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 24, 39, 0.95), rgba(9, 14, 26, 0.93))',
                  borderColor: 'rgba(74, 116, 240, 0.22)',
                }}
              >
                <svg className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                  <pattern id="grid-in" width="14" height="14" patternUnits="userSpaceOnUse">
                    <path d="M 14 0 L 0 0 0 14" fill="none" stroke="white" strokeWidth="0.8" />
                  </pattern>
                  <rect width="100%" height="100%" fill="url(#grid-in)" />
                </svg>
                <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity duration-500"
                  style={{
                    background: 'radial-gradient(circle, #4A74F0 35%, transparent 70%)',
                    filter: 'blur(16px)',
                  }}
                />
                <div className="flex items-center justify-between gap-4 relative z-10">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      Total Check-ins (Unique)
                    </p>
                    <p className="mt-2.5 text-3xl font-black text-white leading-none num-pop" style={{ filter: 'drop-shadow(0 0 8px rgba(74, 116, 240,0.55))' }}>
                      {dailyReport?.uniqueCheckIns ?? 0}
                    </p>
                  </div>
                  <div className="w-[48px] h-[48px] shrink-0 relative flex items-center justify-center rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                    <svg width="40" height="40" viewBox="0 0 48 48" className="overflow-visible absolute">
                      <circle cx="24" cy="24" r="18" fill="none" stroke="#4A74F0" strokeWidth="1" strokeDasharray="20 10" opacity="0.6">
                        <animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="8s" repeatCount="indefinite" />
                      </circle>
                    </svg>
                    <Users className="w-5 h-5 text-emerald-400 z-10 animate-pulse" />
                  </div>
                </div>
                <span className="shine-overlay-anuvadini rounded-2xl opacity-[0.12]" />
              </button>

              {/* Check-outs Card */}
              <button
                type="button"
                onClick={() => navigate(`/checkout-details?date=${selectedDate}&mode=day&slot=ALL`)}
                className="group relative overflow-hidden rounded-2xl p-5 text-left border shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, rgba(8, 38, 56, 0.95), rgba(3, 16, 26, 0.93))',
                  borderColor: 'rgba(14, 165, 233, 0.22)',
                }}
              >
                <svg className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                  <pattern id="grid-out" width="14" height="14" patternUnits="userSpaceOnUse">
                    <path d="M 14 0 L 0 0 0 14" fill="none" stroke="white" strokeWidth="0.8" />
                  </pattern>
                  <rect width="100%" height="100%" fill="url(#grid-out)" />
                </svg>
                <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity duration-500"
                  style={{
                    background: 'radial-gradient(circle, #0ea5e9 35%, transparent 70%)',
                    filter: 'blur(16px)',
                  }}
                />
                <div className="flex items-center justify-between gap-4 relative z-10">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      Total Check-outs (Unique)
                    </p>
                    <p className="mt-2.5 text-3xl font-black text-white leading-none num-pop" style={{ filter: 'drop-shadow(0 0 8px rgba(14,165,233,0.55))' }}>
                      {(() => {
                        const checkoutRecords = attendanceData.filter(r => r.type === 'out');
                        const studentCheckouts = new Map();
                        checkoutRecords.forEach(record => {
                          const studentId = record.student?._id || record.student;
                          if (studentId) {
                            const existing = studentCheckouts.get(studentId);
                            if (!existing || new Date(record.timestamp) > new Date(existing.timestamp)) {
                              studentCheckouts.set(studentId, record);
                            }
                          }
                        });
                        return studentCheckouts.size;
                      })()}
                    </p>
                  </div>
                  <div className="w-[48px] h-[48px] shrink-0 relative flex items-center justify-center rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                    <svg width="40" height="40" viewBox="0 0 48 48" className="overflow-visible absolute">
                      <circle cx="24" cy="24" r="18" fill="none" stroke="#0ea5e9" strokeWidth="1" strokeDasharray="20 10" opacity="0.6">
                        <animateTransform attributeName="transform" type="rotate" from="360 24 24" to="0 24 24" dur="8s" repeatCount="indefinite" />
                      </circle>
                    </svg>
                    <CheckCircle className="w-5 h-5 text-sky-400 z-10 animate-pulse" />
                  </div>
                </div>
                <span className="shine-overlay-anuvadini rounded-2xl opacity-[0.12]" />
              </button>

              {/* Total Present Card */}
              <div
                className="group relative overflow-hidden rounded-2xl p-5 border shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, rgba(38, 30, 6, 0.95), rgba(18, 14, 2, 0.93))',
                  borderColor: 'rgba(245, 158, 11, 0.22)',
                }}
              >
                <svg className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                  <pattern id="grid-pres" width="14" height="14" patternUnits="userSpaceOnUse">
                    <path d="M 14 0 L 0 0 0 14" fill="none" stroke="white" strokeWidth="0.8" />
                  </pattern>
                  <rect width="100%" height="100%" fill="url(#grid-pres)" />
                </svg>
                <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity duration-500"
                  style={{
                    background: 'radial-gradient(circle, #f59e0b 35%, transparent 70%)',
                    filter: 'blur(16px)',
                  }}
                />
                <div className="flex items-center justify-between gap-4 relative z-10">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      Total Present
                    </p>
                    <p className="mt-2.5 text-3xl font-black text-white leading-none num-pop" style={{ filter: 'drop-shadow(0 0 8px rgba(245,158,11,0.55))' }}>
                      {(() => {
                        const ids = new Set();
                        for (const r of attendanceData) {
                          if (r.type === 'in') {
                            const sid = r?.student?._id;
                            if (sid) ids.add(sid);
                          }
                        }
                        return ids.size;
                      })()}
                    </p>
                  </div>
                  <div className="w-[48px] h-[48px] shrink-0 relative flex items-center justify-center rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                    <svg width="40" height="40" viewBox="0 0 48 48" className="overflow-visible absolute">
                      <circle cx="24" cy="24" r="18" fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="15 15" opacity="0.6">
                        <animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="10s" repeatCount="indefinite" />
                      </circle>
                    </svg>
                    <TrendingUp className="w-5 h-5 text-amber-400 z-10" />
                  </div>
                </div>
                <span className="shine-overlay-anuvadini rounded-2xl opacity-[0.12]" />
              </div>
            </>
          )}

          {selectedRange !== 'day' && (
            <>
              {/* Total Present (Period) */}
              <button
                type="button"
                onClick={() => navigate(`/present-absent-details?date=${selectedDate}&mode=${selectedRange}&status=present`)}
                className="group relative overflow-hidden rounded-2xl p-5 text-left border shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 24, 39, 0.95), rgba(9, 14, 26, 0.93))',
                  borderColor: 'rgba(74, 116, 240, 0.22)',
                }}
              >
                <svg className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                  <pattern id="grid-in-range" width="14" height="14" patternUnits="userSpaceOnUse">
                    <path d="M 14 0 L 0 0 0 14" fill="none" stroke="white" strokeWidth="0.8" />
                  </pattern>
                  <rect width="100%" height="100%" fill="url(#grid-in-range)" />
                </svg>
                <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity duration-500"
                  style={{
                    background: 'radial-gradient(circle, #4A74F0 35%, transparent 70%)',
                    filter: 'blur(16px)',
                  }}
                />
                <div className="flex items-center justify-between gap-4 relative z-10">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      Total Present
                    </p>
                    <p className="mt-2.5 text-3xl font-black text-white leading-none num-pop" style={{ filter: 'drop-shadow(0 0 8px rgba(74, 116, 240,0.55))' }}>
                      {(() => {
                        if (selectedRange === 'week' || selectedRange === 'month' || selectedRange === 'custom') {
                          return rangeInOutData.reduce((sum, d) => sum + (d?.checkIn || 0), 0);
                        }
                        return 0;
                      })()}
                    </p>
                  </div>
                  <div className="w-[48px] h-[48px] shrink-0 relative flex items-center justify-center rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                    <CheckCircle className="w-5 h-5 text-emerald-400 z-10" />
                  </div>
                </div>
                <span className="shine-overlay-anuvadini rounded-2xl opacity-[0.12]" />
              </button>

              {/* Total Absent (Period) */}
              <button
                type="button"
                onClick={() => navigate(`/present-absent-details?date=${selectedDate}&mode=${selectedRange}&status=absent`)}
                className="group relative overflow-hidden rounded-2xl p-5 text-left border shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, rgba(38, 12, 16, 0.95), rgba(18, 4, 8, 0.93))',
                  borderColor: 'rgba(244, 63, 94, 0.22)',
                }}
              >
                <svg className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                  <pattern id="grid-out-range" width="14" height="14" patternUnits="userSpaceOnUse">
                    <path d="M 14 0 L 0 0 0 14" fill="none" stroke="white" strokeWidth="0.8" />
                  </pattern>
                  <rect width="100%" height="100%" fill="url(#grid-out-range)" />
                </svg>
                <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity duration-500"
                  style={{
                    background: 'radial-gradient(circle, #f43f5e 35%, transparent 70%)',
                    filter: 'blur(16px)',
                  }}
                />
                <div className="flex items-center justify-between gap-4 relative z-10">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      Total Absent
                    </p>
                    <p className="mt-2.5 text-3xl font-black text-white leading-none num-pop" style={{ filter: 'drop-shadow(0 0 8px rgba(244,63,94,0.55))' }}>
                      {(() => {
                        if (selectedRange === 'week' || selectedRange === 'month' || selectedRange === 'custom') {
                          return rangeInOutData.reduce((sum, d) => sum + (d?.checkOut || 0), 0);
                        }
                        return 0;
                      })()}
                    </p>
                  </div>
                  <div className="w-[48px] h-[48px] shrink-0 relative flex items-center justify-center rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                    <XCircle className="w-5 h-5 text-rose-400 z-10" />
                  </div>
                </div>
                <span className="shine-overlay-anuvadini rounded-2xl opacity-[0.12]" />
              </button>

              {/* Applied Leaves */}
              <div
                className="group relative overflow-hidden rounded-2xl p-5 border shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, rgba(22, 12, 38, 0.95), rgba(10, 4, 18, 0.93))',
                  borderColor: 'rgba(139, 92, 246, 0.22)',
                }}
              >
                <svg className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                  <pattern id="grid-leaves" width="14" height="14" patternUnits="userSpaceOnUse">
                    <path d="M 14 0 L 0 0 0 14" fill="none" stroke="white" strokeWidth="0.8" />
                  </pattern>
                  <rect width="100%" height="100%" fill="url(#grid-leaves)" />
                </svg>
                <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity duration-500"
                  style={{
                    background: 'radial-gradient(circle, #8b5cf6 35%, transparent 70%)',
                    filter: 'blur(16px)',
                  }}
                />
                <div className="flex items-center justify-between gap-4 relative z-10">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      Applied Leaves
                    </p>
                    <p className="mt-2.5 text-3xl font-black text-white leading-none num-pop" style={{ filter: 'drop-shadow(0 0 8px rgba(139,92,246,0.55))' }}>
                      {periodStats?.appliedLeaves ?? 0}
                    </p>
                  </div>
                  <div className="w-[48px] h-[48px] shrink-0 relative flex items-center justify-center rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                    <TrendingUp className="w-5 h-5 text-purple-400 z-10" />
                  </div>
                </div>
                <span className="shine-overlay-anuvadini rounded-2xl opacity-[0.12]" />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="glass border border-slate-100/60 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/10 p-5 rounded-2xl shadow-sm">
          <EmptyState
            icon={Users}
            title="No summary data"
            message="Summary statistics will appear once attendance is recorded for this period."
          />
        </div>
      )}

      {/* Charts */}
      {selectedRange === 'day' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Live Attendance Chart */}
          <div className="glass border border-slate-100/60 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/10 p-5 rounded-2xl shadow-sm">
            <LiveAttendanceChart 
              liveAttendanceData={liveAttendanceData}
            />
          </div>

          {/* Today's In-Time Statistics (Pie) */}
          <div className="glass border border-slate-100/60 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/10 p-5 rounded-2xl shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100" style={{ fontFamily: "'Geist', sans-serif" }}>Today's In-Time Statistics</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">Check-in slot-wise distribution</p>
            </div>
            <div>
              {timeWiseData && timeWiseData.length > 0 ? (
                (() => {
                  const filteredData = timeWiseData.filter(item => item.value > 0);
                  const timeColors = ['#4A74F0', '#0ea5e9', '#f59e0b', '#dc2626', '#8b5cf6'];
                  return filteredData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={filteredData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percentage }) => `${name} (${percentage}%)`}
                          outerRadius={90}
                          dataKey="value"
                          minAngle={5}
                        >
                          {filteredData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={timeColors[index % timeColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTheme.tooltipStyle} itemStyle={chartTheme.tooltipItemStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState
                      icon={Clock}
                      title="No check-ins today"
                      message="Time statistics will appear once staff check in."
                      className="h-64"
                    />
                  );
                })()
              ) : (
                <EmptyState
                  icon={Clock}
                  title="No check-in data"
                  message="Time statistics will appear once staff check in today."
                  className="h-64"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {(selectedRange === 'week' || selectedRange === 'month' || selectedRange === 'custom') && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Double Bar: Total Check-in / Check-out */}
          <div className={`glass border border-slate-100/60 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/10 p-5 rounded-2xl shadow-sm ${selectedRange === 'month' || selectedRange === 'custom' ? 'lg:col-span-2' : ''}`}>
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100" style={{ fontFamily: "'Geist', sans-serif" }}>In/Out Summary ({selectedRange === 'week' ? 'This Week' : selectedRange === 'month' ? 'This Month' : 'Custom Range'})</h3>
            </div>
            <div>
              {rangeInOutData && rangeInOutData.length > 0 ? (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={rangeInOutData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
                    <XAxis 
                      dataKey="name"
                      tickFormatter={(val, idx) => {
                        const item = rangeInOutData[idx];
                        return item && item.isWeekend ? `${val}` : val;
                      }}
                      tick={chartTheme.axisTick}
                      tickLine={chartTheme.tickLine}
                      stroke={chartTheme.axisColor}
                    />
                    <YAxis allowDecimals={false} tick={chartTheme.axisTick} tickLine={chartTheme.tickLine} stroke={chartTheme.axisColor} />
                    <Tooltip 
                      contentStyle={chartTheme.tooltipStyle}
                      labelStyle={chartTheme.tooltipLabelStyle}
                      formatter={(value, name) => [value, name]}
                      labelFormatter={(label, payload) => {
                        const item = payload && payload[0] ? payload[0].payload : null;
                        return item && item.isWeekend ? `${label} (Weekend)` : label;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="checkIn" fill="#6AA51F" name="Check-in" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="checkOut" fill="#315CE8" name="Check-out" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={Calendar}
                  title="No data"
                  message="In/out activity will appear here once attendance is recorded."
                  className="h-64"
                />
              )}
            </div>
          </div>

          {/* Weekly Trend: only for week */}
          {selectedRange === 'week' && (
            <div className="glass border border-slate-100/60 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/10 p-5 rounded-2xl shadow-sm">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100" style={{ fontFamily: "'Geist', sans-serif" }}>Attendance (Week-wise)</h3>
              </div>
              <div>
                {weekTrendData && weekTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={weekTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
                      <XAxis dataKey="date" tick={chartTheme.axisTick} tickLine={chartTheme.tickLine} stroke={chartTheme.axisColor} />
                      <YAxis allowDecimals={false} tick={chartTheme.axisTick} tickLine={chartTheme.tickLine} stroke={chartTheme.axisColor} />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const item = payload[0]?.payload || {};
                        const dateStr = (() => {
                          try {
                            const dt = new Date(item.fullDate);
                            return dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
                          } catch {
                            return item.fullDate || label;
                          }
                        })();
                        return (
                          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3 py-2 text-xs">
                            <div className="font-bold text-slate-800 dark:text-slate-100 mb-1">{dateStr}</div>
                            <div className="space-y-0.5 font-mono">
                              <div className="flex justify-between gap-5"><span className="text-emerald-600 dark:text-emerald-400">Present</span><span className="font-extrabold text-slate-800 dark:text-slate-100">{item.present ?? 0}</span></div>
                              <div className="flex justify-between gap-5"><span className="text-rose-500 dark:text-rose-400">Absent</span><span className="font-extrabold text-slate-800 dark:text-slate-100">{item.absent ?? 0}</span></div>
                              <div className="flex justify-between gap-5"><span className="text-amber-500 dark:text-amber-400">Late</span><span className="font-extrabold text-slate-800 dark:text-slate-100">{item.late ?? 0}</span></div>
                            </div>
                          </div>
                        );
                      }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="present" name="Present" fill="#6AA51F" radius={[3, 3, 0, 0]}>
                        {weekTrendData.map((entry, index) => (
                          <Cell key={`cell-p-${index}`} fill={entry.isWeekend ? '#B9F36A' : '#6AA51F'} />
                        ))}
                      </Bar>
                      <Bar dataKey="absent" name="Absent" fill="#DC2626" radius={[3, 3, 0, 0]}>
                        {weekTrendData.map((entry, index) => (
                          <Cell key={`cell-a-${index}`} fill={entry.isWeekend ? '#FCA5A5' : '#DC2626'} />
                        ))}
                      </Bar>
                      <Bar dataKey="late" name="Late" fill="#D97706" radius={[3, 3, 0, 0]}>
                        {weekTrendData.map((entry, index) => (
                          <Cell key={`cell-l-${index}`} fill={entry.isWeekend ? '#FCD34D' : '#D97706'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    icon={TrendingUp}
                    title="No trend data"
                    message="Weekly attendance trends will appear here once data is available."
                    className="h-64"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Attendance Table */}
      <div className="glass border border-slate-100/60 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/10 p-5 rounded-2xl shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100" style={{ fontFamily: "'Geist', sans-serif" }}>Detailed Attendance</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">Browse and search individual listings</p>
          </div>
          <div className="relative w-64 max-w-full">
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search by name or UID..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
        <div>
          {selectedRange === 'day' ? (
            (attendanceData.length > 0 || (dailyReport?.students?.length || 0) > 0) ? (
              <div data-lenis-prevent className="max-h-[65vh] overflow-auto">
                {(() => {
                  let rowsAll = buildDayRows();
                  if (tableSearch.trim()) {
                    const q = tableSearch.toLowerCase();
                    rowsAll = rowsAll.filter(r =>
                      (r.student?.fullName || '').toLowerCase().includes(q) ||
                      (r.student?.uid || '').toLowerCase().includes(q)
                    );
                  }
                  rowsAll.sort((a, b) => b.sortKey - a.sortKey);
                  const totalPages = Math.max(1, Math.ceil(rowsAll.length / pageSize));
                  const currentPage = Math.min(page, totalPages);
                  const startIdx = (currentPage - 1) * pageSize;
                  const rows = rowsAll.slice(startIdx, startIdx + pageSize);
                  return (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800/50">
                              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[50px] whitespace-nowrap">S.No</th>
                              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[180px] whitespace-nowrap">Staff</th>
                              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[100px] whitespace-nowrap">Check-in</th>
                              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[110px] whitespace-nowrap">Office</th>
                              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[100px] whitespace-nowrap">Check-out</th>
                              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[100px] whitespace-nowrap">Duration</th>
                              <th className="pb-3 text-right text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[80px] whitespace-nowrap">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100/60 dark:divide-slate-800/30">
                            {rows.map((row, idx) => (
                              <tr
                                key={row.id}
                                className="group hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors duration-150 cursor-pointer"
                                onClick={() => navigate(`/student-report/${row.id}`)}
                              >
                                <td className="py-3.5 text-xs font-mono text-slate-400 dark:text-slate-500">{startIdx + idx + 1}</td>
                                <td className="py-3.5">
                                  <div className="flex items-center">
                                    <div className="h-8 w-8 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100/50 dark:border-emerald-900/30 flex items-center justify-center shrink-0">
                                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                        {row.student?.fullName?.charAt(0) || '?'}
                                      </span>
                                    </div>
                                    <div className="ml-3">
                                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                        {row.student?.fullName || 'Unknown'}
                                      </p>
                                      <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">{row.student?.uid || ''}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5">
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{row.checkIn}</span>
                                  </div>
                                </td>
                                <td className="py-3.5">
                                  {row.officeDiffers ? (
                                    <div className="flex flex-col gap-1">
                                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/40 w-fit">
                                        <MapPin className="h-3 w-3" />{row.officeIn} <span className="font-medium opacity-70">(in)</span>
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200/40 w-fit">
                                        <MapPin className="h-3 w-3" />{row.officeOut} <span className="font-medium opacity-70">(out)</span>
                                      </span>
                                    </div>
                                  ) : row.office && row.office !== '—' ? (
                                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/40">
                                      <MapPin className="h-3 w-3" />{row.office}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                                  )}
                                </td>
                                <td className="py-3.5">
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                                    {row.checkOut === 'Pending' ? (
                                      <span className="inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/40">{row.checkOut}</span>
                                    ) : (
                                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{row.checkOut}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3.5">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${
                                    row.diff === 'In-progress' 
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/40' 
                                      : 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border border-sky-200/40'
                                  }`}>{row.diff}</span>
                                </td>
                                <td className="py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    icon={Download}
                                    onClick={() => exportStudentCSV(row.id, row.student?.fullName)}
                                    className="h-7 text-[10px] px-2.5 rounded-lg border-slate-200 text-slate-600 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300"
                                  >
                                    Export
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Page {currentPage} of {totalPages}</span>
                        <div className="space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="h-8 text-xs border-slate-200 text-slate-700 dark:border-slate-750 dark:text-slate-300"
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="h-8 text-xs border-slate-200 text-slate-700 dark:border-slate-750 dark:text-slate-300"
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <EmptyState
                icon={Calendar}
                title="No attendance records"
                message="No attendance data found for the selected date. Try changing the filters or check back later."
              />
            )
          ) : (
            // Week/Month table
            <div data-lenis-prevent className="max-h-[65vh] overflow-auto">
              {rangeLoading ? (
                <SkeletonTable rows={6} cols={7} className="py-4" />
              ) : rangeRows.length > 0 ? (
                (() => {
                  let filtered = rangeRows;
                  if (tableSearch.trim()) {
                    const q = tableSearch.toLowerCase();
                    filtered = filtered.filter(r =>
                      (r.student?.fullName || '').toLowerCase().includes(q) ||
                      (r.student?.uid || '').toLowerCase().includes(q)
                    );
                  }
                  filtered = [...filtered].sort((a, b) => (b.presentDays ?? 0) - (a.presentDays ?? 0));
                  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
                  const currentPage = Math.min(page, totalPages);
                  const startIdx = (currentPage - 1) * pageSize;
                  const rows = filtered.slice(startIdx, startIdx + pageSize);
                  return (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800/50">
                              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[50px] whitespace-nowrap">S.No</th>
                              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[180px] whitespace-nowrap">Staff</th>
                              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[90px] whitespace-nowrap">Total Days</th>
                              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[100px] whitespace-nowrap">Present Days</th>
                              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[120px] whitespace-nowrap">Approved Leave</th>
                              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[90px] whitespace-nowrap">Absent</th>
                              <th className="pb-3 text-right text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[80px] whitespace-nowrap">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100/60 dark:divide-slate-800/30">
                            {rows.map((row, idx) => (
                              <tr
                                key={row.id}
                                className="group hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors duration-150 cursor-pointer"
                                onClick={() => navigate(`/student-report/${row.id}`)}
                              >
                                <td className="py-3.5 text-xs font-mono text-slate-400 dark:text-slate-500">{startIdx + idx + 1}</td>
                                <td className="py-3.5">
                                  <div className="flex items-center">
                                    <div className="h-8 w-8 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100/50 dark:border-emerald-900/30 flex items-center justify-center shrink-0">
                                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                        {row.student?.fullName?.charAt(0) || '?'}
                                      </span>
                                    </div>
                                    <div className="ml-3">
                                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{row.student?.fullName || 'Unknown'}</p>
                                      <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">{row.student?.uid || ''}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 text-xs font-medium text-slate-700 dark:text-slate-200">{row.totalDays}</td>
                                <td className="py-3.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">{row.presentDays}</td>
                                <td className="py-3.5 text-xs font-medium text-slate-700 dark:text-slate-200">{row.approvedLeave}</td>
                                <td className="py-3.5 text-xs font-bold text-rose-500 dark:text-rose-450">{Math.max(row.totalDays - row.presentDays - row.approvedLeave, 0)}</td>
                                <td className="py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    icon={Download}
                                    onClick={() => exportStudentCSV(row.id, row.student?.fullName)}
                                    className="h-7 text-[10px] px-2.5 rounded-lg border-slate-200 text-slate-600 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300"
                                  >
                                    Export
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Page {currentPage} of {totalPages}</span>
                        <div className="space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="h-8 text-xs border-slate-200 text-slate-700 dark:border-slate-750 dark:text-slate-300"
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="h-8 text-xs border-slate-200 text-slate-700 dark:border-slate-750 dark:text-slate-300"
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    </>
                  );
                })()
              ) : (
                <EmptyState
                  icon={Calendar}
                  title="No attendance records"
                  message="No data found for the selected period."
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Attendance;
