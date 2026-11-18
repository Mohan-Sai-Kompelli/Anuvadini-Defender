import React, { useMemo, useState } from 'react';

function smoothLine(P) {
  if (P.length < 2) return "";
  let d = `M ${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[i + 2] || p2;
    const t = 0.18;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const AttendanceTrendMountain = ({
  data = [],
  xKey = 'date',
  series = [
    { key: 'present', label: 'Present', color: '#315CE8', gradStart: '#315CE8', gradStop: '#4A74F0' },
    { key: 'absent', label: 'Absent', color: '#dc2626', gradStart: '#dc2626', gradStop: '#f43f5e' }
  ],
  height = 240,
  formatX = (val) => {
    if (!val) return '';
    try {
      const date = new Date(val);
      if (isNaN(date.getTime())) return val;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return val;
    }
  },
  formatTooltipX = (val) => {
    if (!val) return '';
    try {
      const date = new Date(val);
      if (isNaN(date.getTime())) return val;
      return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return val;
    }
  }
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const W = 800;
  const H = height;
  const PAD = { t: 40, r: 24, b: 40, l: 36 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  // Calculate coordinates & paths
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Find max value across all series
    const allValues = data.flatMap(d => series.map(s => Number(d[s.key]) || 0));
    const maxVal = Math.max(10, Math.max(...allValues) * 1.15);

    const x = (i) => PAD.l + (i / Math.max(1, data.length - 1)) * innerW;
    const y = (v) => PAD.t + innerH - (v / maxVal) * innerH;
    const baseY = PAD.t + innerH;

    const seriesPaths = series.map((s, sIdx) => {
      const coords = data.map((d, i) => [x(i), y(Number(d[s.key]) || 0)]);
      const linePath = smoothLine(coords);
      const areaPath = linePath 
        ? `${linePath} L ${coords[coords.length - 1][0]},${baseY} L ${coords[0][0]},${baseY} Z`
        : '';

      return {
        ...s,
        coords,
        linePath,
        areaPath,
        gradId: `trendGrad_${s.key}`
      };
    });

    return {
      x,
      y,
      baseY,
      seriesPaths,
      maxVal
    };
  }, [data, series, innerW, innerH]);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
        <span className="text-sm text-slate-400">No trend data available</span>
      </div>
    );
  }

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const relativeX = (clickX / rect.width) * W;
    const xPercent = (relativeX - PAD.l) / innerW;
    const approxIndex = Math.round(xPercent * (data.length - 1));
    const index = Math.max(0, Math.min(data.length - 1, approxIndex));
    
    setHoveredIndex(index);
    setTooltipPos({
      x: (chartData.x(index) / W) * 100,
      y: (Math.min(...series.map(s => chartData.y(Number(data[index][s.key]) || 0))) / H) * 100
    });
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  return (
    <div className="relative w-full overflow-visible">
      {/* SVG canvas */}
      <svg 
        viewBox={`0 0 ${W} ${H}`} 
        className="w-full overflow-visible select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ height }}
      >
        <defs>
          {series.map(s => (
            <linearGradient key={s.key} id={`trendGrad_${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.gradStart || s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.gradStop || s.color} stopOpacity={0.0} />
            </linearGradient>
          ))}
          {/* Grid filter dropshadow */}
          <filter id="trendShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0F172A" floodOpacity="0.06" />
          </filter>
        </defs>

        {/* Grid lines */}
        {chartData && Array.from({ length: 5 }).map((_, idx) => {
          const val = (chartData.maxVal / 4) * idx;
          const gy = chartData.y(val);
          return (
            <g key={idx}>
              <line 
                x1={PAD.l} 
                y1={gy} 
                x2={W - PAD.r} 
                y2={gy} 
                stroke="rgba(20, 17, 11, 0.05)" 
                strokeWidth={1} 
              />
              <text 
                x={PAD.l - 8} 
                y={gy + 4} 
                textAnchor="end" 
                fontSize={10} 
                className="fill-slate-400 font-mono font-medium"
              >
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* X Axis labels */}
        {chartData && data.map((d, i) => {
          // Render label for start, middle, and end, or index steps to avoid crowding
          const shouldRender = data.length < 12 || i % Math.ceil(data.length / 6) === 0 || i === data.length - 1;
          if (!shouldRender) return null;
          return (
            <text
              key={i}
              x={chartData.x(i)}
              y={chartData.baseY + 18}
              textAnchor="middle"
              fontSize={10}
              className="fill-slate-400 font-mono"
            >
              {formatX(d[xKey])}
            </text>
          );
        })}

        {/* Render Mountain Area fills and Lines */}
        {chartData && chartData.seriesPaths.map((s) => (
          <g key={s.key}>
            {/* Area path */}
            {s.areaPath && (
              <path 
                d={s.areaPath} 
                fill={`url(#${s.gradId})`} 
                className="transition-all duration-300"
              />
            )}
            {/* Outline path */}
            {s.linePath && (
              <path 
                d={s.linePath} 
                fill="none" 
                stroke={s.color} 
                strokeWidth={2.5} 
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            )}
          </g>
        ))}

        {/* Vertical tracking indicator line */}
        {hoveredIndex !== null && chartData && (
          <line
            x1={chartData.x(hoveredIndex)}
            y1={PAD.t}
            x2={chartData.x(hoveredIndex)}
            y2={chartData.baseY}
            stroke="rgba(49, 92, 232, 0.2)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        )}

        {/* Active dots on hover */}
        {hoveredIndex !== null && chartData && chartData.seriesPaths.map((s) => {
          const cx = chartData.x(hoveredIndex);
          const cy = chartData.y(Number(data[hoveredIndex][s.key]) || 0);
          return (
            <g key={s.key}>
              <circle 
                cx={cx} 
                cy={cy} 
                r={6} 
                fill={s.color} 
                stroke="#fff" 
                strokeWidth={2}
                className="filter drop-shadow-sm"
              />
              <circle 
                cx={cx} 
                cy={cy} 
                r={12} 
                fill={s.color} 
                opacity={0.12} 
                className="animate-ping" 
              />
            </g>
          );
        })}
      </svg>

      {/* Premium HTML Tooltip on hover */}
      {hoveredIndex !== null && (
        <div 
          className="absolute z-30 pointer-events-none px-3.5 py-2.5 rounded-xl glass bg-white/95 dark:bg-slate-900/95"
          style={{
            left: `${tooltipPos.x}%`,
            top: `${tooltipPos.y}%`,
            transform: 'translate(-50%, -125%)',
            boxShadow: 'var(--shadow-lg)'
          }}
        >
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
            {formatTooltipX(data[hoveredIndex][xKey])}
          </div>
          <div className="space-y-1">
            {series.map(s => (
              <div key={s.key} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{s.label}</span>
                </div>
                <span className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                  {data[hoveredIndex][s.key] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceTrendMountain;
