import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  Tent,
  ShieldAlert,
  Landmark,
  GitPullRequestClosed,
  ArrowUpRight,
} from 'lucide-react';
import { saacmsAPI } from '../../services/api';
import ScrollReveal from '../ScrollReveal';


/* ─────────────────────────────────────────────────────────────────────────────
   Anuvadini Compliance Modules — NATS Maps bento-card style
   • Glass cards with accent top-bar
   • Atmospheric glow radials
   • Hover lift + shine overlay
   • Kicker section label
───────────────────────────────────────────────────────────────────────────── */

const fmt = (v, suffix = '') => (v == null ? '—' : `${v}${suffix}`);

const buildModules = (s) => [
  {
    key: 'academics',
    title: 'Academic Activity',
    icon: GraduationCap,
    href: '/teaching-log',
    accent: '#315CE8',
    rows: [
      { label: 'Classes scheduled today', value: fmt(s?.academics?.scheduled) },
      { label: 'Conducted (geo-verified)', value: fmt(s?.academics?.conducted), highlight: 'success' },
      { label: 'Ongoing now', value: fmt(s?.academics?.ongoing), highlight: 'info' },
    ],
  },
  {
    key: 'outreach',
    title: 'Outreach Activities',
    icon: Tent,
    href: '/outreach',
    accent: '#f59e0b',
    rows: [
      { label: 'Pending approvals', value: fmt(s?.outreach?.pending), highlight: 'warning' },
      { label: 'Active camps', value: fmt(s?.outreach?.active), highlight: 'info' },
      { label: 'Participants reached', value: fmt(s?.outreach?.participants), highlight: 'success' },
    ],
  },
  {
    key: 'antifraud',
    title: 'Anti-Fraud & Spot-Checks',
    icon: ShieldAlert,
    href: '/spot-checks',
    accent: '#ef4444',
    rows: [
      { label: 'Spot-check response rate', value: fmt(s?.antifraud?.responseRate, '%'), highlight: 'success' },
      { label: 'Missed checks today', value: fmt(s?.antifraud?.missedToday), highlight: 'warning' },
      { label: 'Proxy suspects flagged', value: fmt(s?.antifraud?.proxySuspects), highlight: 'danger' },
    ],
  },
  {
    key: 'leave',
    title: 'Leave Management',
    icon: GitPullRequestClosed,
    href: '/leave-request',
    accent: '#8b5cf6',
    rows: [
      { label: 'Pending approvals', value: fmt(s?.leave?.pending), highlight: 'warning' },
      { label: 'On approved leave', value: fmt(s?.leave?.onLeaveToday) },
      { label: 'Substitutes to arrange', value: fmt(s?.leave?.substitutesNeeded), highlight: 'warning' },
    ],
  },
  {
    key: 'compliance',
    title: 'Compliance Rating',
    icon: Landmark,
    href: '/compliance',
    accent: '#4A74F0',
    rows: [
      { label: 'Attendance today', value: fmt(s?.compliance?.attendancePct, '%'), highlight: 'success' },
      { label: 'Multi-college analytics', value: 'Open' },
    ],
  },
];

const HIGHLIGHT_CLS = {
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-rose-500 dark:text-rose-400',
  info: 'text-sky-500 dark:text-sky-400',
};

