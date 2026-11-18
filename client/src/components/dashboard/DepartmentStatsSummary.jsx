import React, { useState, useMemo } from 'react';
import {
  Building2,
  Users,
  UserCheck,
  UserX,
  Briefcase,
  Calendar,
  Search,
  ChevronDown,
  ChevronUp,
  MapPin,
  FileText,
  Download
} from 'lucide-react';
import { useTheme } from '../../ThemeContext';

// Helper component for Department Icon and styling
const getDeptIconAndStyle = (deptName) => {
  return {
    icon: Building2,
    style: 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-100 dark:border-slate-700/50'
  };
};

const DepartmentStatsSummary = ({ deptDetailedStats = [], slotMode = 'day', slotDate }) => {
  const { theme } = useTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedDepts, setExpandedDepts] = useState({});
  const [activeTabs, setActiveTabs] = useState({}); // deptName -> activeTab

  const toggleExpand = (deptName) => {
    setExpandedDepts(prev => ({
      ...prev,
      [deptName]: !prev[deptName]
    }));
    if (!activeTabs[deptName]) {
      setActiveTabs(prev => ({
        ...prev,
        [deptName]: 'absent'
      }));
    }
  };

  const setTab = (deptName, tab) => {
    setActiveTabs(prev => ({
      ...prev,
      [deptName]: tab
    }));
  };

  // Filter departments based on search term
  const filteredStats = useMemo(() => {
    return deptDetailedStats.filter(stat =>
      stat.department.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [deptDetailedStats, searchTerm]);

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

  // Export report to CSV
  const handleDownloadReport = () => {
    try {
      const headers = ['Department', 'Total Employees', 'Present', 'On Field', 'On Leave', 'Absent'];
      const rows = filteredStats.map(stat => [
        stat.department,
        stat.totalEmployees,
        stat.presentCount,
        stat.onFieldCount,
        stat.onLeaveCount,
        stat.absentCount
      ]);

      // Add overall totals row at the end
      rows.push([
        'Overall Total',
        overallTotals.total,
        overallTotals.present,
        overallTotals.field,
        overallTotals.leave,
        overallTotals.absent
      ]);

      const csvContent = [
        `Anuvadini Attendance & Field Duty Report - ${slotDate} (${slotMode})`,
        '',
        headers.join(','),
        ...rows.map(row => row.map(val => `"${val}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Anuvadini_Department_Stats_${slotDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to export CSV report:', error);
    }
  };

  return (
    <div className="glass overflow-hidden transition-all duration-300 flex flex-col w-full bg-white dark:bg-slate-900/60 rounded-[24px] border border-slate-150/80 dark:border-slate-800/40 shadow-sm mt-6">
      {/* Header Area */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 bg-white/40 px-6 py-5 dark:border-slate-800/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl grid place-items-center bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400 shadow-sm border border-indigo-100/50">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
              Department-wise Status & Field Duty Overview
            </h3>
            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
              Breakdown of presence, field duty, leaves, and absences • Mode: {slotMode} • Date: {slotDate}
            </p>
          </div>
        </div>

        {/* Search & Download Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative w-full sm:w-60">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-3.5 w-3.5 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="Search department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl border border-slate-200 bg-white/50 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-750 dark:bg-slate-850 dark:text-slate-200"
            />
          </div>

          {/* Download Report */}
          <button
            onClick={handleDownloadReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 text-xs font-bold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Report</span>
          </button>
        </div>
      </div>

      {/* Overall KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-6 bg-slate-50/30 dark:bg-slate-900/10 border-b border-slate-100 dark:border-slate-800/40">
        <div className="bg-white dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/40 shadow-sm">
          <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Staff</span>
          <div className="text-xl font-black text-slate-800 dark:text-slate-100 mt-0.5">{overallTotals.total}</div>
        </div>
        <div className="bg-emerald-50/30 dark:bg-emerald-950/10 p-3.5 rounded-2xl border border-emerald-100/20 dark:border-emerald-900/10 shadow-sm">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <UserCheck className="w-3.5 h-3.5" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Present</span>
          </div>
          <div className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-0.5">{overallTotals.present}</div>
        </div>
        <div className="bg-rose-50/30 dark:bg-rose-950/10 p-3.5 rounded-2xl border border-rose-100/20 dark:border-rose-900/10 shadow-sm">
          <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
            <UserX className="w-3.5 h-3.5" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Absent</span>
          </div>
          <div className="text-xl font-black text-rose-700 dark:text-rose-400 mt-0.5">{overallTotals.absent}</div>
        </div>
        <div className="bg-amber-50/30 dark:bg-amber-950/10 p-3.5 rounded-2xl border border-amber-100/20 dark:border-amber-900/10 shadow-sm">
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <Briefcase className="w-3.5 h-3.5" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">On Field</span>
          </div>
          <div className="text-xl font-black text-amber-700 dark:text-amber-400 mt-0.5">{overallTotals.field}</div>
        </div>
        <div className="bg-purple-50/30 dark:bg-purple-950/10 p-3.5 rounded-2xl border border-purple-100/20 dark:border-purple-900/10 shadow-sm">
          <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">On Leave</span>
          </div>
          <div className="text-xl font-black text-purple-700 dark:text-purple-400 mt-0.5">{overallTotals.leave}</div>
        </div>
      </div>

      {/* Main Content Table */}
      <div className="overflow-x-auto">
        {filteredStats && filteredStats.length > 0 ? (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800/40 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-50/10 dark:bg-slate-900/5">
                <th className="px-6 py-3.5 text-left min-w-[200px]">Department</th>
                <th className="px-4 py-3.5 text-center w-24">Total</th>
                <th className="px-4 py-3.5 text-center w-28 text-emerald-600 dark:text-emerald-400">Present</th>
                <th className="px-4 py-3.5 text-center w-28 text-rose-600 dark:text-rose-400">Absent</th>
                <th className="px-4 py-3.5 text-center w-28 text-amber-600 dark:text-amber-400">On Field</th>
                <th className="px-4 py-3.5 text-center w-28 text-purple-600 dark:text-purple-400">On Leave</th>
                <th className="px-6 py-3.5 text-right w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStats.map((stat, idx) => {
                const info = getDeptIconAndStyle(stat.department);
                const isExpanded = !!expandedDepts[stat.department];
                const activeTab = activeTabs[stat.department] || 'absent';

                // Percentages for mini visual bar
                const total = stat.totalEmployees || 1;
                const pPct = ((stat.presentCount || 0) / total) * 100;
                const aPct = ((stat.absentCount || 0) / total) * 100;
                const fPct = ((stat.onFieldCount || 0) / total) * 100;
                const lPct = ((stat.onLeaveCount || 0) / total) * 100;

                return (
                  <React.Fragment key={idx}>
                    <tr className={`border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/20 dark:hover:bg-slate-900/10 transition-colors duration-150 ${isExpanded ? 'bg-slate-50/10 dark:bg-slate-900/5' : ''}`}>
                      {/* Department Name */}
                      <td className="px-6 py-4.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center border shadow-sm ${info.style}`}>
                            <info.icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
                              {stat.department}
                            </div>
                            {/* Combined Mini Progress Bar */}
                            <div className="w-32 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden mt-1.5">
                              <div style={{ width: `${pPct}%` }} className="bg-emerald-500 h-full" title={`Present: ${stat.presentCount}`} />
                              <div style={{ width: `${fPct}%` }} className="bg-amber-500 h-full" title={`On Field: ${stat.onFieldCount}`} />
                              <div style={{ width: `${lPct}%` }} className="bg-purple-500 h-full" title={`On Leave: ${stat.onLeaveCount}`} />
                              <div style={{ width: `${aPct}%` }} className="bg-rose-500 h-full" title={`Absent: ${stat.absentCount}`} />
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Total Employees */}
                      <td className="px-4 py-4.5 text-center text-xs font-bold text-slate-700 dark:text-slate-300">
                        {stat.totalEmployees}
                      </td>

                      {/* Present */}
                      <td className="px-4 py-4.5 text-center">
                        <span className={`text-xs font-black px-2.5 py-1 rounded-full ${stat.presentCount > 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-600'}`}>
                          {stat.presentCount}
                        </span>
                      </td>

                      {/* Absent */}
                      <td className="px-4 py-4.5 text-center">
                        <span className={`text-xs font-black px-2.5 py-1 rounded-full ${stat.absentCount > 0 ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 font-black' : 'text-slate-400 dark:text-slate-600'}`}>
                          {stat.absentCount}
                        </span>
                      </td>

                      {/* On Field */}
                      <td className="px-4 py-4.5 text-center">
                        <span className={`text-xs font-black px-2.5 py-1 rounded-full ${stat.onFieldCount > 0 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' : 'text-slate-400 dark:text-slate-600'}`}>
                          {stat.onFieldCount}
                        </span>
                      </td>

                      {/* On Leave */}
                      <td className="px-4 py-4.5 text-center">
                        <span className={`text-xs font-black px-2.5 py-1 rounded-full ${stat.onLeaveCount > 0 ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400' : 'text-slate-400 dark:text-slate-600'}`}>
                          {stat.onLeaveCount}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4.5 text-right">
                        <button
                          onClick={() => toggleExpand(stat.department)}
                          className={`flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg border text-xs font-bold transition-all duration-150 cursor-pointer ${isExpanded
                              ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
                              : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800'
                            }`}
                        >
                          <span>{isExpanded ? 'Hide Details' : 'View Members'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Details Row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan="7" className="px-6 py-4 bg-slate-50/40 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800/40">
                          <div className="flex flex-col gap-4">
                            {/* Tab Headers */}
                            <div className="flex flex-wrap gap-2 border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                              <button
                                onClick={() => setTab(stat.department, 'absent')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${activeTab === 'absent'
                                    ? 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                  }`}
                              >
                                <UserX className="w-3.5 h-3.5" />
                                <span>Absent ({stat.absentEmployees.length})</span>
                              </button>
                              <button
                                onClick={() => setTab(stat.department, 'field')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${activeTab === 'field'
                                    ? 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                  }`}
                              >
                                <Briefcase className="w-3.5 h-3.5" />
                                <span>On Field ({stat.onFieldEmployees.length})</span>
                              </button>
                              <button
                                onClick={() => setTab(stat.department, 'leave')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${activeTab === 'leave'
                                    ? 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                  }`}
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                <span>On Leave ({stat.onLeaveEmployees.length})</span>
                              </button>
                              <button
                                onClick={() => setTab(stat.department, 'present')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${activeTab === 'present'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                  }`}
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Present ({stat.presentEmployees.length})</span>
                              </button>
                            </div>

                            {/* Tab Content */}
                            <div className="min-h-[100px]">
                              {activeTab === 'absent' && (
                                <div>
                                  {stat.absentEmployees.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                      {stat.absentEmployees.map((emp, eIdx) => (
                                        <div key={eIdx} className="flex items-center gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800/40 shadow-sm">
                                          <div className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400 grid place-items-center font-bold text-xs shrink-0">
                                            {emp.fullName?.charAt(0).toUpperCase() || 'E'}
                                          </div>
                                          <div className="min-w-0">
                                            <div className="text-xs font-bold text-slate-850 dark:text-slate-200 truncate">{emp.fullName}</div>
                                            <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500 truncate">UID: {emp.uid || 'N/A'}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500 font-bold">
                                      🎉 No absent employees in this department.
                                    </div>
                                  )}
                                </div>
                              )}

                              {activeTab === 'field' && (
                                <div>
                                  {stat.onFieldEmployees.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      {stat.onFieldEmployees.map((emp, eIdx) => (
                                        <div key={eIdx} className="flex flex-col p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800/40 shadow-sm">
                                          <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400 grid place-items-center font-bold text-xs shrink-0">
                                              {emp.fullName?.charAt(0).toUpperCase() || 'E'}
                                            </div>
                                            <div className="min-w-0">
                                              <div className="text-xs font-bold text-slate-850 dark:text-slate-200 truncate">{emp.fullName}</div>
                                              <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500">UID: {emp.uid || 'N/A'}</div>
                                            </div>
                                          </div>
                                          <div className="mt-2 flex items-start gap-1.5 bg-amber-500/[0.03] border border-amber-500/10 rounded-lg p-2 text-[10px] text-amber-700 dark:text-amber-400">
                                            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            <span className="font-semibold leading-tight">{emp.eventTitle || 'On field duty'}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500 font-bold">
                                      No employees on field duty in this department.
                                    </div>
                                  )}
                                </div>
                              )}

                              {activeTab === 'leave' && (
                                <div>
                                  {stat.onLeaveEmployees.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      {stat.onLeaveEmployees.map((emp, eIdx) => (
                                        <div key={eIdx} className="flex flex-col p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800/40 shadow-sm">
                                          <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-full bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400 grid place-items-center font-bold text-xs shrink-0">
                                              {emp.fullName?.charAt(0).toUpperCase() || 'E'}
                                            </div>
                                            <div className="min-w-0">
                                              <div className="text-xs font-bold text-slate-850 dark:text-slate-200 truncate">{emp.fullName}</div>
                                              <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500">UID: {emp.uid || 'N/A'}</div>
                                            </div>
                                          </div>
                                          <div className="mt-2 flex items-start gap-1.5 bg-purple-500/[0.03] border border-purple-500/10 rounded-lg p-2 text-[10px] text-purple-700 dark:text-purple-400">
                                            <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            <span className="font-semibold leading-tight">{emp.leaveDetails || 'On Leave'}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500 font-bold">
                                      No employees on leave in this department.
                                    </div>
                                  )}
                                </div>
                              )}

                              {activeTab === 'present' && (
                                <div>
                                  {stat.presentEmployees.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                      {stat.presentEmployees.map((emp, eIdx) => (
                                        <div key={eIdx} className="flex items-center gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800/40 shadow-sm">
                                          <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400 grid place-items-center font-bold text-xs shrink-0">
                                            {emp.fullName?.charAt(0).toUpperCase() || 'E'}
                                          </div>
                                          <div className="min-w-0">
                                            <div className="text-xs font-bold text-slate-850 dark:text-slate-200 truncate">{emp.fullName}</div>
                                            <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500 truncate">UID: {emp.uid || 'N/A'}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500 font-bold">
                                      No present employees in this department yet.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
              <Building2 className="h-5 w-5 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No matching department found</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Try adjusting your search query.
            </p>
          </div>
        )}
      </div>

      {/* Legend Footer */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 bg-slate-50/20 px-6 py-4 dark:border-slate-800/40 dark:bg-slate-900/10">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/35" />
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Present</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/35" />
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">On Field</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm shadow-purple-500/35" />
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">On Leave</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/35" />
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Absent</span>
        </div>
      </div>
    </div>
  );
};

export default DepartmentStatsSummary;
