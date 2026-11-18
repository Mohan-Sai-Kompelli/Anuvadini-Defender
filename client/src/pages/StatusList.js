import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Search, ArrowLeft, Calendar, Users, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import ScrollReveal from '../components/ScrollReveal';

const StatusList = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const status = (params.get('status') || 'present').toLowerCase();
  const date = params.get('date') || new Date().toISOString().split('T')[0];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [firstInById, setFirstInById] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Always get the daily attendance and all students
        const [dailyRes, studentsRes] = await Promise.all([
          axios.get('/api/attendance/reports/daily', { params: { date } }),
          axios.get('/api/students', { params: { limit: 10000 } })
        ]);

        const attendance = dailyRes?.data?.report?.attendance || [];
        const allStudents = studentsRes?.data?.students || [];

        // Map present (in+out) and compute earliest check-in time per student
        const byStudent = new Map();
        for (const r of attendance) {
          const sid = r?.student?._id;
          if (!sid) continue;
          const existing = byStudent.get(sid) || { in: false, out: false, student: r.student, firstIn: null };
          if (r.type === 'in') {
            existing.in = true;
            if (!existing.firstIn || new Date(r.timestamp) < new Date(existing.firstIn)) {
              existing.firstIn = r.timestamp;
            }
          }
          if (r.type === 'out') existing.out = true;
          existing.student = existing.student || r.student;
          byStudent.set(sid, existing);
        }

        const firstInMap = {};
        for (const [sid, info] of byStudent.entries()) {
          if (info.firstIn) firstInMap[sid] = info.firstIn;
        }
        setFirstInById(firstInMap);

        let list = [];
        if (status === 'present') {
          // Present = any student with at least one check-in today
          const uniqueIn = new Map();
          attendance.filter(r => r?.type === 'in').forEach(r => {
            const sid = r?.student?._id;
            if (!sid) return;
            if (!uniqueIn.has(sid)) uniqueIn.set(sid, r.student);
          });
          list = Array.from(uniqueIn.values());
        } else if (status === 'absent') {
          const presentIds = new Set(Array.from(byStudent.entries()).filter(([, v]) => v.in || v.out).map(([sid]) => sid));
          list = allStudents.filter(s => !presentIds.has(s._id));
        } else if (status === 'leave') {
          // Try org leave requests API if available; fallback to empty list
          try {
            const leaveRes = await axios.get('/api/leave-requests', { params: { date } });
            list = leaveRes?.data?.data || leaveRes?.data?.requests || [];
          } catch (_) {
            list = [];
          }
        }

        setStudents(list);
        setPage(1);
        setSearchQuery('');
      } catch (err) {
        console.error('Failed to load status list:', err);
        setError('Failed to load list');
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [status, date]);

  const title = useMemo(() => {
    if (status === 'present') return "Today's Present";
    if (status === 'absent') return "Today's Absent";
    if (status === 'leave') return "Today's Leave";
    return 'List';
  }, [status]);

  const statusTheme = useMemo(() => {
    if (status === 'present') {
      return {
        color: 'text-emerald-700 dark:text-emerald-450',
        badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-250/30',
        avatar: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
        accent: 'linear-gradient(90deg, #315CE8, #4A74F0)',
        icon: CheckCircle2
      };
    }
    if (status === 'absent') {
      return {
        color: 'text-rose-700 dark:text-rose-450',
        badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-250/30',
        avatar: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
        accent: 'linear-gradient(90deg, #991b1b, #f43f5e)',
        icon: XCircle
      };
    }
    return {
      color: 'text-amber-700 dark:text-amber-450',
      badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-250/30',
      avatar: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      accent: 'linear-gradient(90deg, #d97706, #fbbf24)',
      icon: Clock
    };
  }, [status]);

  const StatusIcon = statusTheme.icon;

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const name = (s.fullName || s.name || '').toLowerCase();
      const uid = (s.uid || '').toLowerCase();
      return name.includes(q) || uid.includes(q);
    });
  }, [students, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage]);

  const formattedDate = useMemo(() => {
    return new Date(date).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [date]);

  return (
    <ScrollReveal y={28} duration={800} blur={8} className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="kicker-label text-emerald-700 dark:text-emerald-400 mb-1.5">
            ATTENDANCE REGISTRY · DAILY MONITORING
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
              {title}
            </h1>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full ${statusTheme.badge}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {filteredStudents.length} Students
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mt-2 text-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>{formattedDate}</span>
          </div>
        </div>

        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl border border-slate-200/80 bg-white/40 dark:border-slate-800 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all shadow-sm cursor-pointer select-none"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </div>

      {/* Main Glass Ledger Container */}
      <div
        className="relative rounded-3xl overflow-hidden flex flex-col bento-hover-anuvadini"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.80))',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.85)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 56px -28px rgba(10,20,36,0.18)',
        }}
      >
        {/* Top Accent Gradient Bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: statusTheme.accent }} />
        <span className="shine-overlay-anuvadini rounded-3xl opacity-40" />

        {/* Ledger Header Control Bar */}
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-[16px] text-slate-800 dark:text-slate-100" style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
              Student Roll Call Ledger
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Click on a row to audit the student's full historical attendance report card.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-450" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search name or UID..."
              className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50/50 focus:bg-white dark:bg-slate-800/50 dark:focus:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all font-semibold text-slate-700 dark:text-slate-200"
            />
          </div>
        </div>

        {/* Ledger Table Section */}
        <div className="p-6 flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
              <p className="text-xs font-semibold text-slate-450 uppercase tracking-widest">Querying registry database...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 text-rose-600 font-semibold">{error}</div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-bold text-sm">No students found matching filters.</p>
              <p className="text-xs text-slate-450 mt-1">Try refining your search keyword query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-5 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-400 text-center w-16">#</th>
                    <th className="px-5 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-400">Student Profile</th>
                    <th className="px-5 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-400 w-44">Unique UID</th>
                    <th className="px-5 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-400 w-44">Check-in Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginated.map((s, idx) => (
                    <tr
                      key={s._id}
                      className="hover:bg-slate-50/50 cursor-pointer transition-colors duration-150 group"
                      onClick={() => navigate(`/student-report/${s._id}`)}
                    >
                      <td className="px-5 py-3 text-xs font-bold text-slate-400 text-center tabular-nums">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-bold text-xs shadow-sm ${statusTheme.avatar}`}>
                            {(s.fullName || s.name || 'U')?.charAt(0)}
                          </div>
                          <span className="group-hover:text-emerald-700 transition-colors">
                            {s.fullName || s.name || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs font-bold text-slate-500 tabular-nums">
                        {s.uid || '-'}
                      </td>
                      <td className="px-5 py-3 text-xs font-bold text-slate-500 tabular-nums">
                        {firstInById[s._id] ? (
                          <span className="inline-flex items-center gap-1 bg-slate-100/60 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200/30">
                            <Clock className="w-3.5 h-3.5 text-slate-450" />
                            {new Date(firstInById[s._id]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-650">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Ledger Pagination Bar */}
          {!loading && filteredStudents.length > 0 && (
            <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                Showing <span className="text-slate-600 font-extrabold">{(currentPage - 1) * pageSize + 1}</span> to <span className="text-slate-600 font-extrabold">{Math.min(currentPage * pageSize, filteredStudents.length)}</span> of <span className="text-slate-600 font-extrabold">{filteredStudents.length}</span> students
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center gap-1.5 select-none">
                <button
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    currentPage === 1
                      ? 'text-slate-350 border-slate-100 bg-slate-50/30 cursor-not-allowed'
                      : 'text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-emerald-700'
                  }`}
                  onClick={() => currentPage > 1 && setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, currentPage - 3), Math.max(0, currentPage - 3) + 5)
                  .map((p) => (
                    <button
                      key={p}
                      className={`h-8 min-w-[32px] px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        p === currentPage
                          ? 'bg-[#315CE8] border-[#315CE8] text-white shadow-sm'
                          : 'text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-emerald-700'
                      }`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ))}

                <button
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    currentPage === totalPages
                      ? 'text-slate-350 border-slate-100 bg-slate-50/30 cursor-not-allowed'
                      : 'text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-emerald-700'
                  }`}
                  onClick={() => currentPage < totalPages && setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ScrollReveal>
  );
};

export default StatusList;
