import React from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, dashboardPathFor } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import MarketingSite from './pages/MarketingSite';
import PortalLayout from './components/PortalLayout';
import FacultyDashboard from './pages/portal/FacultyDashboard';
import FacultyAttendance from './pages/portal/FacultyAttendance';
import FacultyLeaves from './pages/portal/FacultyLeaves';
import FacultyProfile from './pages/portal/FacultyProfile';
import FacultyCalendar from './pages/portal/FacultyCalendar';
import FacultyHolidays from './pages/portal/FacultyHolidays';
import FacultyTimetable from './pages/portal/FacultyTimetable';
import FacultyOutreach from './pages/portal/FacultyOutreach';
import FacultyCheckouts from './pages/portal/FacultyCheckouts';
import SuperAdminLayout from './components/SuperAdminLayout';
import SuperAdminOrganizations from './pages/superadmin/SuperAdminOrganizations';
import SuperAdminFaceCaptures from './pages/superadmin/SuperAdminFaceCaptures';
import SuperAdminSpoofAttempts from './pages/superadmin/SuperAdminSpoofAttempts';
import SuperAdminSpoofAttemptDetail from './pages/superadmin/SuperAdminSpoofAttemptDetail';
import SuperAdminIpTracking from './pages/superadmin/SuperAdminIpTracking';
import SuperAdminSessions from './pages/superadmin/SuperAdminSessions';
import SuperAdminBlockedDevices from './pages/superadmin/SuperAdminBlockedDevices';
import SuperAdminRegistrationImages from './pages/superadmin/SuperAdminRegistrationImages';
import SuperAdminGhostFaculty from './pages/superadmin/SuperAdminGhostFaculty';
import SuperAdminAnalytics from './pages/superadmin/SuperAdminAnalytics';
import SuperAdminAttendanceCompliance from './pages/superadmin/SuperAdminAttendanceCompliance';
// Moved to the Admin/HOD dashboard — see AttendanceRegularization below.
// import SuperAdminRegularization from './pages/superadmin/SuperAdminRegularization';
import SuperAdminAuditTrail from './pages/superadmin/SuperAdminAuditTrail';
import SuperAdminSpotChecks from './pages/superadmin/SuperAdminSpotChecks';
import OperationalComplianceCenter from './pages/superadmin/OperationalComplianceCenter';
import RegistrationImages from './pages/RegistrationImages';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentReport from './pages/StudentReport';
import CheckInDetails from './pages/CheckInDetails';
import CheckoutDetails from './pages/CheckoutDetails';
import Attendance from './pages/Attendance';
import PresentAbsentDetails from './pages/PresentAbsentDetails';
import Profile from './pages/Profile';
import Layout from './components/Layout';
import { DefenderStatusProvider } from './pages/defender/api';
import DefenderOverview from './pages/defender/DefenderOverview';
import DefenderFleet from './pages/defender/DefenderFleet';
import DefenderLive from './pages/defender/DefenderLive';
import DefenderIncidents from './pages/defender/DefenderIncidents';
import DefenderAnalytics from './pages/defender/DefenderAnalytics';
import DefenderFirewall from './pages/defender/DefenderFirewall';
import DefenderRules from './pages/defender/DefenderRules';
import DefenderSecurity from './pages/defender/DefenderSecurity';
import DefenderTimesheet from './pages/defender/DefenderTimesheet';
import DefenderSystem from './pages/defender/DefenderSystem';
import AllStudentsDetails from './pages/AllStudentsDetails';
import LeaveRequest from './pages/LeaveRequest'
import LeaveRequestDetail from './pages/LeaveRequestDetail';
import FieldRequests from './pages/FieldRequests';
import FieldRequestDetail from './pages/FieldRequestDetail';
import CheckOutRequest from "./pages/CheckOutRequest";
import CheckoutRequestDetail from './pages/CheckoutRequestDetail';
import AttendanceRegularization from './pages/AttendanceRegularization';
import RegularizationDetail from './pages/RegularizationDetail';
import OrganizationManagement from './pages/OrganizationManagement';
import StudentLocationManagement from './pages/StudentLocationManagement';
import LiveLocationMap from './pages/LiveLocationMap';
import GeofenceBreachLog from './pages/GeofenceBreachLog';
import StaffLocationReport from './pages/StaffLocationReport';
import StatusList from './pages/StatusList';
import StudentsByGender from './pages/StudentsByGender';
import Reports from './pages/Reports';
import SpotCheckReport from './pages/SpotCheckReport';
import AuditTrail from './pages/AuditTrail';
import Absences from './pages/Absences';
import TimetableManagement from './pages/TimetableManagement';
import TeachingLog from './pages/TeachingLog';
import OutreachActivities from './pages/OutreachActivities';
import ComplianceAnalytics from './pages/ComplianceAnalytics';
import DepartmentComplianceDetails from './pages/DepartmentComplianceDetails';
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import TrainingSupport from './pages/TrainingSupport';
import VerificationEngine from './pages/VerificationEngine';
import RegisterStudent from './pages/RegisterStudent';
import PublicRegister from './pages/PublicRegister';
import DefenderDownload from './pages/DefenderDownload';

