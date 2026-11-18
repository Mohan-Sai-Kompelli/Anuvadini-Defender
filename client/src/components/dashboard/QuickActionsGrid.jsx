import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, CalendarDays, BarChart3, Clock, ArrowUpRight } from 'lucide-react';

const ACTIONS = [
  {
    icon: Users,
    title: 'Add Staff',
    description: 'Register faculty or doctor',
    gradient: 'from-emerald-500 to-teal-650',
    shadow: 'shadow-emerald-500/20',
    accentColor: '#4A74F0',
    href: '/students',
  },
  {
    icon: BarChart3,
    title: 'View Reports',
    description: 'Attendance & compliance',
    gradient: 'from-cyan-500 to-blue-650',
    shadow: 'shadow-cyan-500/20',
    accentColor: '#6F8DF0',
    href: '/reports',
  },
  {
    icon: CalendarDays,
    title: 'Timetable',
    description: 'Assign classes to faculty',
    gradient: 'from-amber-500 to-orange-650',
    shadow: 'shadow-amber-500/20',
    accentColor: '#f59e0b',
    href: '/timetable',
  },
  {
    icon: Clock,
    title: 'Attendance',
    description: 'Staff check-in records',
    gradient: 'from-purple-500 to-indigo-655',
    shadow: 'shadow-purple-500/20',
    accentColor: '#8b5cf6',
    href: '/attendance',
  },
];

const QuickActionsGrid = () => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.href}
            type="button"
            onClick={() => navigate(action.href)}
            className="group relative flex flex-col items-center gap-4 rounded-3xl overflow-hidden p-6 text-center bento-hover-anuvadini transition-all duration-300 focus:outline-none cursor-pointer"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.80))',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              border: '1px solid rgba(255,255,255,0.85)',
              boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 16px 36px -18px rgba(10,20,36,0.12)',
            }}
          >
            {/* Top accent dynamic color line */}
            <div className="absolute top-0 left-0 right-0 h-[2.5px] opacity-80 transition-all duration-300 group-hover:h-[4px]" 
              style={{ background: `linear-gradient(90deg, ${action.accentColor}, ${action.accentColor}cc)` }} />

            {/* Premium glass shimmer underlay */}
            <span className="shine-overlay-anuvadini rounded-3xl opacity-30" />

            {/* Glowing Icon Holder */}
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${action.gradient} text-white shadow-lg ${action.shadow} transition-all duration-300 group-hover:scale-110 group-hover:-translate-y-0.5`}>
              <Icon className="h-5 w-5 text-white" aria-hidden="true" />
            </div>

            {/* Texts */}
            <div className="z-10">
              <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100" style={{ fontFamily: "'Geist', sans-serif" }}>
                {action.title}
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-350 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-700 dark:text-slate-650 dark:group-hover:text-slate-300" aria-hidden="true" />
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-450 dark:text-slate-500 leading-tight">{action.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default QuickActionsGrid;
