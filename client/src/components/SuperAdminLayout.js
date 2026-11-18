import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Building2,
  Camera,
  GalleryHorizontal,
  ShieldAlert,
  LogOut,
  Menu,
  ChevronRight,
  ShieldCheck,
  SlidersHorizontal,
  ScrollText,
  UserCheck,
  FileWarning,
  ShieldX,
  Globe,
  KeyRound,
  ClipboardCheck,
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import Sidebar, { SidebarToggle } from './Sidebar';

const NAVIGATION = [
  {
    section: 'Operations',
    items: [
      { name: 'Spot Checks', href: '/superadmin/spot-checks', icon: UserCheck },
      { name: 'Registration Images', href: '/superadmin/registration-images', icon: GalleryHorizontal },
    ],
  },
  {
    section: 'Security & Monitoring',
    items: [
      { name: 'Spoof Detection', href: '/superadmin/spoof-attempts', icon: ShieldAlert },
      { name: 'Face Report', href: '/superadmin/face-captures', icon: Camera },
      { name: 'Device Integrity', href: '/superadmin/blocked-devices', icon: ShieldX },
      { name: 'Device & IP Tracking', href: '/superadmin/ip-tracking', icon: Globe },
      { name: 'Login Sessions', href: '/superadmin/sessions', icon: KeyRound },
    ],
  },
  {
    section: 'Analytics & Compliance',
    items: [
      { name: 'Attendance Compliance', href: '/superadmin/checkout-compliance', icon: ClipboardCheck },
      { name: 'Risk Insights', href: '/superadmin/compliance-center', icon: FileWarning },
      { name: 'Organization Profile', href: '/superadmin/organization', icon: SlidersHorizontal },
    ],
  },
];

const SuperAdminLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');
  const handleLogout = () => { logout(); navigate('/login'); };

  const pageTitle = NAVIGATION.flatMap((g) => g.items).find((i) => i.href === location.pathname)?.name ?? 'Super Admin';

  return (
    <div className="relative min-h-screen bg-[#FAFAF7] dark:bg-[#0A0F1C]">
      <div className="dash-ambient" aria-hidden="true" />
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        navigation={NAVIGATION}
        logoSubtitle="Super Admin"
        footer={{ icon: Building2, primary: user?.name || 'Super Admin', secondary: 'Admin Access' }}
      />
      <div className="relative z-[1] transition-[padding] duration-300 ease-out lg:pl-[var(--sidebar-w,16rem)]">
        <header className="sticky top-3 z-30 mx-3 mt-3 flex h-14 items-center gap-4 rounded-full border border-slate-200/80 bg-white/80 px-4 shadow-[0_14px_34px_-20px_rgba(23,25,28,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/75 sm:mx-5 sm:px-5 lg:mx-8">
          <button type="button" className="-m-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <SidebarToggle className="-ml-1" />
          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Anuvadini</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{pageTitle}</span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-2">
            <div className="flex items-center gap-3">
              <div className="hidden flex-col items-end sm:flex">
                <span className="text-sm font-semibold leading-tight text-slate-800 dark:text-slate-200">{user?.name || 'Super Admin'}</span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">Anuvadini</span>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <button onClick={handleLogout} className="flex h-9 items-center gap-1.5 rounded-xl border border-danger-200 bg-danger-50 px-3 text-sm font-medium text-danger-700 transition-all hover:bg-danger-100 dark:border-danger-800/50 dark:bg-danger-900/20 dark:text-danger-400 dark:hover:bg-danger-900/40">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </header>
        <main className="py-6">
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default SuperAdminLayout;
