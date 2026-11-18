import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export const useAttendanceStats = () => {
  const [attendanceStats, setAttendanceStats] = useState({
    trendData: [],
    usageStats: {
      activeUsers: { current: 0, total: 0 },
      biometricTerminals: { current: 0, total: 0 },
      desktopDevices: { current: 0, total: 0 },
      personalDevices: { current: 0, total: 0 },
    },
    kpis: {
      authenticationTime: 0,
      averageInTime: "",
      averageOutTime: "",
    },
  });
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchAttendanceStatistics = async () => {
    try {
      setStatsLoading(true);
      const response = await axios.get("/api/attendance/statistics");
      setAttendanceStats(
        response.data.data || {
          trendData: [],
          usageStats: {
            activeUsers: {
              current: response.data.data.trendData.absent,
              total: 0,
            },
            biometricTerminals: { current: 0, total: 0 },
            desktopDevices: { current: 0, total: 0 },
            personalDevices: { current: 0, total: 0 },
          },
          kpis: {
            authenticationTime: 0,
            averageInTime: "",
            averageOutTime: "",
          },
        }
      );
    } catch (error) {
      console.error("Error fetching attendance statistics:", error);
      toast.error("Failed to load attendance statistics");
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendanceStatistics();
  }, []);

  return {
    attendanceStats,
    statsLoading,
    refetch: fetchAttendanceStatistics
  };
};
