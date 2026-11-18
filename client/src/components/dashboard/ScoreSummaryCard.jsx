import React from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { Button, SkeletonCard } from '../ui';
import { RadialRingSection } from './AnuvadiniAdvancedCharts';

/* ─────────────────────────────────────────────────────────────────────────────
   Today's Score & Attendance Summary Card (Combined 3-Column Layout)
───────────────────────────────────────────────────────────────────────────── */

function buildRadarData({ presentCount, absentCount, totalStudents, attendanceRate, averageInTime, slotTotals }) {
  const total = totalStudents || (presentCount + absentCount) || 1;
  const rate = attendanceRate ?? ((presentCount / total) * 105);
  const completionPct = slotTotals?.in > 0
    ? Math.min(100, (((slotTotals.in - (slotTotals.no || 0)) / slotTotals.in) * 100))
    : 50;
  const absentPct = total > 0 ? Math.min(100, ((absentCount / total) * 100)) : 0;
  
  const parseTime = (t) => {
    if (!t || t === '00:00') return 9.5;
    const [h, m] = t.split(':').map(Number);
    return h + m / 60;
  };
  const avgHour = parseTime(averageInTime);
  const punctualityScore = Math.max(0, Math.min(100, 100 - (avgHour - 8.5) * 30));

  return [
    { metric: 'Attendance Rate',       value: Math.round(rate),             benchmark: 90 },
    { metric: 'Punctuality',            value: Math.round(punctualityScore), benchmark: 80 },
    { metric: 'Full-day Completion',   value: Math.round(completionPct),    benchmark: 85 },
    { metric: 'Present Strength',      value: Math.round((presentCount / total) * 100), benchmark: 90 },
    { metric: 'Absenteeism Control',   value: Math.max(0, Math.round(100 - absentPct)), benchmark: 85 },
  ];
}

function ScoreBar({ label, value, color }) {
  return (
    <div>
      <div className="flex justify-between text-[13px] mb-2">
        <span className="text-slate-500 dark:text-slate-400 font-semibold">{label}</span>
        <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">{value}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800">
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

function KpiTile({ label, value, color }) {
  return (
    <div className="rounded-2xl p-4 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-sm">
      <div className="kicker-label text-slate-400 dark:text-slate-500 text-[10px]">{label}</div>
      <div className="font-black text-2xl mt-1 tabular-nums" style={{ color, fontFamily: "'Geist','Inter',sans-serif" }}>
        {value}
      </div>
    </div>
  );
}

const ScoreSummaryCard = ({
  todayPresentCount = 0,
  todayAbsentCount  = 0,
  todayLeaveCount   = 0,
  todayUnapprovedCount = 0,
  overallRate       = {},
  attendanceStats   = {},
  slotTotals        = {},
  onRefresh,
  statsLoading = false,
}) => {
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

  const presentPct = totalStudents > 0 ? (todayPresentCount / totalStudents) * 100 : 0;
  const absentPct  = totalStudents > 0 ? (todayAbsentCount  / totalStudents) * 100 : 0;
  const ratePct    = Number.isFinite(overallRate?.attendanceRate) ? overallRate.attendanceRate : presentPct;

  const bars = [
    { label: 'Present',         pct: presentPct, count: todayPresentCount, total: totalStudents, color: '#4A74F0' },
    { label: 'Absent',          pct: absentPct,  count: todayAbsentCount,  total: totalStudents, color: '#f43f5e' },
    { label: 'Attendance Rate', pct: ratePct,    count: Number(ratePct).toFixed(1) + '%', total: null, color: '#315CE8' },
  ];

  return (
    <div
      className="w-full flex flex-col flex-1"
      style={{
        padding: '24px 20px 12px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between pb-5 border-b border-slate-200 dark:border-slate-800 mb-8">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl grid place-items-center flex-shrink-0"
            style={{ background: 'rgba(49, 92, 232,0.12)', border: '1px solid rgba(49, 92, 232,0.25)' }}
          >
            <BarChart3 className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <div className="kicker-label text-slate-400 dark:text-slate-500 text-[11px] font-extrabold tracking-widest">METRIC BREAKDOWN & STATISTICS</div>
            <h3 className="font-black text-[32px] text-slate-900 dark:text-slate-100 leading-tight mt-1"
              style={{ fontFamily: "'Geist','Inter',sans-serif", letterSpacing: '-0.03em' }}>
              Today's Score & Attendance Summary
            </h3>
          </div>
        </div>
        {onRefresh && (
          <Button
            size="sm"
            icon={RefreshCw}
            onClick={onRefresh}
            title="Refresh statistics"
            className="px-5 py-2.5 text-sm font-semibold rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-md shadow-emerald-800/10 transition-all duration-300"
          >
            Refresh
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-stretch flex-1">
        {/* Left Column: Metric Breakdown */}
        <div className="flex flex-col justify-between">
          <div>
            <div className="text-[22px] font-black text-slate-900 dark:text-slate-100 tracking-tight mb-6"
              style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
              Today's Score Summary
            </div>
            <div className="space-y-6">
              {radarData.map((r) => (
                <ScoreBar
                  key={r.metric}
                  label={r.metric}
                  value={r.value}
                  color={r.value >= r.benchmark ? '#4A74F0' : r.value >= r.benchmark - 15 ? '#f59e0b' : '#f43f5e'}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Middle Column: Attendance Statistics & KPI Tiles */}
        <div className="flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 pt-8 lg:pt-0 lg:pl-12">
          {statsLoading ? (
            <div className="h-full flex items-center justify-center">
              <SkeletonCard lines={5} />
            </div>
          ) : (
            <div className="flex flex-col h-full justify-start gap-6">
              <div>
                <div className="text-[22px] font-black text-slate-900 dark:text-slate-100 tracking-tight mb-6"
                  style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
                  Attendance Statistics
                </div>
                <div className="space-y-6">
                  {bars.map(b => (
                    <div key={b.label}>
                      <div className="flex justify-between text-[13px] mb-2">
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">{b.label}</span>
                        <span className="font-bold text-slate-850 dark:text-slate-200 tabular-nums">
                          {b.total != null ? `${b.count} / ${b.total}` : b.count}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-out"
                          style={{
                            width: `${Math.min(100, Math.max(0, b.pct))}%`,
                            background: `linear-gradient(90deg, ${b.color}, ${b.color}cc)`,
                            boxShadow: `0 0 8px ${b.color}44`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* KPI Tiles */}
              <div className="grid grid-cols-2 gap-4 pt-5 border-t border-slate-200 dark:border-slate-800">
                <KpiTile label="Avg In-Time" value={attendanceStats?.kpis?.averageInTime || '—'} color="#315CE8" />
                <KpiTile label="Avg Out-Time" value={attendanceStats?.kpis?.averageOutTime || '—'} color="#6F8DF0" />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Attendance Ring */}
        <div className="flex flex-col border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 pt-8 lg:pt-0 lg:pl-12 justify-between">
          <div>
            <div className="text-[22px] font-black text-slate-900 dark:text-slate-100 tracking-tight mb-6"
              style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
              Attendance Ring
            </div>
            <div className="flex items-center justify-center min-h-[320px]">
              <RadialRingSection
                present={todayPresentCount}
                absent={todayAbsentCount}
                leave={todayLeaveCount}
                unapproved={todayUnapprovedCount}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScoreSummaryCard;
