import React from 'react';

/**
 * Card
 * props:
 *  - title: string | node — optional header title
 *  - action: node — optional right-side header action
 *  - className: extra classes for the outer wrapper
 *  - bodyClassName: extra classes for the body
 *  - headerClassName: extra classes for the header row
 *  - noPadding: boolean — skip body padding entirely (useful for flush tables)
 */
const Card = ({
  title = null,
  action = null,
  className = '',
  bodyClassName = '',
  headerClassName = '',
  noPadding = false,
  children,
  ...rest
}) => {
  const hasHeader = title !== null || action !== null;

  return (
    <div
      className={`glass card-hover overflow-hidden transition-all duration-300 ${className}`}
      {...rest}
    >
      {hasHeader && (
        <div
          className={`flex items-center justify-between gap-4 border-b border-slate-100 bg-white/40 px-5 py-3.5 dark:border-slate-800/40 ${headerClassName}`}
        >
          {typeof title === 'string' ? (
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          ) : (
            <div className="min-w-0 flex-1">{title}</div>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={`${noPadding ? '' : 'p-5'} ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
};

export default Card;
