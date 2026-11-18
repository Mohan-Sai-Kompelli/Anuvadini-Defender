import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from 'date-fns';

/**
 * MonthCalendar — reusable month grid with date-keyed events.
 *
 * Props:
 *  - month         Date currently displayed (any day within the month)
 *  - onMonthChange (Date) => void
 *  - events        array of items
 *  - getDate       (item) => 'YYYY-MM-DD'   how to read an item's date
 *  - renderDay     ({ dateKey, items, isCurrentMonth, isToday }) => ReactNode
 *                  custom cell body rendered under the day number
 *  - onDayClick    (dateKey, items) => void
 *  - selectedDate  'YYYY-MM-DD' highlighted cell
 *  - legend        ReactNode rendered under the grid
 *  - accent        tailwind colour name for "today" ring (default emerald)
 */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toKey = (date) => format(date, 'yyyy-MM-dd');

export default function MonthCalendar({
  month,
  onMonthChange,
  events = [],
  getDate = (e) => e.date,
  renderDay,
  onDayClick,
  selectedDate = null,
  legend = null,
}) {
  const grid = useMemo(() => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [month]);

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const key = getDate(ev);
      if (!key) continue;
      const norm = String(key).slice(0, 10);
      (map[norm] = map[norm] || []).push(ev);
    }
    return map;
  }, [events, getDate]);

  const today = new Date();

  return (
    <div className="glass min-w-0 overflow-hidden">
      {/* Calendar header */}
      <div className="flex flex-col items-stretch gap-3 border-b border-slate-200/60 px-3 py-3 dark:border-slate-800 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between sm:px-5 sm:py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CalendarDays className="h-4.5 w-4.5" />
          </span>
          <div>
            <h3 className="text-base font-extrabold leading-none text-slate-900 dark:text-slate-100 sm:text-lg"
                style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
              {format(month, 'MMMM yyyy')}
            </h3>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1">
              {events.length} scheduled
            </p>
          </div>
        </div>
        <div className="grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-1.5 min-[430px]:flex min-[430px]:justify-end">
          <button
            onClick={() => onMonthChange(subMonths(month, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => onMonthChange(new Date())}
            className="h-9 rounded-xl bg-slate-100 px-2 text-xs font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:px-3"
          >
            Today
          </button>
          <button
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      <div className="p-2 sm:p-4">
        {/* Weekday header */}
        <div className="mb-1 grid grid-cols-7 gap-0.5 sm:mb-1.5 sm:gap-1.5">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="py-1.5 text-center text-[9px] font-extrabold uppercase tracking-normal text-slate-400 dark:text-slate-500 sm:py-2 sm:text-[11px] sm:tracking-wider"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5">
          {grid.map((day) => {
            const dateKey = toKey(day);
            const items = eventsByDate[dateKey] || [];
            const inMonth = isSameMonth(day, month);
            const isToday = isSameDay(day, today);
            const isSelected = selectedDate === dateKey;
            const dow = day.getDay();
            const isWeekend = dow === 0 || dow === 6;

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => onDayClick && onDayClick(dateKey, items)}
                className={`group relative flex flex-col text-left rounded-lg border p-1 min-h-[48px] sm:min-h-[88px] sm:rounded-2xl sm:p-2 md:min-h-[104px] lg:min-h-[120px] transition-all duration-150 w-full
                  ${inMonth
                    ? 'bg-white/70 dark:bg-slate-900/50 border-slate-200/70 dark:border-slate-800'
                    : 'bg-slate-50/40 dark:bg-slate-900/20 border-transparent opacity-50'}
                  ${isSelected ? 'ring-2 ring-emerald-500/60 border-emerald-350 dark:border-emerald-500' : ''}
                  ${onDayClick ? 'hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : 'cursor-default'}
                `}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-lg text-xs font-bold transition-all
                      ${isToday
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                        : isWeekend
                        ? 'text-rose-500 dark:text-rose-400 font-extrabold'
                        : 'text-slate-700 dark:text-slate-350'}`}
                  >
                    {format(day, 'd')}
                  </span>
                  {items.length > 0 && (
                    <span className="hidden sm:inline-flex text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {items.length}
                    </span>
                  )}
                </div>

                <div className="mt-1 w-full flex-1 flex flex-col justify-end md:justify-start overflow-hidden">
                  {inMonth && renderDay
                    ? renderDay({ dateKey, items, isCurrentMonth: inMonth, isToday })
                    : null}
                </div>
              </button>
            );
          })}
        </div>

        {legend && (
          <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800">
            {legend}
          </div>
        )}
      </div>
    </div>
  );
}
