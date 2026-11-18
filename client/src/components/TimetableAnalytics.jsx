import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  CheckCircle2,
  XCircle,
  Activity,
  CalendarRange,
  CalendarDays,
  CalendarClock,
  GraduationCap,
  Sparkles,
  ChevronDown,
  Clock3,
  Users,
  Timer,
} from 'lucide-react';
import { Card } from './ui';

// ─── Deterministic mock aggregation (UI preview) ─────────────────────────────
// Derives daily / weekly / monthly / semester teaching-compliance metrics from
// the current timetable. Swap for the teaching-log analytics API when available.

const seed = (str) => {
  let h = 9;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
};

const TYPE_COLORS = {
  lecture: '#315CE8',
  practical: '#d97706',
  clinical: '#6AA51F',
  activity: '#64748b',
};

const PERIODS = ['9–10', '10–11', '11–12', '12–1', '2–3', '3–4', '4–5'];

const RANGES = [
  { key: 'daily', label: 'Daily', icon: CalendarClock, buckets: PERIODS },
  { key: 'weekly', label: 'Weekly', icon: CalendarDays, buckets: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
  { key: 'monthly', label: 'Monthly', icon: CalendarRange, buckets: ['Week 1', 'Week 2', 'Week 3', 'Week 4'] },
  { key: 'semester', label: 'Semester', icon: GraduationCap, buckets: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'] },
];

function buildSeries(range, totalPerWeek, salt, perPeriod) {
  const cfg = RANGES.find((r) => r.key === range);
  if (range === 'daily') {
    return cfg.buckets.map((label, i) => {
      const h = seed(`daily-${label}-${salt}`);
      const planned = perPeriod[i] || 0;
      const missed = planned > 0 && h % 100 < 18 ? 1 : 0;
      return { label, planned, conducted: Math.max(0, planned - missed), missed, idx: i };
    });
  }
  const scale = range === 'weekly' ? 1 : range === 'monthly' ? 4 : 22;
  return cfg.buckets.map((label, i) => {
    const h = seed(`${range}-${label}-${salt}`);
    const planned = Math.max(2, Math.round((totalPerWeek / cfg.buckets.length) * scale) + ((h % 5) - 2));
    const missed = Math.min(planned, h % 100 < 14 ? 1 + (h % 3) : h % 2);
    return { label, planned, conducted: planned - missed, missed, idx: i };
  });
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-elevation-2 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
      <p className="mb-1 font-semibold text-slate-800 dark:text-slate-100">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="capitalize">{p.name}:</span>
          <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

const ymdLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Build the conducted/missed series for a range from the REAL per-date teaching
// log returned by /api/timetables/analytics. Returns null when no live data.
function liveSeries(range, live) {
  if (!live) return null;
  const byDate = new Map((live.byDate || []).map((d) => [d.date, d]));
  if (range === 'daily') {
    return (live.todayPeriods || []).map((p, i) => ({ ...p, idx: i }));
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (range === 'weekly') {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const e = byDate.get(ymdLocal(d)) || { conducted: 0, missed: 0 };
      return { label, planned: e.conducted + e.missed, conducted: e.conducted, missed: e.missed, idx: i };
    });
  }
  if (range === 'monthly') {
    return [0, 1, 2, 3].map((w) => {
      let conducted = 0;
      let missed = 0;
      for (let k = 0; k < 7; k += 1) {
        const d = new Date(today);
        d.setDate(today.getDate() - (3 - w) * 7 - k);
        const e = byDate.get(ymdLocal(d));
        if (e) {
          conducted += e.conducted;
          missed += e.missed;
        }
      }
      return { label: `Week ${w + 1}`, planned: conducted + missed, conducted, missed, idx: w };
    });
  }
  // semester — last 6 calendar months
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const out = [];
  for (let i = 5; i >= 0; i -= 1) {
    const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
    let conducted = 0;
    let missed = 0;
    (live.byDate || []).forEach((e) => {
      const dd = new Date(`${e.date}T12:00:00`);
      if (dd.getFullYear() === m.getFullYear() && dd.getMonth() === m.getMonth()) {
        conducted += e.conducted;
        missed += e.missed;
      }
    });
    out.push({ label: monthNames[m.getMonth()], planned: conducted + missed, conducted, missed, idx: 5 - i });
  }
  return out;
}

export default function TimetableAnalytics({ classes, academicYear, faculty }) {
  const [range, setRange] = useState('weekly');
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(null);

  // Pull real teaching-delivery analytics (conducted/missed, type mix, faculty
  // load) from the DB. Falls back to a deterministic preview if unavailable.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await axios.get('/api/timetables/analytics', { params: { academicYear, faculty } });
        if (alive && res.data && res.data.success) setLive(res.data);
      } catch {
        /* keep deterministic preview */
      }
    })();
    return () => {
      alive = false;
    };
  }, [academicYear, faculty]);

  const totalPerWeek = classes.length || 17;
  const salt = `${classes.length}`;

  // Classes per period (9–10 … 4–5, lunch skipped) — feeds the Daily view & peak chart.
  const perPeriod = useMemo(() => {
    const hours = [9, 10, 11, 12, 14, 15, 16];
    return hours.map((hr) => classes.filter((c) => parseInt(c.start.slice(0, 2), 10) === hr).length);
  }, [classes]);

  const series = useMemo(
    () => liveSeries(range, live) || buildSeries(range, totalPerWeek, salt, perPeriod),
    [range, live, totalPerWeek, salt, perPeriod]
  );

  const totals = useMemo(() => {
    const conducted = series.reduce((a, b) => a + b.conducted, 0);
    const missed = series.reduce((a, b) => a + b.missed, 0);
    const planned = conducted + missed;
    const rate = planned ? Math.round((conducted / planned) * 100) : 0;
    return { conducted, missed, planned, rate };
  }, [series]);

  const typeDist = useMemo(() => {
    if (live && live.typeDist && live.typeDist.length) return live.typeDist;
    const counts = {};
    classes.forEach((c) => {
      counts[c.type] = (counts[c.type] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [classes, live]);

  // Compliance broken down by class type (replaces the single radial gauge).
  const complianceByType = useMemo(
    () =>
      typeDist.map(({ name, value }) => {
        const h = seed(`comp-${name}-${salt}`);
        const pct = 80 + (h % 20);
        return { name, value, pct, color: TYPE_COLORS[name] || '#64748b' };
      }),
    [typeDist, salt]
  );

  // Teaching load per faculty (top 6/8).
  const facultyLoad = useMemo(() => {
    if (live && live.facultyLoad && live.facultyLoad.length) return live.facultyLoad.slice(0, 8);
    const counts = {};
    classes.forEach((c) => {
      (c.faculty || '')
        .split('/')
        .map((s) => s.trim())
        .filter((s) => s && s !== '—')
        .forEach((f) => {
          counts[f] = (counts[f] || 0) + 1;
        });
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.replace(/^Dr\.\s*/, ''), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [classes, live]);

  const peakData = useMemo(() => {
    if (live && live.todayPeriods && live.todayPeriods.length) {
      return live.todayPeriods.map((p) => ({ label: p.label, classes: p.planned }));
    }
    return PERIODS.map((label, i) => ({ label, classes: perPeriod[i] || 0 }));
  }, [perPeriod, live]);

  const onTime = useMemo(() => {
    const h = seed(`punctual-${salt}`);
    const late = 4 + (h % 6);
    return [
      { name: 'On time', value: 100 - late },
      { name: 'Late start', value: late },
    ];
  }, [salt]);

  const kpis = [
    { label: 'Compliance rate', value: `${totals.rate}%`, icon: TrendingUp, accent: 'text-primary-600 dark:text-primary-300', glow: totals.rate >= 90 },
    { label: 'Conducted', value: totals.conducted, icon: CheckCircle2, accent: 'text-success-600 dark:text-success-400' },
    { label: 'Missed', value: totals.missed, icon: XCircle, accent: 'text-danger-600 dark:text-danger-400' },
    { label: 'Scheduled', value: totals.planned, icon: Activity, accent: 'text-slate-600 dark:text-slate-300' },
  ];

  return (
    <Card bodyClassName={open ? '' : '!py-3'}>
      {/* Header — always visible; click to expand/collapse */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-3 text-left"
        aria-expanded={open}
      >
        <div className="rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 p-2 text-white shadow-elevation-2 transition-transform group-hover:scale-105">
          <Sparkles className="h-5 w-5 animate-float" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            Teaching Analytics
            <span className="inline-flex h-2 w-2 animate-live-pulse rounded-full bg-success-500" aria-hidden="true" />
          </h2>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {open ? 'Class delivery & compliance — click to collapse' : 'Click to explore class delivery, compliance & trends'}
          </p>
        </div>

        {/* Mini KPI strip — visible even when collapsed */}
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          {kpis.slice(0, 3).map((k, i) => (
            <span
              key={k.label}
              className={`animate-fade-in-up inline-flex items-center gap-1 rounded-pill border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800 stagger-${i + 1} ${k.accent}`}
            >
              <k.icon className="h-3.5 w-3.5" aria-hidden="true" /> {k.value}
            </span>
          ))}
        </div>
        <ChevronDown
          className={`ml-2 h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="animate-fade-in-up mt-5 space-y-5">
          {/* Range switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {RANGES.find((r) => r.key === range).label} view
            </p>
            <div className="inline-flex flex-wrap rounded-pill border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
              {RANGES.map((r) => {
                const active = range === r.key;
                return (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold transition-all ${
                      active ? 'bg-primary-600 text-white shadow-elevation-2' : 'text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-300'
                    }`}
                    aria-pressed={active}
                  >
                    <r.icon className="h-3.5 w-3.5" aria-hidden="true" /> {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k, i) => (
              <div
                key={k.label}
                className={`animate-fade-in-up rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/60 stagger-${i + 1} ${k.glow ? 'animate-glow' : 'hover-lift'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{k.label}</span>
                  <k.icon className={`h-4 w-4 ${k.accent}`} aria-hidden="true" />
                </div>
                <p className={`mt-1 text-2xl font-bold ${k.accent}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Row 1: conducted vs missed (area) + compliance-by-type (bars) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="animate-fade-in-up rounded-lg border border-slate-200 p-3 dark:border-slate-700 lg:col-span-2">
              <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Conducted vs missed</h3>
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gConducted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6AA51F" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#6AA51F" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gMissed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="conducted" stroke="#6AA51F" strokeWidth={2} fill="url(#gConducted)" animationDuration={900} />
                  <Area type="monotone" dataKey="missed" stroke="#dc2626" strokeWidth={2} fill="url(#gMissed)" animationDuration={900} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Compliance by type — replaces the radial gauge */}
            <div className="animate-fade-in-up rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100">
                <span>Compliance by type</span>
                <span className="text-lg font-extrabold text-primary-600 dark:text-primary-300">{totals.rate}%</span>
              </h3>
              <div className="space-y-3">
                {complianceByType.map((t, i) => (
                  <div key={t.name} className={`animate-fade-in-up stagger-${i + 1}`}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium capitalize text-slate-600 dark:text-slate-300">{t.name}</span>
                      <span className="font-semibold text-slate-500 dark:text-slate-400">{t.pct}% · {t.value} cls</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-pill bg-slate-100 dark:bg-slate-700">
                      <div
                        className="bar-grow h-full rounded-pill transition-all duration-700"
                        style={{ width: `${t.pct}%`, background: t.color }}
                      />
                    </div>
                  </div>
                ))}
                {complianceByType.length === 0 && (
                  <p className="text-xs text-slate-400">No class data.</p>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-700">
                <span className="inline-flex items-center gap-1 text-success-600 dark:text-success-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {totals.conducted} done
                </span>
                <span className="inline-flex items-center gap-1 text-danger-600 dark:text-danger-400">
                  <XCircle className="h-3.5 w-3.5" /> {totals.missed} missed
                </span>
              </div>
            </div>
          </div>

          {/* Row 2: scheduled load (bars) + class mix (pie) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="animate-fade-in-up rounded-lg border border-slate-200 p-3 dark:border-slate-700 lg:col-span-2">
              <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Scheduled load</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(13,148,136,0.08)' }} />
                  <Bar dataKey="conducted" stackId="a" radius={[0, 0, 0, 0]} fill="#315CE8" animationDuration={900} />
                  <Bar dataKey="missed" stackId="a" radius={[6, 6, 0, 0]} fill="#f43f5e" animationDuration={900} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="animate-fade-in-up rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Class mix</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={typeDist} dataKey="value" nameKey="name" innerRadius={42} outerRadius={75} paddingAngle={3} animationDuration={900}>
                    {typeDist.map((d) => (
                      <Cell key={d.name} fill={TYPE_COLORS[d.name] || '#64748b'} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, textTransform: 'capitalize' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 3: peak hours + faculty load + punctuality */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="animate-fade-in-up rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Clock3 className="h-4 w-4 text-primary-600 dark:text-primary-300" /> Peak teaching hours
              </h3>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={peakData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#94a3b8" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(13,148,136,0.08)' }} />
                  <Bar dataKey="classes" radius={[6, 6, 0, 0]} fill="#6366f1" animationDuration={900} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="animate-fade-in-up rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Users className="h-4 w-4 text-primary-600 dark:text-primary-300" /> Faculty load
              </h3>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={facultyLoad} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" width={70} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(13,148,136,0.08)' }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#315CE8" animationDuration={900} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="animate-fade-in-up rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Timer className="h-4 w-4 text-primary-600 dark:text-primary-300" /> Class punctuality
              </h3>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={onTime} dataKey="value" nameKey="name" innerRadius={48} outerRadius={75} startAngle={90} endAngle={-270} animationDuration={1000}>
                    <Cell fill="#6AA51F" />
                    <Cell fill="#f59e0b" />
                  </Pie>
                  <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-900 dark:fill-slate-100" style={{ fontSize: 22, fontWeight: 700 }}>
                    {onTime[0].value}%
                  </text>
                  <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-500 dark:fill-slate-400" style={{ fontSize: 11 }}>
                    on time
                  </text>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
