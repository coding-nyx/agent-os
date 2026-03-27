/**
 * KnowledgeGraph.tsx
 *
 * Interactive SVG knowledge graph for the Scout module.
 *
 * Features:
 *  - Confidence-based node sizing: radius = 8 + confidence * 16
 *  - Status-based node coloring (verified=green, pending=amber, contested=red)
 *  - Node-to-node edges for shared evidence source IDs
 *  - Tag filter dropdown above the graph (dims non-matching nodes to opacity 0.2)
 *  - Zoom controls (+/-/reset) applied via SVG group transform
 *  - Click a node to open a detail overlay showing claim, confidence, status, evidence, tags
 *
 * Complexity:
 *  - Layout: O(n) radial positioning
 *  - Edge computation: O(n²) shared-evidence detection — acceptable for typical graph sizes
 *  - Rendering: O(n + e) where e = edge count
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Zap,
  SlidersHorizontal,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import type { ScoutKnowledgeNode, SourceEntry } from '../../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const SVG_W = 800;
const SVG_H = 500;
const CENTER_X = SVG_W / 2;
const CENTER_Y = SVG_H / 2;
const ZOOM_STEP = 0.2;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  status: ScoutKnowledgeNode['status'];
  confidence: number;
  tags: string[];
  evidence: string[];
  x: number;
  y: number;
  r: number;
  data: ScoutKnowledgeNode;
}

interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

interface KnowledgeGraphProps {
  nodes: ScoutKnowledgeNode[];
  sources?: SourceEntry[];
  onNodeClick?: (node: ScoutKnowledgeNode) => void;
  className?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns fill and stroke colors for a node based on its status. */
function statusColors(status: ScoutKnowledgeNode['status']): {
  fill: string;
  stroke: string;
  badge: string;
} {
  switch (status) {
    case 'verified':
      return {
        fill: 'rgba(34,197,94,0.2)',
        stroke: '#22c55e',
        badge: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
      };
    case 'pending':
      return {
        fill: 'rgba(234,179,8,0.2)',
        stroke: '#eab308',
        badge: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
      };
    case 'contested':
    default:
      return {
        fill: 'rgba(239,68,68,0.2)',
        stroke: '#ef4444',
        badge: 'text-red-400 border-red-500/30 bg-red-500/10',
      };
  }
}

/** Maps confidence [0,1] to node radius per spec: r = 8 + confidence * 16. */
function nodeRadius(confidence: number): number {
  return 8 + Math.max(0, Math.min(1, confidence)) * 16;
}

/** Positions nodes on concentric rings based on confidence tier. */
function layoutNodes(nodes: ScoutKnowledgeNode[]): GraphNode[] {
  return nodes.map((node, i) => {
    const confidence = Math.max(0, Math.min(1, node.confidence));
    const tier = confidence >= 0.7 ? 0 : confidence >= 0.4 ? 1 : 2;
    const baseRadius = 90 + tier * 80;
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const jitter = (i % 3) * 18;

    return {
      id: node.id,
      label: node.claim,
      status: node.status,
      confidence,
      tags: node.tags ?? [],
      evidence: node.evidence ?? [],
      x: CENTER_X + Math.cos(angle) * (baseRadius + jitter),
      y: CENTER_Y + Math.sin(angle) * (baseRadius + jitter),
      r: nodeRadius(confidence),
      data: node,
    };
  });
}

/**
 * Builds edges between nodes that share at least one source ID in their
 * evidence arrays.
 * Time complexity: O(n²) — bounded in practice since graph sizes are small.
 */
