import React, { useMemo, useState } from 'react';
import {
  Flame, MapPin, EyeOff, AlertTriangle, ShieldAlert, Search, X,
} from 'lucide-react';
import { Card, EmptyState, SkeletonTable } from '../ui';

const pctStr = (v) => `${Math.round((v || 0) * 100)}%`;

const getInitials = (name) =>
  (name || '?')
    .replace(/^Dr\.?\s+/i, '')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

// Miss-rate pill — worse rates read hotter.
const missRateBadge = (r) =>
  r >= 0.5
    ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
    : r >= 0.25
    ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';

// Flag → pill styling + icon, matching the compliance board.
const FLAG_META = {
  never_responds: { label: 'Never responds', Icon: EyeOff, cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  repeat_offender: { label: 'Repeat offender', Icon: AlertTriangle, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  proxy_suspect: { label: 'Proxy suspect', Icon: ShieldAlert, cls: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
  on_miss_streak: { label: 'Miss streak', Icon: Flame, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
};

// Campus spots — a stable "last seen"
// per staff member (demo presence signal).
const CAMPUS_SPOTS = [
  'Main Gate', 'Reception', 'Library', 'Admin Block',
  'Cafeteria', 'Conference Room', 'Server Room', 'Parking',
  'Block A', 'Block B', 'Block C', 'Garden',
];
const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
  return Math.abs(h);
};
const lastSeenSpot = (u) => CAMPUS_SPOTS[hashStr(u.student || u.uid || u.name) % CAMPUS_SPOTS.length];

const SORTERS = {
  missRate: { label: 'Miss rate', fn: (a, b) => b.missRate - a.missRate || b.missed - a.missed },
  responseRate: { label: 'Response rate', fn: (a, b) => b.responseRate - a.responseRate },
  missed: { label: 'Most missed', fn: (a, b) => b.missed - a.missed },
  streak: { label: 'Miss streak', fn: (a, b) => b.currentMissStreak - a.currentMissStreak },
  name: { label: 'Name', fn: (a, b) => a.name.localeCompare(b.name) },
};

// Last-N compliance dots: green = responded, red = missed, grey = awaiting.
// Capped at 10 so the column stays compact (overflow shown as "+N").
function HistoryDots({ history = [] }) {
  if (!history.length) return <span className="text-xs text-slate-300">—</span>;
  const shown = history.slice(-10);
  const extra = history.length - shown.length;
  return (
    <div className="flex items-center gap-[3px]">
      {shown.map((s, i) => (
        <span
          key={i}
          title={s}
          className={`h-2 w-2 rounded-full ${
            s === 'responded'
              ? 'bg-emerald-500'
              : s === 'missed'
              ? 'bg-rose-500'
              : 'bg-slate-300 dark:bg-slate-600'
          }`}
        />
      ))}
      {extra > 0 && <span className="ml-0.5 text-[10px] font-semibold text-slate-400">+{extra}</span>}
    </div>
  );
}

export default function SpotCheckStaffTable({ users = [], loading, onSelect }) {
  const [sortKey, setSortKey] = useState('missRate');
  const [search, setSearch] = useState('');

  // Live name/UID/department search, then sort. Matches surface as you type.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? users.filter((u) =>
          `${u.name} ${u.uid || ''} ${u.department || ''}`.toLowerCase().includes(q)
        )
      : users;
    return [...filtered].sort(SORTERS[sortKey].fn);
  }, [users, search, sortKey]);

  return (
    <Card noPadding>
      {/* Header: title + search + sort-by */}
      <div className="grid gap-3 px-4 py-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Staff Compliance ({search ? `${rows.length} / ${users.length}` : users.length})
        </h3>
        <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff by name…"
              className="input w-full py-1.5 pl-9 pr-8 text-sm sm:w-56"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <label className="grid gap-1 text-sm text-slate-500 dark:text-slate-400 sm:flex sm:items-center sm:gap-2 sm:whitespace-nowrap">
            Sort by
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="input w-full py-1.5 text-sm sm:w-auto"
            >
              {Object.entries(SORTERS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="p-5"><SkeletonTable rows={6} /></div>
      ) : rows.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title={search ? 'No matches' : 'No data'}
            message={search ? `No staff matching “${search}”.` : 'No spot-check responses for the selected period.'}
          />
        </div>
      ) : (
        <>
          <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800 md:hidden">
            {rows.map((u) => (
              <button
                key={u.student}
                onClick={() => onSelect && onSelect(u)}
                className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-primary-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                title="View full spot-check history"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                    {getInitials(u.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-800 dark:text-slate-100">{u.name}</div>
                    <div className="truncate text-xs text-slate-400">{u.uid}{u.department ? ` - ${u.department}` : ''}</div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-slate-50 px-2 py-1.5 dark:bg-slate-800/70">
                        <div className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{u.totalIssued}</div>
                        <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Issued</div>
                      </div>
                      <div className="rounded-xl bg-emerald-50 px-2 py-1.5 dark:bg-emerald-900/20">
                        <div className="text-sm font-bold tabular-nums text-emerald-600">{u.responded}</div>
                        <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-600/70">Marked</div>
                      </div>
                      <div className="rounded-xl bg-rose-50 px-2 py-1.5 dark:bg-rose-900/20">
                        <div className="text-sm font-bold tabular-nums text-rose-600">{u.missed}</div>
                        <div className="text-[9px] font-semibold uppercase tracking-wide text-rose-600/70">Missed</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-pill px-2.5 py-0.5 text-xs font-bold ${missRateBadge(u.missRate)}`}>{pctStr(u.missRate)} miss</span>
                      {u.currentMissStreak > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-pill bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600 dark:bg-amber-900/30">
                          <Flame className="h-3.5 w-3.5" /> {u.currentMissStreak} streak
                        </span>
                      )}
                      <HistoryDots history={u.history} />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="hidden overflow-x-auto border-t border-slate-100 dark:border-slate-800 md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:bg-slate-800/80 dark:text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Staff</th>
                <th className="px-4 py-3 font-semibold">Dept</th>
                <th className="px-4 py-3 font-semibold">Issued</th>
                <th className="px-4 py-3 font-semibold">Responded</th>
                <th className="px-4 py-3 font-semibold">Missed</th>
                <th className="px-4 py-3 font-semibold">Miss Rate</th>
                <th className="px-4 py-3 font-semibold">Streak</th>
                <th className="px-4 py-3 font-semibold">History</th>
                <th className="px-4 py-3 font-semibold">Last Seen</th>
                <th className="px-4 py-3 font-semibold">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {rows.map((u) => (
                <tr
                  key={u.student}
                  onClick={() => onSelect && onSelect(u)}
                  className="cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                  title="View full spot-check history"
                >
                  {/* Staff */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                        {getInitials(u.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 dark:text-slate-100">{u.name}</div>
                        <div className="text-xs text-slate-400">{u.uid}{u.department ? ` · ${u.department}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  {/* Dept */}
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.department || '—'}</td>
                  {/* Issued */}
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.totalIssued}</td>
                  {/* Responded */}
                  <td className="px-4 py-3 font-medium text-emerald-600">{u.responded}</td>
                  {/* Missed */}
                  <td className="px-4 py-3 font-medium text-rose-600">{u.missed}</td>
                  {/* Miss Rate */}
                  <td className="px-4 py-3">
                    <span className={`rounded-pill px-2.5 py-0.5 text-xs font-bold ${missRateBadge(u.missRate)}`}>{pctStr(u.missRate)}</span>
                  </td>
                  {/* Streak */}
                  <td className="px-4 py-3">
                    {u.currentMissStreak > 0 ? (
                      <span className="inline-flex items-center gap-1 font-bold tabular-nums text-amber-600">
                        <Flame className="h-3.5 w-3.5" /> {u.currentMissStreak}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  {/* History */}
                  <td className="px-4 py-3"><HistoryDots history={u.history} /></td>
                  {/* Last Seen */}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" /> {lastSeenSpot(u)}
                    </span>
                  </td>
                  {/* Flags */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {u.flags.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        u.flags.map((f) => {
                          const meta = FLAG_META[f];
                          if (!meta) return null;
                          const { label, Icon, cls } = meta;
                          return (
                            <span key={f} className={`inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-pill px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
                              <Icon className="h-3 w-3 shrink-0" /> {label}
                            </span>
                          );
                        })
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </Card>
  );
}
