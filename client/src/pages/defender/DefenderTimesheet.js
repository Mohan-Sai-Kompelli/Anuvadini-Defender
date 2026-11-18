import React, { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Card, DefenderPage, Empty, ErrorNote, Pill, Skeleton } from '../../components/defender/ui';
import { downloadFile, useDefender } from './api';

const today = () => new Date().toLocaleDateString('en-CA');
const fh = (h) => `${Number(h || 0).toFixed(1)} h`;

const DefenderTimesheet = () => {
  const [date, setDate] = useState(today());
  const ts = useDefender('attendance/timesheet', { params: { date_str: date }, interval: 20000 });
  const rows = ts.data || [];
  const counted = rows.filter((r) => r.total_seconds > 0);
  const avg = counted.length ? Math.round(counted.reduce((a, r) => a + (r.compliance_score || 0), 0) / counted.length) : null;

  return (
    <DefenderPage
      title="Timesheet"
      subtitle="Hours each employee was on a monitored PC, split into work, idle and policy time."
      actions={(
        <>
          <label className="sr-only" htmlFor="ts-date">Date</label>
          <input id="ts-date" type="date" className="app-input !w-auto" max={today()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button type="button" className="app-btn app-btn--ghost" onClick={() => window.print()}><Printer className="h-4 w-4" />Print summary</button>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => downloadFile('attendance/timesheet/export', `defender-timesheet-${date}.csv`, { date_str: date })}><Download className="h-4 w-4" />Export CSV</button>
        </>
      )}
    >
      <Card pad={false} title={undefined}>
        {ts.error && !ts.data ? <div className="p-4"><ErrorNote error={ts.error} onRetry={ts.refresh} /></div>
          : !ts.data ? <div className="p-4"><Skeleton rows={4} h="h-11" /></div>
          : rows.length === 0 ? <Empty title="No hours recorded for this day" hint="A day appears once an enrolled workstation has reported during a shift." />
          : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--app-border)] px-5 py-3 text-[12.5px] text-[color:var(--app-text-2)]"><span className="tnum">{rows.length} employee{rows.length === 1 ? '' : 's'}</span><span>Average compliance <b className="text-[color:var(--app-text)] tnum">{avg == null ? '-' : `${avg}%`}</b> <span className="text-[color:var(--app-muted)]">(productive / total hours). Separate from face-verified attendance.</span></span></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-[13px]">
                  <thead><tr className="bg-[color:var(--app-bg)] text-left text-[11.5px] uppercase tracking-[0.06em] text-[color:var(--app-muted)]"><th className="px-5 py-2.5 font-semibold">Employee</th><th className="px-3 py-2.5 font-semibold">In</th><th className="px-3 py-2.5 font-semibold">Out</th><th className="px-3 py-2.5 text-right font-semibold">Total</th><th className="px-3 py-2.5 text-right font-semibold">Work</th><th className="px-3 py-2.5 text-right font-semibold">Idle</th><th className="px-3 py-2.5 text-right font-semibold">Policy</th><th className="px-5 py-2.5 text-right font-semibold">Compliance</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${r.employee_id}-${r.hostname}`} className="border-t border-[color:var(--app-border)]">
                        <td className="px-5 py-2.5"><span className="block font-medium text-[color:var(--app-text)]">{r.username}</span><span className="block text-[12px] text-[color:var(--app-muted)]">{r.department} · {r.employee_id}</span></td>
                        <td className="px-3 py-2.5 tnum text-[color:var(--app-text-2)]">{r.clock_in || '-'}</td>
                        <td className="px-3 py-2.5 tnum text-[color:var(--app-text-2)]">{r.clock_out || '-'}</td>
                        <td className="px-3 py-2.5 text-right tnum">{fh(r.total_hours)}</td>
                        <td className="px-3 py-2.5 text-right tnum">{fh(r.productive_hours)}</td>
                        <td className="px-3 py-2.5 text-right tnum text-[color:var(--app-text-2)]">{fh(r.idle_hours)}</td>
                        <td className="px-3 py-2.5 text-right tnum" style={{ color: r.gaming_hours > 0 ? 'var(--err)' : undefined }}>{fh(r.gaming_hours)}</td>
                        <td className="px-5 py-2.5 text-right">{r.total_seconds > 0 ? <Pill tone={r.compliance_score >= 80 ? 'ok' : r.compliance_score >= 50 ? 'warn' : 'err'} dot={false}>{Math.round(r.compliance_score)}%</Pill> : <span className="text-[color:var(--app-muted)]" title="No recorded hours">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
      </Card>
    </DefenderPage>
  );
};

export default DefenderTimesheet;
