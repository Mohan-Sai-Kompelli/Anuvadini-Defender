import axios from "axios";
import toast from "react-hot-toast";

// The leave-attachment route is auth-guarded (Bearer token), so a plain
// <a href> navigation can't reach it — fetch as a blob via the authenticated
// axios instance and open that instead.
export async function openLeaveAttachment(url, filename) {
  try {
    const res = await axios.get(url, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(res.data);
    const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!win) {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (err) {
    toast.error("Could not open attachment");
  }
}
