import React from 'react';
import { Calendar, TrendingUp, RotateCcw } from 'lucide-react';
import { Button } from '../ui';

const QUICK_FILTERS = [
  { key: 'today',  label: 'Today' },
  { key: 'week',   label: 'This Week' },
  { key: 'month',  label: 'This Month' },
  { key: 'custom', label: 'Custom Range' },
];

const DashboardFilters = ({
  showFilters,
  setShowFilters,
  filterMode,
  setQuickFilter,
  filterLoading,
  resetFilters,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  applyFilters,
  customDateRange,
  handleCustomDateChange,
  applyCustomDateRange,
}) => {
  if (!showFilters) return null;

  const inputCls =
    'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-emerald-900/40';

  return (
    <div className="glass overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-100/80 bg-white/40 px-5 py-4 dark:border-slate-800/40">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <Calendar className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Dashboard Filters</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">Filter data by time period</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={RotateCcw}
            loading={filterLoading}
            onClick={resetFilters}
            className="border-slate-200 text-slate-600 hover:text-emerald-700 hover:border-emerald-250"
          >
            Reset
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowFilters(false)}>
            Hide
          </Button>
        </div>
      </div>

      <div className="px-5 py-5 space-y-5">
        {/* Quick filter pills */}
        <div>
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> Time Period
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                disabled={filterLoading}
                onClick={() => setQuickFilter(key)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-150 disabled:opacity-60 cursor-pointer ${
                  filterMode === key
                    ? 'border-emerald-600 bg-gradient-to-b from-[#315CE8] to-[#101827] text-white shadow-sm shadow-emerald-700/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-600 dark:hover:text-emerald-400'
                }`}
              >
                {filterLoading && filterMode === key ? 'Loading…' : label}
              </button>
            ))}
          </div>
        </div>

        {/* Month + year picker */}
        {filterMode === 'month' && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800/40 dark:bg-slate-900/20 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(parseInt(e.target.value)); setTimeout(applyFilters, 100); }}
                className={inputCls}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {new Date(2024, i, 1).toLocaleDateString('en-US', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => { setSelectedYear(parseInt(e.target.value)); setTimeout(applyFilters, 100); }}
                className={inputCls}
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i} value={2020 + i}>{2020 + i}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Custom date range */}
        {filterMode === 'custom' && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800/40 dark:bg-slate-900/20">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Start Date</label>
                <input
                  type="date"
                  value={customDateRange.startDate}
                  onChange={(e) => handleCustomDateChange('startDate', e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">End Date</label>
                <input
                  type="date"
                  value={customDateRange.endDate}
                  onChange={(e) => handleCustomDateChange('endDate', e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                loading={filterLoading}
                disabled={filterLoading || !customDateRange.startDate || !customDateRange.endDate}
                onClick={applyCustomDateRange}
                icon={Calendar}
                className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm"
              >
                Apply Range
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardFilters;
