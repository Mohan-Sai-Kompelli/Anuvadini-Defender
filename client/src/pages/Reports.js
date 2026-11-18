import React, { useState } from 'react';
import axios from 'axios';
import Attendance from './Attendance';
import ScrollReveal from '../components/ScrollReveal';
import { Card, Button } from '../components/ui';
import { Download, FileCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadCsv } from '../lib/csvExport';

const todayStamp = () => new Date().toISOString().slice(0, 10);

const Reports = () => {
  const [busy, setBusy] = useState(null);

  const runExport = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      console.error(`Export failed (${key}):`, err);
      toast.error('Failed to generate report');
    } finally {
      setBusy(null);
    }
  };

  const exportCompliance = () =>
    runExport('compliance', async () => {
      const res = await axios.get('/api/compliance/departments');
      const rows = res.data?.departments || [];
      if (rows.length === 0) {
        toast.error('No compliance data to export');
        return;
      }
      downloadCsv(`compliance-report_${todayStamp()}.csv`, rows, [
        { label: 'Department', get: (d) => d.name },
        { label: 'Code', get: (d) => d.code },
        { label: 'Attendance %', get: (d) => d.attendance ?? '' },
        { label: 'Teaching %', get: (d) => d.teaching ?? '' },
        { label: 'Spot-check %', get: (d) => d.spotCheck ?? '' },
        { label: 'Rating', get: (d) => d.rating ?? '' },
      ]);
      toast.success('Compliance report downloaded');
    });

  const exportAttendance = () =>
    runExport('attendance', async () => {
      const params = new URLSearchParams({ mode: 'month' });
      const res = await axios.get(`/api/attendance/export?${params.toString()}`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `attendance-report_${todayStamp()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success('Attendance report downloaded');
    });

  const exportSpotCheck = () =>
    runExport('spotcheck', async () => {
      const res = await axios.get('/api/spot-checks/report');
      const rows = res.data?.users || [];
      if (rows.length === 0) {
        toast.error('No spot-check data to export');
        return;
      }
      downloadCsv(`spot-check-report_${todayStamp()}.csv`, rows, [
        { label: 'Name', get: (u) => u.name },
        { label: 'UID', get: (u) => u.uid },
        { label: 'Department', get: (u) => u.department },
        { label: 'Issued', get: (u) => u.totalIssued ?? 0 },
        { label: 'Responded', get: (u) => u.responded ?? 0 },
        { label: 'Missed', get: (u) => u.missed ?? 0 },
        { label: 'Response Rate %', get: (u) => Math.round((u.responseRate || 0) * 100) },
        { label: 'Miss Rate %', get: (u) => Math.round((u.missRate || 0) * 100) },
        { label: 'Longest Miss Streak', get: (u) => u.longestMissStreak ?? 0 },
        { label: 'Marked After Miss', get: (u) => u.markedAfterMissCount ?? 0 },
      ]);
      toast.success('Spot-check report downloaded');
    });

  // No dedicated "staff performance" metric exists yet — backed by the same
  // attendance export (closest real proxy) rather than a fabricated figure.
  const exportStaffPerformance = () =>
    runExport('staff', async () => {
      const params = new URLSearchParams({ mode: 'month' });
      const res = await axios.get(`/api/attendance/export?${params.toString()}`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `staff-attendance_${todayStamp()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success('Staff attendance report downloaded');
    });

  return (
    <ScrollReveal y={28} duration={800} blur={8} className="space-y-6">
      <Attendance />

      {/* Compliance Reports & Exports section */}
      <Card
        title={
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <FileCheck className="h-4 w-4 text-emerald-650" />
            Compliance Reports & Exports
          </h3>
        }
      >
        <p className="text-xs text-slate-500 mb-4">
          Download generated compliance documentation and datasets for the institution.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Button variant="outline" icon={Download} disabled={busy === 'compliance'} onClick={exportCompliance}>
            {busy === 'compliance' ? 'Preparing…' : 'Compliance Report'}
          </Button>
          <Button variant="outline" icon={Download} disabled={busy === 'attendance'} onClick={exportAttendance}>
            {busy === 'attendance' ? 'Preparing…' : 'Attendance Report'}
          </Button>
          <Button variant="outline" icon={Download} disabled={busy === 'spotcheck'} onClick={exportSpotCheck}>
            {busy === 'spotcheck' ? 'Preparing…' : 'Spot-Check Report'}
          </Button>
          <Button variant="outline" icon={Download} disabled={busy === 'staff'} onClick={exportStaffPerformance}>
            {busy === 'staff' ? 'Preparing…' : 'Staff Performance Report'}
          </Button>
        </div>
      </Card>
    </ScrollReveal>
  );
};

export default Reports;