function buildSharedEvidenceEdges(graphNodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];

  for (let i = 0; i < graphNodes.length; i++) {
    const a = graphNodes[i];
    if (a.evidence.length === 0) continue;
    const aSet = new Set(a.evidence);

    for (let j = i + 1; j < graphNodes.length; j++) {
      const b = graphNodes[j];
      const hasShared = b.evidence.some(id => aSet.has(id));
      if (hasShared) {
        edges.push({ id: `edge-${a.id}-${b.id}`, sourceId: a.id, targetId: b.id });
      }
    }
  }

  return edges;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function KnowledgeGraph({
  nodes,
  sources: _sources,
  onNodeClick,
  className,
}: KnowledgeGraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string>('');
  const [scale, setScale] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  // ── Zoom handlers ────────────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setScale(s => Math.min(ZOOM_MAX, Math.round((s + ZOOM_STEP) * 10) / 10));
  }, []);

  const zoomOut = useCallback(() => {
    setScale(s => Math.max(ZOOM_MIN, Math.round((s - ZOOM_STEP) * 10) / 10));
  }, []);

  const resetZoom = useCallback(() => setScale(1), []);

  // ── Tags ─────────────────────────────────────────────────────────────────
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    nodes.forEach(n => n.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [nodes]);

  // ── Graph data ───────────────────────────────────────────────────────────
  const graphNodes = useMemo(() => layoutNodes(nodes), [nodes]);

  const graphEdges = useMemo(
    () => buildSharedEvidenceEdges(graphNodes),
    [graphNodes],
  );

  // O(1) node lookup for edge rendering — avoids O(n) Array.find per edge.
  const nodeById = useMemo(
    () => new Map(graphNodes.map(n => [n.id, n])),
    [graphNodes],
  );

  // ── Interaction ──────────────────────────────────────────────────────────
  const handleNodeClick = useCallback(
    (gn: GraphNode) => {
      setSelectedId(prev => (prev === gn.id ? null : gn.id));
      onNodeClick?.(gn.data);
    },
    [onNodeClick],
  );

  const selectedNode = useMemo(
    () => graphNodes.find(n => n.id === selectedId) ?? null,
    [graphNodes, selectedId],
  );

  const connectedIds = useMemo(() => {
    if (!selectedId) return null;
    const ids = new Set<string>();
    graphEdges.forEach(e => {
      if (e.sourceId === selectedId) ids.add(e.targetId);
      if (e.targetId === selectedId) ids.add(e.sourceId);
    });
    return ids;
  }, [selectedId, graphEdges]);

  // ── Status summary ───────────────────────────────────────────────────────
  const statusCounts = useMemo(
    () => ({
      verified: nodes.filter(n => n.status === 'verified').length,
      pending: nodes.filter(n => n.status === 'pending').length,
      contested: nodes.filter(n => n.status === 'contested').length,
    }),
    [nodes],
  );

  return (
    <div className={cn('relative w-full h-full flex flex-col', className)}>

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2 flex-wrap">
        {/* Graph label + node count */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
          <div className="w-2 h-2 rounded-full bg-lime-400" />
          <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">
            Knowledge Graph
          </span>
          <span className="text-[10px] text-white/30">·</span>
          <span className="text-[10px] text-white/50">{nodes.length} nodes</span>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1.5">
          {statusCounts.verified > 0 && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-bold">
              {statusCounts.verified} verified
            </span>
          )}
          {statusCounts.pending > 0 && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 font-bold">
              {statusCounts.pending} pending
            </span>
          )}
          {statusCounts.contested > 0 && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/20 font-bold">
              {statusCounts.contested} contested
            </span>
          )}
        </div>

        {/* Tag filter dropdown */}
        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            className="ml-1 px-2 py-1 rounded-full text-[10px] bg-white/5 border border-white/10 text-white/60 focus:outline-none focus:border-white/30 appearance-none cursor-pointer"
            aria-label="Filter by tag"
          >
            <option value="">All tags</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </select>
        )}

        {/* Zoom controls */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={zoomOut}
            aria-label="Zoom out"
            disabled={scale <= ZOOM_MIN}
            className="flex items-center justify-center w-6 h-6 rounded-full bg-white/5 border border-white/10 text-white/50 hover:text-white/80 disabled:opacity-30 transition-colors"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <button
            onClick={resetZoom}
            aria-label="Reset zoom"
            className="flex items-center justify-center px-2 h-6 rounded-full bg-white/5 border border-white/10 text-[9px] font-mono text-white/50 hover:text-white/80 transition-colors"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={zoomIn}
            aria-label="Zoom in"
            disabled={scale >= ZOOM_MAX}
            className="flex items-center justify-center w-6 h-6 rounded-full bg-white/5 border border-white/10 text-white/50 hover:text-white/80 disabled:opacity-30 transition-colors"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={() => setShowFilters(f => !f)}
            aria-label="Toggle filters"
            className={cn(
              'flex items-center gap-1 px-2 h-6 rounded-full border text-[9px] font-bold uppercase tracking-wider transition-all ml-1',
              showFilters
                ? 'bg-lime-500/20 border-lime-500/30 text-lime-400'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80',
            )}
          >
            <SlidersHorizontal className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Filter panel ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFilters && allTags.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-12 right-3 z-20 p-4 rounded-2xl bg-[#0a0a12] border border-white/10 shadow-2xl w-56 space-y-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              Filter by tag
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTagFilter('')}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all',
                  tagFilter === ''
                    ? 'bg-lime-500/30 border-lime-500/40 text-lime-400'
                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80',
                )}
              >
                All
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(prev => (prev === tag ? '' : tag))}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] border transition-all',
                    tagFilter === tag
                      ? 'bg-violet-500/30 border-violet-500/40 text-violet-300'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70',
                  )}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SVG canvas ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden cursor-grab active:cursor-grabbing mt-10">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
          aria-label="Knowledge graph"
        >
          {/* Zoom group — transform is applied here */}
          <g
            style={{
              transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
              transform: `scale(${scale})`,
              transition: 'transform 0.2s ease',
            }}
          >
            {/* Edges — rendered first so nodes appear on top */}
            {graphEdges.map(edge => {
              const src = nodeById.get(edge.sourceId);
              const tgt = nodeById.get(edge.targetId);
              if (!src || !tgt) return null;

              const isActive =
                selectedId === edge.sourceId ||
                selectedId === edge.targetId ||
                hoveredId === edge.sourceId ||
                hoveredId === edge.targetId;

              return (
                <line
                  key={edge.id}
                  data-edge="true"
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke={isActive ? 'rgba(163,230,53,0.35)' : 'rgba(255,255,255,0.08)'}
                  strokeWidth={isActive ? 1.5 : 1}
                />
              );
            })}

            {/* Nodes */}
            {graphNodes.map(gn => {
              const colors = statusColors(gn.status);
              const isSelected = selectedId === gn.id;
              const isHovered = hoveredId === gn.id;
              const isConnected = connectedIds ? connectedIds.has(gn.id) : false;

              // Dim nodes that don't match the tag filter
              const tagMatch = tagFilter === '' || gn.tags.includes(tagFilter);
              const baseOpacity = tagMatch ? 1 : 0.2;
              const opacity =
                selectedId && !isSelected && !isConnected
                  ? baseOpacity * 0.25
                  : baseOpacity;

              return (
                <motion.g
                  key={gn.id}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity }}
                  whileHover={{ scale: 1.12 }}
                  onClick={() => handleNodeClick(gn)}
                  onMouseEnter={() => setHoveredId(gn.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="cursor-pointer"
                  style={{ originX: `${gn.x}px`, originY: `${gn.y}px` }}
                >
                  {/* Selection / hover glow */}
                  {(isSelected || isHovered) && (
                    <circle
                      cx={gn.x}
                      cy={gn.y}
                      r={gn.r + 10}
                      fill={colors.stroke}
                      fillOpacity={0.12}
                    />
                  )}

                  {/* Main circle */}
                  <circle
                    cx={gn.x}
                    cy={gn.y}
                    r={gn.r}
                    fill={colors.fill}
                    stroke={colors.stroke}
                    strokeWidth={isSelected ? 3 : 1.5}
                    strokeOpacity={isSelected || isHovered ? 1 : 0.65}
                  />

                  {/* Icon placeholder */}
                  <Zap
                    x={gn.x - 5}
                    y={gn.y - 5}
                    size={10}
                    style={{ color: colors.stroke, opacity: 0.8 }}
                  />

                  {/* Label */}
                  <text
                    x={gn.x}
                    y={gn.y + gn.r + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill="rgba(255,255,255,0.5)"
                    className="select-none pointer-events-none"
                  >
                    {gn.label.length > 22
                      ? gn.label.slice(0, 19) + '…'
                      : gn.label}
                  </text>
                </motion.g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* ── Node detail overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedNode && (() => {
          const confidencePct = Math.round(selectedNode.confidence * 100);
          return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl border border-white/10 bg-[#0a0c11]/90 backdrop-blur-xl shadow-2xl"
            role="dialog"
            aria-label="Node detail"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Status badge + confidence */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className={cn(
                      'text-[9px] font-bold px-2 py-0.5 rounded-full border capitalize',
                      statusColors(selectedNode.status).badge,
                    )}
                  >
                    {selectedNode.status}
                  </span>
                  <span className="text-[10px] font-mono text-lime-400">
                    {confidencePct}% confidence
                  </span>
                </div>

                {/* Claim text */}
                <p className="text-sm font-semibold text-white leading-relaxed line-clamp-3">
                  {selectedNode.label}
                </p>

                {/* Evidence source IDs */}
                {selectedNode.evidence.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1">
                      Evidence sources
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selectedNode.evidence.slice(0, 8).map(id => (
                        <span
                          key={id}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/40"
                        >
                          {id.length > 12 ? id.slice(0, 10) + '…' : id}
                        </span>
                      ))}
                      {selectedNode.evidence.length > 8 && (
                        <span className="text-[9px] text-white/30">
                          +{selectedNode.evidence.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {selectedNode.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedNode.tags.map(tag => (
                      <span
                        key={tag}
                        className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-300"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={() => setSelectedId(null)}
                aria-label="Close detail"
                className="p-2 rounded-xl hover:bg-white/5 text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Confidence bar */}
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="flex items-center justify-between text-[10px] mb-1.5">
                <span className="text-white/30 uppercase tracking-widest font-bold">
                  Confidence
                </span>
                <span className="text-lime-400 font-mono">
                  {confidencePct}%
                </span>
              </div>
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${confidencePct}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="h-full bg-lime-500 rounded-full"
                />
              </div>
            </div>
          </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-2">
            <Maximize2 className="w-8 h-8 text-white/10 mx-auto" />
            <p className="text-[11px] text-white/20 font-medium">
              No knowledge nodes yet
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
