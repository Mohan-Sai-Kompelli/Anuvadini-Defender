import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, DefenderPage, Empty, Skeleton, Stat } from '../../components/defender/ui';
import { fmtSecs, useDefender } from './api';

const PALETTE = ['#34c98e', '#2f7de1', '#7a5bd6', '#d4577f', '#f59e0b', '#c43d42', '#0f8fc9', '#6fa83a'];

const SPLIT = [
  { key: 'work_pct', label: 'Productive', color: 'var(--accent-chart)' },
  { key: 'gaming_pct', label: 'Non-work activity', color: '#c2554a' },
  { key: 'idle_pct', label: 'Idle / away', color: '#c9ccc4' },
];

const DefenderAnalytics = () => {
  const navigate = useNavigate();
  const a = useDefender('analytics', { interval: 15000 });
  const v = useDefender('violations', { params: { limit: 500 }, interval: 30000 });
  const d = a.data;

  const split = d ? SPLIT.map((s) => ({ ...s, value: Number(d[s.key]) || 0 })) : [];
  const total = split.reduce((x, y) => x + y.value, 0);

  const byCategory = useMemo(() => {
    const m = {};
    (v.data || []).forEach((i) => { m[i.category || 'Other'] = (m[i.category || 'Other'] || 0) + 1; });
    return Object.entries(m).map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count).slice(0, 8);
  }, [v.data]);
  const byPerson = useMemo(() => {
    const m = {};
    (v.data || []).forEach((i) => { m[i.username || i.hostname] = (m[i.username || i.hostname] || 0) + 1; });
    return Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 6);
  }, [v.data]);
  const topMax = Math.max(1, ...(d?.top_games || []).map((g) => g.total_duration));

  return (
    <DefenderPage title="Analytics" subtitle="Where recorded time goes and what triggers incidents.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card title="Today's time split" subtitle="Share of recorded time on this server's PC.">
          {!d ? <Skeleton rows={1} h="h-48" /> : total === 0 ? <Empty title="Nothing recorded yet today" hint="The split appears once the engine has run for a while." /> : (
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <div className="h-[170px] w-[170px] shrink-0" role="img" aria-label="Time split">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={split} dataKey="value" nameKey="label" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none" animationDuration={700}>
                      {split.map((s) => <Cell key={s.key} fill={s.color} />)}
                    </Pie>
                    <Tooltip formatter={(val, n) => [`${val}%`, n]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-2">
                {split.map((s) => (
                  <li key={s.key} className="flex items-center gap-2.5 text-[13px]"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden="true" /><span className="flex-1 text-[color:var(--app-text)]">{s.label}</span><b className="tnum text-[color:var(--app-text)]">{s.value}%</b></li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Most frequent detections today">
          {!d ? <Skeleton rows={3} /> : (d.top_games || []).length === 0 ? <Empty title="No detections today" hint="Games, blocked sites and tamper attempts will rank here." /> : (
            <ul className="space-y-3">
              {d.top_games.map((g, gi) => (
                <li key={g.game_name}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]"><span className="truncate font-medium text-[color:var(--app-text)]">{g.game_name}<span className="ml-2 text-[12px] font-normal text-[color:var(--app-muted)]">{g.category}</span></span><span className="shrink-0 tnum text-[color:var(--app-text-2)]">{g.incidents} incident{g.incidents === 1 ? '' : 's'} · {fmtSecs(g.total_duration)}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--app-hover)]"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(4, (g.total_duration / topMax) * 100)}%`, background: `linear-gradient(90deg, ${PALETTE[gi % PALETTE.length]}, ${PALETTE[(gi + 1) % PALETTE.length]})` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="Incidents by category" subtitle="From the latest 500 incidents. Select a bar to open those incidents.">
          <div className="h-[240px]" role="img" aria-label="Incidents by category">
            {!v.data ? <Skeleton rows={1} h="h-full" /> : byCategory.length === 0 ? <Empty title="No incidents recorded" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--app-border)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--app-muted)' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11.5, fill: 'var(--app-text-2)' }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'var(--app-hover)' }} />
                  <Bar dataKey="count" name="Incidents" barSize={20} radius={[0, 8, 8, 0]} isAnimationActive={false} cursor="pointer" onClick={(d) => d?.name && navigate(`/defender/incidents?category=${encodeURIComponent(d.name)}`)}>
                    {byCategory.map((c, i) => <Cell key={c.name} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card title="Employees with most recorded incidents" subtitle="Counts are recorded detections, not an assessment of intent or performance.">
          {!v.data ? <Skeleton rows={3} /> : byPerson.length === 0 ? <Empty title="No incidents recorded" /> : (
            <ol className="space-y-2.5">
              {byPerson.map(([name, n], i) => (
                <li key={name} className="flex items-center gap-3 text-[13px]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[11.5px] font-semibold text-[color:var(--accent)] tnum">{i + 1}</span><span className="flex-1 truncate font-medium text-[color:var(--app-text)]">{name}</span><b className="tnum text-[color:var(--app-text)]">{n}</b></li>
              ))}
            </ol>
          )}
          {v.data && <div className="mt-5 border-t border-[color:var(--app-border)] pt-4"><Stat label="Incidents in this view" value={v.data.length} /></div>}
        </Card>
      </div>
    </DefenderPage>
  );
};

export default DefenderAnalytics;
