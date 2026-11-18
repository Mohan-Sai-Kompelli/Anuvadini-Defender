import { useState, useEffect } from 'react';
import axios from 'axios';

export const useLiveAttendance = () => {
  const [liveAttendanceData, setLiveAttendanceData] = useState([]);
  const [liveAttendanceLoading, setLiveAttendanceLoading] = useState(true);
  const [liveAttendanceError, setLiveAttendanceError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchLiveAttendanceData = async () => {
    try {
      setLiveAttendanceLoading(true);
      setLiveAttendanceError(null);
      setLiveAttendanceData([]);

      const response = await axios.get("/api/attendance/live-activity");
      setLiveAttendanceData(response.data.data || []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching live attendance data:", error);
      setLiveAttendanceError("Failed to load live attendance data");
    } finally {
      setLiveAttendanceLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveAttendanceData();
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLiveAttendanceData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    liveAttendanceData,
    liveAttendanceLoading,
    liveAttendanceError,
    lastUpdated,
    refetch: fetchLiveAttendanceData
  };
};
