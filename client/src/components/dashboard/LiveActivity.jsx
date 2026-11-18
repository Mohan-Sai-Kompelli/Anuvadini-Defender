import React, { Suspense } from 'react';
import { Signal, Activity } from "lucide-react";
import LiveAttendanceLineChart from '../LiveAttendanceLineChart';

const LiveActivity = ({ 
  liveAttendanceData = [], 
  liveAttendanceLoading, 
  liveAttendanceError, 
  lastUpdated, 
  onRefresh,
  slotAttendanceData = [],
  attendanceData = [],
  slotAbsentStudents = [],
  onNavigate
}) => {
  const getEarlyStudents = () => {
    const source = (slotAttendanceData && slotAttendanceData.length > 0) ? slotAttendanceData : attendanceData;
    
    if (!source || source.length === 0) {
      return [];
    }

    const byStudent = new Map();
    const allCheckIns = [];
    
    for (const record of source) {
      if (record.type !== 'in' || !record.timestamp) continue;
      const checkInTime = new Date(record.timestamp);
      
      const today = new Date();
      const isToday = checkInTime.toDateString() === today.toDateString();
      if (!isToday) continue;
      
      const hours = checkInTime.getHours();
      const minutes = checkInTime.getMinutes();
      
      allCheckIns.push({
        studentName: record.student?.fullName || record.student?.name || 'Unknown',
        time: checkInTime.toLocaleTimeString(),
        hours,
        minutes,
        timestamp: record.timestamp,
        date: checkInTime.toLocaleDateString(),
        isToday: checkInTime.toDateString() === new Date().toDateString()
      });
      
      const studentId = record.student?._id || record.student?.uid;
      if (!studentId) continue;
      
      if (!byStudent.has(studentId) || checkInTime < byStudent.get(studentId).checkInTime) {
        byStudent.set(studentId, {
          ...record,
          checkInTime,
          studentName: record.student?.fullName || record.student?.name || 'Unknown Student',
          uid: record.student?.uid || record.student?._id || 'N/A'
        });
      }
    }
    
    const earlyStudents = Array.from(byStudent.values())
      .map(record => {
        const timeString = record.checkInTime.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        });
        
        const totalMinutes = record.checkInTime.getHours() * 60 + record.checkInTime.getMinutes();
        
        return {
          ...record,
          timeString,
          totalMinutes
        };
      })
      .sort((a, b) => a.totalMinutes - b.totalMinutes)
      .slice(0, 5);

    return { earlyStudents, totalStudents: byStudent.size };
  };

  const { earlyStudents, totalStudents } = getEarlyStudents();

  return (
    <div className="card border border-gray-100 shadow-sm">
      <div className="card-header bg-gradient-to-r to-indigo-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Signal className="h-6 w-6 text-blue-600" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Real Time Attendance Activity
              </h3>
              <div className="flex items-center space-x-3 mt-1">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-medium text-green-700">
                    Live
                  </span>
                </div>
                {lastUpdated && (
                  <span className="text-xs text-gray-500">
                    Last updated: {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 p-2 text-white hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-sm hover:shadow-md"
            title="Refresh live data"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="card-body">
        {liveAttendanceLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : liveAttendanceError ? (
          <div className="flex items-center justify-center h-64 text-red-600">
            <div className="text-center">
              <Activity className="mx-auto h-12 w-12 text-red-400 mb-2" />
              <p>{liveAttendanceError}</p>
            </div>
          </div>
        ) : (liveAttendanceData?.length ?? 0) > 0 ? (
          <div className="space-y-4">
            {/* Chart */}
            <Suspense fallback={<div className="h-64 flex items-center justify-center text-gray-400">Loading chart...</div>}>
              <LiveAttendanceLineChart data={liveAttendanceData} />
            </Suspense>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {(liveAttendanceData?.length ?? 0) > 0
                    ? liveAttendanceData[liveAttendanceData.length - 1]
                        ?.count || 0
                    : 0}
                </div>
                <div className="text-xs text-gray-500">Total Today</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {(liveAttendanceData?.length ?? 0) > 0
                    ? Math.max(...liveAttendanceData.map((d) => d.count))
                    : 0}
                </div>
                <div className="text-xs text-gray-500">Peak Count</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {(liveAttendanceData?.length ?? 0) > 0
                    ? liveAttendanceData.length
                    : 0}
                </div>
                <div className="text-xs text-gray-500">Time Slots</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Enhanced Empty State */}
            <div className="flex items-center justify-center h-48 text-gray-500">
              <div className="text-center">
                <div className="relative mb-4">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                    <Signal className="h-8 w-8 text-blue-400" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Real-time Monitoring Active
                </h3>
                <p className="text-sm text-gray-500 mb-4 max-w-xs">
                  The system is actively monitoring for attendance activity.
                  Data will appear here as students check in.
                </p>

                {/* Sample Activity Indicator */}
                <div className="flex items-center justify-center space-x-2 text-xs text-gray-400">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  <span>Monitoring...</span>
                </div>
              </div>
            </div>

            {/* Activity Timeline Preview */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Expected Activity Pattern
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Morning Check-ins</span>
                  <span className="text-green-600 font-medium">
                    7:00 AM - 9:00 AM
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Mid-day Activity</span>
                  <span className="text-blue-600 font-medium">
                    12:00 PM - 2:00 PM
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Evening Check-outs</span>
                  <span className="text-purple-600 font-medium">
                    5:00 PM - 7:00 PM
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top 5 Early Students Section */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <div className="flex items-center space-x-2 mb-4">
            <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h4 className="text-md font-semibold text-gray-900">Top 5 Early Birds</h4>
            <span className="text-xs text-gray-500">(Earliest Arrivals)</span>
          </div>
          
          {earlyStudents.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-gray-500">
              <div className="text-center">
                <svg className="mx-auto h-6 w-6 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs">No check-ins today</p>
                <p className="text-xs text-gray-400 mt-1">Students who check in will appear here</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {earlyStudents.map((student, index) => (
                <div key={`${student.uid}-${index}`} className="flex items-center justify-between p-2 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-100 hover:shadow-sm transition-shadow">
                  <div className="flex items-center space-x-2">
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">
                        {student.studentName}
                      </p>
                      <p className="text-xs text-gray-500">
                        UID: {student.uid}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="text-right">
                      <p className="text-xs font-semibold text-green-600">
                        {student.timeString}
                      </p>
                      <p className="text-xs text-green-500">
                        Arrived at {student.timeString}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Summary Stats */}
              <div className="mt-3 pt-2 border-t border-gray-100">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <div className="text-sm font-bold text-green-600">
                      {totalStudents}
                    </div>
                    <div className="text-xs text-gray-500">Total Students</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-blue-600">
                      {earlyStudents.length > 0 ? earlyStudents[0].timeString : 'N/A'}
                    </div>
                    <div className="text-xs text-gray-500">Earliest Time</div>
                  </div>
                </div>
                {totalStudents > 5 && (
                  <div className="mt-2 text-center">
                    <span className="text-xs text-gray-500">
                      Showing top 5 of {totalStudents} students
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveActivity;
