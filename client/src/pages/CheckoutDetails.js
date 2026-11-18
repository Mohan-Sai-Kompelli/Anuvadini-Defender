import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Clock, Search, Download, FileText, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';

/* ── slot meta ───────────────────────────────────────────────── */
const SLOT_META = {
  'Before 4:30 PM': { label: 'Early Leave', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)',  border: 'rgba(244,63,94,0.30)'  },
  '4:30-4:59 PM':   { label: 'Early Leave', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)',  border: 'rgba(244,63,94,0.30)'  },
  '5:00-5:29 PM':   { label: 'Early',       color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.30)' },
  '5:30-6:00 PM':   { label: 'On Time',     color: '#4A74F0', bg: 'rgba(74, 116, 240,0.12)', border: 'rgba(74, 116, 240,0.30)' },
  'After 6:00 PM':  { label: 'On Time',     color: '#4A74F0', bg: 'rgba(74, 116, 240,0.12)', border: 'rgba(74, 116, 240,0.30)' },
  'ALL':            { label: 'All',          color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)', border: 'rgba(14,165,233,0.30)' },
  'NONE':           { label: 'Missing',      color: '#f43f5e', bg: 'rgba(244,63,94,0.12)',  border: 'rgba(244,63,94,0.30)'  },
};

const CheckoutDetails = () => {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [records, setRecords] = useState([]);
  const [query,   setQuery]   = useState('');
  const [page,    setPage]    = useState(1);
  const pageSize = 15;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const mode = searchParams.get('mode') || 'day';
  const slot = searchParams.get('slot') || 'ALL';

  const meta = SLOT_META[slot] || { label: slot, color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)', border: 'rgba(14,165,233,0.30)' };

  /* ── date helpers ──────────────────────────────────────────── */
  const getDatesForMode = (dateStr, modeVal) => {
    const base = new Date(dateStr);
    if (Number.isNaN(base.getTime())) return [dateStr];
    if (modeVal === 'week') {
      const day = base.getDay();
      const diffToMonday = (day + 6) % 7;
      const monday = new Date(base);
      monday.setDate(base.getDate() - diffToMonday);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      });
    }
    if (modeVal === 'month') {
      const y = base.getFullYear(), m = base.getMonth();
      const last = new Date(y, m + 1, 0).getDate();
      return Array.from({ length: last }, (_, i) =>
        `${y}-${String(m + 1).padStart(2,'0')}-${String(i + 1).padStart(2,'0')}`
      );
    }
    return [dateStr];
  };

  const getSlotBounds = (label) => {
    switch (label) {
      case 'ALL':            return { from: 0,    to: 1440 };
      case 'Before 4:30 PM':return { from: 0,    to: 990  };
      case '4:30-4:59 PM':  return { from: 990,  to: 1020 };
      case '5:00-5:29 PM':  return { from: 1020, to: 1050 };
      case '5:30-6:00 PM':  return { from: 1050, to: 1080 };
      case 'After 6:00 PM': return { from: 1080, to: 1440 };
      case 'Before 4:00 PM':return { from: 0,    to: 960  };
      case '4:00-4:29 PM':  return { from: 960,  to: 990  };
      case 'After 5:30 PM': return { from: 1050, to: 1440 };
      default:               return { from: 0,    to: 1440 };
    }
  };

  const getMinutes = (ts) => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };

  /* ── export ────────────────────────────────────────────────── */
  const downloadBlob = (content, mime, fname) => {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: fname });
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // Both re-fetch FRESH for the current date/mode/slot at click time instead
  // of trusting `filtered` (component state) -- see fetchCheckoutRecords above.
  const freshFilteredRecords = async () => {
    const fresh = await fetchCheckoutRecords(date, mode, slot);
    const q = query.trim().toLowerCase();
    return q ? fresh.filter(r => r.name.toLowerCase().includes(q) || r.uid.toLowerCase().includes(q)) : fresh;
  };

  const handleExportExcel = async () => {
    const esc = (v) => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g,'""')}"` : s; };
    const rows = (await freshFilteredRecords()).map(r => [r.name, r.uid, r.time].map(esc).join(','));
    downloadBlob(`﻿Employee,Employee ID,Check-out Time\r\n${rows.join('\r\n')}`, 'text/csv;charset=utf-8;',
      `checkouts_${mode}_${date}_${slot.replace(/\s+/g, '-')}.csv`);
  };

  const handleExportPDF = async () => {
    const rows = await freshFilteredRecords();
    const tableRows = rows.map(r => `<tr><td>${r.name}</td><td>${r.uid}</td><td>${r.time}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Check-outs - ${slot}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:#555}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:12px}th{background:#f5f5f5;text-align:left}</style>
      </head><body><h1>Check-outs - ${slot}</h1><p>${mode === 'day' ? date : `${mode} of ${date}`}</p>
      <table><thead><tr><th>Employee</th><th>Employee ID</th><th>Check-out Time</th></tr></thead>
      <tbody>${tableRows || '<tr><td colspan="3">No records</td></tr>'}</tbody></table>
      <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
  };

  /* ── data fetch ────────────────────────────────────────────── */
  // Extracted so Export can call it FRESH at click time and use the RETURNED
  // records directly, instead of trusting `records` state -- state can be one
  // filter change behind a not-yet-finished background fetch, which would
  // silently export the PREVIOUS filter's data.
  const fetchCheckoutRecords = useCallback(async (dateVal, modeVal, slotVal) => {
    const dateList  = getDatesForMode(dateVal, modeVal);
    const responses = await Promise.all(
      dateList.map(d => axios.get('/api/attendance/reports/daily', { params: { date: d } }).catch(() => ({ data: {} })))
    );
    const list = responses.flatMap(r => r?.data?.report?.attendance || []);

    if (slotVal === 'NONE') {
      const studentsRes = await axios.get('/api/students', { params: { limit: 10000 } });
      const allStudents = studentsRes.data?.students || [];
      const inIds  = new Set(list.filter(r => r?.type === 'in').map(r => r?.student?._id).filter(Boolean));
      const outIds = new Set(list.filter(r => r?.type === 'out').map(r => r?.student?._id).filter(Boolean));
      return allStudents
        .filter(s => inIds.has(s._id) && !outIds.has(s._id))
        .map((s, i) => ({ id: s._id || i, studentId: s._id, name: s.fullName || s.name || 'Unknown', uid: s.uid || '', time: '—' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    const bounds = getSlotBounds(slotVal);
    const byStudent = new Map();
    for (const r of list) {
      if (r.type !== 'out') continue;
      const mins = getMinutes(r.timestamp);
      if (mins < bounds.from || mins >= bounds.to) continue;
      const sid = r?.student?._id || r?.student;
      if (!sid) continue;
      const when = new Date(r.timestamp);
      const dayKey = when.toISOString().split('T')[0];
      const key = modeVal === 'day' ? sid : `${sid}_${dayKey}`;
      if (!byStudent.has(key) || when > byStudent.get(key).ts) {
        byStudent.set(key, {
          id: key,
          studentId: sid,
          name: r?.student?.fullName || r?.student?.name || 'Unknown',
          uid: r?.student?.uid || '',
          ts: when,
          dateStr: when.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
        });
      }
    }
    return Array.from(byStudent.values())
      .map(e => ({ id: e.id, studentId: e.studentId || e.id, name: e.name, uid: e.uid, date: e.dateStr, time: e.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), rawTs: e.ts }))
      .sort((a, b) => b.rawTs - a.rawTs);
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true); setError(null);
        setRecords(await fetchCheckoutRecords(date, mode, slot));
        setPage(1);
      } catch {
        setError('Failed to load check-out details.');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [date, mode, slot, fetchCheckoutRecords]);

  const filtered    = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? records.filter(r => r.name.toLowerCase().includes(q) || r.uid.toLowerCase().includes(q)) : records;
  }, [records, query]);
  const totalPages  = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated   = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage]);

  const periodLabel = mode === 'day' ? date : mode === 'week' ? `Week of ${date}` : `Month of ${date}`;

  /* ── render ────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', padding: '28px 24px', fontFamily: "'Geist','Inter',sans-serif", background: 'transparent' }}>

      {/* ── Hero Header Card ── */}
      <div
        className="relative overflow-hidden rounded-3xl mb-6"
        style={{
          background: 'linear-gradient(135deg, rgba(8,38,56,0.97) 0%, rgba(3,16,26,0.95) 100%)',
          border: '1px solid rgba(14,165,233,0.22)',
          boxShadow: '0 24px 56px -28px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset',
          padding: '28px 28px 24px',
        }}
      >
        {/* SVG grid bg */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.05 }}>
          <defs><pattern id="cod-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.7" />
          </pattern></defs>
          <rect width="100%" height="100%" fill="url(#cod-grid)" />
        </svg>
        {/* Ambient glow */}
        <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${meta.color}60 0%, transparent 70%)`, filter: 'blur(28px)' }} />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-start gap-5">
          {/* Back button */}
          <button
            onClick={() => navigate(-1)}
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 hover:scale-105 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-sky-400 mb-1"
              style={{ fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.18em' }}>
              CHECK-OUT DETAILS · {mode.toUpperCase()}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight" style={{ letterSpacing: '-0.02em' }}>
              {slot === 'NONE' ? 'No Check-out — Missing' : slot === 'ALL' ? 'All Check-outs' : `Slot: ${slot}`}
            </h1>
            <p className="text-slate-400 text-sm mt-1">{periodLabel}</p>
          </div>

          {/* Stats pill */}
          <div className="flex items-center gap-3 sm:self-center">
            <div className="flex flex-col items-center rounded-2xl px-5 py-3 text-center"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <span className="text-3xl font-black tabular-nums" style={{ color: meta.color, filter: `drop-shadow(0 0 8px ${meta.color}88)` }}>
                {filtered.length}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5"
                style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                {slot === 'NONE' ? 'Missing' : 'Records'}
              </span>
            </div>
            <span className="inline-flex rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}>
              {meta.label}
            </span>
          </div>
        </div>

        <span className="shine-overlay-anuvadini rounded-3xl opacity-[0.07]" />
      </div>

      {/* ── Controls Bar ── */}
      <div
        className="relative overflow-hidden rounded-2xl mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 px-5 py-4"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.82))',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.85)',
          boxShadow: '0 4px 24px -8px rgba(10,20,36,0.12)',
        }}
      >
        {/* Search */}
        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search by name or ID…"
            className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
            style={{
              background: 'rgba(10,20,36,0.04)',
              border: '1px solid rgba(10,20,36,0.10)',
              fontFamily: "'Geist',sans-serif",
            }}
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer">×</button>
          )}
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
            style={{ background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.25)', color: '#0284c7' }}>
            <Download className="w-3.5 h-3.5" />
            Excel
          </button>
          <button onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
            style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)', color: '#6366f1' }}>
            <FileText className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* ── Table Card ── */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(255,255,255,0.84))',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.85)',
          boxShadow: '0 8px 32px -16px rgba(10,20,36,0.18)',
        }}
      >
        {/* Top accent */}
        <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${meta.color}, ${meta.color}88, transparent)` }} />

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <div className="w-10 h-10 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Loading check-out data…</p>
          </div>
        ) : error ? (
          <div className="m-5 rounded-xl px-4 py-3 text-sm text-rose-700 font-medium"
            style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)' }}>
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24">
            <div className="w-14 h-14 rounded-2xl grid place-items-center"
              style={{ background: 'rgba(10,20,36,0.06)', border: '1px solid rgba(10,20,36,0.10)' }}>
              <Clock className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-slate-700 font-semibold text-sm">No records found</p>
            <p className="text-slate-400 text-xs">{query ? 'Try a different search term' : 'No check-outs in this slot'}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto scrollbar-none">
              <div className="min-w-[560px]">
                {/* Table header */}
                <div className="grid grid-cols-[48px_1fr_140px_130px_130px] gap-0 border-b px-6 py-3"
                  style={{ borderColor: 'rgba(10,20,36,0.07)', background: 'rgba(10,20,36,0.025)' }}>
                  {['#', 'Employee', 'Employee ID', 'Date', 'Check-out Time'].map(h => (
                    <div key={h} className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400"
                      style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                      {h}
                    </div>
                  ))}
                </div>

                {/* Rows */}
                <div className="divide-y" style={{ divideColor: 'rgba(10,20,36,0.05)' }}>
                  {paginated.map((r, idx) => (
                    <div
                      key={r.id}
                      onClick={() => r.studentId && navigate(`/student-report/${r.studentId}`)}
                      className="group grid grid-cols-[48px_1fr_140px_130px_130px] gap-0 px-6 py-3.5 cursor-pointer transition-all duration-200 hover:bg-slate-50/80"
                      title="View student profile"
                    >
                      {/* S.No */}
                      <div className="flex items-center">
                        <span className="text-xs tabular-nums font-bold text-slate-400" style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                          {(currentPage - 1) * pageSize + idx + 1}
                        </span>
                      </div>

                      {/* Name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0 text-xs font-black text-white"
                          style={{ background: `linear-gradient(135deg, ${meta.color}cc, ${meta.color}66)` }}>
                          {(r.name || '?')[0].toUpperCase()}
                        </div>
                        <span className="font-semibold text-sm text-slate-800 truncate group-hover:text-sky-600 transition-colors">{r.name}</span>
                      </div>

                      {/* UID */}
                      <div className="flex items-center">
                        <span className="text-xs font-mono text-slate-500 bg-slate-100 rounded-lg px-2 py-0.5">{r.uid || '—'}</span>
                      </div>

                      {/* Date */}
                      <div className="flex items-center">
                        <span className="text-xs font-semibold text-slate-600" style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                          {r.date || date}
                        </span>
                      </div>

                      {/* Time */}
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: meta.color }} />
                        <span className="text-sm font-bold tabular-nums" style={{ color: r.time === '—' ? '#9ca3af' : meta.color, fontFamily: "'JetBrains Mono',monospace" }}>
                          {r.time}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t" style={{ borderColor: 'rgba(10,20,36,0.07)' }}>
              <span className="text-xs text-slate-400" style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => currentPage > 1 && setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="w-8 h-8 rounded-lg grid place-items-center transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer"
                  style={{ border: '1px solid rgba(10,20,36,0.10)' }}
                >
                  <ChevronLeft className="w-4 h-4 text-slate-600" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, currentPage - 3), Math.max(0, currentPage - 3) + 5)
                  .map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className="w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer"
                      style={p === currentPage
                        ? { background: meta.color, color: '#fff', border: `1px solid ${meta.color}` }
                        : { background: 'transparent', color: '#6b7280', border: '1px solid rgba(10,20,36,0.10)' }}
                    >
                      {p}
                    </button>
                  ))}
                <button
                  onClick={() => currentPage < totalPages && setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 rounded-lg grid place-items-center transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer"
                  style={{ border: '1px solid rgba(10,20,36,0.10)' }}
                >
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CheckoutDetails;