import './animations.css';

// Institution-admin sections that remain Admin-only (NOT meaningful per-department).
// Everything else (Compliance, Timetable, Teaching Log, Outreach,
// Spot-Checks, Verification, Staff Locations, …) is department-scoped for HODs.
const HOI_ONLY_PREFIXES = [
  '/audit',          // institution tamper-evident security log
  '/training',       // org-level training & support
  '/organizations',  // multi-institution management (super-admin-ish)
  '/profile',        // organization profile/settings (HOD uses /my-profile)
  '/defender',       // workstation monitoring is organisation-admin only
];

// Full dashboard routes — used by Admin and HOD. (HOD data is department-scoped
// on the backend.) Faculty/staff are redirected to their personal portal;
// HODs are blocked from Admin-only sections.
const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading, userType, role, viewAsOrg } = useAuth();
  const location = useLocation();
  if (loading) return null; // or a spinner component
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Super admin may browse the full Admin dashboard ONLY in read-only
  // "view as institute" mode (writes are blocked server-side). Otherwise they
  // belong in the super-admin console.
  if (userType === 'superadmin') {
    return viewAsOrg ? children : <Navigate to="/superadmin" replace />;
  }
  if (userType === 'employee' && role !== 'hod') return <Navigate to="/portal" replace />;
  if (role === 'hod' && HOI_ONLY_PREFIXES.some((p) => location.pathname.startsWith(p))) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

// Faculty / Staff personal portal routes.
const PortalRoute = ({ children }) => {
  const { isAuthenticated, loading, userType, role } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (userType === 'superadmin') return <Navigate to="/superadmin" replace />;
  if (userType !== 'employee' || role === 'hod') return <Navigate to="/dashboard" replace />;
  return <PortalLayout>{children}</PortalLayout>;
};

// Super Admin routes.
const SuperAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, userType } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (userType !== 'superadmin') return <Navigate to="/dashboard" replace />;
  return <SuperAdminLayout>{children}</SuperAdminLayout>;
};

const ScrollToTop = () => {
  const { pathname, search } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, search]);
  return null;
};

