import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const TONES = {
  brand: 'var(--accent)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  err: 'var(--err)',
  info: 'var(--info)',
  neutral: 'var(--app-text-2)',
};

/** Counts to `value` once on mount and whenever `value` actually changes. */
export function useCountTo(value, duration = 700) {
  const reduce = useReducedMotion();
  const target = Number(value);
  const [shown, setShown] = useState(Number.isFinite(target) ? 0 : value);
  const from = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(target)) { setShown(value); return undefined; }
    if (reduce) { setShown(target); from.current = target; return undefined; }
    const start = performance.now();
    const origin = from.current;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(origin + (target - origin) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, value, duration, reduce]);
  return Number.isFinite(target) ? Math.round(shown) : shown;
}

/** A small sparkline that draws once. `data` is an array of numbers. */
export function Spark({ data, color, height = 36 }) {
  const reduce = useReducedMotion();
  if (!data || data.length < 2) return null;
  const w = 120;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - 3 - ((v - min) / range) * (height - 8)]);
  const d = `M ${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ')}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-9 w-full overflow-visible" aria-hidden="true">
      <motion.path
        d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        initial={reduce ? false : { pathLength: 0, opacity: 0.4 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.8, delay: 0.15, ease: 'easeOut' }}
      />
    </svg>
  );
}

/**
 * KPI card shared by Attendance and Defender.
 *  label, value, icon, tone, hint (small caption), spark (number[]), onClick, loading
 */
const KpiCard = ({ label, value, suffix = '', icon: Icon, tone = 'brand', hint, spark, onClick, loading, index = 0, info }) => {
  const reduce = useReducedMotion();
  const color = TONES[tone] || TONES.brand;
  const display = useCountTo(loading ? 0 : value);
  const Tag = onClick ? 'button' : 'div';
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 * index, ease: [0.22, 1, 0.36, 1] }}
      title={info}
    >
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`app-card app-card--hover group block w-full p-4 text-left ${onClick ? 'app-focus cursor-pointer' : ''}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-[color:var(--app-text-2)]">{label}</span>
          {Icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] transition-transform duration-200 group-hover:-translate-y-0.5" style={{ background: 'var(--accent-soft)', color }}>
              <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
            </span>
          )}
        </div>
        {loading ? (
          <div className="mt-3 h-8 w-20 animate-pulse rounded-md bg-[color:var(--app-hover)]" />
        ) : (
          <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight text-[color:var(--app-text)] tnum">
            {typeof display === 'number' ? display.toLocaleString() : display}{suffix}
          </div>
        )}
        <div className="mt-3 flex min-h-[36px] items-end justify-between gap-3">
          {hint ? <span className="text-[11.5px] leading-snug text-[color:var(--app-muted)]">{hint}</span> : <span />}
          {spark && <div className="w-[96px] shrink-0"><Spark data={spark} color={color} /></div>}
        </div>
      </Tag>
    </motion.div>
  );
};

export default KpiCard;
