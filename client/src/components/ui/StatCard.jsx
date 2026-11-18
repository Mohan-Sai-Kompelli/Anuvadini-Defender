import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import TiltCard from './TiltCard';

/**
 * StatCard — dashboard KPI tile.
 */

const ACCENT = {
  primary: {
    icon: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
    bar: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
    dot: 'bg-emerald-500',
  },
  success: {
    icon: 'bg-success-50 text-success-700 dark:bg-success-950/40 dark:text-success-400',
    bar: 'bg-gradient-to-r from-success-500 to-success-600',
    dot: 'bg-success-500',
  },
  warning: {
    icon: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    bar: 'bg-gradient-to-r from-amber-500 to-amber-600',
    dot: 'bg-amber-500',
  },
  danger: {
    icon: 'bg-danger-50 text-danger-700 dark:bg-danger-950/40 dark:text-danger-400',
    bar: 'bg-gradient-to-r from-danger-500 to-danger-600',
    dot: 'bg-danger-500',
  },
  info: {
    icon: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
    bar: 'bg-gradient-to-r from-sky-500 to-sky-600',
    dot: 'bg-sky-500',
  },
};

const StatCard = ({
  label,
  value,
  delta = null,
  deltaLabel = null,
  icon: Icon = null,
  accent = 'primary',
  className = '',
}) => {
  const hasDelta = typeof delta === 'number' && !Number.isNaN(delta);
  const isUp = hasDelta && delta > 0;
  const isDown = hasDelta && delta < 0;
  const theme = ACCENT[accent] ?? ACCENT.primary;

  return (
    <TiltCard
      className={`glass sheen card-hover relative min-h-[8.25rem] overflow-hidden transition-all duration-300 sm:min-h-[9.5rem] ${className}`}
      max={6}
    >
      {/* Top accent line */}
      <div className={`absolute inset-x-0 top-0 h-1 ${theme.bar}`} />
      
      {/* Dynamic line shimmer indicator */}
      <div className="absolute top-0 left-0 w-8 h-1 bg-white/60 blur-[1px] animate-[shimmer_2s_infinite]" />

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <span className={`h-2 w-2 rounded-full ${theme.dot}`} />
            <p className="min-w-0 break-words text-[10px] font-extrabold uppercase leading-4 tracking-wider text-slate-500 dark:text-slate-400 sm:text-[13px]">
              {label}
            </p>
          </div>
          {Icon && (
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-9 sm:w-9 transition-transform duration-300 group-hover:scale-110 shadow-sm ${theme.icon}`}>
              <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" aria-hidden="true" />
            </span>
          )}
        </div>

        <p className="mt-3 break-words text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white stat-mega sm:text-3xl">
          {value}
        </p>

        {hasDelta && (
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${
                isUp
                  ? 'bg-success-50 text-success-700 dark:bg-success-950/30 dark:text-success-400'
                  : isDown
                  ? 'bg-danger-50 text-danger-700 dark:bg-danger-950/30 dark:text-danger-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {isUp ? (
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              ) : isDown ? (
                <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
              ) : null}
              {isUp ? '+' : ''}{delta}
            </span>
            {deltaLabel && (
              <span className="text-xs text-slate-400 dark:text-slate-500">{deltaLabel}</span>
            )}
          </div>
        )}
      </div>
    </TiltCard>
  );
};

export default StatCard;

