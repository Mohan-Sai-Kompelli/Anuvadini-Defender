import React from 'react';

/**
 * Skeleton — shimmer placeholder block.
 * props: className (size with h-* / w-*)
 */
const Skeleton = ({ className = '', ...rest }) => (
  <div
    aria-hidden="true"
    className={`shimmer rounded-xl ${className}`}
    {...rest}
  />
);

/**
 * SkeletonTable — placeholder for tabular data.
 * props: rows (default 5), cols (default 4)
 */
export const SkeletonTable = ({ rows = 5, cols = 4, className = '' }) => (
  <div aria-hidden="true" role="presentation" className={`w-full space-y-3 ${className}`}>
    <div className="flex gap-4">
      {Array.from({ length: cols }).map((_, c) => (
        <Skeleton key={`h-${c}`} className="h-3.5 flex-1" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={`r-${r}`} className="flex gap-4">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={`c-${r}-${c}`} className="h-5 flex-1" />
        ))}
      </div>
    ))}
  </div>
);

/**
 * SkeletonCard — placeholder for a stat card.
 * props: lines (default 3)
 */
export const SkeletonCard = ({ lines = 3, className = '' }) => (
  <div
    aria-hidden="true"
    role="presentation"
    className={`rounded-xl border border-slate-200/80 bg-white p-5 space-y-3 dark:border-slate-700/60 dark:bg-slate-800 ${className}`}
  >
    <Skeleton className="h-3.5 w-1/3" />
    <Skeleton className="h-8 w-1/2" />
    {Array.from({ length: lines - 1 }).map((_, i) => (
      <Skeleton key={`l-${i}`} className={`h-3.5 ${i === lines - 2 ? 'w-2/3' : 'w-full'}`} />
    ))}
  </div>
);

export default Skeleton;
