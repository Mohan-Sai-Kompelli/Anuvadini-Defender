import React from 'react';
import { Inbox } from 'lucide-react';

/**
 * EmptyState — friendly placeholder for empty lists/tables.
 * props:
 *  - icon: Lucide icon component (default Inbox)
 *  - title: string (required)
 *  - message: string — optional supporting copy
 *  - action: node — optional action element
 */
const EmptyState = ({
  icon: Icon = Inbox,
  title,
  message = null,
  action = null,
  className = '',
}) => (
  <div
    className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}
  >
    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 shadow-inner dark:from-slate-800 dark:to-slate-700/50">
      <Icon className="h-7 w-7 text-slate-400 dark:text-slate-500" aria-hidden="true" />
    </div>
    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
    {message && (
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        {message}
      </p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
