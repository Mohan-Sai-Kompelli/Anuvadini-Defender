import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

/* ═══════════════════════════════════════════════════════════════════════════════
   ANUVADINI ADVANCED VISUAL DASHBOARD — NATS Maps Level
   ─ SVG Mirror Bars (Present vs Absent by day)
   ─ Radial Ring Chart (attendance breakdown donut)
   ─ Depth Columns (hourly check-in depth)
   ─ Shimmer, bubble particles, animated draw-ins
   ─ Premium section kicker headers
   No framer-motion, pure CSS + SVG <animate>
═══════════════════════════════════════════════════════════════════════════════*/

/* ── Helpers ── */
function polar(cx, cy, r, a) {
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function ringSegment(cx, cy, rIn, rOut, a0, a1) {
  const A0 = a0 - Math.PI / 2, A1 = a1 - Math.PI / 2;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const oS = polar(cx, cy, rOut, A0), oE = polar(cx, cy, rOut, A1);
  const iS = polar(cx, cy, rIn, A1), iE = polar(cx, cy, rIn, A0);
  return [
    `M ${oS.x.toFixed(2)} ${oS.y.toFixed(2)}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${oE.x.toFixed(2)} ${oE.y.toFixed(2)}`,
    `L ${iS.x.toFixed(2)} ${iS.y.toFixed(2)}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${iE.x.toFixed(2)} ${iE.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/* ── Custom Tooltip ── */
const GlassTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(255,253,247,0.97)',
      border: '1px solid rgba(10,20,36,0.10)',
      borderRadius: 12,
      padding: '10px 14px',
      fontSize: 12,
      fontFamily: "'Geist',sans-serif",
      boxShadow: '0 12px 32px -12px rgba(10,20,36,0.22)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#14110b' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   1. MIRROR BARS — Present (above axis) vs Absent (below axis) per day
══════════════════════════════════════════════════════════════════════════════*/
function MirrorBarsSection({ trendData = [] }) {
  const [hover, setHover] = useState(null);

  const rows = useMemo(() => {
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });

    const trendMap = new Map();
    if (trendData && trendData.length > 0) {
      trendData.forEach(d => {
        if (d.date) {
          const key = new Date(d.date).toISOString().split('T')[0];
          trendMap.set(key, d);
        }
      });
    }

    return dates.map(date => {
      const key = date.toISOString().split('T')[0];
      const isWeekendDay = date.getDay() === 0 || date.getDay() === 6;
      const label = date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });

      if (isWeekendDay) {
        return { label, present: 0, absent: 0 };
      }

      if (trendMap.has(key)) {
        const d = trendMap.get(key);
        return {
          label,
          present: d.present || 0,
          absent: d.absent || 0,
        };
      }

      if (trendMap.size === 0) {
        // Fallback demo data
        return {
          label,
          present: 60 + Math.round(Math.random() * 40),
          absent: 10 + Math.round(Math.random() * 30),
        };
      }

      return {
        label,
        present: 0,
        absent: 0,
      };
    });
  }, [trendData]);

  const W = 1200, H = 440;
  const padX = 40;
  const axisY = H / 2;
  const valGap = 52;
  const maxBar = axisY - valGap - 20;
  const n = rows.length;
  const slot = (W - padX * 2) / n;
  const barW = Math.min(60, slot * 0.55);
  const maxVal = Math.max(...rows.map(r => Math.max(r.present, r.absent)), 1);
  const hBar = (v) => (v / maxVal) * maxBar;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Background ghost text */}
      <svg
        key={rows.map(r => `${r.present}-${r.absent}`).join(',')}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', maxHeight: 'calc(100vh - 240px)', display: 'block', overflow: 'visible' }}
      >
        <defs>
          <filter id="mbShadow2" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#101827" floodOpacity="0.22" />
          </filter>
          <linearGradient id="mbShimmer2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="presentGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#315CE8" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#4A74F0" />
          </linearGradient>
          <linearGradient id="absentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>

        <text x={padX} y={axisY - maxBar * 0.3} textAnchor="start"
          style={{ fontFamily: 'Geist, Inter, sans-serif', fontWeight: 900, letterSpacing: '-0.04em' }}
          fontSize={120} fill="rgba(49, 92, 232,0.09)">PRESENT</text>
        <text x={W - padX} y={axisY + maxBar * 0.4 + 80} textAnchor="end"
          style={{ fontFamily: 'Geist, Inter, sans-serif', fontWeight: 900, letterSpacing: '-0.04em' }}
          fontSize={120} fill="rgba(244,63,94,0.09)">ABSENT</text>

        {/* Central axis line */}
        <line x1={padX - 6} x2={W - padX + 6} y1={axisY} y2={axisY}
          stroke="rgba(10,20,36,0.18)" strokeWidth={1.5} />

        {/* Side labels */}
        <text x={padX - 6} y={22} textAnchor="start" fontSize={14}
          fill="#6b7280" style={{ fontFamily: 'JetBrains Mono,monospace', letterSpacing: '0.18em' }}>
          ▲ PRESENT · CHECK-IN
        </text>
        <text x={W - padX + 6} y={H - 8} textAnchor="end" fontSize={14}
          fill="#6b7280" style={{ fontFamily: 'JetBrains Mono,monospace', letterSpacing: '0.18em' }}>
          ▼ ABSENT · NO CHECK-IN
        </text>

        {rows.map((r, i) => {
          const cx = padX + slot * i + slot / 2;
          const x = cx - barW / 2;
          const active = hover === i;
          const dH = Math.max(8, hBar(r.present));
          const pH = Math.max(8, hBar(r.absent));
          const dim = hover != null && !active;

          return (
            <g key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Hit area */}
              <rect x={x - slot * 0.2} y={axisY - maxBar - 20} width={barW + slot * 0.4}
                height={maxBar * 2 + 60} fill="transparent" />

              {/* PRESENT bar — grows upward */}
              <rect
                x={x} y={axisY - dH} width={barW} height={dH} rx={9}
                fill="url(#presentGrad)"
                filter="url(#mbShadow2)"
                opacity={dim ? 0.35 : active ? 1 : 0.88}
                style={{ transition: 'opacity 0.25s, transform 0.3s' }}
              >
                <animate attributeName="y" from={axisY} to={axisY - dH} dur="0.8s" fill="freeze"
                  begin={`${i * 0.06}s`} calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1" />
                <animate attributeName="height" from="0" to={dH} dur="0.8s" fill="freeze"
                  begin={`${i * 0.06}s`} calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1" />
              </rect>

              {/* ABSENT bar — grows downward */}
              <rect
                x={x} y={axisY} width={barW} height={pH} rx={9}
                fill="url(#absentGrad)"
                filter="url(#mbShadow2)"
                opacity={dim ? 0.35 : active ? 1 : 0.78}
                style={{ transition: 'opacity 0.25s' }}
              >
                <animate attributeName="height" from="0" to={pH} dur="0.8s" fill="freeze"
                  begin={`${i * 0.06}s`} calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1" />
              </rect>

              {/* Present value above bar */}
              <text x={cx} y={axisY - dH - 12} textAnchor="middle" fontSize={20} fill="#315CE8"
                style={{ fontFamily: 'Geist, Inter, sans-serif', fontWeight: 900, letterSpacing: '-0.02em' }}>
                {r.present}
              </text>

              {/* Absent value below bar */}
              <text x={cx} y={axisY + pH + 22} textAnchor="middle" fontSize={20} fill="#f43f5e"
                style={{ fontFamily: 'Geist, Inter, sans-serif', fontWeight: 900, letterSpacing: '-0.02em' }}>
                {r.absent}
              </text>

              {/* Day label at axis */}
              <text x={cx} y={axisY + pH + 42} textAnchor="middle" fontSize={13} fill="#9ca3af"
                style={{ fontFamily: 'JetBrains Mono,monospace', letterSpacing: '0.08em' }}>
                {r.label}
              </text>

              {/* Active highlight dot at axis */}
              {active && (
                <circle cx={cx} cy={axisY} r={5} fill="#101827" />
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hover != null && rows[hover] && (
        <div style={{
          position: 'absolute',
          left: `${(padX + slot * hover + slot / 2) / W * 100}%`,
          top: '42%',
          transform: 'translate(-50%,-100%)',
          background: 'rgba(255,253,247,0.97)',
          border: '1px solid rgba(10,20,36,0.10)',
          borderRadius: 12,
          padding: '10px 14px',
          fontSize: 12,
          fontFamily: "'Geist',sans-serif",
          boxShadow: '0 16px 40px -12px rgba(10,20,36,0.24)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 10,
        }}>
          <div style={{ fontWeight: 700, color: '#101827', marginBottom: 6 }}>{rows[hover].label}</div>
          <div style={{ color: '#4A74F0', fontWeight: 600 }}>✓ Present: {rows[hover].present}</div>
          <div style={{ color: '#f43f5e', fontWeight: 600, marginTop: 3 }}>✗ Absent: {rows[hover].absent}</div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   2. RADIAL RING — Attendance breakdown (Present / Absent / Leave / Unapproved)
══════════════════════════════════════════════════════════════════════════════*/
export function RadialRingSection({ present = 0, absent = 0, leave = 0, unapproved = 0 }) {
  const [hover, setHover] = useState(null);
  const [t, setT] = useState(0);
  const rafRef = useRef(null);

  // Animate in
  useEffect(() => {
    let start = null;
    const tick = (now) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / 1400);
      const eased = 1 - Math.pow(1 - p, 3);
      setT(eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const W = 500, H = 500;
  const cx = W / 2, cy = H / 2;
  const rOut = 190, rIn = 120;

  const items = useMemo(() => {
    const total = (present + absent + leave + unapproved) || 1;
    return [
      { label: 'Present', value: present, color: '#4A74F0', shade: '#315CE8' },
      { label: 'Absent', value: absent, color: '#f43f5e', shade: '#dc2626' },
      { label: 'Approved Leave', value: leave, color: '#6F8DF0', shade: '#0284c7' },
      { label: 'Unapproved', value: unapproved, color: '#f59e0b', shade: '#D97706' },
    ].filter(x => x.value > 0).map(x => ({ ...x, frac: x.value / total }));
  }, [present, absent, leave, unapproved]);

  const total = present + absent + leave + unapproved;
  const eased = t;
  let a = 0;
  const segments = items.map(item => {
    const sweep = item.frac * Math.PI * 2;
    const seg = { ...item, a0: a, a1: a + sweep * eased };
    a += sweep;
    return seg;
  });

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: 'calc(100vh - 240px)', display: 'block', overflow: 'visible' }}>
        <defs>
          {items.map(item => (
            <radialGradient key={item.label} id={`rg-${item.label.replace(/\s/g, '')}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={item.color} stopOpacity="1" />
              <stop offset="100%" stopColor={item.shade} stopOpacity="0.9" />
            </radialGradient>
          ))}
          <filter id="segShadow">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#14110b" floodOpacity="0.16" />
          </filter>
        </defs>

        {segments.map((s, i) => {
          const isHover = hover === i;
          const rOutAdj = isHover ? rOut + 12 : rOut;
          const path = ringSegment(cx, cy, rIn, rOutAdj, s.a0, s.a1);
          const midA = (s.a0 + s.a1) / 2 - Math.PI / 2;
          const labelPt = polar(cx, cy, (rIn + rOut) / 2 + (isHover ? 12 : 0), midA);
          const pct = Math.round(s.frac * 100);
          return (
            <g key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <path d={path}
                fill={`url(#rg-${s.label.replace(/\s/g, '')})`}
                filter="url(#segShadow)"
                stroke="#fff"
                strokeWidth={isHover ? 3 : 2}
                style={{ transition: 'all 0.3s cubic-bezier(0.22,1,0.36,1)' }}
              />
              {pct >= 10 && (
                <text x={labelPt.x} y={labelPt.y + 5} textAnchor="middle" fontSize={isHover ? 18 : 16}
                  fill="#fff" style={{ fontFamily: 'Geist, Inter, sans-serif', fontWeight: 900, pointerEvents: 'none' }}>
                  {pct}%
                </text>
              )}
            </g>
          );
        })}

        {/* Center circle */}
        <circle cx={cx} cy={cy} r={rIn - 6} fill="#fff"
          style={{ filter: 'drop-shadow(0 4px 14px rgba(10,20,36,0.10))' }} />

        {/* Center content */}
        <text x={cx} y={cy - 28} textAnchor="middle" fontSize={14}
          fill="#9ca3af" style={{ fontFamily: 'JetBrains Mono,monospace', letterSpacing: '0.18em' }}>
          TOTAL
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={48}
          fill="#101827" style={{ fontFamily: 'Geist, Inter, sans-serif', fontWeight: 900, letterSpacing: '-0.04em' }}>
          {hover != null ? segments[hover]?.value ?? total : total}
        </text>
        <text x={cx} y={cy + 38} textAnchor="middle" fontSize={14}
          fill={hover != null ? segments[hover]?.color : '#9ca3af'}
          style={{ fontFamily: 'JetBrains Mono,monospace', letterSpacing: '0.12em', transition: 'color 0.2s' }}>
          {hover != null ? (segments[hover]?.label ?? 'students').toUpperCase() : 'STUDENTS'}
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 12, justifyContent: 'center' }}>
        {items.map((item, i) => (
          <div key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              opacity: hover == null || hover === i ? 1 : 0.5, transition: 'opacity 0.2s'
            }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: item.color, display: 'inline-block' }} />
            <span style={{
              fontSize: 11, fontFamily: 'JetBrains Mono,monospace', letterSpacing: '0.1em',
              color: '#6b7280', fontWeight: 600
            }}>
              {item.label.toUpperCase()} · {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   3. DEPTH COLUMNS — hourly check-in distribution (like NATS deepest lakes)
══════════════════════════════════════════════════════════════════════════════*/
function DepthColumnsSection({ trendData = [] }) {
  const [hover, setHover] = useState(null);
  const containerRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        ob.unobserve(el);
      }
    }, { threshold: 0.1, rootMargin: '0px 0px -80px 0px' });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  const rows = useMemo(() => {
    // Generate the last 7 dates ending on today (continuous)
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });

    const trendMap = new Map();
    if (trendData && trendData.length > 0) {
      trendData.forEach(d => {
        if (d.date) {
          const key = new Date(d.date).toISOString().split('T')[0];
          trendMap.set(key, d);
        }
      });
    }

    return dates.map(date => {
      const key = date.toISOString().split('T')[0];
      const isWeekendDay = date.getDay() === 0 || date.getDay() === 6;
      const label = date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });

      if (isWeekendDay) {
        return { label, checkIn: 0, absent: 0, isSpotCheck: true };
      }

      if (trendMap.has(key)) {
        const d = trendMap.get(key);
        const isSpotCheck = d.responded !== undefined || d.missed !== undefined;
        return {
          label,
          checkIn: isSpotCheck ? (d.responded || 0) : (d.present || 0),
          absent: isSpotCheck ? (d.missed || 0) : (d.absent || 0),
          isSpotCheck: true,
        };
      }

      if (trendMap.size === 0) {
        // Fallback demo data
        return {
          label,
          checkIn: 10 + Math.round(Math.random() * 15),
          absent: Math.round(Math.random() * 5),
          isSpotCheck: true,
        };
      }

      return {
        label,
        checkIn: 0,
        absent: 0,
        isSpotCheck: true,
      };
    });
  }, [trendData]);

  const W = 1200, H = 360;
  const surfaceY = 80;
  const floorPad = 56;
  const maxDepth = H - surfaceY - floorPad;
  const maxVal = Math.max(...rows.map(r => r.checkIn), 1);
  const n = rows.length;
  const colW = Math.min(54, (W - 80) / n * 0.62);
  const gap = (W - 80 - colW * n) / Math.max(1, n - 1);
  const xFor = (i) => 40 + i * (colW + gap);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg
        key={rows.map(r => `${r.checkIn}-${r.absent}`).join(',')}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', maxHeight: 'calc(100vh - 240px)', display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="dpPanel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F0F9FF" />
            <stop offset="50%" stopColor="#E0F2FE" />
            <stop offset="100%" stopColor="#BAE6FD" />
          </linearGradient>
          <linearGradient id="dpCol" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#BAE6FD" />
            <stop offset="55%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#034B75" />
          </linearGradient>
          <filter id="dpShadow" x="-50%" y="-20%" width="200%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#034B75" floodOpacity="0.25" />
          </filter>
          {rows.map((r, i) => {
            const x = xFor(i);
            const depth = Math.max(14, (r.checkIn / maxVal) * maxDepth);
            return (
              <clipPath key={i} id={`dpclip-${i}`}>
                <rect x={x} y={surfaceY} width={colW} height={depth} rx={colW / 2} />
              </clipPath>
            );
          })}
        </defs>

        {/* Panel background */}
        <rect x={0} y={0} width={W} height={H} fill="url(#dpPanel)" rx={16} />

        {/* Surface line */}
        <line x1={30} x2={W - 30} y1={surfaceY} y2={surfaceY}
          stroke="#14110b" strokeWidth={2} strokeOpacity={0.7} />
        <text x={W - 30} y={surfaceY - 8} textAnchor="end" fontSize={13} fill="#14110b" fillOpacity={0.5}
          style={{ fontFamily: 'JetBrains Mono,monospace', letterSpacing: '0.12em' }}>
          SURFACE · 0
        </text>

        {rows.map((r, i) => {
          const x = xFor(i);
          const cx = x + colW / 2;
          const depth = Math.max(14, (r.checkIn / maxVal) * maxDepth);
          const tipY = surfaceY + depth;
          const active = hover === i;
          const settleTime = i * 0.08 + 1.0; // Settle delay of this column

          return (
            <g key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Hit area */}
              <rect x={x - gap / 2} y={surfaceY - 56} width={colW + gap} height={depth + 56 + 40}
                fill="transparent" />

              {/* Label above surface */}
              <g
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? 'translateY(0px)' : 'translateY(6px)',
                  transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08 + 0.2}s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08 + 0.2}s`
                }}
              >
                <text x={cx} y={surfaceY - 34} textAnchor="middle" fontSize={12}
                  fill="#101827" fillOpacity={0.7}
                  style={{ fontFamily: 'JetBrains Mono,monospace', letterSpacing: '0.08em', fontWeight: 600 }}>
                  {r.label}
                </text>
                <line x1={cx} y1={surfaceY - 22} x2={cx} y2={surfaceY}
                  stroke="#101827" strokeOpacity={0.15} strokeWidth={1} />
              </g>

              {/* Depth column */}
              <rect x={x} y={surfaceY} width={colW} height={inView ? depth : 0} rx={colW / 2}
                fill="url(#dpCol)" filter="url(#dpShadow)"
                opacity={hover == null || active ? 1 : 0.55}
                style={{ transition: 'opacity 0.25s' }}
              >
                {inView && (
                  <animate attributeName="height" from="0" to={depth} dur="1.2s" fill="freeze"
                    begin={`${i * 0.08}s`} calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1" />
                )}
              </rect>

              {/* Highlight ridge & bubbles */}
              <g clipPath={`url(#dpclip-${i})`}>
                <rect x={x + 8} y={surfaceY} width={6} height={inView ? depth - 6 : 0} rx={3}
                  fill="#fff" fillOpacity={0.28} />

                {/* Rising bubbles in all columns */}
                {inView && [0, 1, 2].map(b => {
                  const bx = x + 10 + (b * 12) % (colW - 18);
                  const br = 1.5 + (b % 2);
                  return (
                    <circle key={b} cx={bx} cy={tipY - 4} r={br} fill="#fff" fillOpacity={0.55}>
                      <animate attributeName="cy" values={`${tipY - 4};${surfaceY + 8}`}
                        dur={`${2.6 + b * 0.6}s`} repeatCount="indefinite" begin={`${settleTime + b * 0.4}s`} />
                      <animate attributeName="opacity" values="0;0.6;0.6;0" dur={`${2.6 + b * 0.6}s`}
                        repeatCount="indefinite" begin={`${settleTime + b * 0.4}s`} />
                      <animate attributeName="cx" values={`${bx};${bx + 3};${bx - 2};${bx}`}
                        dur={`${2.6 + b * 0.6}s`} repeatCount="indefinite" begin={`${settleTime + b * 0.4}s`} />
                    </circle>
                  );
                })}
              </g>

              {/* Surface cap */}
              <ellipse cx={cx} cy={surfaceY} rx={colW / 2} ry={4}
                fill="#EEF3FF" stroke="#315CE8" strokeOpacity={0.25} strokeWidth={1}
                style={{
                  opacity: inView ? 1 : 0,
                  transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08 + 0.4}s`
                }}
              />

              {/* Value at tip */}
              <g
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? 'translateY(0px)' : 'translateY(-6px)',
                  transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${settleTime + 0.2}s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${settleTime + 0.2}s`,
                }}
              >
                <text x={cx} y={tipY + 22} textAnchor="middle" fontSize={19}
                  fill="#101827" style={{ fontFamily: 'Geist, Inter, sans-serif', fontWeight: 900, letterSpacing: '-0.02em' }}>
                  {r.checkIn}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hover != null && rows[hover] && (
        <div style={{
          position: 'absolute',
          left: `${(xFor(hover) + colW / 2) / W * 100}%`,
          top: `${(surfaceY - 70) / H * 100}%`,
          transform: 'translate(-50%, -100%)',
          background: 'rgba(255,253,247,0.97)',
          border: '1px solid rgba(10,20,36,0.10)',
          borderRadius: 12,
          padding: '10px 14px',
          fontSize: 12,
          fontFamily: "'Geist',sans-serif",
          boxShadow: '0 12px 32px -12px rgba(10,20,36,0.22)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 10,
        }}>
          <div style={{ fontWeight: 700, color: '#101827', marginBottom: 4 }}>{rows[hover].label}</div>
          <div style={{ color: '#4A74F0', fontWeight: 600 }}>
            {rows[hover].isSpotCheck ? `Responded: ${rows[hover].checkIn}` : `Present: ${rows[hover].checkIn}`}
          </div>
          <div style={{ color: '#f43f5e', fontWeight: 600, marginTop: 2 }}>
            {rows[hover].isSpotCheck ? `Missed: ${rows[hover].absent}` : `Absent: ${rows[hover].absent}`}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   4. AREA MOUNTAIN — 10-day gradient area with animated draw-in
══════════════════════════════════════════════════════════════════════════════*/
function AreaMountainSection({ data = [] }) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data].slice(-10).map(d => {
      let isWeekendDay = false;
      let label = d.date || '';
      if (d.date) {
        const parsed = new Date(d.date);
        if (!isNaN(parsed.getTime())) {
          isWeekendDay = parsed.getDay() === 0 || parsed.getDay() === 6;
          label = parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        } else {
          const currentYear = new Date().getFullYear();
          const parsedWithYear = new Date(`${d.date} ${currentYear}`);
          if (!isNaN(parsedWithYear.getTime())) {
            isWeekendDay = parsedWithYear.getDay() === 0 || parsedWithYear.getDay() === 6;
          }
        }
      }
      return {
        date: label,
        present: isWeekendDay ? 0 : (d.present || 0),
        absent: isWeekendDay ? 0 : (d.absent || 0),
        late: isWeekendDay ? 0 : (d.late || 0),
        total: isWeekendDay ? 0 : ((d.present || 0) + (d.absent || 0)),
      };
    });
  }, [data]);

  if (chartData.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={chartData} margin={{ top: 15, right: 10, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="amPresent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4A74F0" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#4A74F0" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="amAbsent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="amLate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,20,36,0.07)" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 13, fontWeight: 'bold', fontFamily: "'Geist','JetBrains Mono',monospace" }}
          axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#4b5563', fontSize: 13, fontWeight: 'bold', fontFamily: "'Geist','JetBrains Mono',monospace" }}
          axisLine={false} tickLine={false} />
        <Tooltip content={<GlassTooltip />} />
        <Area type="monotone" dataKey="present" name="Present" stroke="#4A74F0" strokeWidth={2.4}
          fill="url(#amPresent)" dot={false} activeDot={{ r: 5, fill: '#4A74F0' }} />
        <Area type="monotone" dataKey="late" name="Late" stroke="#f59e0b" strokeWidth={2}
          fill="url(#amLate)" dot={false} activeDot={{ r: 5, fill: '#f59e0b' }} />
        <Area type="monotone" dataKey="absent" name="Absent" stroke="#f43f5e" strokeWidth={2}
          fill="url(#amAbsent)" dot={false} activeDot={{ r: 5, fill: '#f43f5e' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN EXPORTED COMPONENT
══════════════════════════════════════════════════════════════════════════════*/
const AnuvadiniAdvancedCharts = ({
  todayPresentCount = 0,
  todayAbsentCount = 0,
  todayLeaveCount = 0,
  todayUnapprovedCount = 0,
  attendanceStats = {},
  slotSummary = [],
  chartData = [],
  type,
  spotCheckTrend = [],
}) => {
  const trendData = type === 'depth' ? spotCheckTrend : (attendanceStats?.trendData || chartData || []);

  // ── Conditional Row 1 ──
  const mirrorRow = (
    <div
      style={{
        padding: '24px 20px 12px',
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div className="kicker-label" style={{ color: '#9ca3af', marginBottom: 4, fontSize: '13px' }}>
          DAILY COMPARISON · PRESENT vs ABSENT · LAST 7 DAYS
        </div>
        <div style={{
          fontFamily: "'Geist','Inter',sans-serif",
          fontWeight: 900,
          fontSize: 26,
          color: '#101827',
          letterSpacing: '-0.025em',
        }}>
          Presence{' '}
          <span style={{ color: '#f43f5e' }}>vs</span>{' '}
          Absence
        </div>
      </div>
      <MirrorBarsSection trendData={trendData} />
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7280',
          fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.1em'
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#4A74F0', display: 'inline-block' }} />
          PRESENT (above axis)
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7280',
          fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.1em'
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#f43f5e', display: 'inline-block' }} />
          ABSENT (below axis)
        </div>
      </div>
    </div>
  );

  // ── Conditional Row 2 ──
  const depthRow = (
    <div
      style={{
        padding: '24px 20px 16px',
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div className="kicker-label" style={{ color: '#9ca3af', marginBottom: 4, fontSize: '13px' }}>
          DAILY COMPLIANCE · SPOT-CHECK RESPONSES · LAST 7 DAYS
        </div>
        <div style={{
          fontFamily: "'Geist','Inter',sans-serif",
          fontWeight: 900,
          fontSize: 26,
          color: '#101827',
          letterSpacing: '-0.025em',
        }}>
          Where Spot-Checks{' '}
          <span style={{ color: '#4A74F0' }}>Run Deepest</span>
        </div>
        <div style={{ fontSize: 15, color: '#9ca3af', marginTop: 4, fontFamily: "'Geist',sans-serif" }}>
          Each column plunges from the surface — deeper = more staff responded to random spot-check requests
        </div>
      </div>
      <DepthColumnsSection trendData={trendData} />
    </div>
  );

  // ── Conditional Row 3 ──
  const landscapeRow = (
    <div
      style={{
        padding: '24px 20px 16px',
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div style={{ marginBottom: 28 }}>
        <div className="kicker-label" style={{ color: '#9ca3af', marginBottom: 4, fontSize: '13px' }}>
          AREA MOUNTAIN · 10-DAY GRADIENT TREND
        </div>
        <div style={{
          fontFamily: "'Geist','Inter',sans-serif",
          fontWeight: 900,
          fontSize: 26,
          color: '#101827',
          letterSpacing: '-0.025em',
        }}>
          Attendance{' '}
          <span style={{ color: '#6AA51F' }}>Landscape</span>
        </div>
        <div style={{ fontSize: 15, color: '#9ca3af', marginTop: 4, fontFamily: "'Geist',sans-serif" }}>
          10-day visualization tracking the flow of daily present, absent, and late-arrival counts across the campus.
        </div>
      </div>
      <div className="flex-1 flex flex-col min-h-[350px]">
        {trendData.length > 0 ? (
          <AreaMountainSection data={trendData} />
        ) : (
          <div className="text-center text-slate-400 py-10">No trend data available</div>
        )}
      </div>
    </div>
  );

  if (type === 'mirror') return mirrorRow;
  if (type === 'depth') return depthRow;
  if (type === 'landscape') return landscapeRow;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
      {/* ── Section kicker ── */}
      <div className="kicker-label" style={{ color: '#315CE8', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="pulse-dot-anuvadini" style={{ background: '#4A74F0', color: '#4A74F0' }} />
        NATS-STYLE ANALYTICS · ADVANCED VISUALISATIONS
      </div>
      {mirrorRow}
      {depthRow}
      {landscapeRow}
    </div>
  );
};

export default AnuvadiniAdvancedCharts;
