import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

// Point all relative axios calls at the backend.
// In the browser, an empty baseURL ("") guarantees that all requests (/api/...)
// are naturally routed to the current website origin (e.g. https://defender.anuvadiniturn.com)
// without any hardcoded host, avoiding mixed-content and connection-refused errors.
axios.defaults.baseURL = '';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Where each role lands after authentication.
//  • Admin and HOD both use the full dashboard at /dashboard (the HOD's data is
//    department-scoped on the backend).
//  • Faculty / staff use the personal portal at /portal.
export const dashboardPathFor = (userType, role) => {
  if (userType === 'superadmin') return '/superadmin/spot-checks'; // super admin console
  if (userType === 'employee' && role !== 'hod') return '/portal'; // faculty / staff
  return '/dashboard'; // Admin + HOD
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null); // 'hoi' | 'employee'
  const [role, setRole] = useState(null); // 'hoi' | 'faculty' | 'staff' | 'hod'
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // Super-admin "view as institute" selection ({ id, name }) — persisted so it
  // survives reloads. The axios interceptors read localStorage('viewAsOrg').
  const [viewAsOrg, setViewAsOrg] = useState(() => {
    try { return JSON.parse(localStorage.getItem('viewAsOrg')) || null; } catch { return null; }
  });

  // Single-active-session guard: when ANY protected call answers 401 with a
  // session code, this login has been invalidated server-side (usually because
  // the account logged in on another device). Show the security message, clear
  // the local session and return to the Login screen. Login/logout requests
  // are skipped so a failed login attempt never triggers the redirect.
  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const status = error.response?.status;
        let code = error.response?.data?.code;
        // Report/export downloads (`responseType: 'blob'`) get their error
        // body parsed as a Blob too — the JSON `code`/`message` are hidden
        // inside it until read back out, so a real session-expiry on an
        // export request never surfaced the proper message. Unwrap it once.
        if (code === undefined && error.response?.data instanceof Blob && /json/i.test(error.response.data.type || '')) {
          try {
            const parsed = JSON.parse(await error.response.data.text());
            code = parsed.code;
            error.response.data = parsed;
          } catch {
            // Not JSON after all — leave the Blob as-is.
          }
        }
        const url = String(error.config?.url || '');
        const isAuthCall = url.includes('/login') || url.includes('/logout') || url.includes('/register');
        if (
          status === 401 &&
          !isAuthCall &&
          ['session_terminated', 'session_expired', 'session_required'].includes(code)
        ) {
          const message =
            code === 'session_terminated'
              ? error.response?.data?.message ||
                'Your account has been logged in on another device. For security reasons, this session has been terminated.'
              : 'Your session has expired. Please log in again.';
          // id dedupes the toast when several in-flight requests 401 together.
          toast.error(message, { id: 'session-ended', duration: 8000 });
          clearSession();
          // Back to the Login screen (avoid a redirect loop if already there).
          if (window.location.pathname !== '/login') window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore session from localStorage on load.
  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedType = localStorage.getItem('userType');
    const storedRole = localStorage.getItem('role');
    const storedProfile = localStorage.getItem('profile');

    if (!token) {
      setLoading(false);
      return;
    }
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    const restore = async () => {
      try {
        if (storedType === 'superadmin') {
          // No per-user lookup; restore from the cached profile.
          setUser(storedProfile ? JSON.parse(storedProfile) : { name: 'Anuvadini Super Admin' });
          setUserType('superadmin');
          setRole('superadmin');
          setIsAuthenticated(true);
        } else if (storedType === 'employee') {
          // Validate + refresh the employee profile.
          const { data } = await axios.get('/api/portal/me');
          setUser({ ...data.profile, name: data.profile.fullName });
          setUserType('employee');
          setRole(data.profile.role || 'faculty');
          setIsAuthenticated(true);
        } else {
          // Admin / organization session.
          const { data } = await axios.get('/api/auth/me');
          setUser(data.organization);
          setUserType('hoi');
          setRole('hoi');
          setIsAuthenticated(true);
        }
      } catch (error) {
        // Token invalid/expired — fall back to any cached profile, else clear.
        if (storedProfile && storedType) {
          try {
            setUser(JSON.parse(storedProfile));
            setUserType(storedType);
            setRole(storedRole);
            setIsAuthenticated(true);
          } catch {
            clearSession();
          }
        } else {
          clearSession();
        }
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  const clearSession = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('role');
    localStorage.removeItem('profile');
    localStorage.removeItem('viewAsOrg');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    setUserType(null);
    setRole(null);
    setViewAsOrg(null);
    setIsAuthenticated(false);
  };

  // Super admin: enter / exit read-only "view as institute" mode.
  const enterInstituteView = (org, customReturnUrl) => {
    const sel = { id: org.id || org._id, name: org.name };
    localStorage.setItem('viewAsOrg', JSON.stringify(sel));
    const returnUrl = customReturnUrl || window.location.pathname + window.location.search;
    localStorage.setItem('superAdminReturnUrl', returnUrl);
    setViewAsOrg(sel);
  };
  const exitInstituteView = () => {
    localStorage.removeItem('viewAsOrg');
    localStorage.removeItem('superAdminReturnUrl');
    setViewAsOrg(null);
  };

  // Unified login — accepts an email (Admin) or a UID (employee). The backend
  // auto-detects and returns the role so we can route to the right dashboard.
  const login = async (identifier, password) => {
    try {
      const { data } = await axios.post('/api/portal/login', { identifier, password });
      const { token, userType: ut, role: r, profile } = data;

      localStorage.setItem('token', token);
      localStorage.setItem('userType', ut);
      localStorage.setItem('role', r);
      localStorage.setItem('profile', JSON.stringify({ ...profile, name: profile.name || profile.fullName }));
      // A fresh login never inherits a previous super-admin "view as institute"
      // selection (which would otherwise read-only-lock the new session).
      localStorage.removeItem('viewAsOrg');
      setViewAsOrg(null);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      setUser({ ...profile, name: profile.name || profile.fullName });
      setUserType(ut);
      setRole(r);
      setIsAuthenticated(true);

      toast.success('Login successful!');
      return { success: true, userType: ut, role: r, redirect: dashboardPathFor(ut, r) };
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || 'Login failed';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const logout = () => {
    // Close the server-side session first (best-effort, fire-and-forget) so
    // the session history records a clean "Manual Logout". Faculty/student
    // tokens have no session and the endpoint simply no-ops for them.
    axios.post('/api/portal/logout').catch(() => {});
    clearSession();
    toast.success('Logged out successfully');
  };

  const updateProfile = async (profileData) => {
    try {
      const response = await axios.put('/api/organization/profile', profileData);
      setUser(response.data.organization);
      toast.success('Profile updated successfully!');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Profile update failed';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const updatePassword = async (currentPassword, newPassword) => {
    try {
      await axios.put('/api/organization/password', {
        currentPassword,
        newPassword
      });
      toast.success('Password updated successfully!');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Password update failed';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const value = {
    user,
    userType,
    role,
    loading,
    isAuthenticated,
    viewAsOrg,
    enterInstituteView,
    exitInstituteView,
    login,
    logout,
    updateProfile,
    updatePassword
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
