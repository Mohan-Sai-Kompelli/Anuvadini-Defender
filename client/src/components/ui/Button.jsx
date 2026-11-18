import React from 'react';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary:
    'bg-gradient-to-b from-primary-500 to-primary-600 text-white shadow-sm shadow-primary-700/20 hover:from-primary-600 hover:to-primary-700 focus-visible:ring-primary-500 dark:from-primary-500 dark:to-primary-600 dark:hover:from-primary-400 dark:hover:to-primary-500',
  secondary:
    'bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-slate-400 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600',
  outline:
    'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus-visible:ring-primary-500 dark:border-slate-600 dark:bg-transparent dark:text-slate-200 dark:hover:border-primary-500 dark:hover:bg-slate-800 dark:hover:text-primary-300',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  danger:
    'bg-gradient-to-b from-danger-500 to-danger-600 text-white shadow-sm shadow-danger-700/20 hover:from-danger-600 hover:to-danger-700 focus-visible:ring-danger-500',
  success:
    'bg-gradient-to-b from-success-500 to-success-600 text-white shadow-sm shadow-success-700/20 hover:from-success-600 hover:to-success-700 focus-visible:ring-success-500',
};

const SIZES = {
  xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-lg',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-6 text-base gap-2.5 rounded-xl',
};

const ICON_SIZES = {
  xs: 'h-3 w-3',
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

/**
 * Button
 * props:
 *  - variant: 'primary'|'secondary'|'outline'|'ghost'|'danger'|'success'
 *  - size: 'xs'|'sm'|'md'|'lg'
 *  - loading: boolean
 *  - icon: Lucide icon component
 */
const Button = React.forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    icon: Icon = null,
    type = 'button',
    className = '',
    children,
    ...rest
  },
  ref
) {
  const variantCls = VARIANTS[variant] ?? VARIANTS.primary;
  const sizeCls = SIZES[size] ?? SIZES.md;
  const iconSz = ICON_SIZES[size] ?? ICON_SIZES.md;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.97] ${variantCls} ${sizeCls} ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className={`${iconSz} animate-spin motion-reduce:animate-none`} aria-hidden="true" />
      ) : Icon ? (
        <Icon className={iconSz} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
});

export default Button;
