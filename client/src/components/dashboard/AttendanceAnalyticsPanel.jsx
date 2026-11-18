import React, { useState } from 'react';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
} from 'recharts';
import { Activity, BarChart3 } from 'lucide-react';
import LiveAttendanceChart from './LiveAttendanceChart';

/* ─────────────────────────────────────────────────────────────────────────────
   Anuvadini Analytics Panel (NATS Maps inspired)
   • Radar chart: attendance metrics polar comparison
   • Bar chart: department / time-slot comparison
   • Glass card shell with kicker headers
───────────────────────────────────────────────────────────────────────────── */

const TOOLTIP_STYLE = {
  background: 'rgba(255,253,247,0.96)',
  border: '1px solid rgba(10,20,36,0.10)',
  borderRadius: 12,
  color: '#0a1424',
  fontSize: 12,
  fontFamily: "'Geist', sans-serif",
  boxShadow: '0 12px 32px -12px rgba(10,20,36,0.22)',
};

/* Radar data builder from dashboard state */
function buildRadarData({ presentCount, absentCount, totalStudents, attendanceRate, averageInTime, slotTotals }) {
  const total = totalStudents || (presentCount + absentCount) || 1;
  const rate = attendanceRate ?? ((presentCount / total) * 100);
  const earlyPct = slotTotals?.in > 0
    ? Math.min(100, (((slotTotals.in - (slotTotals.no || 0)) / slotTotals.in) * 100))
    : 50;
  const completionPct = slotTotals?.in > 0
    ? Math.min(100, (((slotTotals.in - (slotTotals.no || 0)) / slotTotals.in) * 100))
    : 50;
  const absentPct = total > 0 ? Math.min(100, ((absentCount / total) * 100)) : 0;
  // Parse avg in time — earlier = better score
  const parseTime = (t) => {
    if (!t || t === '00:00') return 9.5;
    const [h, m] = t.split(':').map(Number);
    return h + m / 60;
  };
  const avgHour = parseTime(averageInTime);
  const punctualityScore = Math.max(0, Math.min(100, 100 - (avgHour - 8.5) * 30));

  return [
    { metric: 'Attendance\nRate',       value: Math.round(rate),             benchmark: 90 },
    { metric: 'Punctuality',            value: Math.round(punctualityScore), benchmark: 80 },
    { metric: 'Full-day\nCompletion',   value: Math.round(completionPct),    benchmark: 85 },
    { metric: 'Present\nStrength',      value: Math.round((presentCount / total) * 100), benchmark: 90 },
    { metric: 'Absenteeism\nControl',   value: Math.max(0, Math.round(100 - absentPct)), benchmark: 85 },
  ];
}

/* Glass wrapper card */
function GlassCard({ children, className = '' }) {
  return (
    <div
      className={`relative rounded-3xl overflow-hidden flex flex-col bento-hover-anuvadini ${className}`}
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.80))',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.85)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 56px -28px rgba(10,20,36,0.18)',
      }}
    >
      <span className="shine-overlay-anuvadini rounded-3xl opacity-40" />
      <div className="relative flex-1 flex flex-col">{children}</div>
    </div>
  );
}

function PanelHead({ icon: Icon, kicker, title }) {
  return (
    <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
      <div
        className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0"
        style={{ background: 'rgba(49, 92, 232,0.12)', border: '1px solid rgba(49, 92, 232,0.25)' }}
      >
        <Icon className="w-4 h-4 text-emerald-700" />
      </div>
      <div>
        <div className="kicker-label text-slate-400">{kicker}</div>
        <div className="font-bold text-[15px] text-slate-800 leading-tight mt-0.5"
          style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
          {title}
        </div>
      </div>
    </div>
  );
}

/* Graduation bar for radar legend */
function ScoreBar({ label, value, color }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-slate-500">{label}</span>
        <span className="font-bold text-slate-700">{value}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(10,20,36,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            background: `linear-gradient(90deg, ${color}, ${color}aa)`,
            boxShadow: `0 0 8px ${color}55`,
          }}
        />
      </div>
    </div>
  );
}

