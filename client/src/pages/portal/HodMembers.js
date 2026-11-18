import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { X, Search, ShieldCheck } from 'lucide-react';
import { Card, EmptyState, SkeletonTable } from '../../components/ui';

const statusBadge = (status) =>
  status === 'present'
    ? 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400'
    : status === 'leave'
    ? 'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400'
    : 'bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400';

const monthLabel = (m) => {
  if (!m) return '';
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, mm - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const HodMembers = () => {
  const [params] = useSearchParams();
  const [date, setDate] = useState('');
  const [month, setMonth] = useState('');
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState(null); // { member, summary, rows }
  const [focusLoading, setFocusLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get('/api/portal/me');
        const d = data.context?.latestDeptActivityDate || new Date().toISOString().slice(0, 10);
        setDate(d);
        setMonth(data.context?.latestDeptActivityMonth || d.slice(0, 7));
      } catch {
        const d = new Date().toISOString().slice(0, 10);
        setDate(d);
        setMonth(d.slice(0, 7));
      }
    })();
  }, []);

  const load = useCallback(async (d, m) => {
    if (!d) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/portal/hod/members', { params: { date: d, month: m } });
      setRows(res.data.rows || []);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (date && month) load(date, month);
  }, [date, month, load]);

  const openMember = useCallback(async (id, m) => {
    setFocusLoading(true);
    setFocus({ loading: true });
    try {
      const res = await axios.get(`/api/portal/hod/member/${id}/attendance`, { params: { month: m } });
      setFocus(res.data);
    } catch {
      toast.error('Failed to load member');
      setFocus(null);
    } finally {
      setFocusLoading(false);
    }
  }, []);

  // Deep-link from dashboard (?focus=<id>)
  useEffect(() => {
    const f = params.get('focus');
    if (f && month) openMember(f, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, month]);

  const filtered = rows.filter(
    (r) => r.fullName.toLowerCase().includes(q.toLowerCase()) || r.uid.includes(q) || (r.designation || '').toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Faculty &amp; Staff</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Department members · {monthLabel(month)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / UID"
              className="input pl-9" />
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input" />
        </div>
      </div>

      <Card noPadding>
        {loading ? (
          <div className="p-5"><SkeletonTable rows={6} /></div>
        ) : filtered.length === 0 ? (
          <div className="p-5"><EmptyState title="No members" description="No matching department members." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:bg-slate-800/80 dark:text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">UID</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Designation</th>
                  <th className="px-5 py-3 font-semibold">Check-in</th>
                  <th className="px-5 py-3 font-semibold">Check-out</th>
                  <th className="px-5 py-3 font-semibold">Present Days</th>
                  <th className="px-5 py-3 font-semibold">Month %</th>
                  <th className="px-5 py-3 font-semibold">Today</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filtered.map((m) => (
                  <tr key={m.id} className="cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40" onClick={() => openMember(m.id, month)}>
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {m.fullName}
                      {m.isHod && <span className="ml-2 rounded-pill bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">HOD</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{m.uid}</td>
                    <td className="px-5 py-3 capitalize text-slate-600 dark:text-slate-300">{m.role}</td>
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

      {/* Drill-in modal */}
      {focus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setFocus(null)} />
          <div className="relative z-10 max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-elevation-4 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700/60">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {focus.member?.fullName || 'Loading…'}
                </h3>
                {focus.member && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {focus.member.designation} · UID {focus.member.uid} · {monthLabel(month)}
                  </p>
                )}
              </div>
              <button onClick={() => setFocus(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              {focusLoading || focus.loading ? (
                <SkeletonTable rows={5} />
              ) : (
                <>
                  {focus.summary && (
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        ['Present', focus.summary.presentDays, 'text-success-600'],
                        ['Absent', focus.summary.absentDays, 'text-danger-600'],
                        ['Rate', `${focus.summary.attendanceRate}%`, 'text-primary-600'],
                        ['Avg In', focus.summary.avgInTime, 'text-slate-700 dark:text-slate-200'],
                      ].map(([label, val, cls]) => (
                        <div key={label} className="rounded-xl border border-slate-200/80 p-3 text-center dark:border-slate-700/60">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
                          <p className={`mt-1 text-xl font-bold ${cls}`}>{val}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {(!focus.rows || focus.rows.length === 0) ? (
                    <EmptyState title="No records" description="No attendance for this month." />
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="py-2 font-semibold">Date</th>
                          <th className="py-2 font-semibold">In</th>
                          <th className="py-2 font-semibold">Out</th>
                          <th className="py-2 font-semibold">Method</th>
                          <th className="py-2 font-semibold">Verified</th>
                          <th className="py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        {focus.rows.map((r) => (
                          <tr key={r.date}>
                            <td className="py-2 font-medium text-slate-800 dark:text-slate-100">
                              {new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                            </td>
                            <td className="py-2 text-slate-600 dark:text-slate-300">{r.firstIn || '—'}</td>
                            <td className="py-2 text-slate-600 dark:text-slate-300">{r.lastOut || '—'}</td>
                            <td className="py-2 text-slate-600 dark:text-slate-300">{r.firstIn || r.method ? 'Face' : '—'}</td>
                            <td className="py-2">{r.faceVerified ? <ShieldCheck className="h-4 w-4 text-success-600" /> : '—'}</td>
                            <td className="py-2">
                              <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${statusBadge(r.status)}`}>{r.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HodMembers;
