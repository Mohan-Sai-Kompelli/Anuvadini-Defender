import React, { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, LineChart } from 'lucide-react';

const SERIES = [
  { key: 'present', label: 'Present', color: 'var(--accent)' },
  { key: 'absent', label: 'Absent', color: '#c2554a' },
];

const fmtDate = (iso) => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const TipBox = ({ active, payload, label, hidden }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[color:var(--app-border)] bg-white px-3 py-2 text-[12px] shadow-lg">
      <p className="mb-1 font-semibold text-[color:var(--app-text)]">{fmtDate(label)}</p>
      {payload.filter((p) => !hidden[p.dataKey]).map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-[color:var(--app-text-2)]">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}
          <span className="ml-auto font-semibold text-[color:var(--app-text)] tnum">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

/** Present / absent trend for the loaded range. Legend chips toggle series; bar / line view switch. */
const AttendanceTrendCard = ({ chartData, loading }) => {
  const [mode, setMode] = useState('line');
  const [hidden, setHidden] = useState({});

  const data = useMemo(
    () => (chartData || []).filter((x) => !x.isWeekend).map((x) => ({
      date: x.date,
      present: x.count || 0,
      absent: Math.max((x.totalStudents || 0) - (x.count || 0), 0),
    })),
    [chartData]
  );
  const toggle = (k) => setHidden((h) => ({ ...h, [k]: !h[k] }));
  const common = { data, margin: { top: 8, right: 8, left: -18, bottom: 0 } };
  const axes = (
    <>
      <CartesianGrid stroke="var(--app-border)" vertical={false} />
      <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: 'var(--app-muted)' }} tickLine={false} axisLine={false} minTickGap={16} />
      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--app-muted)' }} tickLine={false} axisLine={false} />
      <Tooltip content={<TipBox hidden={hidden} />} cursor={{ stroke: 'var(--app-border)' }} />
    </>
  );

  return (
    <section className="app-card flex flex-col p-5" aria-labelledby="att-trend">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="att-trend" className="text-[15px] font-semibold text-[color:var(--app-text)]">Attendance trend</h2>
          <p className="text-[12px] text-[color:var(--app-text-2)]">Recent days, present vs absent.</p>
        </div>
        <div className="flex items-center gap-2">
          {SERIES.map((s) => (
            <button
              key={s.key} type="button" aria-pressed={!hidden[s.key]} onClick={() => toggle(s.key)}
              className="app-focus inline-flex items-center gap-1.5 rounded-full border border-[color:var(--app-border)] px-2.5 py-1 text-[12px] font-medium text-[color:var(--app-text-2)] transition-opacity"
              style={{ opacity: hidden[s.key] ? 0.45 : 1 }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />{s.label}
            </button>
          ))}
          <div className="inline-flex rounded-lg border border-[color:var(--app-border)] p-0.5" role="group" aria-label="Chart type">
            {[['line', LineChart, 'Line'], ['bar', BarChart3, 'Bar']].map(([k, Icon, label]) => (
              <button key={k} type="button" aria-pressed={mode === k} aria-label={`${label} chart`} onClick={() => setMode(k)}
                className="app-focus rounded-md p-1.5 transition-colors"
                style={{ background: mode === k ? 'var(--accent-soft)' : 'transparent', color: mode === k ? 'var(--accent)' : 'var(--app-muted)' }}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-[260px] flex-1" role="img" aria-label="Present and absent counts per day">
        {loading ? (
          <div className="h-full animate-pulse rounded-xl bg-[color:var(--app-hover)]" />
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-[color:var(--app-text-2)]">No attendance recorded for this range.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {mode === 'line' ? (
              <AreaChart {...common}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {axes}
                {!hidden.present && <Area type="monotone" dataKey="present" name="Present" stroke="var(--accent)" strokeWidth={2.25} fill="url(#trendFill)" animationDuration={700} dot={{ r: 2.5 }} activeDot={{ r: 4.5 }} />}
                {!hidden.absent && <Area type="monotone" dataKey="absent" name="Absent" stroke="#c2554a" strokeWidth={2} fill="none" animationDuration={700} dot={{ r: 2.5 }} activeDot={{ r: 4.5 }} />}
              </AreaChart>
            ) : (
              <BarChart {...common} barGap={3}>
                {axes}
                {!hidden.present && <Bar dataKey="present" name="Present" fill="var(--accent-chart)" radius={[4, 4, 0, 0]} animationDuration={600} />}
                {!hidden.absent && <Bar dataKey="absent" name="Absent" fill="#c2554a" radius={[4, 4, 0, 0]} animationDuration={600} />}
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
};

export default AttendanceTrendCard;
