import React, { useEffect, useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  UserCheck, Search, RefreshCw, Clock, Activity, AlertCircle, Play,
  Building2, Check, X, ShieldAlert, Users, ChevronDown, ShieldCheck,
  ChevronRight, ChevronLeft, Star, TrendingUp, TrendingDown, Minus, Download, Info,
} from 'lucide-react';
import { Card, EmptyState } from '../../components/ui';
import { superAdminSpotCheckAPI, faceCaptureAPI } from '../../services/api';
import { downloadCsv } from '../../lib/csvExport';

const fmtTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? '—'
    : dt.toLocaleString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
};

// ─────────── Compliance heatmap: 5-tier band scale ───────────
// Numbers are printed inside every cell, so color carries the BAND, not a
// continuous scale — a rich two-stop gradient per band (with bold white text
// on the four saturated bands; dark text only on the light "average" yellow,
// where white would fail contrast) gives the grid a lively, "alive" feel
// instead of flat pastel swatches.
const BAND_ORDER = ['excellent', 'good', 'average', 'poor', 'critical'];
// `text` is for ON the gradient (white, bold, punchy); `ink` is the same
// band's darker same-hue color for use on the page's light background
// (the Overall column, stat tiles) — white-on-white would vanish there.
const BAND_STYLE = {
  excellent: { from: '#8FD13C', to: '#2748C4', text: '#FFFFFF', ink: '#2748C4', dot: '#6AA51F', label: 'Excellent', range: '≥ 90%' },
  good: { from: '#8FD13C', to: '#8FD13C', text: '#FFFFFF', ink: '#6AA51F', dot: '#8FD13C', label: 'Good', range: '70 – 89%' },
  average: { from: '#FDE047', to: '#F59E0B', text: '#78350F', ink: '#B45309', dot: '#F59E0B', label: 'Average', range: '50 – 69%' },
  poor: { from: '#FB923C', to: '#EA580C', text: '#FFFFFF', ink: '#C2410C', dot: '#FB923C', label: 'Poor', range: '30 – 49%' },
  critical: { from: '#F87171', to: '#DC2626', text: '#FFFFFF', ink: '#B91C1C', dot: '#EF4444', label: 'Critical', range: '< 30%' },
  nodata: { from: '#F1F5F9', to: '#F1F5F9', text: '#94A3B8', ink: '#94A3B8', dot: '#CBD5E1', label: 'No Data', range: '' },
};

/** Which band a compliance rate falls into. */
const bandOf = (rate) => {
  if (rate >= 90) return 'excellent';
  if (rate >= 70) return 'good';
  if (rate >= 50) return 'average';
  if (rate >= 30) return 'poor';
  return 'critical';
};

/** Status band + rate for one org/day bucket. */
const cellStatus = (total, responded) => {
  if (!total) return { status: 'nodata', rate: null };
  const rate = Math.round((responded / total) * 100);
  return { status: bandOf(rate), rate };
};

