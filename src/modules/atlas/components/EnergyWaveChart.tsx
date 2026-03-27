import React, { useMemo } from 'react';
import { EnergyWavePoint } from '../services/atlas-profile-service';

type EnergyWaveChartProps = {
  points: EnergyWavePoint[];
  flattenedUntil?: string;
};

function buildPath(points: EnergyWavePoint[], getValue: (point: EnergyWavePoint) => number, height: number, width: number): string {
  if (points.length === 0) return '';
  const step = width / Math.max(points.length - 1, 1);
  return points
    .map((point, index) => {
      const x = index * step;
      const value = Math.max(0, Math.min(10, getValue(point)));
      const y = height - (value / 10) * height;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

export function EnergyWaveChart({ points, flattenedUntil }: EnergyWaveChartProps) {
  const width = 300;
  const height = 120;
  const wavePath = useMemo(() => buildPath(points, (point) => point.energy, height, width), [points]);
  const focusPath = useMemo(() => buildPath(points, (point) => point.focus, height, width), [points]);
  const loadPath = useMemo(() => buildPath(points, (point) => point.load, height, width), [points]);
  const isFlattened = flattenedUntil ? Date.parse(flattenedUntil) > Date.now() : false;

  return (
    <div className="rounded-2xl border border-white/[0.12] bg-white/[0.045] p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32" role="img" aria-label="Energy wave chart showing energy, focus, and load over time">
        <defs>
          <linearGradient id="energyGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.8" />
          </linearGradient>
        </defs>
        {isFlattened && <rect x="0" y={height * 0.55} width={width} height={height * 0.45} fill="rgba(56,189,248,0.12)" />}
        {wavePath && <path d={wavePath} fill="none" stroke="url(#energyGradient)" strokeWidth="3" />}
        {focusPath && <path d={focusPath} fill="none" stroke="rgba(14,165,233,0.7)" strokeWidth="2" strokeDasharray="4 4" />}
        {loadPath && <path d={loadPath} fill="none" stroke="rgba(251,191,36,0.6)" strokeWidth="2" />}
      </svg>
      <div className="mt-2 text-xs text-white/70">
        Energy (solid), Focus (dashed), Load (amber). {isFlattened ? 'Flattened window active.' : 'Wave active.'}
      </div>
    </div>
  );
}
