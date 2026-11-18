import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** Page title block used by every overview screen. `actions` sit on the right. */
const PageHeader = ({ title, subtitle, actions, meta }) => {
  const reduce = useReducedMotion();
  return (
    <motion.header
      className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[color:var(--app-text)] sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-[color:var(--app-text-2)]">{subtitle}</p>}
        {meta && <div className="mt-2 text-[12px] text-[color:var(--app-muted)]">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.header>
  );
};

export default PageHeader;
