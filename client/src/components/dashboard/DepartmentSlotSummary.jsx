import React from 'react';
import { 
  
  
  
  Building2, 
  Clock, 
  LogOut, 
  ArrowRight,
  ShieldCheck, 
  Info,
  RefreshCw,
  AlertTriangle,
  Filter,
  Calendar
} from 'lucide-react';
import { useTheme } from '../../ThemeContext';

// Helper component for Department Icon and styling
const getDeptIconAndStyle = (deptName) => {
  return {
    icon: Building2,
    style: 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-100 dark:border-slate-700/50'
  };
};

// Circular KPI Ring Gauge Component
const CircularKPI = ({ count, total, color, label, department }) => {
  const pct = total > 0 ? Math.min((count / total) * 100, 100) : 0;
  const radius = 24;
  const stroke = 3;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  const colorMap = {
    green: {
      stroke: 'stroke-emerald-500',
      track: 'stroke-emerald-100/50 dark:stroke-emerald-950/20',
      text: 'text-emerald-600 dark:text-emerald-400',
      glow: 'pulse-green'
    },
    orange: {
      stroke: 'stroke-amber-500',
      track: 'stroke-amber-100/50 dark:stroke-amber-950/20',
      text: 'text-amber-600 dark:text-amber-400',
      glow: 'pulse-orange'
    },
    red: {
      stroke: 'stroke-rose-500',
      track: 'stroke-rose-100/50 dark:stroke-rose-950/20',
      text: 'text-rose-600 dark:text-rose-400',
      glow: 'pulse-red'
    },
    pink: {
      stroke: 'stroke-pink-500',
      track: 'stroke-pink-100/50 dark:stroke-pink-950/20',
      text: 'text-pink-600 dark:text-pink-400',
      glow: 'pulse-pink'
    },
    blue: {
      stroke: 'stroke-sky-500',
      track: 'stroke-sky-100/50 dark:stroke-sky-950/20',
      text: 'text-sky-600 dark:text-sky-400',
      glow: 'pulse-blue'
    }
  };

  const scheme = colorMap[color] || colorMap.blue;

  return (
    <div className="relative group flex items-center justify-center">
      {/* Floating Ring Gauge */}
      <div 
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 cursor-pointer relative z-10 ${count > 0 ? scheme.glow : ''}`}
      >
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 56 56">
          <circle
            className={`${scheme.track}`}
            strokeWidth={stroke}
            fill="transparent"
            r={normalizedRadius}
            cx="28"
            cy="28"
          />
          <circle
            className={`${scheme.stroke} transition-all duration-700 ease-out`}
            strokeWidth={stroke}
            strokeDasharray={circumference + ' ' + circumference}
            style={{ strokeDashoffset }}
            strokeLinecap="round"
            fill="transparent"
            r={normalizedRadius}
            cx="28"
            cy="28"
          />
        </svg>
        <span className={`absolute text-sm font-black tabular-nums ${scheme.text}`}>
          {count}
        </span>
      </div>
    </div>
  );
};

// Main Component
// Main Component
const DepartmentSlotSummary = ({ 
  deptSummary = [], 
  slotDate, 
  slotWeek, 
  slotMonth, 
  slotMode, 
  setSlotDate, 
  setSlotWeek, 
  setSlotMonth, 
  setSlotMode, 
  loadSlotSummaryForDate 
}) => {
  const { theme } = useTheme();
  const [showFilters, setShowFilters] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  return (
    <div className="glass overflow-hidden transition-all duration-300 flex flex-col w-full bg-white dark:bg-slate-900/60 rounded-[24px] border border-slate-150/80 dark:border-slate-800/40 shadow-sm">
      {/* Dynamic Keyframe Animations for Glowing Pulse Effects */}
      <style>{`
        @keyframes circle-pulse-green {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(74, 116, 240, 0.2)); }
          50% { filter: drop-shadow(0 0 8px rgba(74, 116, 240, 0.45)); }
        }
        @keyframes circle-pulse-orange {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(245, 158, 11, 0.2)); }
          50% { filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.45)); }
        }
        @keyframes circle-pulse-red {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(244, 63, 94, 0.2)); }
          50% { filter: drop-shadow(0 0 8px rgba(244, 63, 94, 0.45)); }
        }
        @keyframes circle-pulse-pink {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(236, 72, 153, 0.2)); }
          50% { filter: drop-shadow(0 0 8px rgba(236, 72, 153, 0.45)); }
        }
        @keyframes circle-pulse-blue {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(14, 165, 233, 0.2)); }
          50% { filter: drop-shadow(0 0 8px rgba(14, 165, 233, 0.45)); }
        }
        .pulse-green { animation: circle-pulse-green 2.5s infinite ease-in-out; }
        .pulse-orange { animation: circle-pulse-orange 2.5s infinite ease-in-out; }
        .pulse-red { animation: circle-pulse-red 2.5s infinite ease-in-out; }
        .pulse-pink { animation: circle-pulse-pink 2.5s infinite ease-in-out; }
        .pulse-blue { animation: circle-pulse-blue 2.5s infinite ease-in-out; }
      `}</style>

      {/* Header Area */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-white/40 px-6 py-5 dark:border-slate-800/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl grid place-items-center bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400 shadow-sm border border-emerald-100/50">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
              Department-wise Check-in & Check-out Summary
            </h3>
            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
              Date: {slotDate}
            </p>
          </div>
        </div>

        {/* Actions & Filters */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all duration-150 cursor-pointer ${
              showFilters 
                ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700' 
                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 bg-white dark:bg-slate-800'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{showFilters ? 'Hide Filter' : 'Filter'}</span>
          </button>

          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1 rounded-full border border-emerald-100 dark:border-emerald-900/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black text-emerald-700 dark:text-emerald-400 tracking-wider uppercase">Live Data</span>
          </div>
          <button 
            onClick={async () => {
              try {
                setIsLoading(true);
                const val = slotMode === 'day' ? slotDate : slotMode === 'week' ? slotWeek : slotMonth;
                await loadSlotSummaryForDate(val, slotMode);
              } finally {
                setIsLoading(false);
              }
            }} 
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-5 dark:border-slate-800/40 dark:bg-slate-900/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
            {/* Select Date */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                <span>Select Date (Daily)</span>
              </label>
              <input
                type="date"
                value={slotDate}
                onChange={async (e) => {
                  if (!e.target.value) return;
                  try {
                    setIsLoading(true);
                    setSlotDate(e.target.value);
                    setSlotMode('day');
                    await loadSlotSummaryForDate(e.target.value, 'day');
                  } finally { setIsLoading(false); }
                }}
                max={new Date().toISOString().split('T')[0]}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              {slotMode === 'day' && (
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 mt-1.5 block">
                  ● Currently viewing selected Date
                </span>
              )}
            </div>

            {/* Select Month */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <Calendar className="h-3.5 w-3.5 text-sky-500" />
                <span>Select Month (Monthly)</span>
              </label>
              <input
                type="month"
                value={slotMonth}
                onChange={async (e) => {
                  if (!e.target.value) return;
                  try {
                    setIsLoading(true);
                    setSlotMonth(e.target.value);
                    setSlotMode('month');
                    await loadSlotSummaryForDate(e.target.value, 'month');
                  } finally { setIsLoading(false); }
                }}
                max={new Date().toISOString().slice(0, 7)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              {slotMode === 'month' && (
                <span className="text-[9px] font-bold text-sky-600 dark:text-sky-400 mt-1.5 block">
                  ● Currently viewing selected Month
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay if loading new summary */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500 dark:text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          Loading data…
        </div>
      )}

      {/* Grid Table Container */}
      <div className="overflow-x-auto">
        {deptSummary && deptSummary.length > 0 ? (
          <table className="w-full border-collapse">
            <thead>
              {/* Header Row 1: Column Groups */}
              <tr className="border-b border-slate-100 dark:border-slate-800/40 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                <th className="px-6 py-4 text-left min-w-[200px] border-r border-slate-100 dark:border-slate-800/40">
                  Department
                </th>
                <th colSpan="3" className="px-6 py-4 text-center border-r border-slate-100 dark:border-slate-800/40 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.01] text-emerald-600 dark:text-emerald-400 font-extrabold">
                  Check-In Details
                </th>
                <th colSpan="3" className="px-6 py-4 text-center bg-sky-500/[0.02] dark:bg-sky-500/[0.01] text-sky-600 dark:text-sky-400 font-extrabold">
                  Check-Out Details
                </th>
              </tr>
              {/* Header Row 2: Status Columns */}
              <tr className="border-b border-slate-100 dark:border-slate-800/40 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/20 dark:bg-slate-900/10">
                <th className="px-6 py-3.5 text-left border-r border-slate-100 dark:border-slate-800/40 font-bold">
                  Department Details
                </th>
                {/* Check-in Subheaders */}
                <th className="px-6 py-3.5 text-center text-emerald-600 dark:text-emerald-400">
                  <div className="flex items-center justify-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>On-Time</span>
                  </div>
                </th>
                <th className="px-6 py-3.5 text-center text-amber-600 dark:text-amber-400">
                  <div className="flex items-center justify-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Late</span>
                  </div>
                </th>
                <th className="px-6 py-3.5 text-center text-rose-600 dark:text-rose-400 border-r border-slate-100 dark:border-slate-800/40">
                  <div className="flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Very Late</span>
                  </div>
                </th>
                {/* Check-out Subheaders */}
                <th className="px-6 py-3.5 text-center text-pink-600 dark:text-pink-400">
                  <div className="flex items-center justify-center gap-1.5">
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Early Leave</span>
                  </div>
                </th>
                <th className="px-6 py-3.5 text-center text-amber-600 dark:text-amber-400">
                  <div className="flex items-center justify-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>Early</span>
                  </div>
                </th>
                <th className="px-6 py-3.5 text-center text-sky-600 dark:text-sky-400">
                  <div className="flex items-center justify-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>On-Time</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {deptSummary.map((dept, idx) => {
                const info = getDeptIconAndStyle(dept.department);

                return (
                  <tr 
                    key={idx}
                    className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/20 dark:hover:bg-slate-900/10 transition-colors duration-150"
                  >
                    {/* Department Name Row Header */}
                    <td className="px-6 py-4 border-r border-slate-100 dark:border-slate-800/40 min-w-[200px]">
                      <div className="flex items-center gap-3">
                        <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center border shadow-sm ${info.style}`}>
                          <info.icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
                            {dept.department}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">
                            Total Employees: <span className="text-slate-600 dark:text-slate-400 font-extrabold">{dept.totalEmployees}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Check-in gauges */}
                    <td className="px-6 py-4 text-center">
                      <CircularKPI count={dept.onTimeIn} total={dept.totalEmployees} color="green" label="On-Time Check-in" department={dept.department} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CircularKPI count={dept.lateIn} total={dept.totalEmployees} color="orange" label="Late Check-in" department={dept.department} />
                    </td>
                    <td className="px-6 py-4 text-center border-r border-slate-100 dark:border-slate-800/40">
                      <CircularKPI count={dept.veryLateIn} total={dept.totalEmployees} color="red" label="Very Late Check-in" department={dept.department} />
                    </td>

                    {/* Check-out gauges */}
                    <td className="px-6 py-4 text-center">
                      <CircularKPI count={dept.earlyLeaveOut} total={dept.totalEmployees} color="pink" label="Early Leave Check-out" department={dept.department} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CircularKPI count={dept.earlyOut} total={dept.totalEmployees} color="orange" label="Early Check-out" department={dept.department} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CircularKPI count={dept.onTimeOut} total={dept.totalEmployees} color="blue" label="On-Time Check-out" department={dept.department} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
              <Building2 className="h-5 w-5 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No department data available</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Department-wise metrics will appear here once attendance records are parsed.
            </p>
          </div>
        )}
      </div>

      {/* Footer Legend Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/20 px-6 py-4 dark:border-slate-800/40 dark:bg-slate-900/10">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/35" />
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">On-Time (Check-in)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/35" />
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Late</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/35" />
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Very Late</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-pink-500 shadow-sm shadow-pink-500/35" />
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Early Leave</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/35" />
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Early</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow-sm shadow-sky-500/35" />
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">On-Time (Check-out)</span>
          </div>
        </div>
        
        {/* <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 shrink-0">
          <Info className="w-4 h-4" />
          <span className="text-[10px] font-bold tracking-wide">Counts are unique employees</span>
        </div> */}
      </div>
    </div>
  );
};

export default DepartmentSlotSummary;
