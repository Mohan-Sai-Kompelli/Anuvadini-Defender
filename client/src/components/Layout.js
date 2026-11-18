import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { portalAPI } from '../services/api';
import {
  LayoutDashboard,
  Users,
  Calendar,
  CalendarDays,
  User,
  BarChart3,
  LogOut,
  Menu,
  X,
  Briefcase,
  Building2,
  GitPullRequestClosed,
  GraduationCap,
  Tent,
  Landmark,
  MapPin,
  Camera,
  Map,
  ShieldAlert,
  ScrollText,
  UserX,
  ChevronRight,
  Bell,
  MapPinOff,
  CalendarCheck,
  Monitor,
  MonitorPlay,
  Flame,
  ListChecks,
  ShieldCheck,
  Clock,
  Settings2,
} from 'lucide-react';
import SmoothScroll from './SmoothScroll';
import Sidebar, { SidebarToggle } from './Sidebar';
import { EngineChip, DefenderNotifications } from './defender/TopBarWidgets';
import GlobalSearch from './app/GlobalSearch';
import UserMenu from './app/UserMenu';
import { useProduct } from '../contexts/ProductContext';


// Sidebar IA, ordered by daily workflow: high-level overview first, then the
// core people/attendance operations, academic modules, oversight
// (anti-fraud), and finally administration.
const navigation = [
  {
    section: 'Overview',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Live Map', href: '/live-map', icon: Map },
      { name: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
  {
    section: 'Action Items (Approvals)',
    items: [
      { name: 'Leave Request', href: '/leave-request', icon: GitPullRequestClosed },
      { name: 'Check Out Request', href: '/checkout-request', icon: LogOut },
    ],
  },
  {
    section: 'Daily Operations',
    items: [
      { name: 'Attendance', href: '/attendance', icon: Calendar },
      { name: 'Spot-Checks', href: '/spot-checks', icon: ShieldAlert },
      { name: 'Verification Engine', href: '/verification', icon: ShieldAlert },
      { name: 'Faculty & Staff', href: '/students', icon: Users },
    ],
  },
  {
    section: 'Security & Tracking',
    items: [
      { name: 'Staff Locations', href: '/student-locations', icon: MapPin },
      { name: 'Absences', href: '/absences', icon: UserX },
      { name: 'Registration Images', href: '/registration-images', icon: Camera },
    ],
  },
  {
    section: 'Analytics & Administration',
    items: [
      { name: 'Organizations', href: '/organizations', icon: Building2 },
      { name: 'Profile', href: '/profile', icon: User },
    ],
  },
];

// HOD sidebar: same sections as the Admin dashboard EXCEPT institution-admin ones
// (Organizations, Audit Trail, Training & Support, org Profile) which stay
// Admin-only. Every section below is department-scoped on the backend.
const HOD_NAVIGATION = [
  {
    section: 'Overview',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Live Map', href: '/live-map', icon: Map },
      { name: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
  {
    section: 'Action Items (Approvals)',
    items: [
      { name: 'Leave Request', href: '/leave-request', icon: GitPullRequestClosed },
      { name: 'Check Out Request', href: '/checkout-request', icon: LogOut },
    ],
  },
  {
    section: 'Daily Operations',
    items: [
      { name: 'Attendance', href: '/attendance', icon: Calendar },
      { name: 'Spot-Checks', href: '/spot-checks', icon: ShieldAlert },
      { name: 'Verification Engine', href: '/verification', icon: ShieldAlert },
      { name: 'Faculty & Staff', href: '/students', icon: Users },
    ],
  },
  {
    section: 'Security & Tracking',
    items: [
      { name: 'Staff Locations', href: '/student-locations', icon: MapPin },
      { name: 'Absences', href: '/absences', icon: UserX },
      { name: 'Registration Images', href: '/registration-images', icon: Camera },
    ],
  },
  {
    section: 'Analytics & Administration',
    items: [
      { name: 'Profile', href: '/profile', icon: User },
    ],
  },
];

// Defender sidebar: only destinations that exist in the application.
const DEFENDER_NAVIGATION = [
  {
    section: 'Monitor',
    items: [
      { name: 'Overview', href: '/defender', icon: LayoutDashboard },
      { name: 'Workstations', href: '/defender/fleet', icon: Monitor },
      { name: 'Live screens', href: '/defender/live', icon: MonitorPlay },
      { name: 'Incidents', href: '/defender/incidents', icon: ShieldAlert },
      { name: 'Analytics', href: '/defender/analytics', icon: BarChart3 },
    ],
  },
  {
    section: 'Policy',
    items: [
      { name: 'Web firewall', href: '/defender/firewall', icon: Flame },
      { name: 'Detection rules', href: '/defender/rules', icon: ListChecks },
      { name: 'Tamper protection', href: '/defender/security', icon: ShieldCheck },
    ],
  },
  {
    section: 'Records',
    items: [
      { name: 'Timesheet', href: '/defender/timesheet', icon: Clock },
      { name: 'Engine and agents', href: '/defender/system', icon: Settings2 },
    ],
  },
  {
    section: 'Account',
    items: [{ name: 'Profile', href: '/profile', icon: User }],
  },
];

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, role, userType, logout, viewAsOrg, exitInstituteView } = useAuth();
  const location = useLocation();
  const { product } = useProduct();
  const navigate = useNavigate();

  const [isReadOnlyModalOpen, setIsReadOnlyModalOpen] = useState(false);

  useEffect(() => {
    const handleAttempt = () => {
      setIsReadOnlyModalOpen(true);
    };
    window.addEventListener('readonly-mode-attempt', handleAttempt);
    return () => window.removeEventListener('readonly-mode-attempt', handleAttempt);
  }, []);

  /* ── Notifications (bell) ── */
  const [notifOpen, setNotifOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [lastSeen, setLastSeen] = useState(() =>
    Number(localStorage.getItem('notifLastSeen') || 0)
  );
  const notifRef = useRef(null);

  // Pull recent premises exit/enter alerts (org-scoped for Admin, dept-scoped for
  // HOD); poll every minute so the bell stays live while the dashboard is open.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setNotifLoading(true);
        const res = await portalAPI.getGeofenceAlerts(20);
        if (active && res?.success) setAlerts(res.data || []);
      } catch {
        /* not an Admin/HOD context, or offline — leave the feed empty */
      } finally {
        if (active) setNotifLoading(false);
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Close the dropdown on outside-click or Escape.
  useEffect(() => {
    if (!notifOpen) return undefined;
    const onClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [notifOpen]);

  const unreadCount = alerts.filter((a) => new Date(a.at).getTime() > lastSeen).length;

  const toggleNotif = () => {
    setNotifOpen((open) => {
      const next = !open;
      if (next) {
        // Opening marks everything currently shown as seen.
        const now = Date.now();
        setLastSeen(now);
        localStorage.setItem('notifLastSeen', String(now));
      }
      return next;
    });
  };

  const timeAgo = (d) => {
    const secs = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // Super admin browsing an institute read-only.
  const superAdminView = userType === 'superadmin' && viewAsOrg;
  const exitView = () => {
    const returnUrl = localStorage.getItem('superAdminReturnUrl') || '/superadmin/organizations';
    exitInstituteView();
    navigate(returnUrl);
  };

  // HOD uses this same dashboard but every page is department-scoped, and only
  // sees the curated department sidebar.
  const isHod = role === 'hod';
  const nav = product === 'defender' ? DEFENDER_NAVIGATION : (isHod ? HOD_NAVIGATION : navigation);
  const portalLabel = isHod
    ? `HOD${user?.department ? ` · ${user.department}` : ''}`
    : 'Admin Dashboard';


  // One contextual primary action per product overview.
  const ctaAction = location.pathname === '/dashboard'
    ? { label: 'Export report', to: '/reports' }
    : location.pathname === '/defender'
    ? { label: 'View incidents', to: '/defender/incidents' }
    : null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  /* ── Page title from route ── */
  const pageTitle = nav
    .flatMap((g) => g.items)
    .find((i) => i.href === location.pathname)?.name ?? 'Anuvadini';

  return (
    <SmoothScroll>
      <div className="app-shell relative">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          navigation={nav}
          logoSubtitle="Attendance Portal"
          footer={{ icon: Building2, primary: user?.name, secondary: user?.email }}
          showProductSwitcher={!isHod}
          productKey={product}
        />

        {/* ── Main area ── */}
        <div className="relative z-[1] transition-[padding] duration-300 ease-out lg:pl-[var(--sidebar-w,16rem)]">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-[color:var(--app-border)] bg-[color:var(--app-bg)]/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
            {/* Mobile hamburger */}
            <button
              type="button"
              className="-m-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            <SidebarToggle className="-ml-1" />

            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="hidden items-center gap-2 lg:flex">
              <span className="text-[12.5px] font-medium text-[color:var(--app-muted)]">{product === 'defender' ? 'Defender' : 'Attendance'}</span>
              <ChevronRight className="h-3.5 w-3.5 text-[color:var(--app-border)]" aria-hidden="true" />
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={pageTitle} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.18 }} className="text-[13.5px] font-semibold text-[color:var(--app-text)]">{pageTitle}</motion.span>
              </AnimatePresence>
            </nav>
            <GlobalSearch navigation={nav} />

            <div className="flex flex-1 items-center justify-end gap-2">
              {ctaAction && (
                <button type="button" onClick={() => navigate(ctaAction.to)} className="app-btn app-btn--primary hidden sm:inline-flex">{ctaAction.label}</button>
              )}
              {product === 'defender' && <EngineChip />}
              {product === 'defender' ? <DefenderNotifications /> : (
              <>
              {/* Notifications */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={toggleNotif}
                  className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-all hover:bg-slate-100 hover:text-primary-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-primary-300"
                  aria-label="Notifications"
                  aria-haspopup="true"
                  aria-expanded={notifOpen}
                >
                  <Bell className="h-[18px] w-[18px]" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-900">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="fixed left-3 right-3 top-16 z-50 max-h-[calc(100vh-5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-elevation-4 dark:border-slate-700 dark:bg-slate-900 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 sm:max-w-[calc(100vw-2rem)]">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Notifications
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {alerts.length}
                      </span>
                    </div>

                    <div className="max-h-[calc(100vh-11rem)] min-h-0 overflow-y-auto sm:max-h-96" data-lenis-prevent>
                      {notifLoading && alerts.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-slate-400">Loading…</p>
                      ) : alerts.length === 0 ? (
                        <div className="px-4 py-10 text-center">
                          <Bell className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                          <p className="mt-2 text-sm text-slate-400">You're all caught up</p>
                        </div>
                      ) : (
                        alerts.map((a) => {
                          const isExit = a.type === 'exit';
                          return (
                            <Link
                              key={a.id}
                              to="/student-locations"
                              onClick={() => setNotifOpen(false)}
                              className="flex min-w-0 items-start gap-3 border-b border-slate-50 px-4 py-3 transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/50"
                            >
                              <span
                                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                  isExit
                                    ? 'bg-danger-100 text-danger-600 dark:bg-danger-900/30 dark:text-danger-400'
                                    : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                }`}
                              >
                                <MapPin className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-medium text-slate-800 dark:text-slate-100">
                                  {a.name}
                                </p>
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                  {isExit ? 'Left premises' : 'Returned to premises'}
                                  {a.department ? ` · ${a.department}` : ''}
                                  {a.distanceM != null ? ` · ${Math.round(a.distanceM)}m` : ''}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                                  {timeAgo(a.at)}
                                </p>
                              </div>
                            </Link>
                          );
                        })
                      )}
                    </div>

                    <Link
                      to="/student-locations"
                      onClick={() => setNotifOpen(false)}
                      className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-semibold text-primary-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-primary-300 dark:hover:bg-slate-800/50"
                    >
                      View all activity
                    </Link>
                  </div>
                )}
              </div>
              </>
              )}

              <div className="mx-1 h-6 w-px bg-[color:var(--app-border)]" />

              <UserMenu name={user?.name} role={portalLabel} onLogout={handleLogout} />
            </div>
          </header>

          {/* Super-admin read-only "view as institute" banner */}
          {superAdminView && (
            <div className="sticky top-[60px] z-20 flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-amber-250 bg-gradient-to-r from-amber-50/95 via-amber-50/90 to-amber-100/90 dark:border-amber-900/30 dark:from-amber-955/20 dark:via-amber-955/15 dark:to-amber-900/10 px-4 py-3 text-sm dark:text-slate-105 backdrop-blur-md transition-all duration-300 shadow-sm sm:px-6 lg:px-8">
              <div className="flex items-start gap-2.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 mt-0.5 shrink-0">
                  <span className="text-xs" role="img" aria-label="lock">🔒</span>
                </div>
                <div>
                  <h4 className="font-bold text-amber-900 dark:text-amber-350">
                    Read-Only Institute View
                  </h4>
                  <p className="mt-0.5 text-xs text-amber-800/85 dark:text-amber-400/80 font-medium">
                    You are viewing this institute as Super Admin. Editing is disabled until you exit Read-Only Mode.
                  </p>
                </div>
              </div>
              <button
                onClick={exitView}
                className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-amber-600/10 hover:bg-amber-700 active:scale-[0.98] transition-all whitespace-nowrap"
              >
                <X className="h-3.5 w-3.5" /> Exit institute view
              </button>
            </div>
          )}

          {/* Page content */}
          <main className="py-6">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8"
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>

      {isReadOnlyModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsReadOnlyModalOpen(false)}
          />
          
          {/* Modal Card */}
          <div className="relative w-full max-w-md transform overflow-hidden rounded-3xl bg-white p-6 text-left shadow-2xl transition-all dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Close Button */}
            <button 
              onClick={() => setIsReadOnlyModalOpen(false)}
              className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-350 transition-colors"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Content */}
            <div className="flex flex-col items-center text-center mt-2">
              {/* Icon Container */}
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-955/30 dark:text-amber-400 mb-4 ring-4 ring-amber-500/10">
                <span className="text-2xl" role="img" aria-label="lock">🔒</span>
              </div>

              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans tracking-tight">
                Read-Only Mode
              </h3>
              
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                You are currently viewing this institute in Read-Only Mode. Editing actions are disabled. Exit Read-Only Mode to add, edit, or delete information.
              </p>
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start font-sans">
              <button
                type="button"
                onClick={() => {
                  setIsReadOnlyModalOpen(false);
                  exitView();
                }}
                className="inline-flex w-full justify-center items-center gap-2 rounded-2xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-600/15 hover:bg-amber-700 hover:shadow-amber-700/20 active:scale-[0.98] transition-all sm:w-auto"
              >
                <LogOut className="h-4 w-4" />
                Exit Read-Only Mode
              </button>
              <button
                type="button"
                onClick={() => setIsReadOnlyModalOpen(false)}
                className="inline-flex w-full justify-center items-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 active:scale-[0.98] transition-all dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750 sm:w-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </SmoothScroll>
  );
};

export default Layout;


