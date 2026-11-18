import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Users,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  LogOut,
  Menu,
  ChevronRight,
  GitPullRequestClosed,
  GraduationCap,
  HeartHandshake,
  UserCircle,
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import Sidebar, { SidebarToggle } from './Sidebar';

// Role-specific navigation. Faculty & Staff see only their own data; the HOD
// sees the department. Both reuse the exact Admin dashboard look & feel.
const NAV = {
  faculty: [
    {
      section: 'My Workspace',
      items: [
        { name: 'My Dashboard', href: '/portal', icon: LayoutDashboard },
        { name: 'My Timetable', href: '/portal/timetable', icon: CalendarRange },
        { name: 'My Attendance', href: '/portal/attendance', icon: Calendar },
        { name: 'My Calendar', href: '/portal/calendar', icon: CalendarDays },
        { name: 'Outreach Activities', href: '/portal/outreach', icon: HeartHandshake },
      ],
    },
    {
      section: 'Requests',
      items: [
        { name: 'My Leaves', href: '/portal/leaves', icon: GitPullRequestClosed },
        { name: 'My Check-outs', href: '/portal/checkouts', icon: LogOut },
      ],
    },
    {
      section: 'Account',
      items: [
        { name: 'Holidays', href: '/portal/holidays', icon: CalendarCheck },
        { name: 'My Profile', href: '/portal/profile', icon: UserCircle },
      ],
    },
  ],
  hod: [
    {
      section: 'Department',
      items: [
        { name: 'Department Overview', href: '/hod', icon: LayoutDashboard },
        { name: 'Faculty & Staff', href: '/hod/members', icon: Users },
        { name: 'Leave Approvals', href: '/hod/leaves', icon: CalendarCheck },
      ],
    },
  ],
};

const PortalLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, role, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const isHod = role === 'hod';
  const navigation = isHod ? NAV.hod : NAV.faculty;
  const portalLabel = isHod ? 'HOD Dashboard' : 'Faculty & Staff Portal';
  const RoleIcon = isHod ? GraduationCap : UserCircle;

  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const pageTitle =
    navigation.flatMap((g) => g.items).find((i) => i.href === location.pathname)?.name ?? portalLabel;

  return (
    <div className="relative min-h-screen bg-[#FAFAF7] dark:bg-[#0A0F1C]">
      <div className="dash-ambient" aria-hidden="true" />
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        navigation={navigation}
        logoSubtitle={portalLabel}
        footer={{
          icon: RoleIcon,
          primary: user?.name || user?.fullName,
          secondary: `${user?.designation || (isHod ? 'HOD' : 'Faculty')}${user?.department ? ` · ${user.department}` : ''}`,
        }}
      />

      {/* Main */}
      <div className="relative z-[1] transition-[padding] duration-300 ease-out lg:pl-[var(--sidebar-w,16rem)]">
        <header className="sticky top-3 z-30 mx-3 mt-3 flex h-14 items-center gap-4 rounded-full border border-slate-200/80 bg-white/80 px-4 shadow-[0_14px_34px_-20px_rgba(23,25,28,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/75 sm:mx-5 sm:px-5 lg:mx-8">
          <button
            type="button"
            className="-m-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <SidebarToggle className="-ml-1" />
          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Anuvadini</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{pageTitle}</span>
          </div>

          <div className="flex flex-1 items-center justify-end gap-2">
            <div className="flex items-center gap-3">
              <div className="hidden flex-col items-end sm:flex">
                <span className="text-sm font-semibold leading-tight text-slate-800 dark:text-slate-200">
                  {user?.name || user?.fullName}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">{portalLabel}</span>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm text-xs font-bold">
                {(user?.name || user?.fullName)?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <button
                onClick={handleLogout}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-danger-200 bg-danger-50 px-3 text-sm font-medium text-danger-700 transition-all hover:bg-danger-100 dark:border-danger-800/50 dark:bg-danger-900/20 dark:text-danger-400 dark:hover:bg-danger-900/40"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </header>

        <main className="py-4 sm:py-6">
          <div className="mx-auto max-w-[1600px] px-3 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default PortalLayout;

