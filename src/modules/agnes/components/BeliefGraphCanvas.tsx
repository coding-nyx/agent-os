import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { BeliefGraph } from '../services/belief-graph-service';

const SVG_WIDTH = 620;
const SVG_HEIGHT = 320;
const CENTER_X = SVG_WIDTH / 2;
const CENTER_Y = SVG_HEIGHT / 2;
const ORBIT_RADIUS = 118;

const VALENCE_COLORS = {
  positive: '#34d399',
  neutral: '#94a3b8',
  negative: '#f472b6',
} as const;

function truncate(value: string, max = 18): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function polarToPoint(index: number, total: number, radius = ORBIT_RADIUS): [number, number] {
  const angle = total <= 1 ? 0 : (Math.PI * 2 * index) / total - Math.PI / 2;
  return [CENTER_X + Math.cos(angle) * radius, CENTER_Y + Math.sin(angle) * radius];
}

interface BeliefGraphCanvasProps {
  graph: BeliefGraph | null;
  className?: string;
  emptyMessage?: string;
  highlightLabels?: string[];
}

export function BeliefGraphCanvas({
  graph,
  className,
  emptyMessage = 'Confirmed beliefs will appear here once you approve them.',
  highlightLabels = [],
}: BeliefGraphCanvasProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(graph?.nodes[0]?.id ?? null);
  const highlightSet = useMemo(
    () => new Set(highlightLabels.map((label) => label.trim().toLowerCase())),
    [highlightLabels],
  );

  const nodes = useMemo(() => graph?.nodes ?? [], [graph?.nodes]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0] ?? null;
  const positions = useMemo(
    () =>
      nodes.map((node, index) => {
        const [x, y] = polarToPoint(index, Math.max(nodes.length, 1));
        return {
          node,
          x,
          y,
          radius: 12 + Math.max(0, Math.min(10, node.intensity)) * 1.25,
          highlighted: highlightSet.has(node.label.trim().toLowerCase()),
        };
      }),
    [highlightSet, nodes],
  );
  const positionById = useMemo(
    () =>
      Object.fromEntries(
        positions.map((position) => [position.node.id, position] as const),
      ) as Record<string, (typeof positions)[number]>,
    [positions],
  );

  if (nodes.length === 0) {
    return (
      <div
        className={cn(
          'flex h-[320px] items-center justify-center rounded-[2rem] border border-white/[0.12] bg-slate-900/50 px-8 text-center text-sm text-white/35',
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="overflow-hidden rounded-[2rem] border border-white/[0.12] bg-slate-900/50 p-3">
        <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} width="100%" height="320" role="img" aria-label="Belief graph">
          <defs>
            <radialGradient id="belief-graph-core" cx="50%" cy="50%" r="75%">
              <stop offset="0%" stopColor="rgba(99,102,241,0.22)" />
              <stop offset="100%" stopColor="rgba(15,23,42,0)" />
            </radialGradient>
          </defs>

          <circle cx={CENTER_X} cy={CENTER_Y} r={88} fill="url(#belief-graph-core)" />

          {graph?.edges.map((edge, index) => {
            const from = positionById[edge.from];
            const to = positionById[edge.to];
            if (!from || !to) return null;
            const edgeHighlighted = from.highlighted || to.highlighted;
            return (
              <line
                key={`${edge.from}-${edge.to}-${edge.relation}-${index}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={edgeHighlighted ? 'rgba(244,114,182,0.42)' : 'rgba(255,255,255,0.12)'}
                strokeWidth={edgeHighlighted ? 1.8 : 1}
              />
            );
          })}

          {positions.map((position) => {
            const selected = position.node.id === selectedNode?.id;
            const color = VALENCE_COLORS[position.node.valence];
            return (
              <g
                key={position.node.id}
                role="button"
                aria-label={position.node.label}
                onClick={() => setSelectedNodeId(position.node.id)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={selected ? position.radius + 2 : position.radius}
                  fill={color}
                  fillOpacity={position.highlighted ? 0.9 : selected ? 0.8 : 0.62}
                  stroke={position.highlighted ? '#ffffff' : color}
                  strokeWidth={position.highlighted ? 1.8 : selected ? 1.2 : 0}
                />
                <text
                  x={position.x}
                  y={position.y + position.radius + 14}
                  textAnchor="middle"
                  fontSize="10"
                  fill="rgba(255,255,255,0.68)"
                >
                  {truncate(position.node.label)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selectedNode ? (
        <div className="rounded-2xl border border-white/[0.12] bg-white/[0.045] p-3">
          <div className="flex flex-wrap items-start gap-2">
            <span className="text-sm font-semibold text-white/85">{selectedNode.label}</span>
            <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">
              {selectedNode.valence}
            </span>
            <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-200/80">
              {selectedNode.intensity}/10
            </span>
          </div>
          {graph?.summary ? (
            <p className="mt-2 text-xs leading-relaxed text-white/55">{graph.summary}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
