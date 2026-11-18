import React, { useEffect, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Building2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import AnuvadiniLogo from '../assets/anuvadini_logo.png';
import ProductSwitcher from './app/ProductSwitcher';

/**
 * Shared left navigation sidebar used by every dashboard shell (Admin/HOD
 * Layout, SuperAdminLayout, PortalLayout). Each caller keeps owning its own
 * `navigation` data, footer identity and `sidebarOpen` state; this component
 * owns the shell markup (mobile drawer, desktop rail, product switcher, nav
 * rendering, animated active indicator, scroll-position restore).
 *
 * Props:
 *  - navigation: [{ section, items: [{ name, href, icon, danger? }] }]
 *  - logoSubtitle: small text under the Anuvadini wordmark
 *  - footer: { icon: LucideIcon, primary, secondary } — bottom identity card
 *  - open / onClose: mobile drawer visibility
 *  - showProductSwitcher: show the Attendance / Defender switch (admin shells)
 */
const EASE = [0.22, 1, 0.36, 1];
const COLLAPSE_KEY = 'anuvadini.sidebar.collapsed';
const W_OPEN = '16rem';
const W_RAIL = '4.5rem';

/**
 * Desktop rail state, shared between the sidebar and the toggle button that lives in each
 * layout's top header. Remembered per browser; the width is published as --sidebar-w so each
 * layout can offset its content.
 */
const readStored = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch (e) { return false; }
};
let collapsedState = readStored();
const listeners = new Set();
const applyWidth = () => document.documentElement.style.setProperty('--sidebar-w', collapsedState ? W_RAIL : W_OPEN);
applyWidth();
const setCollapsedState = (v) => {
  collapsedState = v;
  applyWidth();
  try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch (e) { /* storage unavailable */ }
  listeners.forEach((l) => l());
};
const toggleCollapsed = () => setCollapsedState(!collapsedState);
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const useCollapsed = () => useSyncExternalStore(subscribe, () => collapsedState, () => false);

/** Ctrl/Cmd+B toggles the rail, unless the user is typing. */
const useCollapseShortcut = () => {
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        const t = e.target;
        if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
};

