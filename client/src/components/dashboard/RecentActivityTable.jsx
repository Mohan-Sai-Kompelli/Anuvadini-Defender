import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Activity, Search, X } from 'lucide-react';
import { Button } from '../ui';

const BADGE = {
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/30',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/50 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/30',
  danger:  'bg-rose-50 text-rose-700 ring-1 ring-rose-200/50 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/30',
  info:    'bg-sky-50 text-sky-700 ring-1 ring-sky-200/50 dark:bg-sky-950/30 dark:text-sky-400 dark:ring-sky-900/30',
};

const TabButton = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-lg px-4 py-2 text-xs font-bold transition-all duration-150 cursor-pointer ${
      active
        ? 'bg-gradient-to-b from-[#315CE8] to-[#101827] text-white shadow-sm'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
    }`}
  >
    {children}
  </button>
);

const RecentActivityTable = ({
  recentActivityTab,
  setRecentActivityTab,
  showCalendar,
  setShowCalendar,
  selectedDate,
  setSelectedDate,
  handleSingleDateSelection,
  recentActivityLoading,
  searchQuery,
  setSearchQuery,
  searchQueryPending,
  setSearchQueryPending,
  filteredTopDurationData,
  filteredPendingDurationData,
  visibleCheckoutCount,
  setVisibleCheckoutCount,
  visiblePendingCount,
  setVisiblePendingCount,
  organization,
}) => {
  const navigate = useNavigate();
  const isTop = recentActivityTab === 'top';
  const query = isTop ? searchQuery : searchQueryPending;
  const setQuery = isTop ? setSearchQuery : setSearchQueryPending;
  const data = isTop ? filteredTopDurationData : filteredPendingDurationData;
  const visibleCount = isTop ? visibleCheckoutCount : visiblePendingCount;
  const setVisibleCount = isTop ? setVisibleCheckoutCount : setVisiblePendingCount;

  const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '—';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}h ${m}m`;
  };

  const getAttTypeBadge = (hasIn, hasOut) => {
    if (hasIn && hasOut) return { label: 'Complete', key: 'success' };
    if (hasIn)           return { label: 'Partial',  key: 'warning' };
    return               { label: 'Absent',   key: 'danger' };
  };

  const getStatusBadge = (ms) => {
    const done = ms >= 8 * 3_600_000;
    if (done)   return { label: 'Completed', key: 'success' };
    if (ms > 0) {
      const rem = 8 * 3_600_000 - ms;
      const rH = Math.floor(rem / 3_600_000);
      const rM = Math.floor((rem % 3_600_000) / 60_000);
      return { label: `${rH}h ${rM}m left`, key: 'warning' };
    }
    return { label: 'No time', key: 'danger' };
  };
  return (
    <div
      className="relative rounded-3xl flex flex-col bento-hover-anuvadini"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.80))',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.85)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 56px -28px rgba(10,20,36,0.18)',
      }}
    >
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-3xl"
        style={{ background: 'linear-gradient(90deg, #315CE8, #6F8DF0, #8b5cf6)' }} />
      <span className="shine-overlay-anuvadini rounded-3xl opacity-40" />

      {/* Header */}
      <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-slate-100/80 px-6 py-5 z-30">
        <div>
          <div className="kicker-label text-slate-400 mb-0.5">LOGS · REAL-TIME REGISTRY AUDIT</div>
          <h3 className="font-bold text-[16px] text-slate-850 dark:text-slate-100" style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
            Recent Attendance Activity
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date filter */}
          <div className="relative calendar-container">
            <Button
              size="sm"
              variant="outline"
              icon={Calendar}
              onClick={() => setShowCalendar(!showCalendar)}
              className="border-slate-200 text-slate-700 hover:border-emerald-450 hover:text-emerald-700 dark:border-slate-700 rounded-xl"
            >
              {new Date(selectedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </Button>
            {showCalendar && (
              <div
                className="fixed left-3 right-3 top-20 z-[100] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64 sm:max-w-[calc(100vw-2rem)]"
                data-lenis-prevent
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Select date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  style={{ position: 'relative', zIndex: 101 }}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                  <Button size="sm" variant="outline" onClick={() => setShowCalendar(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    loading={recentActivityLoading}
                    onClick={() => { handleSingleDateSelection(selectedDate); setShowCalendar(false); }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-slate-900/40 border border-slate-200/30">
            <TabButton active={isTop} onClick={() => setRecentActivityTab('top')}>
              Top Duration
            </TabButton>
            <TabButton active={!isTop} onClick={() => setRecentActivityTab('pending')}>
              Remaining
            </TabButton>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative border-b border-slate-100/80 bg-white/20 px-6 py-3.5 dark:border-slate-800/40 z-20">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by name, UID or department…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white py-2.5 pl-10 pr-10 text-xs text-slate-700 placeholder-slate-450 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 cursor-pointer"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-0 z-10">
        {recentActivityLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="h-7 w-7 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <p className="text-xs font-semibold text-slate-450 uppercase tracking-widest">Querying attendance records...</p>
          </div>
        ) : data.length > 0 ? (
          <div className="overflow-x-auto rounded-b-3xl border-t border-slate-100/50">
            <table className="min-w-full divide-y divide-slate-100/60 text-sm dark:divide-slate-800/40">
              <thead className="bg-slate-50/50 dark:bg-slate-900/20">
                <tr>
                  {['#', 'Staff Member', 'Check-in', 'Check-out', 'Duration', isTop ? '' : 'Method', 'Type', 'Status'].map((h, i) => (
                    <th
                      key={i}
                      className="px-6 py-4.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-850">
                {data.slice(0, visibleCount).map((item, idx) => {
                  const { student, inTs, outTs, hasIn, hasOut, authMethod } = item;
                  const ms = item.totalMs || 0;
                  const att = getAttTypeBadge(hasIn, hasOut);
                  const stat = getStatusBadge(ms);
                  return (
                    <tr
                      key={(student?._id) || idx}
                      className="transition-all duration-250 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 group"
                    >
                      <td className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/25 text-xs font-bold text-emerald-700 dark:text-emerald-400 shadow-sm">
                            {student?.fullName?.[0] ?? '?'}
                          </div>
                          <div>
                            <button
                              onClick={() => navigate(`/student-report/${student?._id}`)}
                              className="text-sm font-bold text-slate-700 group-hover:text-emerald-700 dark:text-slate-200 dark:group-hover:text-emerald-400 text-left cursor-pointer transition-colors"
                            >
                              {student?.fullName}
                            </button>
                            <p className="text-[11px] font-bold text-slate-400 tabular-nums mt-0.5">{student?.uid}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                        {hasIn ? new Date(inTs).toLocaleTimeString() : '—'}
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                        {hasOut ? new Date(outTs).toLocaleTimeString() : '—'}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                        {formatDuration(ms)}
                      </td>
                      {!isTop && (
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${BADGE.info}`}>
                            {authMethod ? 'Face' : 'Unknown'}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${BADGE[att.key]}`}>
                          {att.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${BADGE[stat.key]}`}>
                          {stat.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-250/25">
              <Activity className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No attendance records</p>
            <p className="text-xs text-slate-450 dark:text-slate-500 max-w-sm mt-0.5">
              No check-in or check-out activities have been registered for this selected date.
            </p>
          </div>
        )}

        {/* Load more */}
        {data.length > visibleCount && (
          <div className="flex justify-center border-t border-slate-100 dark:border-slate-800 p-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVisibleCount((p) => p + 10)}
              className="border-slate-200 hover:border-emerald-450 hover:text-emerald-700 dark:border-slate-850 rounded-xl"
            >
              Load more ({data.length - visibleCount} remaining)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentActivityTable;