const dayKeyOf = (dateLike) => {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Small ring meter for the single "Overall Compliance" stat tile. */
const RingMeter = ({ percentage, color, size = 56, strokeWidth = 6 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = percentage === null ? circumference : circumference - (percentage / 100) * circumference;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E2E8F0" strokeWidth={strokeWidth} />
      {percentage !== null && (
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      )}
    </svg>
  );
};

/** Minimal inline sparkline — no chart library needed for one thin trend line. */
const Sparkline = ({ values, width = 96, height = 32, color = '#6AA51F' }) => {
  const points = values.map((v, i) => ({ v, x: (i / Math.max(1, values.length - 1)) * width }));
  const known = points.filter((p) => p.v !== null);
  if (known.length < 2) {
    return (
      <div style={{ width, height }} className="flex items-center justify-center text-[10px] font-semibold text-slate-400">
        Not enough data
      </div>
    );
  }
  const max = Math.max(...known.map((p) => p.v), 1);
  const min = Math.min(...known.map((p) => p.v), 0);
  const range = Math.max(1, max - min);
  const toY = (v) => height - ((v - min) / range) * (height - 4) - 2;
  const path = known.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${toY(p.v).toFixed(1)}`).join(' ');
  const last = known[known.length - 1];
  return (
    <svg width={width} height={height}>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={toY(last.v)} r={2.5} fill={color} />
    </svg>
  );
};

const SuperAdminSpotChecks = () => {
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgs, setSelectedOrgs] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllHeatmap, setShowAllHeatmap] = useState(false);
  const [heatmapRangeDays, setHeatmapRangeDays] = useState(14);
  const [heatmapEndDate, setHeatmapEndDate] = useState(() => new Date());
  const [historyFilter, setHistoryFilter] = useState('all');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');

  const handlePresetChange = useCallback((preset) => {
    setHistoryFilter(preset);
    const today = new Date();
    const formatYMD = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (preset === 'all') {
      setCustomFromDate('');
      setCustomToDate('');
    } else if (preset === 'today') {
      const ymd = formatYMD(today);
      setCustomFromDate(ymd);
      setCustomToDate(ymd);
    } else if (preset === 'week') {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      setCustomFromDate(formatYMD(past));
      setCustomToDate(formatYMD(today));
    } else if (preset === '2weeks') {
      const past = new Date();
      past.setDate(today.getDate() - 14);
      setCustomFromDate(formatYMD(past));
      setCustomToDate(formatYMD(today));
    } else if (preset === 'month') {
      const past = new Date();
      past.setDate(today.getDate() - 30);
      setCustomFromDate(formatYMD(past));
      setCustomToDate(formatYMD(today));
    }
  }, []);

  // Configurations
  const [windowMinutes, setWindowMinutes] = useState(15);
  const [onlyCheckedIn, setOnlyCheckedIn] = useState(true);

  // History and Loading
  const [rounds, setRounds] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingRounds, setLoadingRounds] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Drilldown modal for organization's spot checks details
  const [selectedHeatmapOrg, setSelectedHeatmapOrg] = useState(null);
  const [selectedHeatmapDay, setSelectedHeatmapDay] = useState(null);
  const [orgSpotChecks, setOrgSpotChecks] = useState([]);
  const [loadingOrgChecks, setLoadingOrgChecks] = useState(false);
  const [orgChecksSearchQuery, setOrgChecksSearchQuery] = useState('');
  const [orgChecksStatusFilter, setOrgChecksStatusFilter] = useState('all');

  const handleHeatmapOrgClick = useCallback(async (org, day = null) => {
    setSelectedHeatmapOrg(org);
    setSelectedHeatmapDay(day);
    setOrgSpotChecks([]);
    setLoadingOrgChecks(true);
    setOrgChecksSearchQuery('');
    setOrgChecksStatusFilter('all');
    try {
      const orgId = org.id || org._id;
      const res = await superAdminSpotCheckAPI.getOrgSpotChecks(orgId);
      if (res.success) {
        setOrgSpotChecks(res.spotChecks || []);
      } else {
        toast.error(res.error || 'Failed to load spot check details');
      }
    } catch (err) {
      console.error('[superadmin-spotcheck] fetch org spot checks failed', err);
      toast.error('Failed to load spot check details');
    } finally {
      setLoadingOrgChecks(false);
    }
  }, []);

  // Fetch initial data
  const loadOrgs = useCallback(async () => {
    setLoadingOrgs(true);
    try {
      const data = await faceCaptureAPI.institutes();
      const list = Array.isArray(data) ? data : data.organizations || data.items || [];
      setOrganizations(list);
    } catch (err) {
      console.error('[superadmin-spotcheck] load orgs failed', err);
      toast.error('Failed to load organizations');
    } finally {
      setLoadingOrgs(false);
    }
  }, []);

  const loadRounds = useCallback(async () => {
    setLoadingRounds(true);
    try {
      const data = await superAdminSpotCheckAPI.getRounds();
      setRounds(data.rounds || []);
    } catch (err) {
      console.error('[superadmin-spotcheck] load rounds failed', err);
      toast.error('Failed to load spot-check rounds history');
    } finally {
      setLoadingRounds(false);
    }
  }, []);

  useEffect(() => {
    loadOrgs();
    loadRounds();
  }, [loadOrgs, loadRounds]);

  // Filter organizations by search query
  const filteredOrgs = useMemo(() => {
    return organizations.filter((org) => {
      const name = (org.name || '').toLowerCase();
      const state = (org.state || '').toLowerCase();
      const query = searchQuery.toLowerCase();
      return name.includes(query) || state.includes(query);
    });
  }, [organizations, searchQuery]);

  // Handlers for organization selection
  const handleToggleSelect = (orgId) => {
    setSelectedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedOrgs((prev) => {
      const next = new Set(prev);
      filteredOrgs.forEach((org) => next.add(org.id || org._id));
      return next;
    });
  };

  const handleClearAllFiltered = () => {
    setSelectedOrgs((prev) => {
      const next = new Set(prev);
      filteredOrgs.forEach((org) => next.delete(org.id || org._id));
      return next;
    });
  };

  // Trigger Action
  const handleTriggerSpotCheck = async () => {
    if (selectedOrgs.size === 0) {
      toast.error('Please select at least one organization');
      return;
    }

    setTriggering(true);
    setShowConfirm(false);

    try {
      const payload = {
        organizationIds: Array.from(selectedOrgs),
        sampleSize: null,
        windowMinutes: parseInt(windowMinutes) || 15,
        onlyCheckedIn,
      };

      const res = await superAdminSpotCheckAPI.trigger(payload);
      if (res.success) {
        const totalIssued = (res.results || []).reduce((acc, r) => acc + (r.issued || 0), 0);
        const failedOrgs = (res.results || []).filter((r) => !r.success);

        if (totalIssued === 0) {
          toast.error(
            'No spot checks were created because no active staff met the target criteria in the selected organizations.',
            { duration: 6000 }
          );
        } else if (failedOrgs.length > 0) {
          toast.success(`Spot check triggered for ${totalIssued} staff members. (${failedOrgs.length} organizations failed)`);
        } else {
          toast.success(`Spot check successfully triggered for ${totalIssued} staff members!`);
        }
        setSelectedOrgs(new Set()); // Reset selection
        loadRounds(); // Reload history
      } else {
        toast.error(res.error || 'Failed to trigger spot checks');
      }
    } catch (err) {
      console.error('[superadmin-spotcheck] trigger error', err);
      toast.error(err.response?.data?.error || 'Server error triggering spot checks');
    } finally {
      setTriggering(false);
    }
  };

  // Helper stats
  const avgResponseRate = useMemo(() => {
    const resolvedRounds = rounds.filter((r) => r.total > 0 && r.triggeredBy === 'manual');
    if (!resolvedRounds.length) return 0;
    const sum = resolvedRounds.reduce((acc, r) => {
      const rate = r.total > 0 ? (r.responded / r.total) : 0;
      return acc + rate;
    }, 0);
    return Math.round((sum / resolvedRounds.length) * 100);
  }, [rounds]);

  // ── Heatmap: date-range control ──────────────────────────────────────────
  // A CONTINUOUS calendar range (not just "days that happen to have a round")
  // so gaps render as honest "No Data" cells and the range picker means what
  // it says. This is what makes the grid scale cleanly as the network grows —
  // more institutions just add rows (paged via "Show All"), more history is
  // an explicit, user-chosen window instead of an ever-growing fixed slice.
  const buildDayRange = (days, endDate) => {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(endDate);
      d.setDate(d.getDate() - i);
      out.push({ key: dayKeyOf(d), label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) });
    }
    return out;
  };

  const heatmapDays = useMemo(() => buildDayRange(heatmapRangeDays, heatmapEndDate), [heatmapRangeDays, heatmapEndDate]);
  const heatmapPrevDays = useMemo(() => {
    const end = new Date(heatmapEndDate);
    end.setDate(end.getDate() - heatmapRangeDays);
    return buildDayRange(heatmapRangeDays, end);
  }, [heatmapRangeDays, heatmapEndDate]);
  const periodDayKeys = useMemo(() => heatmapDays.map((d) => d.key), [heatmapDays]);
  const prevPeriodDayKeys = useMemo(() => heatmapPrevDays.map((d) => d.key), [heatmapPrevDays]);

  // organizationId -> dayKey -> { total, responded } — every round ever
  // fetched, bucketed by day. The selected range just picks which day keys
  // get read out of this; it doesn't need to be recomputed per range.
  const heatmapCellsByOrg = useMemo(() => {
    const byOrgDay = {};
    rounds.forEach((round) => {
      const orgId = round.organizationId || (round.organization && (round.organization.id || round.organization._id));
      const dayKey = dayKeyOf(round.issuedAt);
      if (!orgId || !dayKey) return;
      const oid = String(orgId);
      if (!byOrgDay[oid]) byOrgDay[oid] = {};
      if (!byOrgDay[oid][dayKey]) byOrgDay[oid][dayKey] = { total: 0, responded: 0 };
      byOrgDay[oid][dayKey].total += round.total || 0;
      byOrgDay[oid][dayKey].responded += round.responded || 0;
    });
    return byOrgDay;
  }, [rounds]);

  const aggregateOrgOverDays = useCallback((orgId, dayKeys) => {
    const orgDays = heatmapCellsByOrg[String(orgId)] || {};
    let total = 0;
    let responded = 0;
    dayKeys.forEach((key) => {
      const b = orgDays[key];
      if (b && b.total > 0) {
        total += b.total;
        responded += b.responded;
      }
    });
    return { total, responded };
  }, [heatmapCellsByOrg]);

  // Every number in this section — rows, the Overall column, the stat cards —
  // is scoped to the SAME selected range, so switching it keeps the whole
  // panel internally consistent instead of mixing an all-time figure with a
  // windowed grid.
  const heatmapRows = useMemo(() => {
    const withData = [];
    const noData = [];
    organizations.forEach((org) => {
      const orgId = org.id || org._id;
      const { total, responded } = aggregateOrgOverDays(orgId, periodDayKeys);
      if (total > 0) {
        const rate = Math.round((responded / total) * 100);
        withData.push({ ...org, rate, total, responded, status: bandOf(rate) });
      } else {
        noData.push({ ...org, rate: null, total: 0, responded: 0, status: 'nodata' });
      }
    });
    withData.sort((a, b) => a.rate - b.rate); // worst first — most actionable
    noData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return [...withData, ...noData];
  }, [organizations, aggregateOrgOverDays, periodDayKeys]);

  const visibleOrgs = useMemo(() => {
    return showAllHeatmap ? heatmapRows : heatmapRows.slice(0, 8);
  }, [heatmapRows, showAllHeatmap]);

  // Network-wide summary for the stat-card row + bottom insights strip.
  const heatmapSummary = useMemo(() => {
    const withData = heatmapRows.filter((r) => r.rate !== null);
    const totalTargeted = withData.reduce((s, r) => s + r.total, 0);
    const totalResponded = withData.reduce((s, r) => s + r.responded, 0);
    const overallRate = totalTargeted > 0 ? Math.round((totalResponded / totalTargeted) * 100) : null;

    let prevTargeted = 0;
    let prevResponded = 0;
    let improved = 0;
    organizations.forEach((org) => {
      const orgId = org.id || org._id;
      const prev = aggregateOrgOverDays(orgId, prevPeriodDayKeys);
      prevTargeted += prev.total;
      prevResponded += prev.responded;
      if (prev.total > 0) {
        const prevRate = Math.round((prev.responded / prev.total) * 100);
        const current = withData.find((r) => String(r.id || r._id) === String(orgId));
        if (current && current.rate > prevRate) improved += 1;
      }
    });
    const prevRate = prevTargeted > 0 ? Math.round((prevResponded / prevTargeted) * 100) : null;
    const trend = overallRate !== null && prevRate !== null ? overallRate - prevRate : null;

    const top = withData.length ? withData.reduce((best, r) => (r.rate > best.rate ? r : best)) : null;
    const worst = withData.length ? withData.reduce((w, r) => (r.rate < w.rate ? r : w)) : null;
    const needsAttentionCount = withData.filter((r) => r.status === 'critical' || r.status === 'poor').length;

    return {
      overallRate, trend, top, worst, improved, needsAttentionCount,
      totalInstitutions: organizations.length,
      totalSpotChecks: totalTargeted,
    };
  }, [heatmapRows, organizations, aggregateOrgOverDays, prevPeriodDayKeys]);

  const handleExportHeatmap = useCallback(() => {
    if (!heatmapRows.length) {
      toast.error('No heatmap data to export');
      return;
    }
    const columns = [
      { label: 'Institution', get: (r) => r.name },
      ...heatmapDays.map((day) => ({
        label: day.label,
        get: (r) => {
          const b = (heatmapCellsByOrg[String(r.id || r._id)] || {})[day.key];
          return b && b.total ? Math.round((b.responded / b.total) * 100) : '';
        },
      })),
      { label: 'Overall %', get: (r) => (r.rate !== null ? r.rate : '') },
    ];
    downloadCsv(`spot-check-compliance-heatmap-${heatmapRangeDays}d.csv`, heatmapRows, columns);
  }, [heatmapRows, heatmapDays, heatmapCellsByOrg, heatmapRangeDays]);

  // Daily network-wide rate across the selected range, for the trend sparkline.
  const heatmapTrendSeries = useMemo(() => {
    return heatmapDays.map((day) => {
      let total = 0;
      let responded = 0;
      organizations.forEach((org) => {
        const orgId = org.id || org._id;
        const b = (heatmapCellsByOrg[String(orgId)] || {})[day.key];
        if (b) {
          total += b.total;
          responded += b.responded;
        }
      });
      return total > 0 ? Math.round((responded / total) * 100) : null;
    });
  }, [heatmapDays, organizations, heatmapCellsByOrg]);

  const filteredRounds = useMemo(() => {
    const baseFiltered = rounds.filter((round) => {
      const roundDate = new Date(round.issuedAt);
      
      if (customFromDate) {
        const fromDate = new Date(customFromDate);
        fromDate.setHours(0, 0, 0, 0);
        if (roundDate < fromDate) return false;
      }
      if (customToDate) {
        const toDate = new Date(customToDate);
        toDate.setHours(23, 59, 59, 999);
        if (roundDate > toDate) return false;
      }
      return true;
    });

    const sorted = [...baseFiltered].sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
    const result = [];
    const TIME_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const currentOrgId = current.organization?._id || current.organizationId;
      const currentTime = new Date(current.issuedAt).getTime();

      const isDuplicate = result.some((added) => {
        const addedOrgId = added.organization?._id || added.organizationId;
        if (addedOrgId !== currentOrgId) return false;

        const addedTime = new Date(added.issuedAt).getTime();
        return Math.abs(addedTime - currentTime) <= TIME_THRESHOLD_MS;
      });

      if (!isDuplicate) {
        result.push(current);
      }
    }

    return result;
  }, [rounds, customFromDate, customToDate]);

  // Scoped stats for modal (date-specific if a date cell was clicked, else overall)
  const modalStats = useMemo(() => {
    if (!selectedHeatmapOrg) return { total: 0, responded: 0, missed: 0, rate: null, isDay: false };
    const orgId = String(selectedHeatmapOrg.id || selectedHeatmapOrg._id);

    if (selectedHeatmapDay?.key) {
      const dayBucket = (heatmapCellsByOrg[orgId] || {})[selectedHeatmapDay.key];
      const total = dayBucket?.total ?? 0;
      const responded = dayBucket?.responded ?? 0;
      const missed = Math.max(0, total - responded);
      const rate = total > 0 ? Math.round((responded / total) * 100) : null;
      return { total, responded, missed, rate, isDay: true, label: selectedHeatmapDay.label, key: selectedHeatmapDay.key };
    }

    const total = selectedHeatmapOrg.total ?? 0;
    const responded = selectedHeatmapOrg.responded ?? 0;
    const missed = Math.max(0, total - responded);
    const rate = selectedHeatmapOrg.rate ?? null;
    return { total, responded, missed, rate, isDay: false };
  }, [selectedHeatmapOrg, selectedHeatmapDay, heatmapCellsByOrg]);

  // Filter spot checks by clicked date if applicable
  const displaySpotChecks = useMemo(() => {
    if (!selectedHeatmapDay?.key) return orgSpotChecks;
    return orgSpotChecks.filter((sc) => {
      if (!sc.issuedAt) return false;
      return dayKeyOf(sc.issuedAt) === selectedHeatmapDay.key;
    });
  }, [orgSpotChecks, selectedHeatmapDay]);

  return (
    <div className="w-full min-w-0 space-y-6 overflow-x-hidden">
      {/* Premium Enterprise Hero Section */}
      <div className="relative overflow-hidden rounded-[24px] border border-emerald-100/80 bg-gradient-to-r from-emerald-50/70 via-teal-50/30 to-emerald-50/20 p-6 sm:p-7 shadow-xs">
        {/* Subtle background glow elements */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="pointer-events-none absolute left-1/3 bottom-0 h-40 w-40 rounded-full bg-teal-400/10 blur-2xl" />

        <div className="relative flex flex-col space-y-6">
          {/* Header Row */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/20">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                  Spot Checks Network Control
                </h1>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  Instant biometric verification sweeps across institutions to verify staff presence.
                </p>
              </div>
            </div>

            <button
              onClick={() => { loadOrgs(); loadRounds(); }}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-200/80 bg-white px-4 text-xs font-bold text-emerald-800 shadow-xs hover:border-emerald-300 hover:bg-emerald-50/50 transition-all cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-emerald-600 ${(loadingOrgs || loadingRounds) ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>

          {/* KPI Cards Grid (3 Cards) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Card 1: Active Institutions */}
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-emerald-300 hover:shadow-md">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100/80 font-bold">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Active Institutions
                </p>
                <p className="text-2xl sm:text-3xl font-black font-mono text-slate-900 leading-tight">
                  {organizations.length}
                </p>
              </div>
            </div>

            {/* Card 2: Manual Spot Checks */}
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-teal-300 hover:shadow-md">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 border border-teal-100/80 font-bold">
                <Play className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Manual Checks Triggered
                </p>
                <p className="text-2xl sm:text-3xl font-black font-mono text-slate-900 leading-tight">
                  {rounds.filter((r) => r.triggeredBy === 'manual').length}
                </p>
              </div>
            </div>

            {/* Card 3: Avg Response Rate */}
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-amber-300 hover:shadow-md">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100/80 font-bold">
                <Clock className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Avg Response Rate
                </p>
                <p className="text-2xl sm:text-3xl font-black font-mono text-slate-900 leading-tight">
                  {avgResponseRate}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spot Check Compliance Heatmap Section */}
      <div className="overflow-hidden rounded-[20px] border border-slate-150 bg-white shadow-sm dark:bg-slate-900/60 dark:border-slate-800/80">
        {/* Compliance-spectrum accent — critical→excellent, a colorful cue without a heavy banner */}
        <div className="h-[3px] w-full bg-gradient-to-r from-red-400 via-amber-400 via-40% to-emerald-400" />
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 dark:border-slate-800/80 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h2 className="flex items-center gap-1.5 text-[17px] font-extrabold leading-none tracking-tight text-slate-900 dark:text-slate-100">
                Spot Check Compliance Heatmap
                <Info className="h-3.5 w-3.5 text-slate-300" title="Verification response rate per institution, per day" />
              </h2>
              <p className="mt-1.5 text-[12.5px] font-medium leading-snug text-slate-500 dark:text-slate-400">
                Compliance health by institution and day, from biometric spot-check response rates.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  const d = new Date(heatmapEndDate);
                  d.setDate(d.getDate() - heatmapRangeDays);
                  setHeatmapEndDate(d);
                }}
                className="px-2 py-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
                title="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800" />
              <button
                type="button"
                onClick={() => {
                  const d = new Date(heatmapEndDate);
                  d.setDate(d.getDate() + heatmapRangeDays);
                  const now = new Date();
                  setHeatmapEndDate(d > now ? now : d);
                }}
                disabled={heatmapEndDate.toDateString() === new Date().toDateString()}
                className="px-2 py-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                title="Next period"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <select
              value={heatmapRangeDays}
              onChange={(e) => {
                setHeatmapRangeDays(Number(e.target.value));
                setHeatmapEndDate(new Date()); // reset to today when range changes
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 outline-none transition focus:border-[#4F46E5] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 shadow-sm"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
            <button
              type="button"
              onClick={handleExportHeatmap}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
        </div>

        {/* Summary stat cards — all scoped to the same selected date range */}
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-6 dark:border-slate-800/80 sm:grid-cols-3 lg:grid-cols-5">
          <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm dark:border-indigo-500/20 dark:from-indigo-950/30 dark:to-slate-900">
            <RingMeter
              percentage={heatmapSummary.overallRate}
              color={heatmapSummary.overallRate === null ? '#CBD5E1' : BAND_STYLE[bandOf(heatmapSummary.overallRate)].dot}
              size={52}
              strokeWidth={5}
            />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Overall Compliance</p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
                {heatmapSummary.overallRate !== null ? `${heatmapSummary.overallRate}%` : '—'}
              </p>
              {heatmapSummary.trend !== null && (
                <p className={`flex items-center gap-0.5 text-[11px] font-bold ${heatmapSummary.trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {heatmapSummary.trend > 0 ? <TrendingUp className="h-3 w-3" /> : heatmapSummary.trend < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                  {heatmapSummary.trend > 0 ? '+' : ''}{heatmapSummary.trend}% vs prior {heatmapRangeDays}d
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm dark:border-sky-500/20 dark:from-sky-950/30 dark:to-slate-900">
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500 text-white shadow-sm">
              <Star className="h-3.5 w-3.5" fill="currentColor" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">Top Performing</p>
            <p className="truncate text-base font-extrabold text-slate-900 dark:text-white">{heatmapSummary.top?.name || '—'}</p>
            <p className="text-[11px] font-semibold text-sky-700/70 dark:text-sky-300/70">
              {heatmapSummary.top ? `${heatmapSummary.top.rate}% avg compliance` : 'No data yet'}
            </p>
          </div>

          <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-4 shadow-sm dark:border-rose-500/20 dark:from-rose-950/30 dark:to-slate-900">
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500 text-white shadow-sm">
              <AlertCircle className="h-3.5 w-3.5" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Needs Attention</p>
            <p className="truncate text-base font-extrabold text-slate-900 dark:text-white">{heatmapSummary.worst?.name || '—'}</p>
            <p className="text-[11px] font-semibold text-rose-700/70 dark:text-rose-300/70">
              {heatmapSummary.worst ? `${heatmapSummary.worst.rate}% avg compliance` : 'No data yet'}
            </p>
          </div>

          <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm dark:border-violet-500/20 dark:from-violet-950/30 dark:to-slate-900">
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500 text-white shadow-sm">
              <Users className="h-3.5 w-3.5" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">Total Institutions</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{heatmapSummary.totalInstitutions}</p>
            <p className="text-[11px] font-semibold text-violet-700/70 dark:text-violet-300/70">Active in network</p>
          </div>

          <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-4 shadow-sm dark:border-teal-500/20 dark:from-teal-950/30 dark:to-slate-900">
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500 text-white shadow-sm">
              <Activity className="h-3.5 w-3.5" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">Total Spot Checks</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{heatmapSummary.totalSpotChecks.toLocaleString()}</p>
            <p className="text-[11px] font-semibold text-teal-700/70 dark:text-teal-300/70">This period</p>
          </div>
        </div>

        {/* Heatmap Grid — organizations x day, band-colored with the rate printed in every cell */}
        <div className="p-6 sm:p-8 bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-900 dark:via-slate-900/90 dark:to-indigo-950/20 relative">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02] dark:opacity-5 pointer-events-none" />
          {organizations.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No institutions yet"
              description="Once institutions are onboarded, their compliance will appear here."
            />
          ) : (
            <div className="overflow-x-auto pb-1">
              <div className="inline-block min-w-full">
                <div className="flex flex-col gap-1.5 relative z-10 w-max">
                  {/* Header row */}
                  <div className="flex items-end gap-1.5 mb-2 pl-2">
                    <div className="w-[210px] shrink-0 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Institution</div>
                    {heatmapDays.map((day, idx) => {
                      return (
                        <div key={`hdr-${day.key}`} className="w-[42px] shrink-0 relative h-9">
                          <span className="absolute bottom-0 left-1/2 origin-bottom-left -translate-x-1/2 -rotate-45 whitespace-nowrap text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                            {day.label}
                          </span>
                        </div>
                      );
                    })}
                    <div className="w-[80px] shrink-0 px-2 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Overall</div>
                  </div>

                  {/* One row per organization, worst compliance first */}
                  {visibleOrgs.map((org, rowIdx) => {
                    const orgId = String(org.id || org._id);
                    const orgDays = heatmapCellsByOrg[orgId] || {};
                    const overallStyle = BAND_STYLE[org.status] || BAND_STYLE.nodata;
                    return (
                      <div
                        key={`row-${orgId}`}
                        className="group/row flex items-center gap-1.5 rounded-2xl p-1.5 -ml-1.5 transition-all duration-300 hover:bg-slate-100/80 hover:shadow-[inset_0_1px_3px_rgba(0,0,0,0.03)] dark:hover:bg-slate-800/50"
                      >
                        <button
                          type="button"
                          onClick={() => handleHeatmapOrgClick(org)}
                          className="w-[210px] shrink-0 flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-all hover:bg-white hover:shadow-md hover:shadow-indigo-500/5 dark:hover:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 group/rowbtn border border-transparent hover:border-indigo-100 dark:hover:border-indigo-500/20"
                          title={org.name}
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-slate-100 text-slate-400 transition-colors group/row:bg-white group/row:shadow-sm group-hover/rowbtn:bg-indigo-100 group-hover/rowbtn:text-indigo-600 dark:bg-slate-800 dark:group/row:bg-slate-900 dark:group-hover/rowbtn:bg-indigo-500/20 dark:group-hover/rowbtn:text-indigo-400">
                            <Building2 className="h-3.5 w-3.5" />
                          </div>
                          <span className="min-w-0 flex-1 truncate text-[12.5px] font-extrabold text-slate-700 transition-colors group-hover/rowbtn:text-indigo-900 dark:text-slate-300 dark:group-hover/rowbtn:text-indigo-300">
                            {org.name}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover/rowbtn:opacity-100" />
                        </button>

                        {heatmapDays.map((day, colIdx) => {
                          const bucket = orgDays[day.key];
                          const { status, rate } = cellStatus(bucket?.total, bucket?.responded);
                          const style = BAND_STYLE[status];
                          const tooltip = bucket?.total
                            ? `${org.name} · ${day.label} — ${rate}% (${bucket.responded}/${bucket.total} verified)`
                            : `${org.name} · ${day.label} — no spot checks`;
                          return (
                            <div
                              key={`cell-${orgId}-${day.key}`}
                              className="w-[42px] shrink-0 group/cell relative animate-fadeUp opacity-0"
                              style={{ animationDelay: `${Math.min(rowIdx * 30 + colIdx * 12, 600)}ms` }}
                            >
                              <button
                                type="button"
                                onClick={() => handleHeatmapOrgClick(org, day)}
                                aria-label={tooltip}
                                style={{
                                  background: status === 'nodata' ? 'transparent' : `linear-gradient(135deg, ${style.from}, ${style.to})`,
                                  color: status === 'nodata' ? '#94A3B8' : style.text,
                                  boxShadow: status === 'nodata' ? 'none' : `0 4px 12px ${style.from}60, inset 0 1px 1px rgba(255,255,255,0.3)`,
                                }}
                                className={`flex h-[42px] w-[42px] items-center justify-center rounded-[12px] text-[12.5px] font-extrabold transition-all duration-300 ease-out hover:z-10 hover:-translate-y-0.5 hover:shadow-lg focus:z-10 focus:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[#4F46E5]/30 ${
                                  status === 'nodata' ? 'border border-slate-200 border-dashed dark:border-slate-700 hover:border-slate-300 hover:bg-white dark:hover:bg-slate-800' : 'hover:brightness-110'
                                } ${status === 'critical' ? 'animate-live-pulse border border-red-300 dark:border-red-500/50' : 'border border-transparent'}`}
                              >
                                {rate !== null ? `${rate}%` : '·'}
                              </button>
                              <div
                                role="tooltip"
                                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-1.5 text-center text-[11.5px] font-bold leading-snug text-white opacity-0 shadow-xl transition-all duration-200 group-hover/cell:opacity-100 group-hover/cell:-translate-y-1 group-focus-within/cell:opacity-100 dark:bg-slate-700"
                              >
                                {tooltip}
                              </div>
                            </div>
                          );
                        })}

                        <div className="w-[80px] shrink-0 flex items-center justify-end gap-2 px-2">
                          <span className="text-[14px] font-black" style={{ color: overallStyle.ink }}>
                            {org.rate !== null ? `${org.rate}%` : '—'}
                          </span>
                          <span
                            className={`h-3 w-3 shrink-0 rounded-full shadow-sm ring-2 ring-white group-hover/row:ring-slate-100 dark:ring-slate-900 dark:group-hover/row:ring-slate-800 ${org.status === 'critical' ? 'animate-live-pulse' : ''}`}
                            style={{ backgroundColor: overallStyle.dot }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {heatmapRows.length > 8 && (
            <div className="flex justify-center mt-6 pt-4 border-t border-slate-150 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => setShowAllHeatmap(!showAllHeatmap)}
                className="inline-flex items-center gap-1.5 px-4.5 py-2 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl transition-all duration-200 shadow-sm"
              >
                {showAllHeatmap ? 'Show Less' : `Show All (${heatmapRows.length})`}
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${showAllHeatmap ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* Footer: compliance scale legend + insights + trend */}
        <div className="flex flex-col gap-4 border-t border-slate-100 p-5 dark:border-slate-800/80 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Compliance Scale</span>
            {[...BAND_ORDER, 'nodata'].map((key) => (
              <div key={key} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BAND_STYLE[key].dot }} />
                {BAND_STYLE[key].label} {BAND_STYLE[key].range && `(${BAND_STYLE[key].range})`}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-6">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <TrendingUp className="h-3 w-3 text-emerald-500" /> Insights
              </p>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span className="font-extrabold text-emerald-600">{heatmapSummary.improved}</span> institution{heatmapSummary.improved === 1 ? '' : 's'} improved
              </p>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span className="font-extrabold text-red-600">{heatmapSummary.needsAttentionCount}</span> need{heatmapSummary.needsAttentionCount === 1 ? 's' : ''} attention
              </p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Trend (vs prior {heatmapRangeDays}d)
              </p>
              <div className="flex items-center gap-2">
                <Sparkline
                  values={heatmapTrendSeries}
                  color={heatmapSummary.trend === null || heatmapSummary.trend >= 0 ? '#6AA51F' : '#DC2626'}
                />
                {heatmapSummary.trend !== null && (
                  <span className={`text-sm font-extrabold ${heatmapSummary.trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {heatmapSummary.trend > 0 ? '+' : ''}{heatmapSummary.trend}%
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Organization Selection List */}
        <Card
          className="lg:col-span-12 h-[520px] flex flex-col"
          bodyClassName="flex-1 min-h-0 flex flex-col"
          noPadding
        >
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
              Step 1: Select Target Institutions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select one or more institutions to receive the spot check notification.
            </p>

            {/* Search and Shortcuts */}
            <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-2.5 h-4.5 w-4.5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by name or state..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-900/50 dark:focus:border-amber-500 dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="px-2.5 py-2 font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-amber-400 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 rounded-lg transition"
                >
                  Select All Filtered
                </button>
                <button
                  type="button"
                  onClick={handleClearAllFiltered}
                  className="px-2.5 py-2 font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition"
                >
                  Clear Filtered
                </button>
              </div>
            </div>
          </div>

          {/* Org List Area */}
          <div className="flex-1 overflow-y-auto min-h-0 sidebar-scroll px-4 py-2 space-y-1">
            {loadingOrgs ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
                <RefreshCw className="h-6 w-6 animate-spin" />
                <span className="text-sm">Loading organizations...</span>
              </div>
            ) : filteredOrgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Building2 className="h-8 w-8 mb-2 opacity-40" />
                <span className="text-sm">No institutions match your search</span>
              </div>
            ) : (
              filteredOrgs.map((org) => {
                const orgId = org.id || org._id;
                const isSelected = selectedOrgs.has(orgId);
                return (
                  <div
                    key={orgId}
                    onClick={() => handleToggleSelect(orgId)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all duration-150 ${isSelected
                      ? 'border-emerald-500 bg-emerald-50/20 dark:border-amber-500 dark:bg-amber-950/10'
                      : 'border-slate-150 hover:border-slate-350 dark:border-slate-800/80 dark:hover:border-slate-700 bg-transparent'
                      }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${isSelected
                        ? 'border-emerald-600 bg-emerald-600 text-white dark:border-amber-500 dark:bg-amber-500'
                        : 'border-slate-300 dark:border-slate-700'
                        }`}>
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {org.name}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-2">
                          <span className="bg-slate-100 dark:bg-slate-855 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase">
                            {org.type}
                          </span>
                          <span>{org.state}</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 justify-end">
                        <Users className="h-3.5 w-3.5 opacity-60" />
                        {org.staff || 0}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        Active staff
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/80 rounded-b-2xl flex justify-between items-center shrink-0">
            <div className="flex items-center gap-4 text-xs">
              <span className="font-medium text-slate-500 dark:text-slate-400">
                Selected: <strong className="text-emerald-700 dark:text-amber-400 text-sm">{selectedOrgs.size}</strong> institutions
              </span>
              <button
                onClick={() => setSelectedOrgs(new Set())}
                disabled={selectedOrgs.size === 0}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                Clear Selection
              </button>
            </div>

            <button
              type="button"
              disabled={selectedOrgs.size === 0 || triggering}
              onClick={() => setShowConfirm(true)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-555 hover:to-emerald-650 text-white dark:from-amber-500 dark:to-amber-600 dark:hover:from-amber-450 dark:hover:to-amber-550 px-5 py-2 text-sm font-bold shadow-md shadow-emerald-700/10 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
            >
              {triggering ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Triggering...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Trigger Spot Check
                </>
              )}
            </button>
          </div>
        </Card>
      </div>

      {/* Confirmation Dialog Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <Card className="w-full max-w-md p-6 relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl animate-scaleUp">
            <button
              onClick={() => setShowConfirm(false)}
              className="absolute right-4 top-4 text-slate-450 hover:text-slate-650 dark:text-slate-500 dark:hover:text-slate-350 transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400 mb-4 animate-bounce">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Confirm Spot Check Trigger
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                You are about to trigger a manual, instant biometric verification round for{' '}
                <strong className="text-slate-800 dark:text-slate-200">{selectedOrgs.size}</strong> selected organization{selectedOrgs.size !== 1 ? 's' : ''}.
              </p>

              {/* Rules Summary Box */}
              <div className="w-full bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850 my-4 text-left space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-455 dark:text-slate-500">Target Range:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {onlyCheckedIn ? 'Checked-In Staff' : 'All Staff'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-455 dark:text-slate-500">Audience:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    All eligible staff
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-455 dark:text-slate-500">Response Window:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                    {windowMinutes} minutes
                  </span>
                </div>
              </div>

              <div className="flex gap-3 w-full mt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-655 font-semibold text-sm transition dark:border-slate-850 dark:hover:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTriggerSpotCheck}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-555 text-white font-semibold text-sm transition dark:bg-amber-500 dark:hover:bg-amber-450"
                >
                  Confirm & Send
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Rounds History */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
              Spot Checks History
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Active and expired spot checks rounds issued manually or automatically.
            </p>
          </div>

          {/* Controls Area: Filters + Refresh */}
          <div className="flex flex-wrap items-center gap-3 self-start lg:self-center">
            {/* Filter Preset Dropdown and Inputs */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-slate-555 dark:text-slate-400">Filter:</span>
              <select
                value={historyFilter}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-[125px] px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-355 focus:border-emerald-500 outline-none transition cursor-pointer shadow-sm"
              >
                <option value="" disabled hidden>Select Preset</option>
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Past Week</option>
                <option value="2weeks">Past 2 Weeks</option>
                <option value="month">Past Month</option>
              </select>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-555 dark:text-slate-400 font-bold">From:</span>
                <input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => {
                    setCustomFromDate(e.target.value);
                    setHistoryFilter('');
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-355 focus:border-emerald-500 outline-none transition shadow-sm w-[115px] sm:w-[125px]"
                />
                <span className="text-xs text-slate-555 dark:text-slate-400 font-bold">To:</span>
                <input
                  type="date"
                  value={customToDate}
                  onChange={(e) => {
                    setCustomToDate(e.target.value);
                    setHistoryFilter('');
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-355 focus:border-emerald-500 outline-none transition shadow-sm w-[115px] sm:w-[125px]"
                />
              </div>
            </div>

            <button
              onClick={loadRounds}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350 dark:hover:bg-slate-800 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingRounds ? 'animate-spin' : ''}`} />
              Refresh History
            </button>
          </div>
        </div>

        {/* Table Area */}
        <div className="overflow-x-auto">
          {loadingRounds ? (
            <div className="flex flex-col items-center justify-center p-12 gap-3 text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span className="text-sm">Loading spot checks history...</span>
            </div>
          ) : rounds.length === 0 ? (
            <div className="p-12 text-center">
              <EmptyState
                title="No spot checks found"
                description="Manual or automatic spot check rounds will list here once issued."
                icon={UserCheck}
              />
            </div>
          ) : filteredRounds.length === 0 ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400 font-semibold text-sm">
              No spot check rounds match the selected date filter.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-sm text-slate-655 dark:text-slate-350">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-455 dark:text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/80">
                <tr>
                  <th className="px-5 py-3.5">Target Organization</th>
                  <th className="px-5 py-3.5">Issued At</th>
                  <th className="px-5 py-3.5">Audience & Compliance Progress</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredRounds.map((round, idx) => {
                  const totalEmployees = round.total;
                  const responsePercent = totalEmployees > 0 ? Math.round((round.responded / totalEmployees) * 100) : 0;
                  const isExpired = new Date(round.expiresAt) < new Date();

                  // Compute Status pill
                  let statusLabel = 'Active';
                  let statusStyle = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-455';
                  if (round.pending === 0 || isExpired) {
                    statusLabel = 'Completed';
                    statusStyle = 'bg-slate-100 text-slate-650 dark:bg-slate-850 dark:text-slate-400';
                  }

                  return (
                    <tr
                      key={`${round.roundId}-${idx}`}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors"
                    >
                      <td className="px-5 py-4 font-semibold text-slate-800 dark:text-slate-200">
                        {round.organization?.name || 'Unknown Institution'}
                      </td>


                      <td className="px-5 py-4 text-xs text-slate-450 dark:text-slate-500">
                        {fmtTime(round.issuedAt)}
                      </td>
                      <td className="px-5 py-4 min-w-[200px]">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-555 dark:text-slate-455 mb-1">
                          <span>
                            {round.responded} / {totalEmployees} Responded
                            {round.pending > 0 && ` (${round.pending} pending)`}
                          </span>
                          <span className="font-mono text-slate-700 dark:text-slate-300">
                            {responsePercent}%
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                          <div
                            className="bg-emerald-500 h-full transition-all duration-300"
                            style={{ width: `${responsePercent}%` }}
                            title={`${round.responded} responded`}
                          />
                          <div
                            className="bg-red-400 h-full transition-all duration-300"
                            style={{ width: `${totalEmployees > 0 ? (round.missed / totalEmployees) * 100 : 0}%` }}
                            title={`${round.missed} missed`}
                          />
                          <div
                            className="bg-amber-350 h-full transition-all duration-300"
                            style={{ width: `${totalEmployees > 0 ? (round.pending / totalEmployees) * 100 : 0}%` }}
                            title={`${round.pending} pending`}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Drilldown Modal for Organization Spot Checks Details */}
      {selectedHeatmapOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col p-0 relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl animate-scaleUp overflow-hidden rounded-[24px]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#162B63] to-[#233C8C] p-6 text-white shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md">
                  <Building2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold leading-none tracking-tight flex items-center gap-2.5 flex-wrap">
                    <span>{selectedHeatmapOrg.name} Spot Check Details</span>
                    {modalStats.isDay && (
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                        Date: {modalStats.label}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs font-medium text-white/80 mt-1.5 leading-none">
                    {modalStats.isDay
                      ? `Spot check participation log for ${modalStats.label} (${modalStats.key}).`
                      : 'Spot check participation log for all targeted employees (overall period).'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedHeatmapOrg(null);
                  setSelectedHeatmapDay(null);
                }}
                className="text-white/85 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Stats Overview */}
            <div className="p-6 pb-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-150 dark:border-slate-850 flex flex-wrap gap-4 items-center justify-between shrink-0">
              <div className="flex flex-wrap gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 px-4 py-2.5 rounded-2xl shadow-sm min-w-[120px]">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                    {modalStats.isDay ? 'Targeted on Date' : 'Total Targeted'}
                  </span>
                  <span className="text-xl font-extrabold text-slate-850 dark:text-slate-100 font-mono">
                    {modalStats.total}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 px-4 py-2.5 rounded-2xl shadow-sm min-w-[120px]">
                  <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider block">Responded</span>
                  <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                    {modalStats.responded}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 px-4 py-2.5 rounded-2xl shadow-sm min-w-[120px]">
                  <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider block">Missed</span>
                  <span className="text-xl font-extrabold text-red-600 dark:text-red-400 font-mono">
                    {modalStats.missed}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 px-4 py-2.5 rounded-2xl shadow-sm min-w-[120px]">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Compliance Rate</span>
                  <span className="text-xl font-extrabold text-slate-850 dark:text-slate-100 font-mono">
                    {modalStats.rate !== null ? `${modalStats.rate}%` : '—'}
                  </span>
                </div>
              </div>

              {/* Search, Filter & View All Dates Inputs */}
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto mt-2 md:mt-0">
                {modalStats.isDay && (
                  <button
                    onClick={() => setSelectedHeatmapDay(null)}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition cursor-pointer whitespace-nowrap dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300"
                  >
                    View All Dates
                  </button>
                )}
                <div className="relative w-full sm:w-60 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search staff..."
                    value={orgChecksSearchQuery}
                    onChange={(e) => setOrgChecksSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-4 text-xs outline-none transition focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:focus:border-amber-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <select
                  value={orgChecksStatusFilter}
                  onChange={(e) => setOrgChecksStatusFilter(e.target.value)}
                  className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-355 outline-none transition cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="responded">Responded</option>
                  <option value="missed">Missed</option>
                  <option value="pending">Pending</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>
            </div>

            {/* Modal Body / Table Log */}
            <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-6 pt-0">
              {loadingOrgChecks ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                  <span className="text-sm">Loading spot check details...</span>
                </div>
              ) : displaySpotChecks.length === 0 ? (
                <div className="py-12 text-center text-slate-500 dark:text-slate-400 font-semibold text-sm">
                  {modalStats.isDay
                    ? `No spot check records found for ${modalStats.label} (${modalStats.key}).`
                    : 'No spot check records found for this organization.'}
                </div>
              ) : (() => {
                // Client-side search and status filters
                const filtered = displaySpotChecks.filter((sc) => {
                  const matchesStatus = orgChecksStatusFilter === 'all' || sc.status === orgChecksStatusFilter;
                  const studentName = (sc.student?.fullName || '').toLowerCase();
                  const studentUid = (sc.student?.uid || '').toLowerCase();
                  const studentDept = (sc.student?.department || '').toLowerCase();
                  const studentDesg = (sc.student?.designation || '').toLowerCase();
                  const query = orgChecksSearchQuery.toLowerCase();
                  const matchesSearch = 
                    studentName.includes(query) || 
                    studentUid.includes(query) || 
                    studentDept.includes(query) || 
                    studentDesg.includes(query);
                  return matchesStatus && matchesSearch;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-500 dark:text-slate-400 font-semibold text-sm">
                      No spot checks match the search or filter criteria.
                    </div>
                  );
                }

                return (
                  <table className="w-full border-collapse text-left text-sm text-slate-655 dark:text-slate-350">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-455 dark:text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/80 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-2.5">Staff Member</th>
                        <th className="px-4 py-2.5">Department</th>
                        <th className="px-4 py-2.5">Issued At</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {filtered.map((sc, index) => {
                        let badgeStyle = 'bg-slate-100 text-slate-650 dark:bg-slate-850 dark:text-slate-400';
                        if (sc.status === 'responded') badgeStyle = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-450';
                        else if (sc.status === 'missed') badgeStyle = 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-450';
                        else if (sc.status === 'pending') badgeStyle = 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-450';

                        return (
                          <tr key={sc._id || index} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {sc.student?.fullName || 'Unknown'}
                              </div>
                              <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                                UID: {sc.student?.uid || '—'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                              {sc.student?.department || '—'}
                              {sc.student?.designation && (
                                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                  {sc.student.designation}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-500">
                              {fmtTime(sc.issuedAt)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${badgeStyle}`}>
                                {sc.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {sc.status === 'responded' ? (
                                <div className="space-y-0.5">
                                  <div className="text-slate-700 dark:text-slate-300 font-medium">
                                    Responded in {sc.responseLatencyMs ? `${Math.round(sc.responseLatencyMs / 1000)}s` : '—'}
                                  </div>
                                  <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                                    <span>Match: {sc.verificationScore ? `${sc.verificationScore}%` : '—'}</span>
                                    <span>•</span>
                                    <span>Face: {sc.faceVerified ? 'Verified' : 'Failed'}</span>
                                  </div>
                                </div>
                              ) : sc.status === 'pending' ? (
                                <span className="text-slate-400 dark:text-slate-500">Awaiting response...</span>
                              ) : sc.status === 'skipped' ? (
                                <span className="text-slate-400 dark:text-slate-500">{sc.reason || 'Skipped'}</span>
                              ) : (
                                <span className="text-red-500/80 dark:text-red-400/80 font-medium">No response</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-150 dark:border-slate-850 text-right shrink-0">
              <button
                type="button"
                onClick={() => setSelectedHeatmapOrg(null)}
                className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-350 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminSpotChecks;
