import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { TherapyIntakeProfile, SessionSummary } from '@/lib/types';

// ─── Domain Types ────────────────────────────────────────────────────────────

type Sentiment = 'positive' | 'negative' | 'neutral';
type Category  = 'goal' | 'struggle' | 'insight';

interface BeliefNode {
  id:        string;
  label:     string;     // truncated to 30 chars
  sentiment: Sentiment;
  category:  Category;
  frequency: number;     // sessions this theme appeared in
  date?:     string;     // ISO date of first appearance
}

interface PositionedNode {
  node: BeliefNode;
  x:    number;
  y:    number;
  r:    number;
}

export interface BeliefGraphProps {
  profile: TherapyIntakeProfile | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_LABEL_CHARS    = 30;
const SHORT_LABEL_CHARS  = 15;
const MIN_RADIUS         = 10;
const MAX_RADIUS         = 22;
const RADIUS_PER_SESSION = 2;

const SVG_W    = 600;
const SVG_H    = 280;
const CX       = SVG_W / 2;
const CY       = SVG_H / 2;
const ORBIT_R  = 95;

/** Arc ranges in degrees clockwise-from-top */
const ARC: Record<Category, [number, number]> = {
  goal:     [ -60,  60 ],   // top arc,   centred at  0° (12 o'clock)
  insight:  [  60, 180 ],   // right arc, centred at 120° (4 o'clock)
  struggle: [ 180, 300 ],   // left arc,  centred at 240° (8 o'clock)
};

const SENTIMENT_COLOR: Record<Sentiment, string> = {
  positive: '#34d399',
  negative: '#f87171',
  neutral:  '#94a3b8',
};

const CATEGORY_LABEL: Record<Category, string> = {
  goal:     'Goal',
  struggle: 'Struggle',
  insight:  'Insight',
};

const CATEGORY_BADGE_CLASS: Record<Sentiment, string> = {
  positive: 'bg-emerald-500/20 text-emerald-400',
  negative: 'bg-red-500/20 text-red-400',
  neutral:  'bg-slate-500/20 text-slate-400',
};

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

const normalizeLabel = (s: string): string => s.toLowerCase().trim();

const truncate = (s: string, max: number): string =>
  s.length > max ? s.slice(0, max - 3) + '...' : s;

const toArray = (v: string | string[] | undefined): string[] => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

/**
 * Count how many sessions mention `label` in their theme or keyInsights.
 * Returns at least 1 so every node has a visible radius.
 */
const countFrequency = (label: string, sessions: SessionSummary[]): number => {
  const needle = normalizeLabel(label);
  const hits = sessions.filter(
    (s) =>
      s.theme?.toLowerCase().includes(needle) ||
      s.keyInsights?.some((ki) => ki.toLowerCase().includes(needle)),
  ).length;
  return Math.max(1, hits);
};

/**
 * Returns true when two labels share at least one word of 4+ characters.
 * Used to draw edges between thematically related beliefs.
 */
const shareSignificantWords = (a: string, b: string): boolean => {
  const significant = (s: string): string[] =>
    s.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const setA = new Set(significant(a));
  return significant(b).some((w) => setA.has(w));
};

/** Convert clockwise-from-top degrees to SVG (x, y) on a circle. */
const polarToSVG = (angleDeg: number, r: number): [number, number] => {
  const rad = (angleDeg * Math.PI) / 180;
  return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)];
};

/**
 * Derive BeliefNode list from profile data.
 *
 * Sources (in priority order):
 *   1. baseContext.goals     → positive / goal
 *   2. baseContext.struggles → negative / struggle
 *   3. integratedInsights[].keyInsights → neutral / insight
 *
 * Deduplication is performed by normalised label key.
 */
const deriveNodes = (profile: TherapyIntakeProfile | null): BeliefNode[] => {
  if (!profile) return [];

  const { baseContext } = profile;
  const sessions: SessionSummary[] = baseContext.integratedInsights ?? [];
  const seen     = new Set<string>();
  const nodes: BeliefNode[] = [];

  const add = (
    label:     string,
    sentiment: Sentiment,
    category:  Category,
    date?:     string,
  ): void => {
    const key = normalizeLabel(label);
    if (!key || seen.has(key)) return;
    seen.add(key);
    nodes.push({
      id:        key,
      label:     truncate(label, MAX_LABEL_CHARS),
      sentiment,
      category,
      frequency: countFrequency(label, sessions),
      date,
    });
  };

  for (const g of toArray(baseContext.goals))     add(g, 'positive', 'goal');
  for (const s of toArray(baseContext.struggles)) add(s, 'negative', 'struggle');

  for (const session of sessions) {
    for (const ki of session.keyInsights ?? []) {
      add(ki, 'neutral', 'insight', session.date);
    }
  }

  return nodes;
};

