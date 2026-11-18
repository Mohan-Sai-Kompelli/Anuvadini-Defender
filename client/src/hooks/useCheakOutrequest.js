import axios from "axios";
const { useState, useEffect } = require("react");

const useCheakOutrequest = () => {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    const fetchCheakoutRequests = async () => {
      try {
        const res = await axios.get("/api/get-cheakout-request", {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

      
        const data = res.data;
        
        setRequests(data);
      } catch (err) {
        console.error("Error fetching checkout requests:", err);
      }
    };
    fetchCheakoutRequests();
  }, []);

  
  const updateCheakoutRequestStatus = async (requestId, status, reson) => {
    try {
      console.log(requestId, status, reson, "REQID STATUS");
      // Shared axios instance → carries the super-admin view-as scope and the
      // client read-only guard automatically.
      const res = await axios.put(
        `/api/update-cheakout-request-status/${requestId}`,
        { requestId, status, reson }
      );

      const data = res.data;

      // Update state locally
      setRequests((prev) =>
        prev.map((r) => (r._id === requestId ? { ...r, status, reson } : r))
      );

      return data;
    } catch (err) {
      // The read-only view guard already shows a toast — don't double-alert.
      if (err?.code === "ERR_READ_ONLY_VIEW") return undefined;
      console.log(err);
      alert(err?.response?.data?.message || err.message || "Failed to update status");
      return undefined;
    }
  };

  return { requests, updateCheakoutRequestStatus };
};

export default useCheakOutrequest;
