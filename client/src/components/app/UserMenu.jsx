import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, LogOut } from 'lucide-react';

/** Avatar button with an accessible dropdown (name, role, sign out). */
const UserMenu = ({ name, role, onLogout }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const initial = (name || 'A').trim()[0]?.toUpperCase() || 'A';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="app-focus flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-[color:var(--app-hover)]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-semibold text-white" style={{ background: 'var(--accent)' }}>{initial}</span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[140px] truncate text-[13px] font-semibold leading-tight text-[color:var(--app-text)]">{name}</span>
          <span className="block text-[11px] leading-tight text-[color:var(--app-muted)]">{role}</span>
        </span>
        <ChevronDown className={`hidden h-3.5 w-3.5 text-[color:var(--app-muted)] transition-transform sm:block ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-[calc(100%+6px)] z-50 w-56 rounded-xl border border-[color:var(--app-border)] bg-white p-1.5 shadow-[0_18px_40px_-20px_rgba(23,25,28,0.35)]"
          >
            <div className="border-b border-[color:var(--app-border)] px-3 pb-2.5 pt-2">
              <p className="truncate text-[13px] font-semibold text-[color:var(--app-text)]">{name}</p>
              <p className="text-[11.5px] text-[color:var(--app-muted)]">{role}</p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onLogout(); }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[color:var(--err)] transition-colors hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserMenu;
