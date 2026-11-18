import React from 'react';
import { Signal, TrendingUp, BarChart2, Clock } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { EmptyState } from '../ui';
import { useChartTheme, CHART_COLORS } from './chartTheme';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass bg-white/95 px-4 py-3 dark:bg-slate-900/95">
      <p className="mb-1 text-xs font-semibold text-slate-400 dark:text-slate-500">Time: {label}</p>
      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-450">
        {payload[0].value} check-ins
      </p>
    </div>
  );
};

const LiveAttendanceChart = ({ liveAttendanceData, earlyBirds = [], className = '' }) => {
  const chartTheme = useChartTheme();

  if (!liveAttendanceData || liveAttendanceData.length === 0) {
    return (
      <div
        className={`relative rounded-3xl overflow-hidden flex flex-col bento-hover-anuvadini transition-all duration-300 ${className}`}
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.80))',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.85)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 56px -28px rgba(10,20,36,0.18)',
        }}
      >
        <span className="shine-overlay-anuvadini rounded-3xl opacity-40 pointer-events-none" />
        <div className="relative flex-1 flex flex-col">
          <div className="border-b border-slate-150/80 bg-white/40 px-5 py-4 dark:border-slate-800/40">
            <div className="flex items-center gap-2">
              <Signal className="h-4 w-4 text-emerald-600 dark:text-emerald-450" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Live Attendance Chart
              </h3>
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-250 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                <span className="live-dot" />
                Live
              </span>
            </div>
          </div>
          <EmptyState
            icon={Signal}
            title="Monitoring active"
            message="Data will appear here as staff check in."
          />
        </div>
      </div>
    );
  }

  const latest = liveAttendanceData[liveAttendanceData.length - 1]?.count ?? 0;
  const peak = Math.max(...liveAttendanceData.map((d) => d.count));
  const slots = liveAttendanceData.length;

  return (
    <div
      className={`relative rounded-3xl overflow-hidden flex flex-col bento-hover-anuvadini transition-all duration-300 ${className}`}
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.80))',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.85)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 56px -28px rgba(10,20,36,0.18)',
      }}
    >
      <span className="shine-overlay-anuvadini rounded-3xl opacity-40 pointer-events-none" />
      <div className="relative flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-150/80 bg-white/40 px-5 py-4 dark:border-slate-800/40">
          <Signal className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-450" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Live Attendance Chart
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">Real-time check-in monitoring</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-250 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
            <span className="live-dot" aria-hidden="true" />
            Live
          </span>
        </div>

        <div className="p-5 flex-1 flex flex-col justify-between">
          {/* Chart */}
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={liveAttendanceData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <defs>
                  <linearGradient id="liveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#315CE8" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#315CE8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ ...chartTheme.axisTick, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ ...chartTheme.axisTick, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  domain={['dataMin - 1', 'dataMax + 1']}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2.5}
                  fill="url(#liveGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: CHART_COLORS.primary, stroke: '#fff', strokeWidth: 2 }}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Stats row */}
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            {[
              { label: 'Total today', value: latest, icon: BarChart2, color: 'text-emerald-600 dark:text-emerald-450', bg: 'bg-emerald-50/30 dark:bg-emerald-950/10' },
              { label: 'Peak count', value: peak, icon: TrendingUp, color: 'text-amber-600 dark:text-amber-450', bg: 'bg-amber-50/30 dark:bg-amber-950/10' },
              { label: 'Time slots', value: slots, icon: Clock, color: 'text-sky-600 dark:text-sky-450', bg: 'bg-sky-50/30 dark:bg-sky-950/10' },
            ].map((s) => (
              <div key={s.label} className={`flex flex-col items-center rounded-xl p-3 border border-slate-100 dark:border-slate-800/60 transition-transform duration-200 hover:scale-[1.03] ${s.bg}`}>
                <s.icon className={`mb-1 h-4 w-4 ${s.color}`} aria-hidden="true" />
                <p className={`text-xl font-black tabular-nums stat-mega ${s.color}`}>{s.value}</p>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* Early birds */}
          {earlyBirds.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Top 3 Early Birds
              </p>
              <ul className="overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800/80">
                {earlyBirds.slice(0, 3).map((eb, i) => (
                  <li
                    key={eb?.student?._id ?? i}
                    className="flex items-center justify-between gap-3 border-b border-slate-50 px-4 py-2.5 last:border-b-0 transition-colors hover:bg-emerald-50/20 dark:border-slate-800 dark:hover:bg-emerald-950/10"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#315CE8] to-[#101827] text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {eb?.student?.fullName ?? 'Unknown'}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          {eb?.student?.uid}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900">
                      {new Date(eb.inTs).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveAttendanceChart;
