import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { User, Building2, Hash, Briefcase, ShieldCheck, ShieldX, Mail, Users } from 'lucide-react';
import { Card, SkeletonCard } from '../../components/ui';

// Face is the only supported attendance method.
const BIOMETRICS = [
  { key: 'face', label: 'Face' },
];

const PARTICLES = Array.from({ length: 20 }).map((_, i) => ({
  w: 1 + (i % 3) * 0.8,
  l: `${(i * 53) % 100}%`,
  t: `${(i * 71) % 100}%`,
  dur: `${5 + (i % 5)}s`,
  delay: `${(i * 0.15) % 3}s`,
}));

const Row = ({ icon: Icon, label, value, colorClass }) => (
  <div className="flex items-center gap-4 py-3 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10 px-3.5 transition-colors rounded-2xl">
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${colorClass || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-450 border-slate-200'}`}>
      <Icon className="h-5 w-5" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className="truncate text-sm font-bold text-slate-850 dark:text-slate-150 mt-0.5">{value || '—'}</p>
    </div>
  </div>
);

const FacultyProfile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get('/api/portal/me');
        setProfile(data.profile);
      } catch {
        toast.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const bio = profile?.selectedBiometrics || {};

  return (
    <div className="space-y-8">
      {/* Identity Band with Rich Gradient Mesh */}
      <div 
        className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 p-8 text-white shadow-xl shadow-teal-600/10"
        style={{
          background: 'linear-gradient(135deg, #0B1220 0%, #101827 35%, #315CE8 65%, #0B1220 100%)'
        }}
      >
        {/* Atmospheric glows */}
        <div className="absolute -top-16 left-1/3 w-72 h-72 rounded-full pointer-events-none atmo-glow-gold opacity-60" />
        <div className="absolute -bottom-16 right-1/4 w-72 h-72 rounded-full pointer-events-none atmo-glow-cyan opacity-50" />

        {/* Animated light particles */}
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white pointer-events-none"
            style={{
              width: p.w, height: p.w,
              left: p.l, top: p.t,
              boxShadow: '0 0 6px rgba(255,255,255,0.6)',
              opacity: 0.4,
              animation: `floatY ${p.dur} ease-in-out infinite`,
              animationDelay: p.delay,
            }}
          />
        ))}

        {/* Chrome scan line */}
        <div className="chrome-scan" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md text-3xl font-extrabold shadow-inner border border-white/20">
            {profile?.fullName?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="text-center md:text-left flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight truncate">{profile?.fullName}</h1>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur-sm border border-white/10">
                {profile?.role}
              </span>
            </div>
            <p className="mt-2 text-sm text-emerald-100/90 font-medium">
              {profile?.designation || (profile?.role === 'staff' ? 'Staff Member' : 'Faculty Member')}
              {profile?.department ? ` · ${profile.department}` : ''}
            </p>
            <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-4 text-xs font-semibold text-white/90">
              <span className="flex items-center gap-1.5">
                <Hash className="h-4 w-4 text-amber-300" /> UID: {profile?.uid || '—'}
              </span>
              <span className="flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-amber-300" /> {profile?.email}
              </span>
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-amber-300" /> {profile?.organization?.name}
              </span>
            </div>
          </div>
        </div>

        {/* Shine sweep */}
        <span className="shine-overlay-anuvadini rounded-3xl" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl shadow-slate-250/10 dark:shadow-none">
          <h3 className="text-lg font-bold text-slate-850 dark:text-slate-150 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
            <User className="h-5 w-5 text-emerald-600 dark:text-emerald-450" />
            Personal &amp; Work Details
          </h3>
          <div className="space-y-1">
            <Row icon={Hash} label="Employee UID" value={profile?.uid} colorClass="bg-indigo-50 text-indigo-600 border-indigo-100/50 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/30" />
            <Row icon={Mail} label="Email Address" value={profile?.email} colorClass="bg-sky-50 text-sky-600 border-sky-100/50 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-900/30" />
            <Row icon={Briefcase} label="Designation" value={profile?.designation} colorClass="bg-amber-50 text-amber-600 border-amber-100/50 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/30" />
            <Row icon={Users} label="Department" value={profile?.department} colorClass="bg-rose-50 text-rose-600 border-rose-100/50 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/30" />
            <Row icon={Building2} label="Institution" value={profile?.organization?.name} colorClass="bg-emerald-50 text-emerald-600 border-emerald-100/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/30" />
            <Row icon={User} label="Gender / Age" value={[profile?.gender, profile?.age].filter(Boolean).join(' · ')} colorClass="bg-violet-50 text-violet-600 border-violet-100/50 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-900/30" />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl shadow-slate-250/10 dark:shadow-none">
          <h3 className="text-lg font-bold text-slate-850 dark:text-slate-150 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-4 mb-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-450" />
            Biometric Enrollment
          </h3>
          <p className="mb-4 text-xs text-slate-400 dark:text-slate-500 font-medium">
            Below are the verification methods enabled for your account to sign check-ins and check-outs in the mobile app.
          </p>
          <ul className="space-y-2.5">
            {BIOMETRICS.map((b) => {
              const on = !!bio[b.key];
              return (
                <li key={b.key} className="flex items-center justify-between rounded-2xl border border-slate-200/70 p-3.5 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 hover:border-slate-350 dark:hover:border-slate-700 transition-colors">
                  <span className="text-sm font-semibold text-slate-750 dark:text-slate-250">{b.label} Method</span>
                  {on ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50 shadow-sm shadow-emerald-500/5">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" /> Enabled
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400 border border-slate-200/60 dark:bg-slate-800/40 dark:text-slate-500 dark:border-slate-800">
                      <ShieldX className="h-4 w-4 text-slate-400" /> Off
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-5 flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-450 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100/65 dark:border-emerald-900/25 rounded-2xl p-4 shadow-inner">
            <ShieldCheck className="h-4 w-4 shrink-0" /> Account status is active. Biometric verification is required for all actions.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FacultyProfile;
