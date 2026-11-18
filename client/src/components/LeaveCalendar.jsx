import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Landmark } from 'lucide-react';
import { Button, Card } from './ui';

// Government holiday list (sample — replace with the official list from
// organization settings / a holidays API when available).
const GOVERNMENT_HOLIDAYS = {
  '2026-01-26': 'Republic Day',
  '2026-03-04': 'Holi',
  '2026-03-21': 'Id-ul-Fitr',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Ambedkar Jayanti',
  '2026-05-01': 'Buddha Purnima',
  '2026-05-27': 'Id-ul-Zuha (Bakrid)',
  '2026-06-26': 'Muharram',
  '2026-08-15': 'Independence Day',
  '2026-08-25': 'Milad-un-Nabi',
  '2026-09-04': 'Janmashtami',
  '2026-10-02': 'Gandhi Jayanti',
  '2026-10-20': 'Dussehra',
  '2026-11-08': 'Diwali',
  '2026-11-24': 'Guru Nanak Jayanti',
  '2026-12-25': 'Christmas Day',
  '2027-01-26': 'Republic Day',
  '2025-08-15': 'Independence Day',
  '2025-10-02': 'Gandhi Jayanti',
  '2025-10-20': 'Diwali',
  '2025-12-25': 'Christmas Day',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_CHIP = {
  approved:
    'bg-success-50 text-success-700 border-success-200 dark:bg-success-900/40 dark:text-success-400 dark:border-success-800',
  rejected:
    'bg-danger-50 text-danger-700 border-danger-200 dark:bg-danger-900/40 dark:text-danger-400 dark:border-danger-800',
  pending:
    'bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-900/40 dark:text-warning-400 dark:border-warning-800',
};

const LEGEND = [
  { key: 'approved', label: 'Approved leave' },
  { key: 'pending', label: 'Pending leave' },
  { key: 'rejected', label: 'Rejected leave' },
];

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

const normalizedStatus = (s) => {
  const v = (s || 'pending').toLowerCase();
  if (v === 'submitted') return 'pending';
  return v;
};

/**
 * Month calendar of employee leave requests (approved / pending / rejected)
 * with government holidays pre-marked. Navigate months to see previous and
 * upcoming requests.
 */
const LeaveCalendar = ({ requests = [] }) => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  const goMonth = (delta) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  // Map every day of the visible grid to the leave entries covering it.
  const weeks = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

    const parsed = requests
      .map((r) => {
        const start = r?.leaveDates?.start ? new Date(r.leaveDates.start) : null;
        const end = r?.leaveDates?.end ? new Date(r.leaveDates.end) : start;
        if (!start || Number.isNaN(start.getTime())) return null;
        return {
          id: r._id,
          name: r.student?.fullName || 'Unknown',
          details: r.leaveDetails || '',
          status: normalizedStatus(r.status),
          start: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
          end: new Date(end.getFullYear(), end.getMonth(), end.getDate()),
        };
      })
      .filter(Boolean);

    const result = [];
    const cursor = new Date(gridStart);
    for (let w = 0; w < 6; w += 1) {
      const week = [];
      for (let i = 0; i < 7; i += 1) {
        const date = new Date(cursor);
        const key = dayKey(date);
        week.push({
          date,
          key,
          inMonth: date.getMonth() === viewMonth,
          isToday: date.toDateString() === today.toDateString(),
          holiday: GOVERNMENT_HOLIDAYS[key] || null,
          entries: parsed.filter((p) => date >= p.start && date <= p.end),
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      result.push(week);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, viewYear, viewMonth]);

  return (
    <Card bodyClassName="!p-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            icon={ChevronLeft}
            onClick={() => goMonth(-1)}
            aria-label="Previous month"
          />
          <span className="min-w-[10rem] text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
            {monthLabel}
          </span>
          <Button
            variant="outline"
            size="sm"
            icon={ChevronRight}
            onClick={() => goMonth(1)}
            aria-label="Next month"
          />
          {(viewYear !== today.getFullYear() || viewMonth !== today.getMonth()) && (
            <Button variant="ghost" size="sm" onClick={goToday}>
              Today
            </Button>
          )}
        </div>
        {/* Legend */}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {LEGEND.map((l) => (
            <span
              key={l.key}
              className={`inline-flex items-center rounded-pill border px-2 py-0.5 font-medium ${STATUS_CHIP[l.key]}`}
            >
              {l.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 rounded-pill border border-info-200 bg-info-50 px-2 py-0.5 font-medium text-info-700 dark:border-info-800 dark:bg-info-900/40 dark:text-info-300">
            <Landmark className="h-3 w-3" aria-hidden="true" />
            Government holiday
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] table-fixed border-collapse">
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th
                  key={d}
                  className={`border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide last:border-r-0 dark:border-slate-700 dark:bg-slate-800 ${
                    d === 'Sun'
                      ? 'text-danger-500 dark:text-danger-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day) => (
                  <td
                    key={day.key}
                    className={`h-28 border-b border-r border-slate-100 p-1.5 align-top last:border-r-0 dark:border-slate-700/60 ${
                      !day.inMonth
                        ? 'bg-slate-50/70 dark:bg-slate-800/40'
                        : day.holiday
                        ? 'bg-info-50/50 dark:bg-info-900/10'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-pill text-xs font-semibold ${
                          day.isToday
                            ? 'bg-primary-600 text-white'
                            : day.inMonth
                            ? 'text-slate-700 dark:text-slate-200'
                            : 'text-slate-400 dark:text-slate-600'
                        }`}
                      >
                        {day.date.getDate()}
                      </span>
                    </div>
                    {day.holiday && (
                      <div
                        className="mt-1 truncate rounded border border-info-200 bg-info-50 px-1.5 py-0.5 text-[11px] font-medium text-info-700 dark:border-info-800 dark:bg-info-900/40 dark:text-info-300"
                        title={`Government holiday — ${day.holiday}`}
                      >
                        {day.holiday}
                      </div>
                    )}
                    <div className="mt-1 space-y-1">
                      {day.entries.slice(0, 3).map((e) => (
                        <div
                          key={`${e.id}-${day.key}`}
                          className={`truncate rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                            STATUS_CHIP[e.status] || STATUS_CHIP.pending
                          }`}
                          title={`${e.name} — ${e.status}${e.details ? ` · ${e.details}` : ''}`}
                        >
                          {e.name}
                        </div>
                      ))}
                      {day.entries.length > 3 && (
                        <div className="px-1 text-[11px] text-slate-400 dark:text-slate-500">
                          +{day.entries.length - 3} more
                        </div>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default LeaveCalendar;