/** Collapse / expand button for the layout's top header. Desktop only; mobile uses the drawer. */
export const SidebarToggle = ({ className = '' }) => {
  const collapsed = useCollapsed();
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  return (
    <button
      type="button"
      onClick={toggleCollapsed}
      aria-label={label}
      aria-pressed={collapsed}
      title={`${label} (Ctrl+B)`}
      className={`app-focus hidden h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[color:var(--app-text-2)] transition-colors hover:bg-[color:var(--app-hover)] hover:text-[color:var(--app-text)] lg:inline-flex ${className}`}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
};

// Module-level components keep their identity between renders, which is what
// lets the active indicator animate from one item to the next.
const NavItem = ({ item, active, onClick, indicatorId, collapsed }) => {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.name : undefined}
      aria-label={collapsed ? item.name : undefined}
      className={`app-focus group relative flex min-w-0 items-center rounded-[10px] py-2 text-[13.5px] font-medium leading-5 transition-colors duration-200 ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'}`}
      style={{ color: active ? 'var(--accent)' : 'var(--app-text-2)' }}
    >
      {active && (
        <>
          <motion.span
            layoutId={`${indicatorId}-bg`}
            className="absolute inset-0 rounded-[10px]"
            style={{ background: 'var(--accent-soft)' }}
            transition={{ type: 'spring', stiffness: 460, damping: 38 }}
          />
          <motion.span
            layoutId={`${indicatorId}-bar`}
            className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
            style={{ background: 'var(--accent)' }}
            transition={{ type: 'spring', stiffness: 460, damping: 38 }}
          />
        </>
      )}
      {!active && <span className="absolute inset-0 rounded-[10px] bg-transparent transition-colors duration-200 group-hover:bg-[color:var(--app-hover)]" />}
      <Icon
        className={`relative h-[17px] w-[17px] flex-shrink-0 transition-colors duration-200 ${
          active ? '' : item.danger ? 'text-[color:var(--err)]' : 'text-[color:var(--app-muted)] group-hover:text-[color:var(--app-text)]'
        }`}
        aria-hidden="true"
      />
      {!collapsed && <span className="relative min-w-0 flex-1 break-words group-hover:text-[color:var(--app-text)]" style={active ? { color: 'var(--accent)' } : undefined}>{item.name}</span>}
      {item.danger && !active && <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[color:var(--err)] ${collapsed ? 'absolute right-2 top-2' : 'relative'}`} title="Security alerts" />}
    </Link>
  );
};

const SidebarContent = ({ navigation, logoSubtitle, footer, onItemClick, onCloseClick, pathname, indicatorId, showProductSwitcher, productKey, collapsed = false }) => {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex h-[64px] shrink-0 items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
        <a href="/" className="app-focus flex min-w-0 items-center gap-2.5 rounded-lg" aria-label="Anuvadini">
          <div className={`flex h-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--app-border)] bg-white p-1 ${collapsed ? 'w-9' : 'w-[80px]'}`}>
            <img src={AnuvadiniLogo} alt="Anuvadini" className={`h-full w-full ${collapsed ? 'object-cover object-left' : 'object-contain'}`} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-semibold tracking-tight text-[color:var(--app-text)]">Anuvadini</p>
              <p className="truncate text-[10.5px] font-medium text-[color:var(--app-muted)]">{logoSubtitle}</p>
            </div>
          )}
        </a>
        {onCloseClick && (
          <button onClick={onCloseClick} className="app-focus shrink-0 rounded-lg p-1.5 text-[color:var(--app-text-2)] hover:bg-[color:var(--app-hover)]" aria-label="Close sidebar">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {showProductSwitcher && (
        <div className={`shrink-0 pb-2 pt-1 ${collapsed ? 'px-2' : 'px-3'}`}>
          <ProductSwitcher onNavigate={onItemClick} collapsed={collapsed} />
        </div>
      )}

      <nav
        data-lenis-prevent
        aria-label="Primary"
        className={`sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pt-2 ${collapsed ? 'px-2' : 'px-3'}`}
        onScroll={(e) => { sessionStorage.setItem('sidebarScrollTop', e.target.scrollTop); }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={productKey}
            initial={reduce ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: 8 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="space-y-5"
          >
            {navigation.map((group) => (
              <div key={group.section}>
                {collapsed
                  ? <div className="mx-3 mb-2 h-px bg-[color:var(--app-border)]" role="presentation" />
                  : <p className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[color:var(--app-muted)]">{group.section}</p>}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavItem key={item.name} item={item} active={pathname === item.href} onClick={onItemClick} indicatorId={indicatorId} collapsed={collapsed} />
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
        <div className="h-4" />
      </nav>

      <div className="shrink-0 border-t border-[color:var(--app-border)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className={`flex items-center rounded-xl p-2 ${collapsed ? 'justify-center' : 'gap-3'}`} title={collapsed ? [footer?.primary, footer?.secondary].filter(Boolean).join(' · ') : undefined}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: 'var(--accent)' }}>
            {footer?.icon ? <footer.icon className="h-4 w-4" aria-hidden="true" /> : <Building2 className="h-4 w-4" aria-hidden="true" />}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[color:var(--app-text)]">{footer?.primary}</p>
              <p className="truncate text-[11.5px] text-[color:var(--app-muted)]">{footer?.secondary}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ navigation, logoSubtitle, footer, open, onClose, showProductSwitcher = false, productKey = 'default' }) => {
  const location = useLocation();
  const collapsed = useCollapsed();
  useCollapseShortcut();

  useEffect(() => {
    const saved = sessionStorage.getItem('sidebarScrollTop');
    if (saved) document.querySelectorAll('.sidebar-scroll').forEach((el) => { el.scrollTop = Number(saved); });
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    const onEsc = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onEsc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onEsc); };
  }, [open, onClose]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="fixed inset-0 bg-[#17202B]/40" onClick={onClose} aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            <motion.div
              role="dialog" aria-modal="true" aria-label="Navigation"
              className="fixed inset-y-0 left-0 flex w-[min(19rem,calc(100vw-1rem))] max-w-full flex-col overflow-hidden bg-[color:var(--app-sidebar)] shadow-2xl"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ duration: 0.3, ease: EASE }}
            >
              <SidebarContent navigation={navigation} logoSubtitle={logoSubtitle} footer={footer} onItemClick={onClose} onCloseClick={onClose} pathname={location.pathname} indicatorId="nav-m" showProductSwitcher={showProductSwitcher} productKey={productKey} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <aside className="hidden transition-[width] duration-300 ease-out lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:flex-col" style={{ width: collapsed ? W_RAIL : W_OPEN }}>
        <div className="flex flex-1 flex-col overflow-hidden border-r border-[color:var(--app-border)] bg-[color:var(--app-sidebar)]">
          <SidebarContent navigation={navigation} logoSubtitle={logoSubtitle} footer={footer} onItemClick={undefined} onCloseClick={undefined} pathname={location.pathname} indicatorId="nav" showProductSwitcher={showProductSwitcher} productKey={productKey} collapsed={collapsed} />
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