const AppRoutes = () => {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<MarketingSite />} />
        <Route path="/login" element={<LandingPage />} />

        {/* ── Super Admin (Anuvadini network) ── */}
        <Route path="/superadmin" element={<Navigate to="/superadmin/spot-checks" replace />} />
        <Route path="/superadmin/organization" element={<SuperAdminRoute><SuperAdminOrganizations view="admin" /></SuperAdminRoute>} />
        <Route path="/superadmin/face-captures" element={<SuperAdminRoute><SuperAdminFaceCaptures /></SuperAdminRoute>} />
        <Route path="/superadmin/spoof-attempts" element={<SuperAdminRoute><SuperAdminSpoofAttempts /></SuperAdminRoute>} />
        <Route path="/superadmin/spoof-attempts/:id" element={<SuperAdminRoute><SuperAdminSpoofAttemptDetail /></SuperAdminRoute>} />
        <Route path="/superadmin/ip-tracking" element={<SuperAdminRoute><SuperAdminIpTracking /></SuperAdminRoute>} />
        <Route path="/superadmin/sessions" element={<SuperAdminRoute><SuperAdminSessions /></SuperAdminRoute>} />
        <Route path="/superadmin/blocked-devices" element={<SuperAdminRoute><SuperAdminBlockedDevices /></SuperAdminRoute>} />
        <Route path="/superadmin/registration-images" element={<SuperAdminRoute><SuperAdminRegistrationImages /></SuperAdminRoute>} />
        <Route path="/superadmin/ghost-faculty" element={<SuperAdminRoute><SuperAdminGhostFaculty /></SuperAdminRoute>} />
        <Route path="/superadmin/analytics" element={<SuperAdminRoute><SuperAdminAnalytics /></SuperAdminRoute>} />
        <Route path="/superadmin/checkout-compliance" element={<SuperAdminRoute><SuperAdminAttendanceCompliance /></SuperAdminRoute>} />
        {/* Moved to the Admin/HOD dashboard (institute-scoped review) — see the
            /regularization route below. */}
        {/* <Route path="/superadmin/regularization" element={<SuperAdminRoute><SuperAdminRegularization /></SuperAdminRoute>} /> */}
        <Route path="/superadmin/audit" element={<SuperAdminRoute><SuperAdminAuditTrail /></SuperAdminRoute>} />
        <Route path="/superadmin/spot-checks" element={<SuperAdminRoute><SuperAdminSpotChecks /></SuperAdminRoute>} />
        <Route path="/superadmin/compliance-center" element={<SuperAdminRoute><OperationalComplianceCenter /></SuperAdminRoute>} />

        {/* HOD's personal profile (rendered inside the full dashboard layout) */}
        <Route path="/my-profile" element={<PrivateRoute><Layout><FacultyProfile /></Layout></PrivateRoute>} />

        {/* ── Faculty & Staff personal portal ── */}
        <Route path="/portal" element={<PortalRoute><FacultyDashboard /></PortalRoute>} />
        <Route path="/portal/attendance" element={<PortalRoute><FacultyAttendance /></PortalRoute>} />
        <Route path="/portal/leaves" element={<PortalRoute><FacultyLeaves /></PortalRoute>} />
        <Route path="/portal/timetable" element={<PortalRoute><FacultyTimetable /></PortalRoute>} />
        <Route path="/portal/outreach" element={<PortalRoute><FacultyOutreach /></PortalRoute>} />
        <Route path="/portal/checkouts" element={<PortalRoute><FacultyCheckouts /></PortalRoute>} />
        <Route path="/portal/calendar" element={<PortalRoute><FacultyCalendar /></PortalRoute>} />
        <Route path="/portal/holidays" element={<PortalRoute><FacultyHolidays /></PortalRoute>} />
        <Route path="/portal/profile" element={<PortalRoute><FacultyProfile /></PortalRoute>} />

        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          element={
            <PrivateRoute>
              <Layout>
                <DefenderStatusProvider>
                  <Outlet />
                </DefenderStatusProvider>
              </Layout>
            </PrivateRoute>
          }
        >
          <Route path="/defender" element={<DefenderOverview />} />
          <Route path="/defender/fleet" element={<DefenderFleet />} />
          <Route path="/defender/live" element={<DefenderLive />} />
          <Route path="/defender/incidents" element={<DefenderIncidents />} />
          <Route path="/defender/analytics" element={<DefenderAnalytics />} />
          <Route path="/defender/firewall" element={<DefenderFirewall />} />
          <Route path="/defender/rules" element={<DefenderRules />} />
          <Route path="/defender/security" element={<DefenderSecurity />} />
          <Route path="/defender/timesheet" element={<DefenderTimesheet />} />
          <Route path="/defender/system" element={<DefenderSystem />} />
        </Route>
        <Route
          path="/students"
          element={
            <PrivateRoute>
              <Layout>
                <Students />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/registration-images"
          element={
            <PrivateRoute>
              <Layout>
                <RegistrationImages />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/status-list"
          element={
            <PrivateRoute>
              <Layout>
                <StatusList />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/students-details"
          element={
            <PrivateRoute>
              <Layout>
                <AllStudentsDetails />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/students-by-gender/:gender"
          element={
            <PrivateRoute>
              <Layout>
                <StudentsByGender />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/student-report/:studentId"
          element={
            <PrivateRoute>
              <Layout>
                <StudentReport />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <PrivateRoute>
              <Layout>
                <Reports />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/spot-checks"
          element={
            <PrivateRoute>
              <Layout>
                <SpotCheckReport />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <PrivateRoute>
              <Layout>
                <AuditTrail />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/absences"
          element={
            <PrivateRoute>
              <Layout>
                <Absences />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/timetable"
          element={
            <PrivateRoute>
              <Layout>
                <TimetableManagement />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/teaching-log"
          element={
            <PrivateRoute>
              <Layout>
                <TeachingLog />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/outreach"
          element={
            <PrivateRoute>
              <Layout>
                <OutreachActivities />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/compliance"
          element={
            <PrivateRoute>
              <Layout>
                <ComplianceAnalytics />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/hoi/compliance-analytics/department/:departmentId"
          element={
            <PrivateRoute>
              <Layout>
                <DepartmentComplianceDetails />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
        path="/checkin-details"
        element={
          <PrivateRoute>
            <Layout>
              <CheckInDetails />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/checkout-details"
        element={
          <PrivateRoute>
            <Layout>
              <CheckoutDetails />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/live-map"
        element={
          <PrivateRoute>
            <Layout>
              <LiveLocationMap />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/geofence-breaches"
        element={
          <PrivateRoute>
            <Layout>
              <GeofenceBreachLog />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/staff-location-report/:studentId"
        element={
          <PrivateRoute>
            <Layout>
              <StaffLocationReport />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
          path="/leave-request"
          element={
            <PrivateRoute>
              <Layout>
                <LeaveRequest />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/leave-request/:id"
          element={
            <PrivateRoute>
              <Layout>
                <LeaveRequestDetail />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/checkout-request"
          element={
            <PrivateRoute>
              <Layout>
                <CheckOutRequest />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/checkout-request/:id"
          element={
            <PrivateRoute>
              <Layout>
                <CheckoutRequestDetail />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/regularization"
          element={
            <PrivateRoute>
              <Layout>
                <AttendanceRegularization />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/regularization/:id"
          element={
            <PrivateRoute>
              <Layout>
                <RegularizationDetail />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/field-requests"
          element={
            <PrivateRoute>
              <Layout>
                <FieldRequests />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/field-requests/:id"
          element={
            <PrivateRoute>
              <Layout>
                <FieldRequestDetail />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/organizations"
          element={
            <PrivateRoute>
              <Layout>
                <OrganizationManagement />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/student-locations"
          element={
            <PrivateRoute>
              <Layout>
                <StudentLocationManagement />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/attendance"
          element={
            <PrivateRoute>
              <Layout>
                <Attendance />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/present-absent-details"
          element={
            <PrivateRoute>
              <Layout>
                <PresentAbsentDetails />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <Layout>
                <Profile />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/training"
          element={
            <PrivateRoute>
              <Layout>
                <TrainingSupport />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/verification"
          element={
            <PrivateRoute>
              <Layout>
                <VerificationEngine />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route path="/register-employee" element={<RegisterStudent />} />
        <Route path="/register" element={<PublicRegister />} />
        <Route path="/download" element={<DefenderDownload />} />
      </Routes>
      {/* ✅ Toast container outside routes */}
      <ToastContainer
        position="top-right"
        autoClose={3000}
        pauseOnHover
        pauseOnFocusLoss
      />
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;