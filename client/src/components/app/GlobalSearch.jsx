import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search } from 'lucide-react';

/**
 * Jump-to search for the pages in the current sidebar. Real and functional:
 * type to filter, arrow keys to move, Enter to open, Esc to close, Ctrl/Cmd+K
 * to focus from anywhere.
 */
const GlobalSearch = ({ navigation }) => {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef(null);
  const box = useRef(null);

  const all = useMemo(
    () => navigation.flatMap((g) => g.items.map((i) => ({ ...i, section: g.section }))),
    [navigation],
  );
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? all.filter((i) => i.name.toLowerCase().includes(t) || i.section.toLowerCase().includes(t)) : all).slice(0, 8);
  }, [q, all]);

  useEffect(() => { setCursor(0); }, [q, open]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); setOpen(true); }
    };
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, []);

  const go = (item) => { navigate(item.href); setOpen(false); setQ(''); input.current?.blur(); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(results.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); go(results[cursor]); }
    else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
  };

  return (
    <div ref={box} className="relative hidden w-full max-w-[320px] md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--app-muted)]" aria-hidden="true" />
      <input
        ref={input}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-list"
        aria-label="Search pages"
        placeholder="Search pages"
        className="app-input w-full pl-9 pr-12"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-[color:var(--app-border)] bg-[color:var(--app-hover)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[color:var(--app-text-2)]">Ctrl K</kbd>

      <AnimatePresence>
        {open && (
          <motion.ul
            id="global-search-list"
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-80 overflow-y-auto rounded-xl border border-[color:var(--app-border)] bg-white p-1.5 shadow-[0_18px_40px_-20px_rgba(23,25,28,0.35)]"
          >
            {results.length === 0 && <li className="px-3 py-3 text-[13px] text-[color:var(--app-text-2)]">No matching pages</li>}
            {results.map((r, i) => {
              const Icon = r.icon;
              return (
                <li key={r.href} role="option" aria-selected={i === cursor}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(r)}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors"
                    style={{ background: i === cursor ? 'var(--accent-soft)' : 'transparent' }}
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: i === cursor ? 'var(--accent)' : 'var(--app-muted)' }} aria-hidden="true" />
                    <span className="flex-1 truncate font-medium text-[color:var(--app-text)]">{r.name}</span>
                    <span className="truncate text-[11px] text-[color:var(--app-muted)]">{r.section}</span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GlobalSearch;
