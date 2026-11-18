import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Calendar,
  Clock,
  TrendingUp,
  User,
  ArrowLeft,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3,
  LogIn,
  LogOut,
  Timer,
  Hourglass,
  ShieldCheck,
  Tent,
  Activity,
} from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import { downloadCsv } from "../lib/csvExport";
const StudentReport = () => {
  const { user } = useAuth();
  const { studentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (window.history.length > 1 && location.key !== 'default') {
      navigate(-1);
    } else {
      navigate("/students");
    }
  };
  const [student, setStudent] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [detailedMonthlyData, setDetailedMonthlyData] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [viewType, setViewType] = useState("calendar"); // 'calendar' or 'textual'
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [genderDistribution, setGenderDistribution] = useState([]);
  const [genderLoading, setGenderLoading] = useState(false);
  const [authMethodDistribution, setAuthMethodDistribution] = useState([]);
  const [recordSearch, setRecordSearch] = useState('');
  const [authMethodLoading, setAuthMethodLoading] = useState(false);
  const [leaveStats, setLeaveStats] = useState({ applied: 0, approved: 0 });
  const [activity, setActivity] = useState(null); // spot-checks / outreach
  const [loginActivity, setLoginActivity] = useState([]); // app login/logout history

  // Remove Saturday holidays if user.saturdayIsWorking is true
  let aicteHolidays2025 = {
    "2025-01-26": "Republic Day",
    "2025-02-26": "Maha Shivaratri",
    "2025-03-14": "Holi",
    "2025-03-31": "Id-ul-Fitr",
    "2025-04-10": "Mahavir Jyanti",
    "2025-04-18": "Good Friday",
    "2025-05-12": "Buddha Purnima",
    "2025-06-07": "Id-ul-Zuha (Bakrid)",
    "2025-07-06": "Muharram",
    "2025-08-15": "Independence Day",
    "2025-08-16": "Janmashtami",
    "2025-09-05": "Milad-un-Nabi",
    "2025-10-02": "Gandhi Jayanti & Dussehra",
    "2025-10-20": "Diwali",
    "2025-11-05": "Guru Nanak Jayanti",
    "2025-12-25": "Christmas Day",
  };
  if (user?.saturdayIsWorking) {
    aicteHolidays2025 = Object.fromEntries(
      Object.entries(aicteHolidays2025).filter(([date, name]) => {
        const d = new Date(date);
        // 6 = Saturday
        return d.getDay() !== 6;
      })
    );
  }

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

  // Helper function to count weekends for a month (Saturday + Sunday)
  const getMonthWeekendsCount = (year, month) => {
    const daysInMonth = getLastDayOfMonth(year, month);
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month, d).getDay();
      const isWeekendDay = dow === 0 || dow === 6;
      if (isWeekendDay) {
        count++;
      }
    }
    return count;
  };

  // Helper function to check if a check-in time is late
  const isLateCheckIn = (checkInTime) => {
    if (!checkInTime) return false;

    const [hours, minutes] = checkInTime.split(":").map(Number);
    const checkInMinutes = hours * 60 + minutes;
    const lateThreshold = 9 * 60 + 31; // 9:31 AM in minutes

    return checkInMinutes >= lateThreshold;
  };

  // Helper function to determine status based on check-in time and total hours
  const getAttendanceStatus = (record) => {
    if (!record.checkIn) {
      return { status: "Absent", color: "badge-danger" };
    }

    const checkInTime = record.checkIn;
    const [hours, minutes] = checkInTime.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes;

    // Define time thresholds in minutes
    const lateThreshold = 9 * 60 + 31; // 9:31 AM
    const halfDayStartThreshold = 11 * 60; // 11:00 AM
    const halfDayEndThreshold = 16 * 60; // 4:00 PM
    const lateEndThreshold = 17 * 60 + 29; // 5:29 PM

    // Check if only has check-in (no check-out)
    if (!record.checkOut) {
      if (totalMinutes < lateThreshold) { // Before 9:31 AM
        return { status: "Checked-in", color: "badge-info" };
      } else if (totalMinutes >= lateThreshold && totalMinutes <= lateEndThreshold) { // Late: 9:31 AM to 5:29 PM
        if (totalMinutes >= halfDayStartThreshold && totalMinutes < halfDayEndThreshold) { // Half Day: 11:00 AM to before 4:00 PM
          return { status: "Half Day Checked-in", color: "badge-warning" };
        } else {
          return { status: "Late Checked-in", color: "badge-warning" };
        }
      } else { // After 5:29 PM
        return { status: "Very Late Checked-in", color: "badge-danger" };
      }
    }

    // Has both check-in and check-out
    const totalHours = parseFloat(record.totalHours) || 0;

    // Check for early leave based on checkout time
    let isEarlyLeave = false;
    if (record.checkOut) {
      const [checkOutHours, checkOutMinutes] = record.checkOut.split(":").map(Number);
      const checkOutTotalMinutes = checkOutHours * 60 + checkOutMinutes;
      const earlyLeaveThreshold = 17 * 60 + 29; // 5:29 PM
      isEarlyLeave = checkOutTotalMinutes < earlyLeaveThreshold;
    }

    // Determine status based on check-in time, checkout time, and total hours
    if (totalMinutes >= halfDayStartThreshold && totalMinutes < halfDayEndThreshold) {
      // Half Day: Check-in between 11:00 AM to before 4:00 PM
      return { status: "Half Day", color: "badge-warning" };
    } else if (isEarlyLeave) {
      // Early Leave: Check-out before 5:29 PM
      return { status: "Early Leave", color: "badge-warning" };
    } else if (totalMinutes >= lateThreshold && totalMinutes <= lateEndThreshold) {
      // Late: Check-in between 9:31 AM to 5:29 PM (excluding half day range)
      if (totalHours >= 8) {
        return { status: "Late but Full Day", color: "badge-info" };
      } else {
        return { status: "Late", color: "badge-warning" };
      }
    } else if (totalHours < 8) {
      return { status: "Half Day", color: "badge-warning" };
    } else {
      return { status: "Present", color: "badge-success" };
    }
  };

  // Test function to validate status logic (for development)
  const testStatusLogic = () => {
    const testCases = [
      { checkIn: "09:15", checkOut: null, totalHours: null, expected: "Checked-in" },
      { checkIn: "09:45", checkOut: null, totalHours: null, expected: "Late Checked-in" },
      { checkIn: "11:30", checkOut: null, totalHours: null, expected: "Half Day Checked-in" },
      { checkIn: "10:30", checkOut: null, totalHours: null, expected: "Late Checked-in" },
      { checkIn: "09:00", checkOut: "17:30", totalHours: 8, expected: "Present" },
      { checkIn: "09:45", checkOut: "17:30", totalHours: 7.25, expected: "Late but Full Day" },
      { checkIn: "11:30", checkOut: "15:30", totalHours: 4, expected: "Half Day" },
      { checkIn: "09:00", checkOut: "15:00", totalHours: 6, expected: "Early Leave" },
      { checkIn: "09:00", checkOut: "16:00", totalHours: 7, expected: "Early Leave" },
      { checkIn: null, checkOut: null, totalHours: null, expected: "Absent" }
    ];

    console.log("Testing status logic:");
    testCases.forEach((testCase, index) => {
      const result = getAttendanceStatus(testCase);
      console.log(`Test ${index + 1}: ${testCase.checkIn || 'null'} -> ${result.status} (expected: ${testCase.expected})`);
    });
  };

  // Uncomment the line below to run tests in development
  // testStatusLogic();

  // Helper function to determine day status including late detection
  const getDayStatus = (dayData) => {
    // If student has actual attendance (checkIn / details / non-weekend status),
    // show actual attendance status instead of overriding with "Weekend".
    const hasAttendanceRecord = !!(
      dayData && (
        dayData.checkIn ||
        (Array.isArray(dayData.details) && dayData.details.some(d => d.action && d.action.toLowerCase().includes('check in'))) ||
        (typeof dayData.status === 'string' && dayData.status !== 'Weekend' && dayData.status !== 'No Data' && dayData.status !== 'Absent')
      )
    );

    if (dayData && !hasAttendanceRecord) {
      const date = new Date(selectedYear, selectedMonth, dayData.day);
      const dow = date.getDay(); // 0=Sun .. 6=Sat
      const isWeekendDay = dow === 0 || (dow === 6 && !user?.saturdayIsWorking);
      if (isWeekendDay) {
        return "Weekend";
      }
    }

    if (!dayData || dayData.status === "Weekend" || dayData.status === "Absent") {
      return dayData?.status || "No Data";
    }

    // Check if student was late
    if (dayData.details && dayData.details.length > 0) {
      const checkInDetails = dayData.details.filter((d) =>
        d.action.toLowerCase().includes("check in")
      );

      if (checkInDetails.length > 0) {
        const earliestCheckIn = checkInDetails.reduce((earliest, d) => {
          const [h, m] = d.time.split(":").map(Number);
          const minutes = h * 60 + m;
          if (!earliest || minutes < earliest.minutes) {
            return { time: d.time, minutes };
          }
          return earliest;
        }, null);

        if (earliestCheckIn && isLateCheckIn(earliestCheckIn.time)) {
          // If late and also partial, show as "Late Partial"
          if (dayData.status === "Partial") {
            return "Late Partial";
          }
          return "Late";
        }
      }
    }

    return dayData.status;
  };

  const [dateRange, setDateRange] = useState({
    startDate: formatDateYMD(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ),
    endDate: formatDateYMD(
      new Date().getFullYear(),
      new Date().getMonth(),
      new Date().getDate()
    ),
  });

  useEffect(() => {
    if (studentId) {
      fetchStudentReport();
      fetchGenderDistribution();
      fetchAuthMethodDistribution();
      axios
        .get(`/api/attendance/login-activity/${studentId}`)
        .then((res) => setLoginActivity(res.data?.activity || []))
        .catch((err) => console.error('Error fetching login activity:', err));
      // Also fetch current month's detailed data including notes
      const fetchInitialMonthlyData = async () => {
        try {
          // formatDateYMD builds the YYYY-MM-DD string directly from the
          // plain year/month/day numbers -- no Date/toISOString conversion,
          // so it can't shift by a day the way `new Date(y,m,d).toISOString()`
          // does for any browser in a timezone ahead of UTC (e.g. IST): that
          // shifted the requested range back by one day, pulling in the
          // PREVIOUS month's last day (e.g. June 30) and cutting off THIS
          // month's last day (e.g. July 31) -- the exact "wrong date's data
          // shows under today's cell" bug.
          const startDate = formatDateYMD(selectedYear, selectedMonth, 1);
          const lastDay = getLastDayOfMonth(selectedYear, selectedMonth);
          const endDate = formatDateYMD(selectedYear, selectedMonth, lastDay);

          const response = await axios.get(
            `/api/attendance/detailed-monthly/${studentId}`,
            {
              params: { startDate, endDate },
            }
          );

          console.log("response", response.data);

          setDetailedMonthlyData(response.data.dailyBreakdown || []);

          // Create notes map from the response
          const notesMap = {};
          response.data.dailyBreakdown?.forEach((day) => {
            if (day.note) {
              notesMap[day.date] = day.note;
            }
          });
          setNotes(notesMap);
        } catch (error) {
          console.error("Error fetching initial monthly data:", error);
        }
      };

      fetchInitialMonthlyData();
    }
  }, [studentId, dateRange, selectedMonth, selectedYear]);

  useEffect(() => {
    if (
      studentId &&
      selectedMonth !== undefined &&
      selectedYear !== undefined
    ) {
      const fetchData = async () => {
        try {
          const startDate = formatDateYMD(selectedYear, selectedMonth, 1);
          const lastDay = getLastDayOfMonth(selectedYear, selectedMonth);
          const endDate = formatDateYMD(selectedYear, selectedMonth, lastDay);

          // Update the dateRange state to reflect the selected month
          const newDateRange = {
            startDate: startDate,
            endDate: endDate,
          };
          setDateRange(newDateRange);

          const response = await axios.get(
            `/api/attendance/detailed-monthly/${studentId}`,
            {
              params: {
                startDate: startDate,
                endDate: endDate,
              },
            }
          );

          setDetailedMonthlyData(response.data.dailyBreakdown || []);

          // Create notes map from the response
          const notesMap = {};
          response.data.dailyBreakdown?.forEach((day) => {
            if (day.note) {
              notesMap[day.date] = day.note;
            }
          });
          setNotes(notesMap);

          // Fetch auth method distribution with the new date range
          await fetchAuthMethodDistribution();
        } catch (error) {
          console.error("Error fetching detailed monthly data:", error);
          toast.error("Failed to load detailed monthly data");
        }
      };

      fetchData();
    }
  }, [studentId, selectedMonth, selectedYear]);

  // Fetch leave stats (applied/approved) for the student within current date range
  useEffect(() => {
    const fetchLeaveStats = async () => {
      try {
        if (!studentId) return;
        // Fetch all leave requests for the student; filter by date range on client
        const response = await axios.get('/api/get-leave-requests', {
          params: { studentId },
        });
        const leaves = response?.data || [];

        const rangeStart = new Date(dateRange.startDate);
        const rangeEnd = new Date(dateRange.endDate);

        const overlapsRange = (start, end) => {
          if (!start || !end) return false;
          const s = new Date(start);
          const e = new Date(end);
          if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
          return s <= rangeEnd && e >= rangeStart;
        };

        const overlapping = leaves.filter(l => overlapsRange(l?.leaveDates?.start, l?.leaveDates?.end));
        const approved = overlapping.filter(l => (l?.status || '').toLowerCase() === 'approved');
        setLeaveStats({ applied: overlapping.length, approved: approved.length });
      } catch (err) {
        console.error('Failed to fetch leave stats:', err);
        setLeaveStats({ applied: 0, approved: 0 });
      }
    };

    fetchLeaveStats();
  }, [studentId, dateRange]);

  // Field activity: spot-checks, outreach.
  useEffect(() => {
    const fetchActivity = async () => {
      try {
        if (!studentId) return;
        const res = await axios.get(`/api/attendance/staff-activity/${studentId}`, {
          params: dateRange,
        });
        setActivity(res.data);
      } catch (err) {
        console.error("Failed to fetch staff activity:", err);
        setActivity(null);
      }
    };
    fetchActivity();
  }, [studentId, dateRange]);

  const fetchStudentReport = async () => {
    try {
      setLoading(true);
      const [studentResponse, reportResponse] = await Promise.all([
        axios.get(`/api/students/${studentId}`),
        axios.get(`/api/attendance/student-report/${studentId}`, {
          params: dateRange,
        }),
      ]);

      console.log("reportResponse", reportResponse.data);

      setStudent(studentResponse.data.student);
      setReportData(reportResponse.data);

      // Also refresh auth method distribution with new date range
      await fetchAuthMethodDistribution();
    } catch (error) {
      console.error("Error fetching student report:", error);
      toast.error("Failed to load student report");
    } finally {
      setLoading(false);
    }
  };

  const fetchGenderDistribution = async () => {
    try {
      setGenderLoading(true);
      const response = await axios.get(
        "/api/attendance/student-gender-distribution"
      );
      setGenderDistribution(response.data.data || []);
    } catch (error) {
      console.error("Error fetching gender distribution:", error);
      toast.error("Failed to load gender distribution");
    } finally {
      setGenderLoading(false);
    }
  };

  const fetchAuthMethodDistribution = async () => {
    try {
      setAuthMethodLoading(true);
      console.log(
        "Fetching auth method distribution with dateRange:",
        dateRange
      );
      const response = await axios.get("/api/attendance/student-auth-method", {
        params: dateRange,
      });
      console.log("Auth method response:", response.data);
      setAuthMethodDistribution(response.data.data || []);
    } catch (error) {
      console.error("Error fetching auth method distribution:", error);
      toast.error("Failed to load auth method distribution");
    } finally {
      setAuthMethodLoading(false);
    }
  };

  const fetchDetailedMonthlyData = async () => {
    try {
      const startDate = formatDateYMD(selectedYear, selectedMonth, 1);
      const lastDay = getLastDayOfMonth(selectedYear, selectedMonth);
      const endDate = formatDateYMD(selectedYear, selectedMonth, lastDay);

      const response = await axios.get(
        `/api/attendance/detailed-monthly/${studentId}`,
        {
          params: {
            startDate: startDate,
            endDate: endDate,
          },
        }
      );

      setDetailedMonthlyData(response.data.dailyBreakdown || []);

      // Create notes map from the response
      const notesMap = {};
      response.data.dailyBreakdown?.forEach((day) => {
        if (day.note) {
          notesMap[day.date] = day.note;
        }
      });
      setNotes(notesMap);
    } catch (error) {
      console.error("Error fetching detailed monthly data:", error);
      toast.error("Failed to load detailed monthly data");
    }
  };

  const handleAddNote = (date) => {
    setSelectedDate(date);
    setNoteText(notes[date] || "");
    setShowNoteModal(true);
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) {
      toast.error("Please enter a note");
      return;
    }

    try {
      console.log("Saving note for date:", selectedDate); // Debug log
      await axios.post("/api/attendance/note", {
        studentId,
        date: selectedDate,
        note: noteText.trim(),
      });

      // Update local notes state
      setNotes((prev) => {
        const updated = {
          ...prev,
          [selectedDate]: noteText.trim(),
        };
        console.log("Updated notes state:", updated); // Debug log
        return updated;
      });

      setShowNoteModal(false);
      setSelectedDate(null);
      setNoteText("");
      toast.success("Note saved successfully");

      // Refresh the monthly data to ensure notes are properly loaded
      await fetchDetailedMonthlyData();
    } catch (error) {
      console.error("Error saving note:", error);
      toast.error("Failed to save note");
    }
  };

  const ACCENTS = {
    emerald: "#4A74F0",
    sky: "#0ea5e9",
    indigo: "#6366f1",
    amber: "#f59e0b",
    rose: "#f43f5e",
    violet: "#a855f7",
    cyan: "#6F8DF0",
  };

  const StatCard = ({ title, value, icon: Icon, accent = "emerald", subtitle }) => {
    const color = ACCENTS[accent] || ACCENTS.emerald;
    return (
      <div
        className="relative rounded-3xl p-5 overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-all duration-200"
        style={{
          background: "linear-gradient(180deg, var(--glass-bg), var(--glass-soft-bg))",
          backdropFilter: "blur(20px)",
          border: "1px solid var(--glass-border)",
          boxShadow: "0 20px 48px -28px rgba(10,20,36,0.12)",
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: color }} />
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {title}
          </span>
          {Icon && (
            <span style={{ color }}>
              <Icon className="h-4.5 w-4.5" />
            </span>
          )}
        </div>
        <div>
          <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">{value}</h3>
          {subtitle && (
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    );
  };

  const ChartShell = ({ title, subtitle, icon: Icon, children }) => (
    <div className="glass overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-slate-200/60 dark:border-slate-800 px-5 py-4">
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <Icon className="h-4.5 w-4.5" />
          </span>
        )}
        <div>
          <h3
            className="text-base font-extrabold text-slate-900 dark:text-slate-100 leading-none"
            style={{ fontFamily: "'Geist','Inter',sans-serif" }}
          >
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );

  const chartTooltipStyle = {
    borderRadius: "0.75rem",
    border: "1px solid var(--glass-border)",
    background: "rgba(255,255,255,0.95)",
    boxShadow: "0 12px 32px -12px rgba(10,20,36,0.25)",
    fontSize: "12px",
    fontWeight: 600,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!student || !reportData) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-medium text-gray-900">Student not found</h3>
        <button
          onClick={handleBack}
          className="mt-4 btn btn-primary"
        >
          Back to Students
        </button>
      </div>
    );
  }

  const COLORS = ["#4A74F0", "#f59e0b", "#ef4444"];

  // Per-day working hours (chronological) — backend returns totalHours like "8.0h".
  const dailyHoursData = [...(reportData?.attendanceRecords || [])]
    .filter((r) => r.totalHours)
    .map((r) => {
      const parsed = new Date(r.date);
      const label = Number.isNaN(parsed.getTime())
        ? r.date
        : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      return { label, hours: parseFloat(r.totalHours) || 0 };
    })
    .reverse(); // records arrive most-recent-first

  const filteredAttendanceRecords = (reportData?.attendanceRecords || []).filter((record) => {
    if (!recordSearch) return true;
    const term = recordSearch.toLowerCase();
    return (
      (record.date || '').toLowerCase().includes(term) ||
      (record.dayOfWeek || '').toLowerCase().includes(term) ||
      (record.checkIn || '').toLowerCase().includes(term) ||
      (record.checkOut || '').toLowerCase().includes(term) ||
      (record.totalHours || '').toLowerCase().includes(term) ||
      (record.status || '').toLowerCase().includes(term) ||
      (record.authMethod || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors"
            aria-label="Back to staff"
            title="Back to staff"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-base font-bold text-white shadow-md shadow-emerald-700/15">
            {(student.fullName || "?")
              .split(" ")
              .map((w) => w[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div>
            <h1
              className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "'Geist','Inter',sans-serif" }}
            >
              {student.fullName}
            </h1>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
              UID: {student.uid}
              <span className="mx-2 text-slate-300 dark:text-slate-600">|</span>
              <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                {student.class || student.department || student.bureau}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, startDate: e.target.value }))
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <span className="text-xs font-bold text-slate-400">to</span>
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, endDate: e.target.value }))
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            onClick={async () => {
              // Fetch fresh data for the EXACT range picked above, at click
              // time. Previously this exported `detailedMonthlyData`, which is
              // only ever populated for the separate calendar month/year
              // selector -- editing the start/end date inputs never changed
              // what got exported (you'd type "1st" and still get the whole
              // current calendar month, e.g. rows from the 30th). Re-fetching
              // here against dateRange.startDate/endDate makes the export
              // match exactly what was picked.
              if (!dateRange.startDate || !dateRange.endDate) {
                toast.error('Pick a start and end date first');
                return;
              }
              if (new Date(dateRange.startDate) > new Date(dateRange.endDate)) {
                toast.error('Start date must be before end date');
                return;
              }
              try {
                const response = await axios.get(
                  `/api/attendance/detailed-monthly/${studentId}`,
                  { params: { startDate: dateRange.startDate, endDate: dateRange.endDate } }
                );
                const rows = response.data.dailyBreakdown || [];
                if (rows.length === 0) {
                  toast.error('No attendance data to export');
                  return;
                }
                const checkInTime = (d) =>
                  d.details?.find((e) => e.action === 'Check In')?.time || '';
                const checkOutTime = (d) =>
                  d.details?.find((e) => e.action === 'Check Out (Last)')?.time || '';
                downloadCsv(
                  `${(student?.fullName || 'student').toLowerCase().replace(/\s+/g, '-')}_attendance_${dateRange.startDate}_to_${dateRange.endDate}.csv`,
                  rows,
                  [
                    { label: 'Date', get: (d) => d.date },
                    { label: 'Day', get: (d) => d.dayName },
                    { label: 'Status', get: (d) => getDayStatus(d) },
                    { label: 'Check-In Time', get: checkInTime },
                    { label: 'Check-Out Time', get: checkOutTime },
                    { label: 'Check-Ins', get: (d) => d.checkIns ?? 0 },
                    { label: 'Check-Outs', get: (d) => d.checkOuts ?? 0 },
                    { label: 'Total Records', get: (d) => d.totalRecords ?? 0 },
                    { label: 'Note', get: (d) => d.note || notes[d.date] || '' },
                  ]
                );
                toast.success('Attendance report downloaded');
              } catch (error) {
                console.error('Error exporting attendance report:', error);
                toast.error('Failed to export attendance report');
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-emerald-700/10 hover:from-emerald-700 hover:to-emerald-800 transition-all"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Total Present Days"
          value={reportData.stats.presentDays}
          icon={CheckCircle}
          accent="emerald"
          subtitle={`Out of ${reportData.stats.workingDays} working days`}
        />
        <StatCard
          title="Attendance Rate"
          value={`${reportData.stats.attendanceRate}%`}
          icon={TrendingUp}
          accent="sky"
          subtitle={`${Math.max(0, reportData.stats.workingDays - reportData.stats.presentDays)} day(s) absent`}
        />
        <StatCard
          title="Avg Check-in"
          value={reportData.stats.avgCheckInTime || "N/A"}
          icon={LogIn}
          accent="indigo"
          subtitle="Average arrival time"
        />
        <StatCard
          title="Avg Check-out"
          value={reportData.stats.avgCheckOutTime || "N/A"}
          icon={LogOut}
          accent="violet"
          subtitle="Average departure time"
        />
        <StatCard
          title="Total Hours"
          value={`${reportData.stats.totalHours ?? 0} h`}
          icon={Hourglass}
          accent="cyan"
          subtitle="Logged in selected range"
        />
        <StatCard
          title="Check-ins / Outs"
          value={`${reportData.stats.totalInCount ?? 0} / ${reportData.stats.totalOutCount ?? 0}`}
          icon={Timer}
          accent="emerald"
          subtitle="Days with check-in / out"
        />
        <StatCard
          title="Leaves Applied"
          value={leaveStats.applied}
          icon={Calendar}
          accent="amber"
          subtitle={`${leaveStats.approved} approved`}
        />
        <StatCard
          title="Unexplained Absent"
          value={reportData.stats.unknownLeaves ?? 0}
          icon={XCircle}
          accent="rose"
          subtitle="Absent without a note"
        />
      </div>

      {/* Field Activity — spot-checks, outreach */}
      {activity && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Field Activity
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              title="Spot-Checks"
              value={`${activity.spotChecks?.responded ?? 0}/${activity.spotChecks?.total ?? 0}`}
              icon={ShieldCheck}
              accent={
                (activity.spotChecks?.missed ?? 0) > 0 ? "rose" : "emerald"
              }
              subtitle={`${activity.spotChecks?.responseRate ?? 0}% responded · ${activity.spotChecks?.missed ?? 0} missed`}
            />
            <StatCard
              title="Outreach"
              value={activity.outreach?.total ?? 0}
              icon={Tent}
              accent="violet"
              subtitle={`${activity.outreach?.completed ?? 0} done · ${activity.outreach?.participants ?? 0} reached`}
            />
          </div>
        </div>
      )}

      {/* Login Activity — app login/logout history, separate from attendance
          marks. Answers "logged in, checked in, logged out, logged back in
          later to check out" — a sequence the attendance calendar alone can't
          show since a check-in/out is a location event, not a session event. */}
      {loginActivity.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Login Activity
            </h2>
          </div>
          <div className="glass overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                    <th className="px-4 py-3">Logged in</th>
                    <th className="px-4 py-3">Logged out</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Device</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loginActivity.map((s, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {s.loginAt ? new Date(s.loginAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {s.logoutAt ? new Date(s.logoutAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {s.durationMs != null ? `${Math.floor(s.durationMs / 3600000)}h ${Math.floor((s.durationMs % 3600000) / 60000)}m` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.device || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${s.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                          {s.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Weekly Attendance Trend */}
        <ChartShell
          title="Weekly Attendance Trend"
          subtitle="Present vs working days"
          icon={TrendingUp}
        >
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={reportData.weeklyTrend}>
              <defs>
                <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4A74F0" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#4A74F0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 12, fontWeight: 600 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Area
                type="monotone"
                dataKey="workingDays"
                name="Working days"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="transparent"
              />
              <Area
                type="monotone"
                dataKey="presentDays"
                name="Present days"
                stroke="#4A74F0"
                strokeWidth={2.5}
                fill="url(#presentGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartShell>

        {/* Monthly Attendance */}
        <ChartShell
          title="Monthly Breakdown"
          subtitle="Present vs absent"
          icon={BarChart3}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={reportData.monthlyData} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fontWeight: 600 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
              <Bar dataKey="present" name="Present" fill="#4A74F0" radius={[6, 6, 0, 0]} maxBarSize={42} />
              <Bar dataKey="absent" name="Absent" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={42} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>

        {/* Check-in Time Distribution */}
        <ChartShell
          title="Check-in Time Pattern"
          subtitle="Arrival punctuality split"
          icon={Clock}
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Pie
                data={reportData.checkInPattern}
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={92}
                paddingAngle={3}
                labelLine={false}
                label={({ percentage }) => (percentage ? `${percentage}%` : "")}
                dataKey="value"
              >
                {reportData.checkInPattern.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartShell>

        {/* Daily Working Hours (face-only system → hours are the useful signal) */}
        <ChartShell
          title="Daily Working Hours"
          subtitle="Hours logged per present day"
          icon={Hourglass}
        >
          {dailyHoursData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyHoursData}>
                <defs>
                  <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6F8DF0" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6F8DF0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 600 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" unit="h" />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${v} h`, "Worked"]} />
                <Area type="monotone" dataKey="hours" name="Hours" stroke="#6F8DF0" strokeWidth={2.5} fill="url(#hoursGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-[300px] text-slate-400 dark:text-slate-500">
              <Hourglass className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm font-semibold">No completed (check-in + out) days in range</p>
            </div>
          )}
        </ChartShell>

        {/* Student Gender Distribution */}
        {/* <div className="card">
          <div className="card-header">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Student Gender Distribution</h3>
              <p className="text-sm text-gray-500">All Students (Organization-wide)</p>
            </div>
          </div>
          <div className="card-body">
            {genderLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : genderDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={genderDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name} (${percentage}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {genderDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                <div className="text-center">
                  <User className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No gender distribution data available</p>
                </div>
              </div>
            )}
          </div>
        </div> */}

        {/* Authentication Method Distribution */}
        {/* <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Authentication Method Usage</h3>
                <p className="text-sm text-gray-500">
                  {dateRange.startDate && dateRange.endDate ? 
                    `${new Date(dateRange.startDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : 
                    'Current Month'
                  }
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <select 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="input-field text-xs"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i}>
                      {new Date(2024, i, 1).toLocaleDateString('en-US', { month: 'short' })}
                    </option>
                  ))}
                </select>
                <select 
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="input-field text-xs"
                >
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i} value={2020 + i}>
                      {2020 + i}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    console.log('Manual refresh clicked. Current dateRange:', dateRange);
                    fetchAuthMethodDistribution();
                  }}
                  className="btn btn-secondary btn-sm"
                  title="Refresh auth method data"
                >
                  <BarChart3 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="card-body">
            {authMethodLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : authMethodDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={authMethodDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="method" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => [value, 'Count']}
                    labelFormatter={(label) => `Method: ${label}`}
                  />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No authentication method data available</p>
                </div>
              </div>
            )}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
              <p><strong>Debug Info:</strong></p>
              <p>authMethodDistribution length: {authMethodDistribution.length}</p>
              <p>authMethodLoading: {authMethodLoading.toString()}</p>
              <p>dateRange: {JSON.stringify(dateRange)}</p>
              <p>authMethodDistribution data: {JSON.stringify(authMethodDistribution)}</p>
            </div>
          </div>
        </div> */}
      </div>

      {/* Detailed Monthly Breakdown */}
      <div className="card">
        <div className="card-header">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-indigo-600" />
              Monthly Attendance Report
            </h3>
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 self-start sm:self-auto">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Period</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {new Date(2024, i, 1).toLocaleDateString("en-US", {
                      month: "long",
                    })}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i} value={2020 + i}>
                    {2020 + i}
                  </option>
                ))}
              </select>
              {/* Removed manual Load button as data auto-loads on change */}
            </div>
          </div>

          {/* View Toggle Tabs */}
          <div className="flex border-b border-gray-200 mt-4">
            <button
              onClick={() => setViewType("calendar")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewType === "calendar"
                  ? "border-blue-500 text-blue-600 bg-blue-50"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
            >
              <Calendar className="w-4 h-4 inline mr-1" />
              Calendar View
            </button>
            <button
              onClick={() => setViewType("textual")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewType === "textual"
                  ? "border-blue-500 text-blue-600 bg-blue-50"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
            >
              <BarChart3 className="w-4 h-4 inline mr-1" />
              List View
            </button>
          </div>
        </div>
        <div className="card-body">
          {detailedMonthlyData.length > 0 ? (
            <div className="space-y-4">
              {/* Month Summary Header */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
                <div className="grid grid-cols-6 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {
                        detailedMonthlyData.filter(
                          (d) => getDayStatus(d) === "Full Day"
                        ).length
                      }
                    </div>
                    <div className="text-sm text-gray-600">Full Days</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-orange-600">
                      {
                        detailedMonthlyData.filter(
                          (d) => getDayStatus(d) === "Late"
                        ).length
                      }
                    </div>
                    <div className="text-sm text-gray-600">Late</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {
                        detailedMonthlyData.filter(
                          (d) => d.status === "Half Day"
                        ).length
                      }
                    </div>
                    <div className="text-sm text-gray-600">Half Days</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">
                      {
                        detailedMonthlyData.filter(
                          (d) => d.status === "Partial"
                        ).length
                      }
                    </div>
                    <div className="text-sm text-gray-600">Partial</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">
                      {
                        detailedMonthlyData.filter((d) => d.status === "Absent")
                          .length
                      }
                    </div>
                    <div className="text-sm text-gray-600">Absent</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-600">
                      {getMonthWeekendsCount(selectedYear, selectedMonth)}
                    </div>
                    <div className="text-sm text-gray-600">Weekends</div>
                  </div>
                </div>
              </div>

              {/* Calendar View */}
              {viewType === "calendar" && (
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                  {/* Calendar Header */}
                  <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-2xl font-bold">
                          {new Date(
                            selectedYear,
                            selectedMonth
                          ).toLocaleDateString("en-US", {
                            month: "long",
                          })}
                        </h4>
                        <p className="text-indigo-100 text-lg">
                          {selectedYear}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold">
                          {detailedMonthlyData.filter((d) => getDayStatus(d) !== "Weekend" && getDayStatus(d) !== "Absent").length}
                        </div>
                        <div className="text-indigo-100 text-sm">
                          Days Present
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6">
                    {/* Days of Week Header */}
                    <div className="grid grid-cols-7 gap-2 mb-4">
                      {[
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ].map((day) => (
                        <div
                          key={day}
                          className="text-center py-3 text-sm font-semibold text-gray-600 bg-gray-50 rounded-lg"
                        >
                          {day.slice(0, 3)}
                        </div>
                      ))}
                    </div>

                    {/* Calendar Days Grid */}
                    <div className="grid grid-cols-7 gap-2">
                      {(() => {
                        // Filter holidays for the selected month and year
                        // done by mukesh sinha
                        const holidayMonthWise = Object.entries(
                          aicteHolidays2025
                        )
                          .map(([date, name]) => ({
                            date,
                            name,
                            dateObj: new Date(date),
                          }))
                          .filter(
                            (holiday) =>
                              holiday.dateObj.getMonth() === selectedMonth &&
                              holiday.dateObj.getFullYear() === selectedYear
                          );

                        //console.log("HolidayName", HolidayName);
                        const firstDay = new Date(
                          selectedYear,
                          selectedMonth,
                          1
                        ).getDay();
                        const daysInMonth = new Date(
                          selectedYear,
                          selectedMonth + 1,
                          0
                        ).getDate();
                        const today = new Date();
                        // Build a quick lookup for holidays in this month
                        const holidaySet = new Set(holidayMonthWise.map((h) => h.date));

                        // Helper to check if a given date (Y, M, D) is a working day
                        const isWorkingDay = (year, month, day) => {
                          const date = new Date(year, month, day);
                          const dow = date.getDay(); // 0=Sun .. 6=Sat
                          const dateKey = formatDateYMD(year, month, day);
                          const isWeekendDay = dow === 0 || (dow === 6 && !user?.saturdayIsWorking);
                          const isHoliday = holidaySet.has(dateKey);
                          if (isWeekendDay) return false;
                          if (isHoliday) return false;
                          return true;
                        };

                        // Determine the last working day in the selected month
                        let lastWorkingDay = null;
                        for (let d = daysInMonth; d >= 1; d--) {
                          if (isWorkingDay(selectedYear, selectedMonth, d)) {
                            lastWorkingDay = d;
                            break;
                          }
                        }
                        const days = [];

                        // Empty cells for days before month starts
                        for (let i = 0; i < firstDay; i++) {
                          days.push(
                            <div
                              key={`empty-${i}`}
                              className="h-28 rounded-lg bg-gray-50 opacity-50"
                            ></div>
                          );
                        }

                        // Days of the month
                        for (let day = 1; day <= daysInMonth; day++) {
                          // Inside your calendar day rendering loop

                          // fetch holiday for the day if exists
                          // Format date as YYYY-MM-DD for comparison
                          // @ done by mukesh sinha
                          const dateKey = formatDateYMD(
                            selectedYear,
                            selectedMonth,
                            day
                          );
                          const holiday = holidayMonthWise.find(
                            (h) => h.date === dateKey
                          );

                          // Match by the FULL date string, not just the bare
                          // day-of-month number -- matching on `.day` alone
                          // let a wrong-month entry (e.g. June 30) get shown
                          // under a same-numbered day in a different month
                          // (July 30) if the fetched range ever spans two
                          // months. Falls back to day-only for older payloads
                          // that don't carry `date`.
                          const dayData = detailedMonthlyData.find((d) => (d.date ? d.date === dateKey : d.day === day));
                          const safeDayData = dayData || { day };
                          const hasAnyRecord = !!(dayData && (
                            (Array.isArray(dayData.details) && dayData.details.length > 0) ||
                            (typeof dayData.totalRecords === 'number' && dayData.totalRecords > 0) ||
                            (typeof dayData.status === 'string' && dayData.status.length > 0)
                          ));

                          const baseStatus = getDayStatus(safeDayData);
                          const isWorking = isWorkingDay(selectedYear, selectedMonth, day);
                          let actualStatus = baseStatus;
                          if (!dayData && !holiday) {
                            const dateObj = new Date(selectedYear, selectedMonth, day);
                            const todayMid = new Date();
                            todayMid.setHours(0, 0, 0, 0);
                            const dateMid = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
                            const isPast = dateMid < todayMid;
                            if (isPast && isWorking) {
                              actualStatus = "Absent";
                            }
                          }
                          const isToday =
                            today.getDate() === day &&
                            today.getMonth() === selectedMonth &&
                            today.getFullYear() === selectedYear;

                          // --- Get earliest Check In and latest Check Out ---
                          let checkInTime = null;
                          let checkOutTime = null;

                          if (dayData?.details?.length > 0) {
                            const checkInDetails = dayData.details.filter((d) =>
                              d.action.toLowerCase().includes("check in")
                            );
                            const checkOutDetails = dayData.details.filter(
                              (d) =>
                                d.action.toLowerCase().includes("check out")
                            );

                            // Earliest Check In
                            if (checkInDetails.length > 0) {
                              checkInTime = checkInDetails.reduce(
                                (earliest, d) => {
                                  const [h, m] = d.time.split(":").map(Number);
                                  const minutes = h * 60 + m;
                                  if (!earliest || minutes < earliest.minutes) {
                                    return { time: d.time, minutes };
                                  }
                                  return earliest;
                                },
                                null
                              ).time;
                            }

                            // Latest Check Out
                            // Latest Check Out
                            if (checkOutDetails.length > 0) {
                              // Try to find "Check Out (Last)" first
                              const lastCheckout = checkOutDetails.find((d) =>
                                d.action.toLowerCase().includes("last")
                              );
                              if (lastCheckout) {
                                checkOutTime = lastCheckout.time;
                              } else {
                                // Fallback to latest by time
                                checkOutTime = checkOutDetails.reduce(
                                  (latest, d) => {
                                    const [h, m] = d.time
                                      .split(":")
                                      .map(Number);
                                    const minutes = h * 60 + m;
                                    if (!latest || minutes > latest.minutes) {
                                      return { time: d.time, minutes };
                                    }
                                    return latest;
                                  },
                                  null
                                ).time;
                              }
                            }
                          }

                          const isLastWorkingDay = lastWorkingDay === day;
                          const onlyCheckedIn = !!checkInTime && !checkOutTime;
                          
                          const isWeekendNoAttendance = getDayStatus(safeDayData) === "Weekend" && !checkInTime && (!dayData?.details || !dayData.details.some(d => d.action && d.action.toLowerCase().includes('check in')));
                          const showTimings = actualStatus !== "Absent" && !isWeekendNoAttendance && !holiday;
                          const displayCheckIn = checkInTime;
                          const displayCheckOut = checkOutTime || (actualStatus === "Full Day" || onlyCheckedIn ? "—" : null);
                          const isLate = actualStatus === "Late" || actualStatus === "Late Partial" || isLateCheckIn(displayCheckIn);

                          days.push(
                            <div
                              key={day}
                              className={`h-28 rounded-lg border border-gray-200 dark:border-gray-800 border-l-4 transition-all duration-200 hover:scale-105 hover:shadow-lg cursor-pointer relative overflow-hidden
                                ${isToday
                                  ? "ring-4 ring-blue-400 ring-opacity-50"
                                  : ""
                                }
                                ${holiday
                                  ? "bg-teal-100 border-l-teal-600 shadow-teal-100"
                                  : actualStatus === "Full Day"
                                    ? "bg-gradient-to-br from-green-200 to-green-300 border-l-green-500 hover:from-green-300 hover:to-green-400 shadow-green-100"
                                    : actualStatus === "Late"
                                      ? "bg-gradient-to-br from-yellow-200 to-orange-300 border-l-orange-500 hover:from-yellow-300 hover:to-orange-400 shadow-orange-100"
                                      : actualStatus === "Late Partial"
                                        ? "bg-gradient-to-br from-purple-200 to-purple-300 border-l-purple-500 hover:from-purple-300 hover:to-purple-400 shadow-purple-100"
                                        : dayData?.status === "Half Day"
                                          ? "bg-gradient-to-br from-yellow-100 to-yellow-200 border-l-yellow-500 hover:from-yellow-200 hover:to-yellow-300"
                                          : dayData?.status === "Partial"
                                            ? "bg-gradient-to-br from-purple-100 to-purple-200 border-l-purple-400 hover:from-purple-200 hover:to-purple-300"
                                            : actualStatus === "Absent"
                                              ? "bg-gradient-to-br from-red-100 to-red-200 border-l-red-500 hover:from-red-200 hover:to-red-300"
                                              : getDayStatus(safeDayData) === "Weekend" &&
                                                user?.saturdayIsWorking &&
                                                new Date(selectedYear, selectedMonth, day).getDay() === 6
                                                ? "bg-gradient-to-br from-yellow-100 to-yellow-200 border-l-yellow-500"
                                                : getDayStatus(safeDayData) === "Weekend"
                                                  ? "bg-gradient-to-br from-gray-100 to-gray-200 border-l-gray-400"
                                                  : "bg-gradient-to-br from-white to-gray-50 border-l-gray-300 hover:from-gray-50 hover:to-gray-100"
                                }`}
                              onClick={() =>
                                handleAddNote(
                                  formatDateYMD(
                                    selectedYear,
                                    selectedMonth,
                                    day
                                  )
                                )
                              }
                            >
                              {/* Day Number */}
                              <div className="p-2">
                                <div
                                  className={`text-lg font-bold ${isToday
                                      ? "text-blue-600"
                                      : actualStatus === "Full Day"
                                        ? "text-green-800"
                                        : actualStatus === "Late"
                                          ? "text-orange-800"
                                          : actualStatus === "Late Partial"
                                            ? "text-purple-800"
                                            : dayData?.status === "Partial"
                                              ? "text-purple-800"
                                              : "text-gray-800"
                                    }`}
                                >
                                  {day}
                                </div>
                                {/* Holiday Name: Only show if not Saturday when saturdayIsWorking is true */}
                                {holiday &&
                                  !(
                                    user?.saturdayIsWorking &&
                                    new Date(selectedYear, selectedMonth, day).getDay() === 6
                                  ) && (
                                    <div className="text-xs text-teal-900 font-semibold mt-1">
                                      {holiday.name}
                                    </div>
                                  )}



                                {/* LWD Ribbon: show only if records exist, not absent, not weekend */}
                                {isLastWorkingDay && hasAnyRecord && !holiday && actualStatus !== "Absent" && getDayStatus(safeDayData) !== "Weekend" && (
                                  <div className="absolute top-0 left-0 px-2 py-0.5 text-[10px] font-semibold bg-teal-600 text-white rounded-br">
                                    Last Working Day
                                  </div>
                                )}

                                {/* Time Information */}
                                 {showTimings ? (
                                    <div className="mt-1 space-y-1.5">
                                      {displayCheckIn && (
                                        <div className="flex items-center gap-2">
                                          <div className="shrink-0 hover:scale-110 transition-all duration-300">
                                            <LogIn className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                          </div>
                                          <div className="flex flex-col leading-none">
                                            <span className={`text-[13px] font-extrabold tracking-tight ${isLate ? 'text-orange-600 dark:text-orange-500' : 'text-slate-800 dark:text-slate-200'}`}>
                                              {displayCheckIn}
                                            </span>
                                            {isLate && (
                                              <span className="text-[9px] font-bold text-orange-600 dark:text-orange-500 mt-0.5">Late</span>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                      {displayCheckOut && (
                                        <div className="flex items-center gap-2">
                                          <div className="shrink-0 hover:scale-110 transition-all duration-300">
                                            <LogOut className="w-5 h-5 text-rose-600 dark:text-rose-400" style={{ transform: 'scaleX(-1)' }} />
                                          </div>
                                          <div className="flex flex-col leading-none">
                                            <span className="text-[13px] font-extrabold tracking-tight text-slate-800 dark:text-slate-200">
                                              {displayCheckOut}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                     {actualStatus === "Late Partial" && (
                                       <div className="text-xs text-purple-600 font-medium">
                                         Late + Partial
                                       </div>
                                     )}
                                     {dayData?.status === "Partial" &&
                                       actualStatus !== "Late Partial" && (
                                         <div className="text-xs text-purple-600 font-medium">
                                           Partial
                                         </div>
                                       )}
                                   </div>
                                 ) : (
                                   <>
                                     {/* Weekend label: Only show 'Holiday' if not Saturday when saturdayIsWorking is true */}
                                     {getDayStatus(safeDayData) === "Weekend" &&
                                       !(
                                         user?.saturdayIsWorking &&
                                         new Date(selectedYear, selectedMonth, day).getDay() === 6
                                       ) && (
                                         <div className="text-xs text-gray-600 font-medium">
                                           Weekend
                                         </div>
                                       )}
                                     {/* Only show Absent if NOT a holiday */}
                                     {actualStatus === "Absent" &&
                                       getDayStatus(safeDayData) !== "Weekend" &&
                                       !holiday && (
                                         <div className="text-xs text-red-600 font-medium">
                                           Absent
                                         </div>
                                       )}
                                   </>
                                 )}

                                  {/* Note indicator */}
                                  {(() => {
                                    const dateKey = formatDateYMD(
                                      selectedYear,
                                      selectedMonth,
                                      day
                                    );
                                    const hasNote = notes[dateKey];
                                    console.log(
                                      `Day ${day}, dateKey: ${dateKey}, hasNote:`,
                                      hasNote
                                    ); // Debug log
                                    return hasNote ? (
                                      <div className="flex items-center text-xs text-blue-600">
                                        <div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
                                        <span className="font-medium">
                                          Note
                                        </span>
                                      </div>
                                    ) : null;
                                  })()}
                                </div>

                              {/* Today Indicator */}
                              {isToday && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
                              )}
                            </div>
                          );
                        }

                        return days;
                      })()}
                    </div>

                    {/* Legend */}
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-green-600 rounded"></div>
                          <span className="text-gray-600">
                            Present (Full Day)
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-orange-500 rounded"></div>
                          <span className="text-gray-600">
                            Late (After 9:31 AM)
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-yellow-600 rounded"></div>
                          <span className="text-gray-600">Half Day</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-purple-500 rounded"></div>
                          <span className="text-gray-600">
                            Partial (&lt; 4 hours)
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-red-500 rounded"></div>
                          <span className="text-gray-600">Absent</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-gray-500 rounded"></div>
                          <span className="text-gray-600">Weekend (Sunday)</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-blue-500 rounded"></div>
                          <span className="text-gray-600">Has Note</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-teal-500 rounded"></div>
                          <span className="text-gray-600">Public Holiday</span>
                        </div>
                        <div className="text-gray-400 text-xs ml-4">
                          Click any day to add/edit notes
                        </div>
                      </div>

                      {/* Biometric Methods Legend */}
                      {/* <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs">
                        <span className="text-gray-500">
                          Biometric Methods:
                        </span>
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                          <span className="text-gray-600">Face</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                          <span className="text-gray-600">Voice</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                          <span className="text-gray-600">Palm</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
                          <span className="text-gray-600">Iris</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-orange-600 rounded-full"></div>
                          <span className="text-gray-600">Thumb</span>
                        </div>
                      </div> */}
                    </div>
                  </div>
                </div>
              )}

              {/* Textual/List View */}
              {viewType === "textual" && (
                <div className="space-y-2">
                  {detailedMonthlyData.map((day, index) => {
                    const actualStatus = getDayStatus(day);
                    return (
                      <div
                        key={index}
                        className={`border-l-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 ${actualStatus === "Full Day"
                            ? "border-green-400"
                            : actualStatus === "Late"
                              ? "border-orange-400"
                              : actualStatus === "Late Partial"
                                ? "border-purple-500"
                                : day.status === "Half Day"
                                  ? "border-yellow-400"
                                  : day.status === "Partial"
                                    ? "border-purple-400"
                                    : day.status === "Absent"
                                      ? "border-red-400"
                                      : day.status === "Weekend"
                                        ? "border-gray-400"
                                        : "border-blue-400"
                          }`}
                      >
                        <div className="p-4">
                          {/* Day Header */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-4">
                              <div className="flex items-center space-x-2">
                                <div className="text-2xl font-bold text-gray-800">
                                  {day.day.toString().padStart(2, "0")}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-700">
                                    {day.monthName} {selectedYear} (
                                    {day.dayName})
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {day.status === "Weekend"
                                      ? "Government Holiday"
                                      : `${day.totalRecords} record(s)`}
                                  </div>
                                </div>
                              </div>

                              <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold text-white shadow-sm ${actualStatus === "Full Day"
                                    ? "bg-green-500"
                                    : actualStatus === "Late"
                                      ? "bg-orange-500"
                                      : actualStatus === "Late Partial"
                                        ? "bg-purple-600"
                                        : day.status === "Half Day"
                                          ? "bg-yellow-500"
                                          : day.status === "Partial"
                                            ? "bg-purple-500"
                                            : day.status === "Absent"
                                              ? "bg-red-500"
                                              : day.status === "Weekend"
                                                ? "bg-gray-500"
                                                : "bg-blue-500"
                                  }`}
                              >
                                {actualStatus}
                              </span>
                            </div>

                            {day.checkIns > 0 && (
                              <div className="text-right text-sm text-gray-600">
                                {day.checkIns} In • {day.checkOuts} Out
                              </div>
                            )}
                          </div>

                          {/* Quick status for only check-in days */}
                          {(() => {
                            const hasCheckInOnly = (day?.checkIns || 0) > 0 && (day?.checkOuts || 0) === 0;
                            if (!hasCheckInOnly) return null;
                            // infer earliest check-in time
                            let earliest = null;
                            (day?.details || []).forEach(d => {
                              if ((d?.action || '').toLowerCase().includes('check in') && d?.time) {
                                const [h, m] = d.time.split(':').map(Number);
                                const minutes = h * 60 + m;
                                if (!earliest || minutes < earliest.minutes) earliest = { time: d.time, minutes };
                              }
                            });
                            const late = earliest ? (earliest.minutes > (9 * 60 + 30)) : false;
                            return (
                              <div className={`text-xs mb-2 ${late ? 'text-orange-600' : 'text-gray-600'}`}>
                                {late ? 'Late Check-in' : 'Checked-in'}
                              </div>
                            );
                          })()}

                          {/* Activity Timeline */}
                          {day.details && day.details.length > 0 && (
                            <div className="space-y-2 pl-4 border-l-2 border-gray-200">
                              {day.details.map((detail, detailIndex) => (
                                <div
                                  key={detailIndex}
                                  className="flex items-center space-x-3"
                                >
                                  <div className="flex items-center space-x-2">
                                    {detail.icon === "ArrowRight" ? (
                                      <CheckCircle className="w-4 h-4 text-green-600" />
                                    ) : detail.icon === "ArrowLeft" ? (
                                      <Clock className="w-4 h-4 text-orange-600" />
                                    ) : detail.icon === "Calendar" ? (
                                      <Calendar className="w-4 h-4 text-gray-500" />
                                    ) : (
                                      <XCircle className="w-4 h-4 text-red-500" />
                                    )}
                                  </div>

                                  <div className="font-mono text-sm font-bold text-gray-800 bg-gray-100 px-2 py-1 rounded">
                                    {detail.time}
                                  </div>

                                  <div className="text-sm text-gray-700">
                                    {detail.action}
                                  </div>

                                  <span className="text-xs px-2 py-1 rounded-full font-medium bg-blue-100 text-blue-700">
                                    Face
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Weekend indicator in list view */}
                          {getDayStatus(day) === 'Weekend' && (
                            <div className="mt-2 text-xs text-gray-600">Weekend</div>
                          )}

                          {/* Note Display and Add Button */}
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            {notes[day.date] ? (
                              <div className="bg-blue-50 p-3 rounded-lg">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center text-blue-700 text-sm font-medium mb-1">
                                      <User className="w-4 h-4 mr-1" />
                                      Note:
                                    </div>
                                    <p className="text-gray-700 text-sm">
                                      {notes[day.date]}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleAddNote(day.date)}
                                    className="ml-2 text-blue-600 hover:text-blue-800 text-xs"
                                  >
                                    Edit
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddNote(day.date)}
                                className="w-full text-left text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                              >
                                + Add note for this day
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <div className="text-lg font-medium text-gray-500 mb-2">
                No Monthly Data Selected
              </div>
              <div className="text-sm text-gray-400">
                Select a month and year to view detailed attendance report
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Attendance Table */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center justify-between w-full">
            <h3 className="text-lg font-medium text-gray-900">
              Detailed Attendance Records
            </h3>
            <div className="relative">
              <input
                type="text"
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                placeholder="Search records (date, status, method, etc.)"
                className="input"
              />
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="overflow-x-auto">
            <table className="table">
              <thead className="table-header">
                <tr>
                  <th className="table-header-cell">Date</th>
                  <th className="table-header-cell">Day</th>
                  <th className="table-header-cell">Check-in</th>
                  <th className="table-header-cell">Check-out</th>
                  <th className="table-header-cell">Total Hours</th>
                  <th className="table-header-cell">Status</th>
                  <th className="table-header-cell">Method</th>
                </tr>
              </thead>
              <tbody className="table-body">
                {filteredAttendanceRecords.map((record) => (
                  <tr key={record.date}>
                    <td className="table-cell">{record.date}</td>
                    <td className="table-cell">{record.dayOfWeek}</td>
                    <td className="table-cell">{record.checkIn || "—"}</td>
                    <td className="table-cell">{record.checkOut || "—"}</td>
                    <td className="table-cell">{record.totalHours || "—"}</td>
                    <td className="table-cell">
                      {(() => {
                        const statusInfo = getAttendanceStatus(record);
                        return (
                          <span className={`badge ${statusInfo.color}`}>
                            {statusInfo.status}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="table-cell">
                      <span className="badge badge-secondary">
                        {record.checkIn || record.authMethod ? "Face" : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Add Note for{" "}
                {selectedDate &&
                  new Date(selectedDate).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
              </h3>
              <button
                onClick={() => setShowNoteModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Enter note for this date..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                rows="4"
                maxLength="500"
              />
              <div className="text-right text-xs text-gray-500 mt-1">
                {noteText.length}/500 characters
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowNoteModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNote}
                disabled={!noteText.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentReport;
