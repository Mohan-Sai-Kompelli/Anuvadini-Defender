// All data on this website is ILLUSTRATIVE demo content, not real employee data.

export type TlEvent = {
  id: string;
  time: string;
  title: string;
  short: string;
  attendance: { headline: string; body: string; chips: string[] };
  defender: { headline: string; body: string; chips: string[] };
};

export const TL_EVENTS: TlEvent[] = [
  {
    id: 'checkin', time: '09:00 AM', title: 'Check-in', short: 'The workday begins.',
    attendance: { headline: 'Presence recorded', body: 'A check-in marks the start of the day and sets the attendance status for the record.', chips: ['Check-in', 'On time', 'Status set'] },
    defender: { headline: 'Activity window opens', body: 'The recorded-activity window for the day begins, ready to show what happens next.', chips: ['Window opens', 'Configured scope'] },
  },
  {
    id: 'activity', time: '10:30 AM', title: 'Activity recorded', short: 'Work unfolds.',
    attendance: { headline: 'Working hours accumulate', body: 'Attendance keeps the running view of time on the clock for the day.', chips: ['1h 30m so far'] },
    defender: { headline: 'Work-related activity appears', body: 'Application and website categories populate a contextual timeline for the period.', chips: ['Collaboration', 'Browser', 'Dev tools'] },
  },
  {
    id: 'break', time: '01:00 PM', title: 'Break', short: 'Time away from work.',
    attendance: { headline: 'Break shown in the day', body: 'Breaks are part of a complete picture of the day rather than a gap to be explained.', chips: ['Break', 'Within day'] },
    defender: { headline: 'Idle period noted', body: 'A pause in recorded activity is shown as an idle period: a neutral signal, not a conclusion.', chips: ['Idle period', 'Neutral signal'] },
  },
  {
    id: 'summary', time: '05:30 PM', title: 'Daily summary', short: 'The day, in context.',
    attendance: { headline: 'Hours and status summarised', body: 'Check-in, check-out and total working hours are collected into one daily record.', chips: ['Check-out', 'Total hours', 'Daily record'] },
    defender: { headline: 'Activity summary for review', body: 'Categories and timeline come together so reviewers can read the day with context.', chips: ['Timeline', 'Categories', 'Review in context'] },
  },
];

export type DayStatus = 'present' | 'late' | 'leave' | 'absent' | 'off';

export type DayCell = { d: number; s: DayStatus; hours: string; note: string };

export function buildMonth(year: number, month: number): (DayCell | null)[] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const cells: (DayCell | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month, d).getDay();
    let s: DayStatus = 'present';
    let hours = '8h 05m';
    let note = 'Checked in on time and out at the end of the day.';
    if (dow === 0 || dow === 6) { s = 'off'; hours = '-'; note = 'Weekend.'; }
    else if (d % 11 === 4) { s = 'late'; hours = '7h 40m'; note = 'Checked in after the set start time.'; }
    else if (d % 13 === 6) { s = 'leave'; hours = '-'; note = 'On approved leave.'; }
    else if (d % 17 === 9) { s = 'absent'; hours = '-'; note = 'No attendance recorded for this day.'; }
    cells.push({ d, s, hours, note });
  }
  return cells;
}

export type Activity = {
  id: string;
  category: 'Collaboration' | 'Browser' | 'Development tools' | 'Other';
  app: string;
  start: string;
  end: string;
  duration: string;
  share: number;
  note: string;
};

export const ACTIVITIES: Activity[] = [
  { id: 'a1', category: 'Collaboration', app: 'Team chat and meetings', start: '09:05', end: '10:10', duration: '1h 05m', share: 0.8, note: 'Calls and messages grouped under the collaboration category.' },
  { id: 'a2', category: 'Development tools', app: 'Code editor', start: '10:10', end: '12:20', duration: '2h 10m', share: 1, note: 'Time spent in tools configured as development tools.' },
  { id: 'a3', category: 'Browser', app: 'Web browser', start: '12:20', end: '13:00', duration: '40m', share: 0.45, note: 'Website activity shown by category, for the configured scope.' },
  { id: 'a4', category: 'Other', app: 'Other configured apps', start: '14:00', end: '14:35', duration: '35m', share: 0.4, note: 'Applications that belong to other categories set by the organisation.' },
];
