import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ServerOff, Inbox, X } from 'lucide-react';
import PageHeader from '../app/PageHeader';
import { useEngineStatus, useFreshness } from '../../pages/defender/api';
import useDefenderMotion from '../../hooks/useDefenderMotion';
import useDashboardScroll from '../../hooks/useDashboardScroll';

const TONE = {
  ok: { bg: '#eaf6e3', fg: '#2f5b1e' },
  warn: { bg: '#fdf3d9', fg: '#8a5a00' },
  err: { bg: '#fbe9e7', fg: '#a63a2f' },
  info: { bg: '#e8effd', fg: '#2a4fb0' },
  neutral: { bg: 'var(--app-hover)', fg: 'var(--app-text-2)' },
};

export const Pill = ({ tone = 'neutral', children, dot = true }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold" style={{ background: TONE[tone].bg, color: TONE[tone].fg }}>
    {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />}
    {children}
  </span>
);

export const STATUS = {
  ONLINE: { label: 'On task', tone: 'ok' },
  PRODUCTIVE: { label: 'On task', tone: 'ok' },
  IDLE: { label: 'Idle', tone: 'warn' },
  GAMING_ALERT: { label: 'Violation', tone: 'err' },
  TAMPER_ALERT: { label: 'Not reporting', tone: 'err' },
  OFFLINE: { label: 'Offline', tone: 'neutral' },
};
export const StatusPill = ({ status }) => {
  const m = STATUS[status] || { label: status || 'Unknown', tone: 'neutral' };
  return <Pill tone={m.tone}>{m.label}</Pill>;
};
const SEV = { CRITICAL: 'err', HIGH: 'err', MEDIUM: 'warn', LOW: 'info' };
export const SeverityPill = ({ severity }) => <Pill tone={SEV[String(severity).toUpperCase()] || 'neutral'}>{String(severity || 'Unknown').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</Pill>;

export const Card = ({ title, subtitle, actions, children, className = '', pad = true }) => (
  <section className={`app-card ${pad ? 'p-5' : ''} ${className}`}>
    {(title || actions) && (
      <div className={`flex flex-wrap items-center justify-between gap-3 ${pad ? 'mb-4' : 'px-5 pt-5 pb-3'}`}>
        <div className="min-w-0">
          {title && <h2 className="text-[15px] font-semibold text-[color:var(--app-text)]">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-[12px] text-[color:var(--app-text-2)]">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

export const Empty = ({ title, hint, icon: Icon = Inbox }) => (
  <div className="flex flex-col items-center justify-center py-10 text-center">
    <Icon className="h-6 w-6 text-[color:var(--app-muted)]" aria-hidden="true" />
    <p className="mt-2 text-[13.5px] font-medium text-[color:var(--app-text)]">{title}</p>
    {hint && <p className="mt-1 max-w-sm text-[12px] text-[color:var(--app-text-2)]">{hint}</p>}
  </div>
);

export const Skeleton = ({ rows = 4, h = 'h-12' }) => (
  <div className="space-y-2" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }).map((_, i) => <div key={i} className={`${h} animate-pulse rounded-xl bg-[color:var(--app-hover)]`} />)}
  </div>
);

export const ErrorNote = ({ error, onRetry }) => (
  <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[13px]" style={{ background: '#fbe9e7', borderColor: '#f1c9c5', color: '#7d2a21' }} role="alert">
    <span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" aria-hidden="true" />Could not load this data. {error?.response?.data?.message || ''}</span>
    {onRetry && <button type="button" className="app-btn app-btn--ghost" onClick={onRetry}>Try again</button>}
  </div>
);

export const Segmented = ({ value, onChange, options, label }) => (
  <div role="group" aria-label={label} className="inline-flex rounded-[10px] border border-[color:var(--app-border)] bg-[color:var(--app-card)] p-0.5">
    {options.map((o) => {
      const on = value === o.value;
      return (
        <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
          className="app-focus rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition-colors"
          style={{ background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--app-text-2)' }}>
          {o.label}
        </button>
      );
    })}
  </div>
);

export const Toggle = ({ checked, onChange, label, disabled }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
    className="app-focus relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50"
    style={{ background: checked ? 'var(--accent)' : '#cfd3cc' }}>
    <span className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all duration-200" style={{ left: checked ? 21 : 3 }} />
  </button>
);

/** Centered dialog or right drawer. Esc closes; focus moves in and returns. */
export const Overlay = ({ open, onClose, title, children, side = false, width = 'max-w-lg' }) => {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const back = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    back.current = document.activeElement;
    const t = setTimeout(() => ref.current?.querySelector('[data-autofocus],button,input,select')?.focus(), 30);
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => { clearTimeout(t); document.removeEventListener('keydown', key); back.current?.focus?.(); };
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]" role="presentation">
          <motion.div className="absolute inset-0 bg-black/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={ref} role="dialog" aria-modal="true" aria-label={title}
            className={side
              ? 'absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col overflow-y-auto bg-white shadow-2xl'
              : `absolute left-1/2 top-1/2 flex max-h-[88vh] w-[calc(100%-32px)] ${width} flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl`}
            style={side ? undefined : { x: '-50%', y: '-50%' }}
            initial={reduce ? { opacity: 0 } : side ? { x: '100%' } : { opacity: 0, scale: 0.97 }}
            animate={reduce ? { opacity: 1 } : side ? { x: 0 } : { opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : side ? { x: '100%' } : { opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center justify-between border-b border-[color:var(--app-border)] px-5 py-3.5">
              <h2 className="text-[15px] font-semibold text-[color:var(--app-text)]">{title}</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="app-focus rounded-md p-1.5 text-[color:var(--app-text-2)] hover:bg-[color:var(--app-hover)]"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export const Confirm = ({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }) => (
  <Overlay open={open} onClose={onClose} title={title} width="max-w-md">
    <p className="text-[13.5px] text-[color:var(--app-text-2)]">{message}</p>
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" className="app-btn app-btn--ghost" onClick={onClose}>Cancel</button>
      <button type="button" data-autofocus className="app-btn app-btn--primary" style={danger ? { background: 'var(--err)', borderColor: 'var(--err)' } : undefined} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
    </div>
  </Overlay>
);

/** Page frame: header, then either the page or an "engine offline" panel. */
export const DefenderPage = ({ title, subtitle, actions, meta, children }) => {
  const { online, recheck } = useEngineStatus();
  const fresh = useFreshness();
  const motionRef = useDefenderMotion(online === true);
  const [pageEl, setPageEl] = useState(null);
  const setRoot = useCallback((n) => { motionRef.current = n; setPageEl(n); }, [motionRef]);
  useDashboardScroll(pageEl, online === true);
  return (
    <div ref={setRoot} className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} actions={online ? actions : null} meta={meta} />
      {online && fresh.failing && (
        <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-[12.5px]" style={{ background: '#fdf3d9', borderColor: '#f0e1a8', color: '#8a5a00' }} role="status">
          <span>Showing the last data received. The latest refresh failed.</span>
          <button type="button" className="app-focus rounded font-semibold underline" onClick={recheck}>Check engine</button>
        </div>
      )}
      {online === null ? <Skeleton rows={3} h="h-24" /> : online ? children : (
        <div className="app-card flex flex-col items-center px-6 py-14 text-center" role="alert">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: '#fbe9e7', color: '#a63a2f' }}><ServerOff className="h-6 w-6" aria-hidden="true" /></span>
          <h2 className="mt-4 text-[17px] font-semibold text-[color:var(--app-text)]">The Defender engine is not running</h2>
          <p className="mt-1 max-w-md text-[13px] text-[color:var(--app-text-2)]">Defender monitors workstations through its own local service. Start it, then this page will connect automatically.</p>
          <code className="mt-4 rounded-lg bg-[color:var(--app-hover)] px-3 py-2 text-[12px] text-[color:var(--app-text)]">cd defender &nbsp;&amp;&amp;&nbsp; python main.py</code>
          <p className="mt-2 text-[11.5px] text-[color:var(--app-muted)]">The API server starts it automatically on restart (unless DEFENDER_AUTOSTART=0). If port 8055 is held by another program, stop that program first.</p>
          <button type="button" className="app-btn app-btn--ghost mt-5" onClick={recheck}>Check again</button>
        </div>
      )}
    </div>
  );
};

/** Compact stat for strips inside cards. */
export const Stat = ({ label, value, hint, tone }) => (
  <div>
    <p className="text-[12px] text-[color:var(--app-text-2)]">{label}</p>
    <p className="mt-1 text-[22px] font-semibold leading-none text-[color:var(--app-text)] tnum" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</p>
    {hint && <p className="mt-1 text-[11.5px] text-[color:var(--app-muted)]">{hint}</p>}
  </div>
);
