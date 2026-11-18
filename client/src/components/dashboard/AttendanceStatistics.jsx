import React, { Suspense } from 'react';
import { RefreshCw, BarChart3, UserCheck, UserX, Clock, LogOut } from 'lucide-react';
import AttendanceTrendChart from '../AttendanceTrendChart';
import { Button, SkeletonCard } from '../ui';

const AttendanceStatistics = ({ attendanceStats, statsLoading, onRefresh }) => {
  const totalPresent = attendanceStats?.trendData?.reduce((s, d) => s + (d.present || 0), 0) ?? 0;
  const totalAbsent  = attendanceStats?.trendData?.reduce((s, d) => s + (d.absent  || 0), 0) ?? 0;
  const avgIn  = attendanceStats?.kpis?.averageInTime  || '—';
  const avgOut = attendanceStats?.kpis?.averageOutTime || '—';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-elevation-1 transition-shadow hover:shadow-elevation-2 dark:border-slate-700/60 dark:bg-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-4 dark:border-slate-700/60 dark:bg-slate-800/80">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/30">
            <BarChart3 className="h-4 w-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Attendance Statistics
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" icon={RefreshCw} onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      <div className="p-5">
        {statsLoading ? (
          <SkeletonCard lines={5} />
        ) : (
          <div className="space-y-6">
            {/* Trend chart */}
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Present vs Absent Trend
              </p>
              <Suspense fallback={<SkeletonCard lines={4} />}>
                <AttendanceTrendChart data={attendanceStats.trendData} />
              </Suspense>

              {/* Present / Absent summary */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-success-100 bg-success-50/60 p-4 dark:border-success-900/30 dark:bg-success-900/10">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-100 dark:bg-success-900/40">
                    <UserCheck className="h-4 w-4 text-success-600 dark:text-success-400" />
                  </span>
                  <div>
                    <p className="text-xl font-bold tabular-nums text-success-700 dark:text-success-400">
                      {totalPresent}
                    </p>
                    <p className="text-xs font-medium text-success-600 dark:text-success-500">
                      Total Present
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-danger-100 bg-danger-50/60 p-4 dark:border-danger-900/30 dark:bg-danger-900/10">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-100 dark:bg-danger-900/40">
                    <UserX className="h-4 w-4 text-danger-600 dark:text-danger-400" />
                  </span>
                  <div>
                    <p className="text-xl font-bold tabular-nums text-danger-700 dark:text-danger-400">
                      {totalAbsent}
                    </p>
                    <p className="text-xs font-medium text-danger-600 dark:text-danger-500">
                      Total Absent
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* KPI tiles */}
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Key Performance Indicators
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Avg In-Time',  value: avgIn,  icon: Clock,  color: 'text-primary-600 dark:text-primary-400', bg: 'bg-primary-50 dark:bg-primary-900/20' },
                  { label: 'Avg Out-Time', value: avgOut, icon: LogOut, color: 'text-info-600 dark:text-info-400',    bg: 'bg-info-50 dark:bg-info-900/20' },
                ].map((kpi) => (
                  <div key={kpi.label} className={`flex flex-col items-center rounded-xl p-4 ${kpi.bg}`}>
                    <kpi.icon className={`mb-1.5 h-5 w-5 ${kpi.color}`} aria-hidden="true" />
                    <p className={`text-2xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceStatistics;
