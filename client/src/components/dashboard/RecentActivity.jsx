import React from 'react';
import { Calendar, Activity } from "lucide-react";

const RecentActivity = ({ 
  recentActivityTab,
  setRecentActivityTab,
  filteredTopDurationData,
  filteredPendingDurationData,
  visibleCheckoutCount,
  visiblePendingCount,
  setVisibleCheckoutCount,
  setVisiblePendingCount,
  searchQuery,
  searchQueryPending,
  setSearchQuery,
  setSearchQueryPending,
  recentActivityLoading,
  selectedDate,
  setSelectedDate,
  showCalendar,
  setShowCalendar,
  onSingleDateSelection,
  onNavigate
}) => {
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Recent Attendance Activity</h3>
          <div className="flex items-center space-x-4">
            {/* Calendar Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Filter by date:</span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCalendar(!showCalendar)}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white hover:bg-gray-50 flex items-center space-x-2"
                >
                  <Calendar className="h-4 w-4" />
                  <span>
                    {new Date(selectedDate).toLocaleDateString()}
                  </span>
                </button>
                
                {showCalendar && (
                  <div className="calendar-container fixed left-3 right-3 top-20 z-50 rounded-lg border border-gray-200 bg-white p-4 shadow-lg sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-1 sm:w-72">
                    <div className="w-full">
                      <label className="block text-xs font-medium text-gray-700 mb-2">Select Date</label>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setShowCalendar(false)}
                        className="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSingleDateSelection(selectedDate);
                          setShowCalendar(false);
                        }}
                        disabled={recentActivityLoading}
                        className="px-3 py-1 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {recentActivityLoading ? 'Loading...' : 'Apply'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Tab Controls */}
            <div className="inline-flex rounded-md shadow-sm border border-gray-200 overflow-hidden" role="tablist">
              <button
                type="button"
                className={`px-3 py-1 text-sm ${recentActivityTab === 'top' ? 'bg-primary-50 text-primary-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => setRecentActivityTab('top')}
                role="tab"
                aria-selected={recentActivityTab === 'top'}
                aria-controls="tab-top"
              >
                Top Duration
              </button>
              <button
                type="button"
                className={`px-3 py-1 text-sm border-l border-gray-200 ${recentActivityTab === 'pending' ? 'bg-primary-50 text-primary-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => setRecentActivityTab('pending')}
                role="tab"
                aria-selected={recentActivityTab === 'pending'}
                aria-controls="tab-pending"
              >
                Remaining/Awaiting
              </button>
            </div>
          </div>
        </div>
        
        {/* Search Filter */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder={`Search by name, UID, department, or class...`}
                  value={recentActivityTab === 'top' ? searchQuery : searchQueryPending}
                  onChange={(e) => {
                    if (recentActivityTab === 'top') {
                      setSearchQuery(e.target.value);
                    } else {
                      setSearchQueryPending(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 pl-10 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>
            {(recentActivityTab === 'top' ? searchQuery : searchQueryPending) && (
              <button
                onClick={() => {
                  if (recentActivityTab === 'top') {
                    setSearchQuery('');
                  } else {
                    setSearchQueryPending('');
                  }
                }}
                className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        
        <div className="card-body">
          {recentActivityLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p className="mt-2 text-sm text-gray-500">Loading attendance data...</p>
            </div>
          ) : recentActivityTab === 'top' ? (
            filteredTopDurationData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead className="table-header">
                    <tr>
                      <th className="table-header-cell">S.no</th>
                      <th className="table-header-cell">Student</th>
                      <th className="table-header-cell">Check-in Time</th>
                      <th className="table-header-cell">Check-out Time</th>
                      <th className="table-header-cell">Total Hours</th>
                      {/* <th className="table-header-cell">Biometric Type</th> */}
                      <th className="table-header-cell">Attendance Type</th>
                      <th className="table-header-cell">Status</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {filteredTopDurationData
                      .slice(0, visibleCheckoutCount)
                      .map((item, index) => {
                        const { student, inTs, outTs, hasIn, hasOut } = item;
                        const totalMs = item.totalMs || 0;
                        const hrs = Math.floor(totalMs / 3600000);
                        const mins = Math.floor((totalMs % 3600000) / 60000);
                        const totalLabel = totalMs > 0 ? `${hrs}h ${mins}m` : '—';
                        const isCompleted8 = totalMs >= 8 * 3600000;
                        let remainingLabel = '';
                        if (totalMs > 0 && !isCompleted8) {
                          const remMs = 8 * 3600000 - totalMs;
                          const rH = Math.floor(remMs / 3600000);
                          const rM = Math.floor((remMs % 3600000) / 60000);
                          remainingLabel = `${rH}h ${rM}m remaining`;
                        }
                        return (
                          <tr key={(student && student._id) || index}>
                            <td className="table-cell">{index + 1}</td>
                            <td className="table-cell">
                              <div className="flex items-center">
                                <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                                  <span className="text-sm font-medium text-primary-600">
                                    {student?.fullName?.charAt(0)}
                                  </span>
                                </div>
                                <div className="ml-3">
                                  <button 
                                    onClick={() => onNavigate(`/student-report/${student?._id}`)}
                                    className="text-sm font-medium text-primary-600 hover:text-primary-800 cursor-pointer"
                                  >
                                    {student?.fullName}
                                  </button>
                                  <p className="text-sm text-gray-500">
                                    {student?.uid}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="table-cell">
                              {hasIn ? new Date(inTs).toLocaleTimeString() : '—'}
                            </td>
                            <td className="table-cell">
                              {hasOut ? new Date(outTs).toLocaleTimeString() : '—'}
                            </td>
                            <td className="table-cell">
                              {totalLabel}
                            </td>
                            {/* <td className="table-cell">
                              <span className="badge badge-secondary capitalize">
                                {authMethod || '—'}
                              </span>
                            </td> */}
                            <td className="table-cell">
                              <span className="badge badge-secondary capitalize">
                                {hasOut ? 'out' : (hasIn ? 'in' : '—')}
                              </span>
                            </td>
                            <td className="table-cell">
                              {hasIn && hasOut ? (
                                <span className={`badge ${isCompleted8 ? 'badge-success' : 'badge-warning'}`}>
                                  {isCompleted8 ? 'Completed' : remainingLabel}
                                </span>
                              ) : (
                                <span className={`badge badge-warning`}>
                                  {hasIn ? 'Awaiting checkout' : 'No check-in'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {visibleCheckoutCount < filteredTopDurationData.length && (
                  <div className="mt-4 flex justify-center">
                    <button
                      className="btn btn-secondary"
                      onClick={() => setVisibleCheckoutCount((prev) => prev + 5)}
                    >
                      Load More
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Activity className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No recent activity
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Attendance records will appear here once students start checking
                  in.
                </p>
              </div>
            )) : (
              filteredPendingDurationData.length > 0 ? (
                <div className="overflow-x-auto" id="tab-pending">
                  <table className="table">
                    <thead className="table-header">
                      <tr>
                        <th className="table-header-cell">Rank</th>
                        <th className="table-header-cell">Student</th>
                        <th className="table-header-cell">Check-in Time</th>
                        <th className="table-header-cell">Check-out Time</th>
                        <th className="table-header-cell">Remaining</th>
                        <th className="table-header-cell">Type</th>
                      </tr>
                    </thead>
                    <tbody className="table-body">
                      {filteredPendingDurationData
                        .slice(0, visiblePendingCount)
                        .map((item, index) => {
                          const { student, inTs, outTs, hasIn, hasOut, kind } = item;
                          const remainingMs = item.remainingMs || 0;
                          const rH = Math.floor(remainingMs / 3600000);
                          const rM = Math.floor((remainingMs % 3600000) / 60000);
                          const remainingLabel = `${rH}h ${rM}m`;
                          return (
                            <tr key={(student && student._id) || index}>
                              <td className="table-cell">{index + 1}</td>
                              <td className="table-cell">
                                <div className="flex items-center">
                                  <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                                    <span className="text-sm font-medium text-primary-600">
                                      {student?.fullName?.charAt(0)}
                                    </span>
                                  </div>
                                  <div className="ml-3">
                                    <button 
                                      onClick={() => onNavigate(`/student-report/${student?._id}`)}
                                      className="text-sm font-medium text-primary-600 hover:text-primary-800 cursor-pointer"
                                    >
                                      {student?.fullName}
                                    </button>
                                    <p className="text-sm text-gray-500">
                                      {student?.uid}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="table-cell">{hasIn ? new Date(inTs).toLocaleTimeString() : '—'}</td>
                              <td className="table-cell">{hasOut ? new Date(outTs).toLocaleTimeString() : '—'}</td>
                              <td className="table-cell">{remainingLabel}</td>
                              <td className="table-cell">
                                <span className={`badge ${kind === 'awaiting' ? 'badge-warning' : 'badge-danger'}`}>
                                  {kind === 'awaiting' ? 'Awaiting checkout' : 'Early checkout (<8h)'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {visiblePendingCount < filteredPendingDurationData.length && (
                    <div className="mt-4 flex justify-center">
                      <button
                        className="btn btn-secondary"
                        onClick={() => setVisiblePendingCount((prev) => prev + 5)}
                      >
                        Load More
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8" id="tab-pending">
                  <Activity className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No pending or early checkouts</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Everyone has completed or no activity available.
                  </p>
                </div>
              )
            )}
        </div>
      </div>
    </div>
  );
};

export default RecentActivity;
