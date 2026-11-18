import axios from 'axios';
import toast from 'react-hot-toast';
import React from 'react';

// Monkey-patch toast.error to display the warning-style Alternative Toast instead of red error toasts when in read-only mode.
const originalError = toast.error;
toast.error = (message, options) => {
  let viewing = null;
  let token = null;
  let userType = null;
  try {
    viewing = localStorage.getItem('viewAsOrg');
    token = localStorage.getItem('token');
    userType = localStorage.getItem('userType');
  } catch { /* ignore */ }
  const isReadOnly = token && viewing && userType === 'superadmin';

  const isManualReadOnlyMsg = typeof message === 'string' && (
    message.includes('Read-only institute view') || 
    message.includes('Read-only mode')
  );

  const now = Date.now();
  const wasBlockedRecently = window.__lastReadOnlyBlock && (now - window.__lastReadOnlyBlock < 250);

  if (isReadOnly && (isManualReadOnlyMsg || wasBlockedRecently || (typeof message === 'string' && (
    message.toLowerCase().includes('could not save') ||
    message.toLowerCase().includes('could not remove') ||
    message.toLowerCase().includes('failed to')
  )))) {
    window.dispatchEvent(new CustomEvent('readonly-mode-attempt'));
    
    return toast((t) => (
      <div className="flex flex-col gap-1 text-left font-sans">
        <div className="flex items-center gap-1.5 font-bold text-amber-900">
          <span>🔒</span>
          <span>Read-Only Mode</span>
        </div>
        <p className="text-xs text-amber-800/90 font-medium">
          Editing is disabled while viewing an institute in Read-Only Mode. Exit this mode to make changes.
        </p>
      </div>
    ), {
      id: 'readonly-view',
      duration: 4000,
      style: {
        background: '#fffbeb', // amber-50
        border: '1px solid #fde68a', // amber-200
        padding: '12px 16px',
        borderRadius: '16px',
        maxWidth: '380px',
      },
    });
  }
  return originalError(message, options);
};

const API_BASE_URL = '/api';
const API_ORIGIN = '';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// When the super admin is "viewing as" an institute, every request must carry
// the target org id so the backend scopes (read-only) to it. Stateless: read the
// persisted selection per request, so it survives reloads and navigation.
const applyViewOrg = (config) => {
  try {
    const v = localStorage.getItem('viewAsOrg');
    if (v) {
      const org = JSON.parse(v);
      if (org?.id) config.headers['x-view-org'] = org.id;
    }
  } catch { /* ignore */ }
  return config;
};

// Client-side read-only guard. When the super admin is "viewing as" an institute,
// block EVERY mutating request before it leaves the browser. The backend rejects
// these too (defence in depth — see middleware/auth.js & authOrSuperAdmin.js), but
// blocking here guarantees no write ever fires and gives a clean message instead
// of a raw 403. Throwing here makes axios reject the request.
const READ_METHODS = new Set(['get', 'head', 'options']);
const guardReadOnly = (config) => {
  let viewing = null;
  let token = null;
  try {
    viewing = localStorage.getItem('viewAsOrg');
    token = localStorage.getItem('token');
  } catch { /* ignore */ }
  const method = (config.method || 'get').toLowerCase();
  const url = config.url || '';
  // NEVER block auth flows (login / register / logout) or spot-check triggers.
  // A STALE token + viewAsOrg left in storage must not lock the user out of logging in.
  if (
    /\/(login|register|logout|forgot-password|reset-password)(\?|\/|$)/i.test(url) ||
    /\/spot-checks\/trigger(\?|\/|$)/i.test(url)
  ) {
    return config;
  }
  // Only guard an authenticated view-as session.
  if (token && viewing && !READ_METHODS.has(method)) {
    window.__lastReadOnlyBlock = Date.now();
    window.dispatchEvent(new CustomEvent('readonly-mode-attempt'));
    const err = new Error('Read-only institute view: write blocked client-side');
    err.code = 'ERR_READ_ONLY_VIEW';
    err.config = config;
    throw err;
  }
  return config;
};

