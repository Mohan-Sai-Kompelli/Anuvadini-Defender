import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Calendar, Download, Loader2, Search, ArrowLeft } from 'lucide-react';
import { downloadCsv } from '../lib/csvExport';

const PARTICLES = Array.from({ length: 20 }).map((_, i) => ({
  w: 1 + (i % 3) * 0.8,
  l: `${(i * 53) % 100}%`,
  t: `${(i * 71) % 100}%`,
  dur: `${5 + (i % 5)}s`,
  delay: `${(i * 0.15) % 3}s`,
}));

const AllStudentsDetails = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [statsByStudent, setStatsByStudent] = useState({});
  const [detailedRecordsByStudent, setDetailedRecordsByStudent] = useState({});
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState('month'); // 'month' or 'date'
  const [search, setSearch] = useState('');

  const formatDateYMD = (year, month, day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const getLastDayOfMonth = (year, month) => new Date(year, month + 1, 0).getDate();

  const dateRange = useMemo(() => {
    if (viewMode === 'date') {
      return { startDate: selectedDate, endDate: selectedDate };
    } else {
      const startDate = formatDateYMD(selectedYear, selectedMonth, 1);
      const endDate = formatDateYMD(selectedYear, selectedMonth, getLastDayOfMonth(selectedYear, selectedMonth));
      return { startDate, endDate };
    }
  }, [selectedMonth, selectedYear, selectedDate, viewMode]);

  useEffect(() => {
    const loadStudents = async () => {
      setLoadingStudents(true);
      setError(null);
      try {
        const res = await axios.get('/api/students', { params: { limit: 10000 } });
        setStudents(res.data.students || []);
      } catch (e) {
        console.error(e);
        setError('Failed to load students');
        toast.error('Failed to load students');
      } finally {
        setLoadingStudents(false);
      }
    };
    loadStudents();
  }, []);

  useEffect(() => {
    const fetchStatsInBatches = async () => {
      if (!students.length) return;
      setLoadingStats(true);
      setStatsByStudent({});
      setDetailedRecordsByStudent({});
      try {
        const batchSize = 10;
        for (let i = 0; i < students.length; i += batchSize) {
          const batch = students.slice(i, i + batchSize);
          const results = await Promise.allSettled(
            batch.map((s) => axios.get(`/api/attendance/student-report/${s._id}`, { params: dateRange }))
          );
          const updated = {};
          const detailedUpdated = {};
          results.forEach((res, idx) => {
            const student = batch[idx];
            if (res.status === 'fulfilled') {
              const data = res.value.data;
              updated[student._id] = {
                presentDays: data?.stats?.presentDays ?? 0,
                workingDays: data?.stats?.workingDays ?? 0,
                attendanceRate: data?.stats?.attendanceRate ?? 0,
                avgCheckInTime: data?.stats?.avgCheckInTime ?? 'N/A',
                avgCheckOutTime: data?.stats?.avgCheckOutTime ?? 'N/A',
                totalHours: data?.stats?.totalHours ?? 0,
                totalInOut: data?.stats?.totalInOut ?? 0,
                totalInCount: data?.stats?.totalInCount ?? 0,
                totalOutCount: data?.stats?.totalOutCount ?? 0,
                leavesTaken: data?.stats?.leavesTaken ?? 0,
                unknownLeaves: data?.stats?.unknownLeaves ?? 0
              };
              detailedUpdated[student._id] = data?.attendanceRecords ?? [];
            } else {
              updated[student._id] = {
                presentDays: 0,
                workingDays: 0,
                attendanceRate: 0,
                avgCheckInTime: 'N/A',
                avgCheckOutTime: 'N/A',
                totalHours: 0,
                totalInOut: 0,
                totalInCount: 0,
                totalOutCount: 0,
                leavesTaken: 0,
                unknownLeaves: 0
              };
              detailedUpdated[student._id] = [];
            }
          });
          setStatsByStudent(prev => ({ ...prev, ...updated }));
          setDetailedRecordsByStudent(prev => ({ ...prev, ...detailedUpdated }));
        }
      } catch (e) {
        console.error(e);
        toast.error('Failed to load attendance stats');
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStatsInBatches();
  }, [students, dateRange]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;
    return students.filter(s =>
      s.fullName?.toLowerCase().includes(query) ||
      s.uid?.toLowerCase().includes(query)
    );
  }, [students, search]);

  const handleExportCsv = () => {
    if (!filteredStudents.length) {
      toast.error('No students to export');
      return;
    }
    if (loadingStats) {
      toast.error('Attendance stats are still loading — please wait a moment');
      return;
    }
    const columns = [
      { label: 'Name', get: (r) => r.fullName },
      { label: 'UID', get: (r) => r.uid },
      { label: 'Present Days', get: (r) => statsByStudent[r._id]?.presentDays ?? 0 },
      { label: 'Working Days', get: (r) => statsByStudent[r._id]?.workingDays ?? 0 },
      { label: 'Attendance Rate (%)', get: (r) => statsByStudent[r._id]?.attendanceRate ?? 0 },
      { label: 'Avg Check-In', get: (r) => statsByStudent[r._id]?.avgCheckInTime ?? 'N/A' },
      { label: 'Avg Check-Out', get: (r) => statsByStudent[r._id]?.avgCheckOutTime ?? 'N/A' },
      { label: 'Total Hours', get: (r) => statsByStudent[r._id]?.totalHours ?? 0 },
      { label: 'Total In/Out Events', get: (r) => statsByStudent[r._id]?.totalInOut ?? 0 },
      { label: 'Leaves Taken', get: (r) => statsByStudent[r._id]?.leavesTaken ?? 0 },
    ];
    const rangeLabel = viewMode === 'date'
      ? selectedDate
      : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    downloadCsv(`attendance-report-${rangeLabel}.csv`, filteredStudents, columns);
    toast.success('Report downloaded');
  };

  // Function to get missing checkout dates for a student
  const getMissingCheckoutDates = (studentId) => {
    const records = detailedRecordsByStudent[studentId] || [];
    return records
      .filter(record => record.checkIn && !record.checkOut)
      .map(record => record.date);
  };

  // Tooltip component for showing missing checkout dates
  const MissingCheckoutTooltip = ({ studentId, children }) => {
    const missingDates = getMissingCheckoutDates(studentId);
    const stats = statsByStudent[studentId] || {};
    const hasMismatch = stats.totalInCount !== stats.totalOutCount;
    
    if (!hasMismatch || missingDates.length === 0) {
      return children;
    }

    return (
      <div className="relative group">
        {children}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 max-w-xs">
          <div className="font-semibold mb-1 text-yellow-300">Missing Checkouts:</div>
          <div className="text-xs space-y-1">
            {missingDates.slice(0, 5).map((date, idx) => (
              <div key={idx} className="text-gray-200">{date}</div>
            ))}
            {missingDates.length > 5 && (
              <div className="text-gray-400 italic">...and {missingDates.length - 5} more</div>
            )}
          </div>
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Top Banner Card */}
      <div 
        className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 p-8 text-white shadow-xl shadow-emerald-600/10 animate-fade-in"
        style={{
          background: 'linear-gradient(135deg, #0B1220 0%, #101827 35%, #315CE8 65%, #0B1220 100%)'
        }}
      >
        {/* Atmospheric glows */}
        <div className="absolute -top-16 left-1/3 w-72 h-72 rounded-full pointer-events-none atmo-glow-gold opacity-60" />
        <div className="absolute -bottom-16 right-1/4 w-72 h-72 rounded-full pointer-events-none atmo-glow-cyan opacity-50" />

        {/* Animated light particles */}
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white pointer-events-none"
            style={{
              width: p.w, height: p.w,
              left: p.l, top: p.t,
              boxShadow: '0 0 6px rgba(255,255,255,0.6)',
              opacity: 0.4,
              animation: `floatY ${p.dur} ease-in-out infinite`,
              animationDelay: p.delay,
            }}
          />
        ))}

        {/* Chrome scan line */}
        <div className="chrome-scan" />
        
        <div className="relative flex flex-col xl:flex-row justify-between items-center gap-6">
          <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
            <button 
              onClick={() => navigate('/students')} 
              className="flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 p-3 hover:bg-white/20 transition-all text-white hover:scale-105"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                Detailed Attendance Reports
              </h1>
              <p className="mt-1 text-emerald-100/90 text-sm font-medium">
                {viewMode === 'month' 
                  ? 'Overview of presence/absent and average timings for the selected month'
                  : 'Overview of presence/absent and timings for the selected date'
                }
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-3 shrink-0">
            {/* View Mode Toggle */}
            <div className="flex bg-white/10 backdrop-blur-sm rounded-2xl p-1 border border-white/10">
              <button
                onClick={() => setViewMode('month')}
                className={`px-4 py-2 text-sm font-extrabold rounded-xl transition-all ${
                  viewMode === 'month' 
                    ? 'bg-white text-emerald-700 shadow-md scale-100' 
                    : 'text-white hover:bg-white/15'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setViewMode('date')}
                className={`px-4 py-2 text-sm font-extrabold rounded-xl transition-all ${
                  viewMode === 'date' 
                    ? 'bg-white text-emerald-700 shadow-md scale-100' 
                    : 'text-white hover:bg-white/15'
                }`}
              >
                Date
              </button>
            </div>
            
            {/* Date/Month Picker */}
            <div>
              {viewMode === 'month' ? (
                <input
                  type="month"
                  value={`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split('-').map(Number);
                    setSelectedYear(y);
                    setSelectedMonth(m - 1);
                  }}
                  className="w-full sm:w-auto rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white outline-none backdrop-blur-sm focus:border-white focus:ring-2 focus:ring-white/10"
                />
              ) : (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full sm:w-auto rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white outline-none backdrop-blur-sm focus:border-white focus:ring-2 focus:ring-white/10"
                />
              )}
            </div>

            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-sm font-extrabold text-emerald-700 shadow-lg hover:bg-slate-50 transition-all hover:scale-[1.02]"
            >
              <Download className="h-4.5 w-4.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Shine sweep */}
        <span className="shine-overlay-anuvadini rounded-3xl" />
      </div>

      {/* Styled Search Card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-slate-900 p-6 shadow-elevation-1">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search faculty/staff by name or UID..."
              className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/20 pl-11 pr-4 py-3 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          
          <div className="flex items-center">
            {(loadingStudents || loadingStats) ? (
              <div className="inline-flex items-center gap-2 rounded-xl bg-amber-50/50 border border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30 px-4 py-2.5 text-xs font-bold text-amber-700 dark:text-amber-400 animate-pulse">
                <Loader2 className="h-4.5 w-4.5 animate-spin text-amber-500" />
                Updating attendance records in batches...
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50/50 border border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/30 px-4 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                All Records Synced
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-sm font-semibold text-rose-600 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400">
          ⚠️ {error}
        </div>
      )}

      {/* Main Table Card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-slate-900 shadow-elevation-1">
        <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 px-6 py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <h3 className="text-base font-bold text-slate-850 dark:text-slate-200 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              {viewMode === 'month' 
                ? new Date(selectedYear, selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : new Date(selectedDate).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })
              }
            </h3>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Showing {filteredStudents.length} of {students.length} staff logs
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 dark:bg-slate-900/50 dark:border-slate-800">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Faculty/Staff</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">UID</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Present</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Absent</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Total In/Out</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Total In's</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Total Out's</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Leaves</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Unkn Leaves</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-center font-semibold">Attendance</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-450 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
              {filteredStudents.map((s) => {
                const st = statsByStudent[s._id] || {};
                const present = st.presentDays ?? 0;
                const working = st.workingDays ?? 0;
                const absent = Math.max(working - present, 0);
                const rate = st.attendanceRate ?? 0;
                return (
                  <tr key={s._id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center font-bold text-emerald-750 dark:text-emerald-400">
                          {s.fullName?.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4 min-w-0">
                          <button 
                            onClick={() => navigate(`/student-report/${s._id}`)}
                            className="text-sm font-bold text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-450 text-left truncate block"
                          >
                            {s.fullName}
                          </button>
                          <p className="text-xs text-slate-450 dark:text-slate-400 truncate mt-0.5">
                            {s.class || s.department || s.bureau || '-'}
                          </p>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-200">
                      {s.uid}
                    </td>
                    
                    <td className="px-6 py-4 text-center font-semibold text-emerald-700 dark:text-emerald-400">
                      {present}
                    </td>
                    
                    <td className="px-6 py-4 text-center font-semibold text-rose-600 dark:text-rose-400">
                      {absent}
                    </td>
                    
                    <td className="px-6 py-4 text-center font-semibold text-slate-705 dark:text-slate-300">
                      {st.totalInOut ?? 0}
                    </td>
                    
                    <td className="px-6 py-4 text-center font-semibold text-slate-705 dark:text-slate-300">
                      {st.totalInCount ?? 0}
                    </td>
                    
                    <td className="px-6 py-4 text-center">
                      <MissingCheckoutTooltip studentId={s._id}>
                        <div className="inline-flex items-center gap-1 justify-center">
                          <span className={`font-semibold ${st.totalInCount !== st.totalOutCount ? 'text-amber-600 dark:text-amber-500 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                            {st.totalOutCount ?? 0}
                          </span>
                          {st.totalInCount !== st.totalOutCount && (
                            <span className="text-amber-500 text-xs animate-bounce" title="Mismatch detected">⚠️</span>
                          )}
                        </div>
                      </MissingCheckoutTooltip>
                    </td>
                    
                    <td className="px-6 py-4 text-center font-semibold text-slate-705 dark:text-slate-300">
                      {st.leavesTaken ?? 0}
                    </td>
                    
                    <td className="px-6 py-4 text-center font-semibold text-slate-705 dark:text-slate-300">
                      {st.unknownLeaves ?? 0}
                    </td>
                    
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-xl text-xs font-bold border ${
                        rate >= 75 
                          ? 'bg-emerald-50 text-emerald-750 border-emerald-200/60 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30'
                          : rate >= 50
                          ? 'bg-amber-50 text-amber-750 border-amber-200/60 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30'
                          : 'bg-rose-50 text-rose-750 border-rose-200/60 dark:bg-rose-950/20 dark:text-rose-450 dark:border-rose-900/30'
                      }`}>
                        {rate}%
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 text-right">
                      <button
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition-all cursor-pointer"
                        onClick={() => navigate(`/student-report/${s._id}`)}
                      >
                        View Report
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AllStudentsDetails;
