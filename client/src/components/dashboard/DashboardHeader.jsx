import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Clock, Users, UserX, Gauge } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   Anuvadini dashboard hero.
   Midnight card with slow aurora light, a live "workday" timeline with a
   marker at the current time, and glass stat cards that count up.
───────────────────────────────────────────────────────────────────────────── */

const EASE = [0.22, 1, 0.36, 1];

/** Counts from 0 to `value` when it changes. */
export function AnimatedNumber({ value, suffix = '', prefix = '', duration = 1300 }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const target = Number(value) || 0;
    if (reduce || target === 0) { setDisplay(target); return undefined; }
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration, reduce]);
  return <>{prefix}{display.toLocaleString()}{suffix}</>;
}

const DAY_START = 8;   // 08:00
const DAY_END = 19;    // 19:00
const MARKS = [[9, '09:00', 'Start'], [13, '13:00', 'Break'], [17.5, '17:30', 'End']];

/** Where "now" sits on the 08:00 - 19:00 strip, 0..1. */
const dayProgress = (d) => Math.min(1, Math.max(0, (d.getHours() + d.getMinutes() / 60 - DAY_START) / (DAY_END - DAY_START)));

function WorkdayStrip() {
  const reduce = useReducedMotion();
  const [p, setP] = useState(() => dayProgress(new Date()));
  useEffect(() => {
    const t = setInterval(() => setP(dayProgress(new Date())), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative mt-7 h-14 select-none" aria-label="Workday timeline">
      <div className="absolute left-0 right-0 top-[18px] h-[3px] rounded-full bg-white/15" />
      <motion.div
        className="absolute left-0 top-[18px] h-[3px] origin-left rounded-full bg-gradient-to-r from-[#6F8DF0] to-[#B9F36A]"
        style={{ width: `${p * 100}%` }}
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.6, delay: 0.5, ease: 'easeInOut' }}
      />
      {MARKS.map(([h, label, name], i) => {
        const x = ((h - DAY_START) / (DAY_END - DAY_START)) * 100;
        const passed = x / 100 <= p;
        return (
          <motion.div
            key={label}
            className="absolute top-[11px] -translate-x-1/2 text-center"
            style={{ left: `${x}%` }}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 + i * 0.15, duration: 0.5, ease: EASE }}
          >
            <span className={`mx-auto block h-4 w-4 rounded-full border-2 transition-colors ${passed ? 'border-[#B9F36A] bg-[#B9F36A]/30' : 'border-white/40 bg-[#101827]'}`} />
            <span className="mt-1.5 block font-mono text-[10px] font-semibold text-white/70">{label}</span>
            <span className="block text-[9px] font-medium uppercase tracking-wider text-white/35">{name}</span>
          </motion.div>
        );
      })}
      {/* now marker */}
      <motion.div
        className="absolute top-[10px] -ml-2.5"
        style={{ left: `${p * 100}%` }}
        initial={reduce ? false : { opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.6, type: 'spring', stiffness: 300, damping: 16 }}
      >
        <span className="relative block h-5 w-5 rounded-full bg-white shadow-[0_0_0_4px_rgba(185,243,106,0.35),0_0_18px_4px_rgba(185,243,106,0.7)]">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#B9F36A]/60" />
        </span>
        <span className="absolute left-1/2 top-[26px] -translate-x-1/2 whitespace-nowrap font-mono text-[9px] font-bold uppercase tracking-widest text-[#B9F36A]">now</span>
      </motion.div>
    </div>
  );
}

/** Rate ring that draws on mount. */
function RateRing({ rate }) {
  const reduce = useReducedMotion();
  const C = 2 * Math.PI * 26;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="6" />
      <motion.circle
        cx="32" cy="32" r="26" fill="none" stroke="#B9F36A" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={C} transform="rotate(-90 32 32)"
        initial={reduce ? false : { strokeDashoffset: C }}
        animate={{ strokeDashoffset: C * (1 - Math.min(100, rate) / 100) }}
        transition={{ duration: 1.5, delay: 0.5, ease: 'easeInOut' }}
      />
    </svg>
  );
}

