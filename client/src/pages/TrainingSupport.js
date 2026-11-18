import React from 'react';
import {
  LifeBuoy,
  Phone,
  Mail,
  Clock,
  Gauge,
  Sparkles,
  BookOpen,
  Download,
  GraduationCap,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, StatCard } from '../components/ui';

// ─── Dummy data (UI preview) — replace with support-portal API wiring ────────

const MANUALS = [
  { id: 'm1', title: 'Admin Web Dashboard — User Manual', size: '4.2 MB', updated: 'May 2026' },
  { id: 'm2', title: 'Faculty Mobile App — Quick Start Guide', size: '2.8 MB', updated: 'May 2026' },
  { id: 'm3', title: 'Anuvadini Admin Panel Guide', size: '3.1 MB', updated: 'Apr 2026' },
  { id: 'm4', title: 'Timetable — How-To', size: '1.9 MB', updated: 'Jun 2026' },
];

const SESSIONS = [
  { id: 's1', title: 'Admin onboarding — dashboard & approvals', date: '2026-06-15', mode: 'Online (Meet)', seats: '18 / 30', status: 'open' },
  { id: 's2', title: 'Train-the-trainer — faculty app rollout', date: '2026-06-18', mode: 'On-campus', seats: '25 / 25', status: 'full' },
  { id: 's4', title: 'Anuvadini admins — compliance analytics', date: '2026-06-29', mode: 'Online (Meet)', seats: '4 / 20', status: 'open' },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function TrainingSupport() {
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-4 dark:bg-slate-900 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary-600 p-2.5 text-white">
          <LifeBuoy className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Training &amp; Support
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Helpdesk, user manuals, training sessions and service-level commitments.
          </p>
        </div>
      </div>

      {/* SLA stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Uptime SLA" value="99.5%" icon={Gauge} />
        <StatCard label="Uptime this month" value="99.93%" icon={CheckCircle2} />
        <StatCard label="Open tickets" value="3" icon={LifeBuoy} />
        <StatCard label="Avg first response" value="22 min" icon={Clock} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Helpdesk */}
        <Card title="Helpdesk">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <Clock className="h-4 w-4 text-primary-600 dark:text-primary-300" aria-hidden="true" />
              9:00 AM – 6:00 PM, Monday – Saturday
            </div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <Phone className="h-4 w-4 text-primary-600 dark:text-primary-300" aria-hidden="true" />
              1800-XXX-XXXX (toll-free)
            </div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <Mail className="h-4 w-4 text-primary-600 dark:text-primary-300" aria-hidden="true" />
              support@anuvadini.aicte-india.org
            </div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <Sparkles className="h-4 w-4 text-primary-600 dark:text-primary-300" aria-hidden="true" />
              Quarterly feature updates — next release: <strong>July 2026</strong>
            </div>
            <Button
              className="mt-2"
              icon={LifeBuoy}
              onClick={() => toast.success('Support ticket form opened — demo')}
            >
              Raise a support ticket
            </Button>
          </div>
        </Card>

        {/* Manuals */}
        <Card title="User manuals">
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {MANUALS.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <BookOpen
                    className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-300"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {m.title}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      PDF · {m.size} · updated {m.updated}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  icon={Download}
                  onClick={() => toast.error(`"${m.title}" hasn't been uploaded yet — contact support for a copy.`)}
                >
                  Download
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Training sessions */}
      <Card
        title={
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <GraduationCap className="h-4 w-4 text-primary-600 dark:text-primary-300" aria-hidden="true" />
            Upcoming training sessions
          </h3>
        }
        action={
          <Button
            size="sm"
            variant="outline"
            icon={CalendarDays}
            onClick={() => toast.success('Training request sent to the Anuvadini team — demo')}
          >
            Request a session
          </Button>
        }
        bodyClassName="!p-0"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">Session</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Mode</th>
                <th className="px-3 py-3">Seats</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {SESSIONS.map((s) => (
                <tr
                  key={s.id}
                  className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {s.title}
                  </td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{fmtDate(s.date)}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{s.mode}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{s.seats}</td>
                  <td className="px-5 py-3">
                    {s.status === 'open' ? (
                      <span className="inline-flex items-center rounded-pill bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-700 dark:bg-success-900/40 dark:text-success-400">
                        Registration open
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-pill bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        Full
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