/* ─────────────────────────────────────────────────────────────────────────────
   ModuleMicroGraphic Component — Interactive SVG elements
───────────────────────────────────────────────────────────────────────────── */
const ModuleMicroGraphic = ({ kind, summary, color }) => {
  switch (kind) {
    case 'academics': {
      const radius = 22;
      const circ = 2 * Math.PI * radius;
      const scheduled = summary?.academics?.scheduled ?? 0;
      const conducted = summary?.academics?.conducted ?? 0;
      const pct = scheduled > 0 ? (conducted / scheduled) * 100 : 0;
      const offset = circ - (pct / 100) * circ;
      return (
        <svg width="56" height="56" className="overflow-visible">
          <circle cx="28" cy="28" r={radius} fill="none" stroke={`${color}15`} strokeWidth="3" />
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={circ}
            strokeDashoffset={isNaN(offset) ? circ : offset}
            strokeLinecap="round"
            transform="rotate(-90 28 28)"
            style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
          />
          <text x="28" y="32" textAnchor="middle" fill={color} className="font-bold font-mono text-[9px]">
            {conducted}/{scheduled}
          </text>
        </svg>
      );
    }

    case 'outreach': {
      return (
        <svg width="56" height="56" viewBox="0 0 64 64" className="overflow-visible">
          <defs>
            <linearGradient id={`grad-outreach-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.45" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M 0 48 Q 16 16 32 38 T 64 24 L 64 64 L 0 64 Z"
            fill={`url(#grad-outreach-${color.replace('#', '')})`}
          />
          <path
            d="M 0 48 Q 16 16 32 38 T 64 24"
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="32" cy="38" r="3.5" fill={color} filter={`drop-shadow(0 0 4px ${color})`}>
            <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      );
    }

    case 'antifraud': {
      const suspects = summary?.antifraud?.proxySuspects ?? 0;
      return (
        <svg width="56" height="56" viewBox="0 0 80 80" className="overflow-visible">
          <circle cx="40" cy="40" r="38" fill="none" stroke={`${color}12`} strokeWidth="1" />
          <circle cx="40" cy="40" r="25" fill="none" stroke={`${color}12`} strokeWidth="1" />
          <circle cx="40" cy="40" r="12" fill="none" stroke={`${color}12`} strokeWidth="1" />
          <line x1="40" y1="2" x2="40" y2="78" stroke={`${color}12`} strokeWidth="0.5" />
          <line x1="2" y1="40" x2="78" y2="40" stroke={`${color}12`} strokeWidth="0.5" />

          {suspects > 0 && (
            <circle cx="56" cy="26" r="3.5" fill={color} filter={`drop-shadow(0 0 4px ${color})`}>
              <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" repeatCount="indefinite" />
            </circle>
          )}
          <circle cx="22" cy="54" r="2.5" fill={color} opacity="0.6">
            <animate attributeName="opacity" values="0.1;0.9;0.1" dur="1.8s" repeatCount="indefinite" />
          </circle>

          <line x1="40" y1="40" x2="40" y2="3" stroke={color} strokeWidth="1.8" strokeLinecap="round">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 40 40"
              to="360 40 40"
              dur="3.5s"
              repeatCount="indefinite"
            />
          </line>
        </svg>
      );
    }

    case 'leave': {
      return (
        <svg width="56" height="56" viewBox="0 0 64 64" className="overflow-visible">
          {[0, 1, 2].map((y) =>
            [0, 1, 2].map((x) => {
              const isLit = (y * 3 + x) % 3 === 0;
              return (
                <rect
                  key={`${x}-${y}`}
                  x={x * 19 + 5}
                  y={y * 19 + 5}
                  width="13"
                  height="13"
                  rx="3.5"
                  fill={isLit ? color : `${color}15`}
                  opacity={isLit ? 0.9 : 0.4}
                >
                  {isLit && (
                    <animate
                      attributeName="opacity"
                      values="0.4;1;0.4"
                      dur={`${1.8 + (x + y) * 0.4}s`}
                      repeatCount="indefinite"
                    />
                  )}
                </rect>
              );
            })
          )}
        </svg>
      );
    }

    case 'compliance': {
      const pctVal = summary?.compliance?.attendancePct ?? 0;
      const rGauge = 22;
      const circGauge = 2 * Math.PI * rGauge;
      const offsetGauge = circGauge - (pctVal / 100) * circGauge;
      return (
        <svg width="56" height="56" className="overflow-visible">
          <circle cx="28" cy="28" r={rGauge} fill="none" stroke={`${color}15`} strokeWidth="3" />
          <circle
            cx="28"
            cy="28"
            r={rGauge}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={circGauge}
            strokeDashoffset={isNaN(offsetGauge) ? circGauge : offsetGauge}
            strokeLinecap="round"
            transform="rotate(-90 28 28)"
            style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
          />
          <text x="28" y="32" textAnchor="middle" fill={color} className="font-black font-mono text-[9px]">
            {pctVal}%
          </text>
        </svg>
      );
    }

    default:
      return null;
  }
};

const SaacmsOverview = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [hoveredKey, setHoveredKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    saacmsAPI
      .summary()
      .then((res) => { if (!cancelled && res?.success) setSummary(res.summary); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, []);

  const MODULES = buildModules(summary);

  return (
    <div>
      {/* Section kicker */}
      <div className="kicker-label text-emerald-700 dark:text-emerald-400 mb-4">
        COMPLIANCE MODULES · 6 ACTIVE
      </div>

      <ScrollReveal
        stagger={true}
        staggerGap={80}
        y={30}
        blur={8}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {MODULES.map((mod) => {
          const Icon = mod.icon;
          const isHovered = hoveredKey === mod.key;
          return (
            <button
              key={mod.key}
              type="button"
              onClick={() => navigate(mod.href)}
              onMouseEnter={() => setHoveredKey(mod.key)}
              onMouseLeave={() => setHoveredKey(null)}
              className="group relative h-full w-full text-left overflow-hidden rounded-3xl p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 bento-hover-anuvadini"
              style={{
                background: isHovered
                  ? `linear-gradient(135deg, rgba(255, 255, 255, 0.97), ${mod.accent}14, ${mod.accent}24)`
                  : `linear-gradient(135deg, rgba(255, 255, 255, 0.94), ${mod.accent}0b, ${mod.accent}16)`,
                backdropFilter: 'blur(24px) saturate(160%)',
                WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                border: isHovered
                  ? `1px solid ${mod.accent}55`
                  : `1px solid ${mod.accent}24`,
                boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 20px 48px -28px rgba(10,20,36,0.14)',
                transition: 'background 0.35s ease, border-color 0.35s ease',
              }}
            >
              {/* Accent top bar */}
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: mod.accent }} />

              {/* Atmospheric glow */}
              <div
                className="absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: `radial-gradient(circle, ${mod.accent}45, transparent 70%)`,
                  filter: 'blur(20px)',
                }}
              />

              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                    style={{ background: `${mod.accent}18`, color: mod.accent }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-[16px] font-extrabold text-slate-900 dark:text-slate-100 leading-snug"
                    style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
                    {mod.title}
                  </h3>
                </div>
                <span className="p-1.5 rounded-lg bg-slate-50 border border-slate-100 shrink-0 text-slate-400 transition-all group-hover:text-emerald-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>

              {/* Divider */}
              <div className="mb-3 h-px" style={{ background: 'rgba(10,20,36,0.07)' }} />

              {/* Content Split Layout */}
              <div className="flex items-center justify-between gap-4">
                {/* Left: Rows */}
                <dl className="space-y-2 flex-1">
                  {mod.rows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-2 text-[13px] py-0.5 border-b border-dashed border-slate-100/50 last:border-0">
                      <dt className="text-slate-500 dark:text-slate-400 font-semibold leading-tight" title={row.label}>
                        {row.label}
                      </dt>
                      <dd className={`font-black tabular-nums text-[13px] ${row.highlight ? HIGHLIGHT_CLS[row.highlight] : 'text-slate-900 dark:text-slate-100'}`}
                        style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* Right: SVG Graphic */}
                <div className="flex items-center justify-center w-[62px] h-[62px] shrink-0 rounded-2xl border transition-colors duration-300"
                  style={{
                    background: `${mod.accent}0d`,
                    borderColor: isHovered ? `${mod.accent}40` : `${mod.accent}1a`,
                  }}>
                  <ModuleMicroGraphic kind={mod.key} summary={summary} color={mod.accent} />
                </div>
              </div>

              {/* Shine sweep */}
              <span className="shine-overlay-anuvadini rounded-3xl opacity-40" />
            </button>
          );
        })}
      </ScrollReveal>
    </div>
  );
};

export default SaacmsOverview;
