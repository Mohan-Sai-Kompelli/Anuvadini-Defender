import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const PresentAbsentDetails = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const mode = searchParams.get('mode') || 'week';
  const status = searchParams.get('status') || 'present'; // 'present' | 'absent'

  const getDatesForMode = (dateStr, modeVal) => {
    const base = new Date(dateStr);
    if (Number.isNaN(base.getTime())) return [dateStr];
    if (modeVal === 'week') {
      const day = base.getDay();
      const diffToMonday = (day + 6) % 7;
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
    if (modeVal === 'month') {
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
    return dow !== 0; // Monday–Saturday
  };

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const dates = getDatesForMode(date, mode);
        const workingDates = dates.filter(isWorkingDay);
        const [studentsRes, responses] = await Promise.all([
          axios.get('/api/students', { params: { limit: 10000 } }).catch(() => ({ data: { students: [] } })),
          Promise.all(dates.map(d => axios.get('/api/attendance/reports/daily', { params: { date: d } }).catch(() => ({ data: {} }))))
        ]);
        const students = studentsRes?.data?.students || [];
        const dailyLists = responses.map(r => r?.data?.report?.attendance || []);

        // Build per-day earliest in and latest out per student
        const byStudentPerDay = dates.map(() => new Map());
        dailyLists.forEach((list, idx) => {
          const map = byStudentPerDay[idx];
          for (const rec of list) {
            const sid = rec?.student?._id || rec?.student;
            if (!sid) continue;
            const entry = map.get(sid) || { inTs: null, outTs: null, student: rec.student };
            if (rec.type === 'in') {
              if (!entry.inTs || new Date(rec.timestamp) < new Date(entry.inTs)) entry.inTs = rec.timestamp;
            }
            if (rec.type === 'out') {
              if (!entry.outTs || new Date(rec.timestamp) > new Date(entry.outTs)) entry.outTs = rec.timestamp;
            }
            map.set(sid, entry);
          }
        });

        // Aggregate across dates per student
        const aggregated = new Map();
        students.forEach(s => {
          aggregated.set(s._id, { student: s, daysPresent: 0, daysAbsent: 0, examples: [] });
        });
        byStudentPerDay.forEach((map, dayIdx) => {
          const dateYmd = dates[dayIdx];
          const working = isWorkingDay(dateYmd);
          if (!working) return; // Ignore weekends for present/absent aggregation
          // Present: in and out exist
          students.forEach(s => {
            const rec = map.get(s._id) || { inTs: null, outTs: null };
            const isPresent = !!(rec.inTs && rec.outTs);
            if (isPresent) {
              const item = aggregated.get(s._id);
              item.daysPresent += 1;
              if (item.examples.length < 3) {
                item.examples.push({ date: dateYmd, in: rec.inTs, out: rec.outTs });
              }
            } else {
              const item = aggregated.get(s._id);
              item.daysAbsent += 1;
            }
          });
        });

        const rows = Array.from(aggregated.values())
          .filter(v => (status === 'present' ? v.daysPresent > 0 : (workingDates.length > 0 && v.daysPresent === 0)))
          .map(v => ({
            id: v.student._id,
            studentId: v.student._id,
            name: v.student.fullName || v.student.name || 'Unknown',
            uid: v.student.uid || '',
            total: status === 'present' ? v.daysPresent : workingDates.length,
            examples: status === 'present' ? v.examples : [],
          }))
          .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

        setRecords(rows);
        setPage(1);
      } catch (err) {
        setError('Failed to load details');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [date, mode, status]);

  const title = useMemo(() => (status === 'present' ? 'Total Present (with In & Out)' : 'Total Absent (no In & Out)'), [status]);
  const subtitle = useMemo(() => (mode === 'day' ? date : mode === 'week' ? `Week of ${date}` : `Month of ${date}`), [mode, date]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter(r => (r.name || '').toLowerCase().includes(q) || (r.uid || '').toLowerCase().includes(q));
  }, [records, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M10 18a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              type="text"
              className="pl-8 pr-8 h-9 w-56 text-xs rounded-lg border border-gray-300 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
              placeholder="Search by name or ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search by name or ID"
            />
            {query && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <button className="text-xs px-3 py-1.5 rounded-md border border-primary-200 text-primary-700 hover:bg-primary-50" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-500">Loading...</div>
      ) : error ? (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead className="table-header">
              <tr>
                <th className="table-header-cell min-w-[50px] whitespace-nowrap">S.No</th>
                <th className="table-header-cell min-w-[180px] whitespace-nowrap">Employee</th>
                <th className="table-header-cell min-w-[120px] whitespace-nowrap">Employee ID</th>
              </tr>
            </thead>
            <tbody className="table-body">
              {paginated.map((r, idx) => (
                <tr key={r.id} className="cursor-pointer hover:bg-gray-50" onClick={() => r.studentId && navigate(`/student-report/${r.studentId}`)} title="View student details">
                  <td className="table-cell">{(currentPage - 1) * pageSize + idx + 1}</td>
                  <td className="table-cell">{r.name}</td>
                  <td className="table-cell">{r.uid}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="table-cell text-gray-500" colSpan={3}>No records</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
            </div>
            <div className="inline-flex items-center space-x-1">
              <button
                className={`px-3 py-1 text-sm border rounded-md ${currentPage === 1 ? 'text-gray-400 border-gray-200 cursor-not-allowed' : 'text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                onClick={() => currentPage > 1 && setPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, currentPage - 3), Math.max(0, currentPage - 3) + 5).map(p => (
                <button
                  key={p}
                  className={`px-3 py-1 text-sm border rounded-md ${p === currentPage ? 'bg-primary-600 text-white border-primary-600' : 'text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className={`px-3 py-1 text-sm border rounded-md ${currentPage === totalPages ? 'text-gray-400 border-gray-200 cursor-not-allowed' : 'text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                onClick={() => currentPage < totalPages && setPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PresentAbsentDetails;