/**
 * Distribute nodes evenly within an arc [startDeg, endDeg] (clockwise-from-top).
 * Single-node groups are placed at the arc midpoint.
 */
const placeGroup = (
  group:    BeliefNode[],
  startDeg: number,
  endDeg:   number,
): PositionedNode[] =>
  group.map((node, i) => {
    const t     = group.length === 1 ? 0.5 : i / (group.length - 1);
    const angle = startDeg + t * (endDeg - startDeg);
    const r     = Math.min(MIN_RADIUS + node.frequency * RADIUS_PER_SESSION, MAX_RADIUS);
    const [x, y] = polarToSVG(angle, ORBIT_R);
    return { node, x, y, r };
  });

// ─── Component ────────────────────────────────────────────────────────────────

export function BeliefGraph({ profile }: BeliefGraphProps): React.ReactElement {
  const [selectedNode, setSelectedNode] = useState<BeliefNode | null>(null);

  const nodes = useMemo(() => deriveNodes(profile), [profile]);

  // ── Empty state ──
  if (nodes.length < 3) {
    return (
      <div className="flex items-center justify-center h-[280px] text-white/30 text-sm text-center px-8">
        Your belief landscape will grow as you explore in sessions.
      </div>
    );
  }

  // ── Layout ──
  const goals     = nodes.filter((n) => n.category === 'goal');
  const insights  = nodes.filter((n) => n.category === 'insight');
  const struggles = nodes.filter((n) => n.category === 'struggle');

  const positioned: PositionedNode[] = [
    ...placeGroup(goals,     ...ARC.goal),
    ...placeGroup(insights,  ...ARC.insight),
    ...placeGroup(struggles, ...ARC.struggle),
  ];

  // ── Edges: nodes that share significant words ──
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      if (shareSignificantWords(positioned[i].node.label, positioned[j].node.label)) {
        edges.push([i, j]);
      }
    }
  }

  const handleNodeClick = (node: BeliefNode): void => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  };

  return (
    <div className="rounded-xl overflow-hidden">
      {/* ── SVG canvas ── */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        height="280"
        aria-label="Belief Landscape Graph"
        role="img"
      >
        {/* Faint edges between related beliefs */}
        {edges.map(([i, j]) => (
          <line
            key={`edge-${i}-${j}`}
            x1={positioned[i].x}
            y1={positioned[i].y}
            x2={positioned[j].x}
            y2={positioned[j].y}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          />
        ))}

        {/* Belief nodes */}
        {positioned.map(({ node, x, y, r }) => {
          const color      = SENTIMENT_COLOR[node.sentiment];
          const isSelected = selectedNode?.id === node.id;
          const displayR   = isSelected ? r + 3 : r;

          return (
            <g
              key={node.id}
              onClick={() => handleNodeClick(node)}
              style={{ cursor: 'pointer' }}
              aria-label={node.label}
              role="button"
            >
              <circle
                cx={x}
                cy={y}
                r={displayR}
                fill={color}
                fillOpacity={isSelected ? 0.9 : 0.6}
                stroke={color}
                strokeWidth={isSelected ? 2 : 0}
              />
              <text
                x={x}
                y={y + displayR + 12}
                textAnchor="middle"
                fontSize="8"
                fill="rgba(255,255,255,0.6)"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {truncate(node.label, SHORT_LABEL_CHARS)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* ── Detail panel ── */}
      {selectedNode && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 mt-2">
          <div className="flex items-center gap-2">
            {/* Sentiment dot */}
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: SENTIMENT_COLOR[selectedNode.sentiment] }}
              aria-hidden="true"
            />

            {/* Label */}
            <span className="text-white/80 text-sm font-medium truncate">
              {selectedNode.label}
            </span>

            {/* Category badge */}
            <span
              className={cn(
                'ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0',
                CATEGORY_BADGE_CLASS[selectedNode.sentiment],
              )}
            >
              {CATEGORY_LABEL[selectedNode.category]}
            </span>
          </div>

          {/* Meta row */}
          <div className="mt-2 text-xs text-white/40">
            Appears in {selectedNode.frequency} session
            {selectedNode.frequency !== 1 ? 's' : ''}
            {selectedNode.date && (
              <span className="ml-2 text-white/20">
                · First seen{' '}
                {new Date(selectedNode.date).toLocaleDateString(undefined, {
                  year:  'numeric',
                  month: 'short',
                  day:   'numeric',
                })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
