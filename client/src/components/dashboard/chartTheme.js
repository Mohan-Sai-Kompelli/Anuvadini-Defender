import { useEffect, useState } from 'react';
import { useTheme } from '../../ThemeContext';

/**
 * Shared chart palette for the teal design system.
 * Hexes mirror the Tailwind tokens in tailwind.config.js — keep in sync.
 */
export const CHART_COLORS = {
  primary: '#315CE8', // Anuvadini Forest Green
  primaryDark: '#101827',
  primaryDeep: '#0B1220',
  primaryLight: '#315CE8',
  success: '#6AA51F', // success-600
  warning: '#D97706', // Anuvadini Amber Gold
  danger: '#DC2626', // danger-600
  info: '#0284C7', // info-600
  accent: '#F59E0B', // Accent Gold
};

/** Ordered palette for categorical series (pies, multi-line). */
export const CATEGORY_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.warning,
  CHART_COLORS.info,
  CHART_COLORS.primaryLight,
  CHART_COLORS.success,
  CHART_COLORS.primaryDeep,
];

/** Sequential green ramp for the ApexCharts heatmaps (low -> high). */
export const HEATMAP_RANGES = [
  { from: 0, to: 0, color: '#F3F6FF', name: '0' },
  { from: 1, to: 3, color: '#C9D6FB', name: '1-3' },
  { from: 3, to: 5, color: '#93AEFB', name: '3-5' },
  { from: 5, to: 8, color: '#5B82F0', name: '5-8' },
  { from: 8, to: 12, color: '#315CE8', name: '8-12' },
  { from: 12, to: 100000, color: '#0B1220', name: '12+' },
];

export const HEATMAP_COLORS = HEATMAP_RANGES.map((r) => r.color);

function systemPrefersDark() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/**
 * useChartTheme — dark-aware axis/grid/tooltip props for recharts & apexcharts.
 * Resolves the effective theme from the foundation ThemeContext (incl. 'system').
 */
export function useChartTheme() {
  const { theme } = useTheme();
  const [osDark, setOsDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (theme !== 'system' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setOsDark(e.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [theme]);

  const isDark = theme === 'dark' || (theme === 'system' && osDark);

  // Slate-based neutrals matching the surface tokens.
  const axisColor = isDark ? '#94A3B8' : '#64748B'; // slate-400 / slate-500
  const lineColor = isDark ? '#334155' : '#CBD5E1'; // slate-700 / slate-300
  const gridColor = isDark ? '#334155' : '#E2E8F0'; // slate-700 / slate-200

  return {
    isDark,
    axisColor,
    gridStroke: gridColor,
    axisTick: { fontSize: 11, fill: axisColor },
    axisLine: { stroke: lineColor },
    tickLine: { stroke: lineColor },
    tooltipStyle: {
      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
      borderRadius: '8px',
      color: isDark ? '#F1F5F9' : '#0F172A',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    },
    tooltipItemStyle: { color: isDark ? '#F1F5F9' : '#0F172A' },
    tooltipLabelStyle: { color: isDark ? '#94A3B8' : '#64748B' },
    legendStyle: { color: axisColor },
  };
}

export default useChartTheme;
