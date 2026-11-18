import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export const useDashboardData = () => {
  const [stats, setStats] = useState(null);
  const [attendanceData, setAttendanceData] = useState([]);
  const [timeWiseData, setTimeWiseData] = useState([]);
  const [timeWiseInOut, setTimeWiseInOut] = useState([]);
  const [timeWiseTotals, setTimeWiseTotals] = useState({ in: 0, out: 0 });
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [heatmapSlots, setHeatmapSlots] = useState([]);
  const [heatmapDepartments, setHeatmapDepartments] = useState([]);
  const [heatmapSeries, setHeatmapSeries] = useState([]);
  const [todayPresentCount, setTodayPresentCount] = useState(0);
  const [todayAbsentCount, setTodayAbsentCount] = useState(0);

  const fetchDashboardData = async () => {
    try {
      const [statsResponse, attendanceResponse, timeWiseResponse, timeWiseInOutResponse, profileResponse, monthlyTrendResponse, heatmapResponse] = await Promise.all([
        axios.get('/api/organization/stats'),
        axios.get('/api/attendance/reports/daily'),
        axios.get('/api/attendance/reports/time-wise'),
        axios.get('/api/attendance/reports/time-wise-in-out'),
        axios.get('/api/organization/profile'),
        axios.get('/api/attendance/organization/monthly-trend'),
        axios.get('/api/attendance/department-time-heatmap')
      ]);

      setStats(statsResponse.data.stats);
      const todayAttendance = attendanceResponse.data.report.attendance || [];
      const totalStudentsToday = attendanceResponse?.data?.report?.totalStudents || 0;
      const uniqueCheckInIds = new Set(
        todayAttendance
          .filter(r => r?.type === 'in')
          .map(r => r?.student?._id)
          .filter(Boolean)
      );
      const pr = uniqueCheckInIds.size;
      const ab = Math.max(0, totalStudentsToday - pr);
      setTodayPresentCount(pr);
      setTodayAbsentCount(ab);
      setAttendanceData(todayAttendance);
      setTimeWiseData(timeWiseResponse.data.data.timeSlots || []);
      setTimeWiseInOut((timeWiseInOutResponse.data && timeWiseInOutResponse.data.data && timeWiseInOutResponse.data.data.timeSlots) || []);
      setTimeWiseTotals((timeWiseInOutResponse.data && timeWiseInOutResponse.data.data && timeWiseInOutResponse.data.data.totals) || { in: 0, out: 0 });
      setOrganization(profileResponse.data.organization);
      setMonthlyTrend(monthlyTrendResponse.data.data || []);
      
      // Heatmap mapping
      const hm = heatmapResponse.data?.success
        ? heatmapResponse.data
        : { data: heatmapResponse.data };
      const slots = hm.slots || [];
      const departments = hm.departments || [];
      const matrix = hm.matrix || [];
      const series = matrix.map((r) => ({
        name: r.department,
        data: r.values,
      }));
      setHeatmapSlots(slots);
      setHeatmapDepartments(departments);
      setHeatmapSeries(series);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return {
    stats,
    attendanceData,
    setAttendanceData,
    timeWiseData,
    timeWiseInOut,
    timeWiseTotals,
    organization,
    loading,
    monthlyTrend,
    heatmapSlots,
    heatmapDepartments,
    heatmapSeries,
    todayPresentCount,
    todayAbsentCount,
    refetch: fetchDashboardData
  };
};