/* ── Main exported component ── */
const AttendanceAnalyticsPanel = ({
  todayPresentCount = 0,
  todayAbsentCount  = 0,
  overallRate       = {},
  attendanceStats   = {},
  slotTotals        = {},
  genderDistribution = [],
  authMethodDistribution = [],
  chartData         = [],
  liveAttendanceData = [],
  earlyBirds        = [],
}) => {
  const [tab, setTab] = useState('radar'); // 'radar' | 'trend'

  const totalStudents = overallRate?.totalStudents || (todayPresentCount + todayAbsentCount) || 0;
  const attendanceRate = Number.isFinite(overallRate?.attendanceRate)
    ? overallRate.attendanceRate
    : totalStudents > 0 ? (todayPresentCount / totalStudents) * 100 : 0;

  const radarData = buildRadarData({
    presentCount: todayPresentCount,
    absentCount: todayAbsentCount,
    totalStudents,
    attendanceRate,
    averageInTime: attendanceStats?.kpis?.averageInTime,
    slotTotals,
  });

  /* Bar chart: last 10 days trend */
  const trendBars = (chartData || []).slice().reverse().slice(-10).map(d => ({
    date: d.date ? new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '',
    present: d.count || d.present || 0,
    absent: Math.max(0, (d.totalStudents || 0) - (d.count || d.present || 0)),
    total: d.totalStudents || 0,
  }));

  /* Auth method distribution bars */
  const AUTH_COLORS = {
    'face': '#4A74F0',
    'fingerprint': '#6F8DF0',
    'manual': '#f59e0b',
    'barcode': '#8b5cf6',
    'qr': '#6AA51F',
    'default': '#94a3b8',
  };

  const authBars = authMethodDistribution.map(d => ({
    name: (d.method || d.name || 'Other').replace(/_/g, ' '),
    value: d.count || d.value || 0,
    color: AUTH_COLORS[d.method?.toLowerCase()] || AUTH_COLORS.default,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full items-stretch">
      {/* ── Radar / Trend Chart Card ── */}
      <GlassCard className="w-full min-h-[460px] relative p-0 overflow-hidden flex flex-col h-full">
        {/* Header Title Layer */}
        <div className="absolute top-5 left-5 z-10 select-none">
          <PanelHead icon={Activity} kicker="POLAR PLOT · NORMALISED METRICS" title="Attendance Performance Radar" />
        </div>

        {/* Absolute Tab Switcher Controls */}
        <div className="absolute top-5 right-5 z-20">
          <div className="inline-flex rounded-full p-0.5"
            style={{ background: 'rgba(10,20,36,0.06)', border: '1px solid rgba(10,20,36,0.08)', backdropFilter: 'blur(8px)' }}>
            {[['radar', 'Radar View'], ['trend', '10-Day Trend']].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className="px-3 py-1 text-[11px] font-bold rounded-full transition-all cursor-pointer"
                style={tab === v
                  ? { background: '#315CE8', color: '#fff', fontFamily: "'Geist',sans-serif" }
                  : { color: '#6b7280', fontFamily: "'Geist',sans-serif" }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {tab === 'radar' ? (
          <div className="absolute inset-0 flex flex-col pt-20 pb-5 px-4">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 30, right: 40, bottom: 20, left: 40 }}>
                <PolarGrid stroke="rgba(10,20,36,0.08)" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: '#4b5563', fontSize: 11.5, fontFamily: "'Geist','JetBrains Mono',monospace", fontWeight: 'bold' }}
                />
                <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                <Radar
                  name="Today"
                  dataKey="value"
                  stroke="#315CE8"
                  fill="#315CE8"
                  fillOpacity={0.24}
                  strokeWidth={2.4}
                  dot={{ fill: '#315CE8', r: 4 }}
                />
                <Radar
                  name="Benchmark"
                  dataKey="benchmark"
                  stroke="#6AA51F"
                  fill="#6AA51F"
                  fillOpacity={0.10}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, '']} />
                <Legend
                  wrapperStyle={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 2, textTransform: 'uppercase', paddingTop: 8 }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col pt-24 pb-5 px-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendBars} margin={{ top: 10, right: 10, left: -26, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,20,36,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#9ca3af', fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#9ca3af', fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="present" name="Present" fill="#4A74F0" radius={[4, 4, 0, 0]}>
                  {trendBars.map((_, i) => (
                    <Cell key={i} fill={_.isWeekend ? '#9ca3af' : '#4A74F0'} />
                  ))}
                </Bar>
                <Bar dataKey="absent" name="Absent" fill="#f43f5e" radius={[4, 4, 0, 0]} fillOpacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </GlassCard>

      {/* ── Live Attendance Chart Card ── */}
      <div className="w-full flex flex-col h-full">
        <LiveAttendanceChart
          liveAttendanceData={liveAttendanceData}
          earlyBirds={earlyBirds}
          className="w-full h-full min-h-[460px]"
        />
      </div>
    </div>
  );
};

function KpiTile({ label, value, color }) {
  return (
    <div className="rounded-2xl p-3 text-center" style={{ background: `${color}0f`, border: `1px solid ${color}25` }}>
      <div className="kicker-label text-slate-400 text-[9px]">{label}</div>
      <div className="font-black text-xl mt-1 tabular-nums" style={{ color, fontFamily: "'Geist','Inter',sans-serif" }}>
        {value}
      </div>
    </div>
  );
}

export default AttendanceAnalyticsPanel;
