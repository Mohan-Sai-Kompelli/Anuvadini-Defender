import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const AV = [['#E3F0D2', '#2F5B1E'], ['#DDE9F8', '#2A4FB0'], ['#F6E8CF', '#8A5A00'], ['#E9E3F5', '#5B3FA6'], ['#D9EFEA', '#1E6B5C'], ['#F4DEDB', '#A63A2F']];
const hash = (s) => [...String(s || '?')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Initials avatar with a stable colour per person. */
export const Avatar = ({ name, size = 34, dot }) => {
  const [bg, fg] = AV[hash(name) % AV.length];
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.36 }} aria-hidden="true">
      {initials}
      {dot && <span className="absolute -bottom-0.5 -right-0.5 h-[11px] w-[11px] rounded-full border-2 border-white" style={{ background: dot }} />}
    </span>
  );
};

export const STATUS_COLOR = { ONLINE: 'var(--ok)', PRODUCTIVE: 'var(--ok)', IDLE: 'var(--warn)', GAMING_ALERT: 'var(--err)', TAMPER_ALERT: 'var(--err)', OFFLINE: 'var(--app-muted)' };

/** Animated circular gauge (0-100). Redraws only when the value changes. */
export const Ring = ({ value = 0, size = 124, stroke = 11, track = 'rgba(255,255,255,0.14)', color = '#B9F36A', label, sub, textColor = '#fff' }) => {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label || 'Value'} ${Math.round(v)} percent`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - v / 100) }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[28px] font-semibold leading-none tnum" style={{ color: textColor }}>{Math.round(v)}%</span>
        {sub && <span className="mt-1 text-[11px]" style={{ color: textColor, opacity: 0.65 }}>{sub}</span>}
      </div>
    </div>
  );
};

/** Horizontal stacked bar. parts: [{label, value, color}] */
export const StackedBar = ({ parts, height = 8 }) => {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-[color:var(--app-hover)]" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <span key={p.label} title={`${p.label}: ${p.value}`} className="h-full transition-[width] duration-500" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
};

/** Compact filter tile used for status summaries. */
export const SummaryTile = ({ label, value, color, active, onClick }) => (
  <button type="button" onClick={onClick} aria-pressed={active} className="app-focus flex min-w-[112px] flex-1 items-center gap-3 rounded-xl border bg-[color:var(--app-card)] px-3.5 py-2.5 text-left transition-colors hover:bg-[color:var(--app-hover)]"
    style={{ borderColor: active ? 'var(--accent-border)' : 'var(--app-border)', background: active ? 'var(--accent-soft)' : undefined }}>
    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
    <span className="min-w-0"><span className="block text-[18px] font-semibold leading-none text-[color:var(--app-text)] tnum">{value}</span><span className="mt-1 block truncate text-[11.5px] text-[color:var(--app-text-2)]">{label}</span></span>
  </button>
);