// Add auth token (+ read-only guard + view-as scope) on the apiClient instance.
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return applyViewOrg(guardReadOnly(config));
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Most super-admin/Admin pages use the GLOBAL axios (baseURL + Authorization are
// set in AuthContext). Apply the same read-only guard + view-as scope there too.
axios.interceptors.request.use(
  (config) => applyViewOrg(guardReadOnly(config)),
  (error) => Promise.reject(error)
);

// Handle response errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Organization Management API
export const organizationAPI = {
  // Get all organizations
  getAll: async () => {
    const response = await apiClient.get('/organizations');
    return response.data;
  },

  // Create new organization
  create: async (orgData) => {
    const response = await apiClient.post('/organizations', orgData);
    return response.data;
  },

  // Update organization
  update: async (orgId, updates) => {
    const response = await apiClient.put(`/organizations/${orgId}`, updates);
    return response.data;
  },

  // Get organization locations
  getLocations: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/locations`);
    return response.data;
  },

  // Add location to organization
  addLocation: async (orgId, locationData) => {
    const response = await apiClient.post(`/organizations/${orgId}/locations`, locationData);
    return response.data;
  },

  // Update location
  updateLocation: async (orgId, locationId, updates) => {
    const response = await apiClient.put(`/organizations/${orgId}/locations/${locationId}`, updates);
    return response.data;
  },

  // Delete location
  deleteLocation: async (orgId, locationId) => {
    const response = await apiClient.delete(`/organizations/${orgId}/locations/${locationId}`);
    return response.data;
  },

  // Set primary location
  setPrimaryLocation: async (orgId, locationId) => {
    const response = await apiClient.put(`/organizations/${orgId}/primary-location/${locationId}`);
    return response.data;
  },
};

// Student Location Management API
export const studentLocationAPI = {
  // Get available locations for student
  getAvailableLocations: async () => {
    const response = await apiClient.get('/student/locations');
    return response.data;
  },

  // Get current location
  getCurrentLocation: async () => {
    const response = await apiClient.get('/student/current-location');
    return response.data;
  },

  // Request location change
  requestLocationChange: async (locationId, reason) => {
    const response = await apiClient.post('/student/request-location-change', {
      locationId,
      reason
    });
    return response.data;
  },

  // Get location change requests
  getLocationRequests: async () => {
    const response = await apiClient.get('/student/location-requests');
    return response.data;
  },

  // Get organization location requests (admin)
  getOrgLocationRequests: async (orgId, status = 'pending') => {
    const response = await apiClient.get(`/student/organizations/${orgId}/location-requests?status=${status}`);
    return response.data;
  },

  // Approve/reject location request (admin)
  processLocationRequest: async (orgId, studentId, requestId, status, rejectionReason = '') => {
    const response = await apiClient.put(
      `/student/organizations/${orgId}/location-requests/${studentId}/${requestId}`,
      { status, rejectionReason }
    );
    return response.data;
  },

  // Directly assign location to student (admin)
  assignStudentLocation: async (orgId, studentId, locationId) => {
    const response = await apiClient.put(
      `/student/organizations/${orgId}/students/${studentId}/location`,
      { locationId }
    );
    return response.data;
  },
};

// Spot-Check (random attendance verification) + non-response analytics API
export const spotCheckAPI = {
  // The detailed Admin report: who is regularly missing, repeat offenders,
  // proxy suspects (missed the live check but marked attendance), trend.
  getReport: async (params = {}) => {
    const response = await apiClient.get('/spot-checks/report', { params });
    return response.data;
  },
  // Fire a random spot-check round right now.
  trigger: async (body = {}) => {
    const response = await apiClient.post('/spot-checks/trigger', body);
    return response.data;
  },
  // Drill into one round's roster (who answered / missed).
  getRound: async (roundId) => {
    const response = await apiClient.get(`/spot-checks/round/${roundId}`);
    return response.data;
  },
};

// Face-capture gallery (super-admin) — every recognition image across the
// network (check-in/out + spot-checks + registration) with filters.
export const faceCaptureAPI = {
  list: async (params = {}) => {
    const res = await axios.get('/api/superadmin/face-captures', { params });
    return res.data;
  },
  institutes: async () => {
    const res = await axios.get('/api/superadmin/organizations');
    return res.data;
  },
  instituteStaff: async (instituteId) => {
    const res = await axios.get(`/api/superadmin/institutes/${instituteId}/staff`);
    return res.data;
  },
  // <img> can't send an auth header, so the super-admin token rides as ?token=.
  // item.imageUrl already starts with /api/… — keep it RELATIVE so it resolves
  // same-origin and goes through the dev proxy (global axios has no baseURL set,
  // so interpolating axios.defaults.baseURL yielded "undefined/api/…" → broken).
  // item.imageUrl now carries ?source=spoofattempt|securityevent (added
  // 2026-07-30 so the image route knows which collection to look the id up
  // in — see server/routes/superadmin.js). Blindly appending "?token=" broke
  // every image on this page (a second "?" makes an invalid query string,
  // the server never saw `token`, auth failed, <img> fell back to "No
  // image") — same existing-query-string guard the other imageSrc helpers
  // below already use.
  imageSrc: (item) => {
    const sep = item?.imageUrl?.includes('?') ? '&' : '?';
    return `${item.imageUrl}${sep}token=${encodeURIComponent(localStorage.getItem('token') || '')}`;
  },
};

// Fake-attendance attempts (super-admin) — every face the on-server anti-spoof
// (PAD) model flagged as a screen/photo replay and BLOCKED. Same image/token
// convention as the face-capture gallery.
// Network-wide (unscoped to a single org) tamper-evident audit trail.
export const superAdminAuditAPI = {
  query: async (params = {}) => (await axios.get('/api/superadmin/audit', { params })).data,
  verify: async (id) => (await axios.get(`/api/superadmin/audit/${id}/verify`)).data,
};

// Organization health/inactivity — login recency, activity recency, biometric adoption.
export const orgHealthAPI = {
  list: async () => (await axios.get('/api/superadmin/org-health')).data,
};

// Super Admin network-wide spot checks
export const superAdminSpotCheckAPI = {
  trigger: async (body = {}) => {
    const res = await axios.post('/api/superadmin/spot-checks/trigger', body);
    return res.data;
  },
  getRounds: async (params = {}) => {
    const res = await axios.get('/api/superadmin/spot-checks/rounds', { params });
    return res.data;
  },
  getOrgSpotChecks: async (orgId, params = {}) => {
    const res = await axios.get(`/api/superadmin/org/${orgId}/spot-checks`, { params });
    return res.data;
  },
};

// Per-org deficiency report — lagging components (spot checks, absences, backlogs…).
export const deficiencyAPI = {
  report: async (window = 'month') =>
    (await axios.get('/api/superadmin/deficiencies', { params: { window } })).data,
  details: async (orgId, window = 'month') =>
    (await axios.get(`/api/superadmin/deficiencies/${orgId}/details`, { params: { window } })).data,
};

export const spoofAttemptsAPI = {
  list: async (params = {}) => {
    const res = await axios.get('/api/superadmin/spoof-attempts', { params });
    return res.data;
  },
  institutes: async () => {
    const res = await axios.get('/api/superadmin/organizations');
    return res.data;
  },
  // item.imageUrl now carries ?source=spoofattempt|securityevent (added
  // 2026-07-30 — see server/routes/superadmin.js). Blindly appending
  // "?token=" made a malformed double-"?" URL, the server never parsed
  // `token`, auth failed, and the <img> fell back to "No image" — THIS was
  // the actually-broken copy (an earlier fix mistakenly landed on
  // faceCaptureAPI.imageSrc above instead of this one).
  imageSrc: (item) => {
    const sep = item?.imageUrl?.includes('?') ? '&' : '?';
    return `${item.imageUrl}${sep}token=${encodeURIComponent(localStorage.getItem('token') || '')}`;
  },
};

// Attendance Compliance (super-admin) — checkout-miss monitoring: overview,
// per-employee records, red flags, memos, configuration and notifications.
const CC = '/api/superadmin/checkout-compliance';
export const checkoutComplianceAPI = {
  overview: async (params = {}) => (await axios.get(`${CC}/overview`, { params })).data,
  analyze: async () => (await axios.post(`${CC}/analyze`)).data,
  records: async (params = {}) => (await axios.get(`${CC}/records`, { params })).data,
  redFlags: async (params = {}) => (await axios.get(`${CC}/red-flags`, { params })).data,
  redFlag: async (id) => (await axios.get(`${CC}/red-flags/${id}`)).data,
  issueMemo: async (id, body = {}) => (await axios.post(`${CC}/red-flags/${id}/memo`, body)).data,
  resolveFlag: async (id, note) => (await axios.post(`${CC}/red-flags/${id}/resolve`, { note })).data,
  addRemark: async (id, text) => (await axios.post(`${CC}/red-flags/${id}/remarks`, { text })).data,
  memos: async (params = {}) => (await axios.get(`${CC}/memos`, { params })).data,
  memo: async (id) => (await axios.get(`${CC}/memos/${id}`)).data,
  setMemoStatus: async (id, status) => (await axios.post(`${CC}/memos/${id}/status`, { status })).data,
  getConfig: async () => (await axios.get(`${CC}/config`)).data,
  saveConfig: async (config) => (await axios.put(`${CC}/config`, config)).data,
  notifications: async (params = {}) => (await axios.get(`${CC}/notifications`, { params })).data,
  markNotificationsRead: async (ids = null) => (await axios.post(`${CC}/notifications/read`, ids ? { ids } : {})).data,
  institutes: async () => (await axios.get('/api/superadmin/organizations')).data,
};

// Login sessions (super-admin) — single-active-session history for admin
// accounts: login/logout time, device, IP, duration, and why each ended.
export const sessionsAPI = {
  list: async (params = {}) => {
    const res = await axios.get('/api/superadmin/sessions', { params });
    return res.data;
  },
  institutes: async () => {
    const res = await axios.get('/api/superadmin/organizations');
    return res.data;
  },
};

// IP tracking (super-admin) — the public IP every login / check-in / check-out
// came from, with an informational "IP changed" flag vs the previous address.
export const ipLogsAPI = {
  list: async (params = {}) => {
    const res = await axios.get('/api/superadmin/ip-logs', { params });
    return res.data;
  },
  institutes: async () => {
    const res = await axios.get('/api/superadmin/organizations');
    return res.data;
  },
};

// Blocked devices (super-admin) — every device the mobile enterprise security
// gate (Feature 12) blocked because a critical policy failed.
export const blockedDevicesAPI = {
  list: async (params = {}) => {
    const res = await axios.get('/api/superadmin/blocked-devices', { params });
    return res.data;
  },
  institutes: async () => {
    const res = await axios.get('/api/superadmin/organizations');
    return res.data;
  },
};

// Drill-down face report (super-admin): Network → Institute → Employee →
// date-wise captures. Images are the REAL ones from the face_storage disk tree.
export const reportAPI = {
  network: async (params = {}) => (await axios.get('/api/superadmin/overview', { params })).data,
  institutes: async (params = {}) => (await axios.get('/api/superadmin/organizations', { params })).data,
  institute: async (id, params = {}) => (await axios.get(`/api/superadmin/org/${id}`, { params })).data,
  employees: async (instituteId) =>
    (await axios.get(`/api/superadmin/report/institute/${instituteId}/employees`)).data,
  captures: async (studentId) =>
    (await axios.get(`/api/superadmin/report/employee/${studentId}/captures`)).data,
  // Run the anti-spoof PAD model over this employee's stored captures to flag any
  // marked with a phone-screen / photo replay. Returns { summary, results[] }.
  antispoofScan: async (studentId) =>
    (await axios.post(`/api/superadmin/report/employee/${studentId}/antispoof-scan`)).data,
  // imageUrl already carries ?rel=… — append the super-admin token for the <img>.
  imageSrc: (imageUrl) => {
    const base = imageUrl?.startsWith('/api') ? API_ORIGIN : '';
    const sep = imageUrl?.includes('?') ? '&' : '?';
    return `${base}${imageUrl}${sep}token=${encodeURIComponent(localStorage.getItem('token') || '')}`;
  },
};

// Registration images (super-admin, read-only) — view each faculty's enrolled
// face network-wide. Admin/HOD get the upload-capable version via registrationImageAPI.
export const superAdminRegistrationAPI = {
  institutes: async (params = {}) =>
    (await axios.get('/api/superadmin/organizations', { params })).data,
  staff: async (instituteId) =>
    (await axios.get(`/api/superadmin/institutes/${instituteId}/registration-images`)).data,
  // <img> can't send an auth header → the super-admin token rides as ?token=.
  imageSrc: (studentId, index = 0) =>
    `${API_ORIGIN}/api/superadmin/registration-image/${studentId}/${index}?token=${encodeURIComponent(localStorage.getItem('token') || '')}`,
};

// Ghost-faculty network dedup (super-admin) — same face, multiple identities.
export const ghostFacultyAPI = {
  scan: async (threshold) => {
    const res = await axios.post('/api/superadmin/ghost-faculty/scan', threshold ? { threshold } : {});
    return res.data;
  },
  list: async (params = {}) => {
    const res = await axios.get('/api/superadmin/ghost-faculty', { params });
    return res.data;
  },
  setStatus: async (id, status, note) => {
    const res = await axios.post(`/api/superadmin/ghost-faculty/${id}/status`, { status, note });
    return res.data;
  },
  imageSrc: (member) => {
    const base = member?.imageUrl?.startsWith('/api') ? API_ORIGIN : '';
    const sep = member?.imageUrl?.includes('?') ? '&' : '?';
    return `${base}${member?.imageUrl}${sep}token=${encodeURIComponent(localStorage.getItem('token') || '')}`;
  },
};

// Registration-image management (Admin / HOD) — view + upload-and-re-enroll.
export const registrationImageAPI = {
  overview: async () => {
    const res = await axios.get('/api/portal/staff/registration-overview');
    return res.data;
  },
  upload: async (studentId, images) => {
    const res = await axios.post(`/api/portal/staff/${studentId}/registration-image`, { images });
    return res.data;
  },
  imageSrc: (studentId) =>
    `${API_ORIGIN}/api/portal/staff/${studentId}/registration-image?token=${encodeURIComponent(localStorage.getItem('token') || '')}`,
};

// Audit trail (tamper-evident security log) API
export const auditAPI = {
  query: async (params = {}) => {
    const response = await apiClient.get('/audit', { params });
    return response.data;
  },
};

// Unapproved-absence API
export const absenceAPI = {
  list: async (params = {}) => {
    const response = await apiClient.get('/absences', { params });
    return response.data;
  },
  detect: async (body = {}) => {
    const response = await apiClient.post('/absences/detect', body);
    return response.data;
  },
};

// SAACMS API
export const saacmsAPI = {
  summary: async () => {
    const response = await apiClient.get('/saacms/summary');
    return response.data;
  },
};

// Timetable management (Academic Activity Tracking). Server returns
// { success, entries } / { success, entry }.
export const timetableAPI = {
  list: async () => {
    const response = await apiClient.get('/timetables');
    return response.data;
  },
  create: async (body) => {
    const response = await apiClient.post('/timetables', body);
    return response.data;
  },
  update: async (id, body) => {
    const response = await apiClient.put(`/timetables/${id}`, body);
    return response.data;
  },
  remove: async (id) => {
    const response = await apiClient.delete(`/timetables/${id}`);
    return response.data;
  },
};

// Conducted-class check-in evidence (photos, note, geo) per slot+date.
export const classCheckinAPI = {
  log: async (params = {}) => {
    const response = await apiClient.get('/class-checkins/log', { params });
    return response.data;
  },
  evidence: async (timetableId, params = {}) => {
    const response = await apiClient.get(`/class-checkins/evidence/${timetableId}`, { params });
    return response.data;
  },
};

// Faculty / staff roster. Server returns { success, students, total, ... }.
export const staffAPI = {
  list: async (params = {}) => {
    const response = await apiClient.get('/students', { params });
    return response.data;
  },
};

// Portal API — live-location map + manual class notifications (Admin / HOD).
export const portalAPI = {
  // Latest live positions of on-duty staff (org-scoped for Admin, dept-scoped for HOD).
  // Response includes per-user geofence state + a `premises` circle + `summary`.
  getLiveLocations: async () => {
    const response = await apiClient.get('/portal/live-locations');
    return response.data;
  },

  // Past locations for the whole org over a date range (one marker per staff at
  // their latest fix in range). Powers the Day/Week/Month history view on the map.
  getLocationHistory: async ({ from, to } = {}) => {
    const response = await apiClient.get('/portal/location-history', {
      params: { from, to },
    });
    return response.data;
  },

  // Full-day movement path (breadcrumbs) for one staff member.
  getLiveTrail: async (studentId, date) => {
    const response = await apiClient.get(`/portal/live-locations/${studentId}/trail`, {
      params: date ? { date } : {},
    });
    return response.data;
  },

  // Recent premises exit/enter alerts for the feed.
  getGeofenceAlerts: async (limit = 50) => {
    const response = await apiClient.get('/portal/geofence-alerts', { params: { limit } });
    return response.data;
  },

  // Full accountability report for one staff member on one day: sharing session,
  // outside-campus excursions (with durations), not-sharing gaps, distance, and
  // the raw path. Powers the detailed monitoring report modal.
  getLocationReport: async (studentId, date) => {
    const response = await apiClient.get(`/portal/staff/${studentId}/location-report`, {
      params: date ? { date } : {},
    });
    return response.data;
  },

  // Send a push notification to staff. Pass one of:
  //   { timetableId }       → faculty teaching that slot
  //   { facultyIds: [...] } → specific staff
  //   { department }        → all staff in a department
  //   (none)                → whole org (Admin) / HOD's department
  // plus { title?, body }.
  sendClassNotification: async (payload) => {
    const response = await apiClient.post('/portal/class-notify', payload);
    return response.data;
  },
};

export const regularizationAPI = {
  superAdminStats: async () => (await axios.get('/api/regularization/superadmin/stats')).data,
  superAdminList: async (params = {}) => (await axios.get('/api/regularization/superadmin', { params })).data,
  superAdminAction: async (id, payload) => (await axios.post(`/api/regularization/superadmin/${id}/action`, payload)).data,
  myRequests: async () => (await axios.get('/api/regularization/my-requests')).data,
};

// Existing APIs (keeping for backward compatibility)
export const apiCall = async (url, options = {}) => {
  const token = localStorage.getItem('token');
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  };
  
  try {
    const response = await axios(url, config);
    return response.data;
  } catch (error) {
    console.error('API call failed:', error);
    throw error.response?.data || error;
  }
};

export default apiClient;