function StatGlass({ label, value, color, icon: Icon, delay, children, className = '' }) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-60, 60], [5, -5]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [-80, 80], [-6, 6]), { stiffness: 200, damping: 20 });
  const onMove = (e) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left - r.width / 2);
    my.set(e.clientY - r.top - r.height / 2);
  };
  return (
    <motion.div
      className={`relative overflow-hidden rounded-2xl sm:min-w-[150px] ${className} border border-white/15 bg-white/[0.07] px-4 py-3.5 backdrop-blur-xl`}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 800 }}
      onMouseMove={onMove}
      onMouseLeave={() => { mx.set(0); my.set(0); }}
      initial={reduce ? false : { opacity: 0, y: 26, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
      whileHover={{ y: -3 }}
    >
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-white/55">{label}</div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div className="font-mono text-[34px] font-bold leading-none tabular-nums tracking-tight text-white">{value}</div>
        {children || (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${color}26`, border: `1px solid ${color}66` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
        )}
      </div>
      <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
    </motion.div>
  );
}

const DashboardHeader = ({ organization, lastUpdated, todayPresentCount = 0, todayAbsentCount = 0, overallRate = {}, superAdminView = false }) => {
  const reduce = useReducedMotion();
  // TODAY's rate, derived from the same present/absent shown on the cards beside
  // it so the hero is internally consistent.
  const total = (todayPresentCount + todayAbsentCount) || (overallRate?.totalStudents) || 0;
  const rate = total > 0 ? Math.round((todayPresentCount / total) * 100) : 0;
  const orgName = organization?.name || 'Anuvadini';

  return (
    <motion.div
      className="relative overflow-hidden rounded-[28px] bg-[#101827] shadow-[0_30px_70px_-34px_rgba(16,24,39,0.8)]"
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      {/* aurora light */}
      <motion.div
        aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-80 w-80 rounded-full bg-[#315CE8]/45 blur-[90px]"
        animate={reduce ? undefined : { x: [0, 60, 0], y: [0, 24, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden className="pointer-events-none absolute -bottom-28 right-0 h-80 w-96 rounded-full bg-[#B9F36A]/25 blur-[100px]"
        animate={reduce ? undefined : { x: [0, -50, 0], y: [0, -20, 0] }} transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        aria-hidden className="pointer-events-none absolute inset-0 opacity-60"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '48px 48px', WebkitMaskImage: 'radial-gradient(ellipse at 20% 0%, #000, transparent 70%)', maskImage: 'radial-gradient(ellipse at 20% 0%, #000, transparent 70%)' }}
      />

      <div className="relative z-10 px-6 pb-6 pt-7 sm:px-9">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          {/* title */}
          <div>
            <motion.div
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1"
              initial={reduce ? false : { opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            >
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#B9F36A] opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#B9F36A]" /></span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/80">Live · auto refresh</span>
            </motion.div>

            <h1 className="mt-4 text-[34px] font-bold leading-[1.02] tracking-[-0.035em] text-white sm:text-[46px]">
              <span className="block overflow-hidden pb-1">
                <motion.span className="block" initial={reduce ? false : { y: '110%' }} animate={{ y: 0 }} transition={{ duration: 0.9, delay: 0.2, ease: EASE }}>Attendance</motion.span>
              </span>
              <span className="block overflow-hidden pb-1">
                <motion.span className="block text-[#B9F36A]" initial={reduce ? false : { y: '110%' }} animate={{ y: 0 }} transition={{ duration: 0.9, delay: 0.32, ease: EASE }}>
                  Dashboard
                  {superAdminView && orgName !== 'Anuvadini' && <span className="ml-3 text-xl font-semibold text-white/70">({orgName})</span>}
                </motion.span>
              </span>
            </h1>
            <motion.p
              className="mt-3 max-w-md text-sm text-white/60"
              initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.55 }}
            >
              {orgName !== 'Anuvadini' ? `${orgName}: live attendance overview` : 'Live attendance and compliance monitoring'}
            </motion.p>
            {lastUpdated && (
              <motion.div className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-white/40" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
                <Clock className="h-3.5 w-3.5" /> Updated {new Date(lastUpdated).toLocaleTimeString()}
              </motion.div>
            )}
          </div>

          {/* stats */}
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <StatGlass label="Present today" value={<AnimatedNumber value={todayPresentCount} />} color="#6F8DF0" icon={Users} delay={0.25} />
            <StatGlass label="Absent today" value={<AnimatedNumber value={todayAbsentCount} />} color="#FF6B7A" icon={UserX} delay={0.33} />
            <StatGlass label="Attendance rate" value={<><AnimatedNumber value={rate} />%</>} color="#B9F36A" icon={Gauge} delay={0.41} className="col-span-2 sm:col-span-1">
              <RateRing rate={rate} />
            </StatGlass>
          </div>
        </div>

        <WorkdayStrip />
      </div>
    </motion.div>
  );
};

export default DashboardHeader;
