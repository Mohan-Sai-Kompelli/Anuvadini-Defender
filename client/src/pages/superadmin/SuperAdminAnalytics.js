import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BarChart3, TrendingUp, Sparkles, Network } from 'lucide-react';
import { Card, EmptyState, SkeletonCard } from '../../components/ui';

const SuperAdminAnalytics = () => {
  const [trend, setTrend] = useState([]);
  const [comparison, setComparison] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Default to the network's latest data date so charts are populated.
        const ov = await axios.get('/api/superadmin/overview');
        const end = ov.data.latestDate;
        const res = await axios.get('/api/superadmin/analytics', { params: { end, days: 14 } });
        setTrend(res.data.trend || []);
        setComparison(res.data.comparison || []);
      } catch {
        toast.error('Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const trendData = trend.map((t) => ({ date: t.date.slice(5), Present: t.present }));
  const compData = comparison.map((c) => ({ name: c.name.length > 16 ? c.name.slice(0, 15) + '…' : c.name, Rate: c.rate, Present: c.present }));

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-[#18233D] via-[#315CE8] to-[#0B1220] shadow-lg p-6 text-white">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #4A74F0, #6F8DF0, #2748C4)' }} />
        <div className="relative flex flex-col md:flex-row items-center gap-6 justify-between w-full z-10">
          <div className="flex flex-col md:flex-row items-center gap-4.5 text-center md:text-left">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-inner shrink-0">
              <BarChart3 className="h-7 w-7" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/20">
                Network Intelligence
              </span>
              <h1 className="text-2xl font-black tracking-tight text-white mt-1.5 leading-none font-display">Network Analytics</h1>
              <p className="mt-2 text-xs text-emerald-100/70 font-medium">
                Attendance trend &amp; institution comparison across the network
              </p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
      ) : (
        <>
          <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-250/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-450" /> Network Attendance Trend (present staff-days / day)
            </h3>
            {trendData.length === 0 ? <EmptyState title="No data" description="" /> : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="Present" stroke="#4A74F0" strokeWidth={3} dot={{ r: 3, strokeWidth: 1.5, fill: '#4A74F0' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-250/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Network className="h-5 w-5 text-emerald-600 dark:text-emerald-450" /> Institution Comparison — Attendance Rate (latest day)
            </h3>
            {compData.length === 0 ? <EmptyState title="No data" description="" /> : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compData} margin={{ top: 10, right: 20, left: -10, bottom: 60 }}>
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4A74F0" stopOpacity={0.9} />
                        <stop offset="95%" stopColor="#2748C4" stopOpacity={0.6} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10, fontWeight: '600' }} />
                    <Bar dataKey="Rate" fill="url(#barGrad)" radius={[4, 4, 0, 0]} name="Attendance %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SuperAdminAnalytics;
