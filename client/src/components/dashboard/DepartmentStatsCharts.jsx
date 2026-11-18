import React, { useMemo } from 'react';
import { 
  BarChart2, 
  PieChart as PieIcon,
  Activity
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip as RechartsTooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { useTheme } from '../../ThemeContext';

const DepartmentStatsCharts = ({ deptDetailedStats = [], slotMode = 'day', slotDate }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Overall totals across all departments
  const overallTotals = useMemo(() => {
    let total = 0, present = 0, absent = 0, field = 0, leave = 0;
    deptDetailedStats.forEach(s => {
      total += s.totalEmployees || 0;
      present += s.presentCount || 0;
      absent += s.absentCount || 0;
      field += s.onFieldCount || 0;
      leave += s.onLeaveCount || 0;
    });
    return { total, present, absent, field, leave };
  }, [deptDetailedStats]);

  // Pie chart data
  const pieData = useMemo(() => {
    return [
      { name: 'Present', value: overallTotals.present, color: '#4A74F0' },
      { name: 'On Field', value: overallTotals.field, color: '#f59e0b' },
      { name: 'On Leave', value: overallTotals.leave, color: '#a855f7' },
      { name: 'Absent', value: overallTotals.absent, color: '#f43f5e' }
    ].filter(d => d.value > 0);
  }, [overallTotals]);

  // Bar chart data (department-wise)
  const barData = useMemo(() => {
    return deptDetailedStats.map(stat => ({
      name: stat.department,
      Present: stat.presentCount,
      'On Field': stat.onFieldCount,
      'On Leave': stat.onLeaveCount,
      Absent: stat.absentCount
    }));
  }, [deptDetailedStats]);

  return (
    <div className="glass overflow-hidden transition-all duration-300 flex flex-col w-full bg-white dark:bg-slate-900/60 rounded-[24px] border border-slate-150/80 dark:border-slate-800/40 shadow-sm mt-6">
      {/* Header Area */}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-white/40 px-6 py-5 dark:border-slate-800/40">
        <div className="w-10 h-10 rounded-2xl grid place-items-center bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400 shadow-sm border border-indigo-100/50">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
            Department-wise Graphical Analytics
          </h3>
          <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
            Visual representation of presence, field duty, leaves, and absences • Date: {slotDate}
          </p>
        </div>
      </div>

      {/* Graphical Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 p-6 bg-slate-50/[0.05] dark:bg-slate-900/5">
        {/* Pie Chart: Overall Distribution */}
        <div className="xl:col-span-2 bg-white dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-150/80 dark:border-slate-800/40 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <PieIcon className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">Overall Distribution</span>
          </div>
          {pieData.length > 0 ? (
            <div className="h-64 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{
                      backgroundColor: isDark ? '#1e293b' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#e2e8f0',
                      borderRadius: '12px',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center text of Pie Chart */}
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Present</span>
                <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                  {overallTotals.total > 0 ? Math.round((overallTotals.present / overallTotals.total) * 100) : 0}%
                </span>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400">No data available for chart</div>
          )}
          {/* Custom Legend */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-2">
            {pieData.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{entry.name} ({Math.round(entry.value * 10) / 10})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stacked Bar Chart: Department breakdown */}
        <div className="xl:col-span-3 bg-white dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-150/80 dark:border-slate-800/40 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">Department-wise Breakdown</span>
          </div>
          {barData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155/30' : '#e2e8f0/70'} vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 9, fontWeight: 'bold' }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 9, fontWeight: 'bold' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#1e293b' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#e2e8f0',
                      borderRadius: '12px',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', color: isDark ? '#94a3b8' : '#64748b' }}
                  />
                  <Bar dataKey="Present" stackId="a" fill="#4A74F0" />
                  <Bar dataKey="On Field" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="On Leave" stackId="a" fill="#a855f7" />
                  <Bar dataKey="Absent" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400">No data available for chart</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DepartmentStatsCharts;
