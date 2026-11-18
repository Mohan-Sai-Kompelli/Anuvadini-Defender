import { useEffect, useState } from "react";
import axios from "axios";

const useLeaveRequests = () => {
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Optional studentId filter via URL: /leaves?studentId=<id>
  let studentIdFilter = null;
  try {
    const params = new URLSearchParams(window.location.search || "");
    const val = params.get("studentId");
    studentIdFilter = val && val.trim() !== "" ? val.trim() : null;
  } catch (_) {
    studentIdFilter = null;
  }

  // Function to calculate number of days
  const calculateDays = (startDay, endDay) => {
    const start = new Date(startDay);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDay);
    end.setHours(0, 0, 0, 0);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // include both start and end days
    return diffDays;
  };

  // Update a leave request's status. Uses the shared axios instance so the
  // super-admin "view as institute" scope (x-view-org) and the client read-only
  // guard both apply automatically.
  const updateLeaveRequestStatus = async (requestId, status, reson) => {
    try {
      const { data } = await axios.put(
        `/api/leave-requests/update-status/${requestId}`,
        { status, reson }
      );

      // Update state locally
      setLeaveRequests((prev) =>
        prev.map((r) => (r._id === requestId ? { ...r, status } : r))
      );

      return data;
    } catch (err) {
      // The read-only view guard already shows a toast — don't double-alert.
      if (err?.code === "ERR_READ_ONLY_VIEW") return undefined;
      const msg = err?.response?.data?.message || err.message || "Failed to update status";
      console.log(err);
      alert(msg);
      return undefined;
    }
  };

  // Fetch leave requests on mount
  useEffect(() => {
    const fetchLeaveRequests = async () => {
      try {
        const query = studentIdFilter ? `?studentId=${encodeURIComponent(studentIdFilter)}` : "";
        const { data } = await axios.get(`/api/get-leave-requests${query}`);
        setLeaveRequests(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to fetch leave requests");
        console.error("Error fetching leave requests:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaveRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    leaveRequests,
    loading,
    error,
    calculateDays,
    updateLeaveRequestStatus, // This now updates state automatically
  };
};

export default useLeaveRequests;
