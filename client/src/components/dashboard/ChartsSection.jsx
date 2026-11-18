import React, { Suspense } from 'react';
import { User, Clock, TrendingUp, Users, Activity, UserX } from "lucide-react";
import GenderPieChart from '../GenderPieChart';
import MonthlyAttendanceLineChart from '../MonthlyAttendanceLineChart';
import TimeWisePieChart from '../TimeWisePieChart';
import LazyOnVisible from '../LazyOnVisible';
import ReactApexChart from 'react-apexcharts';
import { EmptyState, SkeletonCard, SkeletonTable } from '../ui';
import { useChartTheme, HEATMAP_RANGES, HEATMAP_COLORS } from './chartTheme';

const ChartsSection = ({
  genderDistribution,
  genderLoading,
  genderTotal,
  monthlyTrend,
  timeWiseData,
  heatmapSlots,
  heatmapDepartments,
  heatmapSeries,
  selectedHeatmapDept,
  selectedHeatmapSlot,
  absentStudents,
  absentLoading,
  absentError,
  onHeatmapClick,
  onNavigate
}) => {
  const chartTheme = useChartTheme();

  const chartCardHeader = (Icon, title, subtitle) => (
    <div className="card-header">
      <div className="flex items-center space-x-3">
        <div className="p-2 rounded-md bg-primary-50 dark:bg-primary-900/40">
          <Icon className="w-5 h-5 text-primary-600 dark:text-primary-300" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Charts Grid - 2x2 Layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Gender Distribution Chart - Top Left */}
        <div className="card">
          {chartCardHeader(Users, 'Gender Distribution', 'Student distribution by gender')}
          <div className="card-body p-6">
            {genderLoading ? (
              <SkeletonCard lines={5} />
            ) : genderDistribution.length > 0 ? (
              <Suspense fallback={<SkeletonCard lines={5} />}>
                <GenderPieChart data={genderDistribution} total={genderTotal} />
              </Suspense>
            ) : (
              <EmptyState
                icon={User}
                title="No data available"
                message="Gender distribution data will appear here once students are registered."
              />
            )}
          </div>
        </div>

        {/* Monthly Attendance Line Chart - Top Right */}
        <div className="card">
          {chartCardHeader(TrendingUp, 'Monthly Attendance Trend', 'Attendance count over time')}
          <div className="card-body p-6">
            <Suspense fallback={<SkeletonCard lines={5} />}>
              <MonthlyAttendanceLineChart data={monthlyTrend} />
            </Suspense>
          </div>
        </div>

        {/* Department vs Attendance Heatmap - Bottom Left */}
        <div className="card">
          {chartCardHeader(Activity, 'Department Heatmap', 'Attendance timing by department')}
          <div className="card-body p-6">
            <Suspense fallback={<SkeletonCard lines={5} />}>
              <LazyOnVisible>
                <ReactApexChart
                  options={{
                    chart: {
                      type: 'heatmap',
                      height: 300,
                      toolbar: {
                        show: false
                      },
                      events: {
                        dataPointSelection: (event, chartContext, config) => {
                          const seriesIndex = config.seriesIndex;
                          const dataPointIndex = config.dataPointIndex;
                          const departmentName = (heatmapSeries[seriesIndex] && heatmapSeries[seriesIndex].name) || heatmapDepartments[seriesIndex];
                          const slotLabel = heatmapSlots[dataPointIndex];
                          if (departmentName) {
                            onHeatmapClick(departmentName, slotLabel);
                          }
                        }
                      }
                    },
                    dataLabels: {
                      enabled: false
                    },
                    colors: HEATMAP_COLORS,
                    xaxis: {
                      categories: heatmapSlots.length ? heatmapSlots : [
                        '8:00–8:30',
                        '8:30–9:00',
                        '9:00–9:30',
                        '9:30–10:00',
                        '10:00–10:30',
                        '10:30–11:00',
                        '11:00+'
                      ],
                      labels: {
                        style: {
                          colors: chartTheme.axisColor,
                          fontSize: '12px'
                        }
                      }
                    },
                    yaxis: {
                      categories: heatmapDepartments.length ? heatmapDepartments : ['tech', 'marketing', 'sales'],
                      labels: {
                        style: {
                          colors: chartTheme.axisColor,
                          fontSize: '12px'
                        }
                      }
                    },
                    plotOptions: {
                      heatmap: {
                        radius: 4,
                        enableShades: true,
                        shadeIntensity: 0.5,
                        distributed: false,
                        useFillColorAsStroke: false,
                        colorScale: {
                          ranges: HEATMAP_RANGES
                        }
                      }
                    },
                    tooltip: {
                      theme: chartTheme.isDark ? 'dark' : 'light',
                      y: {
                        formatter: function (val) {
                          return val + ' students';
                        }
                      }
                    },
                    legend: {
                      show: true,
                      position: 'bottom',
                      horizontalAlign: 'center',
                      labels: {
                        colors: chartTheme.axisColor
                      }
                    }
                  }}
                  series={heatmapSeries.length ? heatmapSeries : [
                    { name: 'tech', data: [5, 6, 7, 8, 4, 3, 2] },
                    { name: 'marketing', data: [3, 2, 1, 4, 5, 6, 7] },
                    { name: 'sales', data: [6, 7, 5, 4, 8, 7, 6] }
                  ]}
                  type="heatmap"
                  height={300}
                />
              </LazyOnVisible>
            </Suspense>
          </div>
        </div>

        {/* Time-wise Statistics - Bottom Right */}
        <div className="card">
          {chartCardHeader(Clock, 'Check-in Time Distribution', "Today's arrival time patterns")}
          <div className="card-body p-6">
            {timeWiseData && timeWiseData.length > 0 ? (
              <Suspense fallback={<SkeletonCard lines={5} />}>
                <TimeWisePieChart data={timeWiseData} />
              </Suspense>
            ) : (
              <EmptyState
                icon={Clock}
                title="No check-in data"
                message="Time statistics will appear once students check in today."
              />
            )}
          </div>
        </div>
      </div>

      {/* Heatmap Absent Students Section - Full Width Below Grid */}
      {selectedHeatmapDept && (
        <div className="card">
          <div className="card-header">
            <h4 className="text-md font-semibold text-slate-900 dark:text-slate-100">
              Absenties in {selectedHeatmapDept} {selectedHeatmapSlot ? `(${selectedHeatmapSlot})` : ''} - Today
            </h4>
          </div>
          <div className="card-body">
            {absentLoading ? (
              <SkeletonTable rows={3} cols={2} />
            ) : absentError ? (
              <div className="text-danger-600 dark:text-danger-400 text-sm">{absentError}</div>
            ) : (
              <div className="overflow-x-auto">
                {absentStudents.length === 0 ? (
                  <EmptyState
                    icon={UserX}
                    title="No absentees found"
                    message="Everyone in this group has an attendance record for today."
                  />
                ) : (
                  <table className="table dark:divide-slate-700">
                    <thead className="table-header dark:bg-slate-800">
                      <tr>
                        <th className="table-header-cell dark:text-slate-400">Student</th>
                        <th className="table-header-cell dark:text-slate-400">UID</th>
                      </tr>
                    </thead>
                    <tbody className="table-body dark:bg-slate-800 dark:divide-slate-700">
                      {absentStudents.map((s) => (
                        <tr
                          key={s._id}
                          className="hover:bg-danger-50 dark:hover:bg-danger-900/20 cursor-pointer transition-colors duration-150 motion-reduce:transition-none"
                          onClick={() => onNavigate(`/student-report/${s._id}`)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onNavigate(`/student-report/${s._id}`);
                            }
                          }}
                          title="Click to view student details"
                        >
                          <td className="table-cell dark:text-slate-100">
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-danger-100 dark:bg-danger-900/40 flex items-center justify-center mr-3">
                                <span className="text-sm font-medium text-danger-600 dark:text-danger-300">
                                  {s.fullName?.charAt(0)}
                                </span>
                              </div>
                              <span>{s.fullName}</span>
                            </div>
                          </td>
                          <td className="table-cell dark:text-slate-100">{s.uid}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartsSection;
