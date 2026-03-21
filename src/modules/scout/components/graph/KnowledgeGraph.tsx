/**
 * KnowledgeGraph.tsx
 * 
 * A visual cartography of the research landscape.
 * Renders Knowledge Nodes (findings) and Source Entries as a linked graph.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Search, BookMarked, Zap, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-react';
import type { ScoutKnowledgeNode, SourceEntry } from '../../types';

interface GraphNode {
  id: string;
  type: 'finding' | 'source';
  label: string;
  status?: string;
  confidence?: number;
  domain?: string;
  x: number;
  y: number;
  r: number;
  data: any;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'citation' | 'relation';
}

interface KnowledgeGraphProps {
  nodes: ScoutKnowledgeNode[];
  sources: SourceEntry[];
  onNodeClick?: (node: any, type: 'finding' | 'source') => void;
  className?: string;
}

const SVG_W = 800;
const SVG_H = 500;
const CENTER_X = SVG_W / 2;
const CENTER_Y = SVG_H / 2;

export function KnowledgeGraph({ nodes, sources, onNodeClick, className }: KnowledgeGraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // ─── Layout Logic ─────────────────────────────────────────────────────────
  
  const graphData = useMemo(() => {
    const graphNodes: GraphNode[] = [];
    const graphEdges: GraphEdge[] = [];
    
    // 1. Place findings in a central orbit or grid
    nodes.forEach((node, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const radius = 120 + (i % 2) * 40;
      const x = CENTER_X + Math.cos(angle) * radius;
      const y = CENTER_Y + Math.sin(angle) * radius;
      
      graphNodes.push({
        id: node.id,
        type: 'finding',
        label: node.claim,
        status: node.status,
        confidence: node.confidence,
        x,
        y,
        r: 18 + (node.confidence * 10),
        data: node
      });
      
      // 2. Link sources to this finding
      (node.evidence || []).forEach((sourceId, j) => {
        const source = sources.find(s => s.id === sourceId);
        if (source) {
          // Check if source already placed
          let existingSource = graphNodes.find(gn => gn.id === source.id);
          if (!existingSource) {
            // Place source near the finding
            const sAngle = angle + (j + 1) * (0.4);
            const sRadius = radius + 80;
            const sx = CENTER_X + Math.cos(sAngle) * sRadius;
            const sy = CENTER_Y + Math.sin(sAngle) * sRadius;
            
            existingSource = {
              id: source.id,
              type: 'source',
              label: source.title,
              domain: source.domain,
              x: sx,
              y: sy,
              r: 12,
              data: source
            };
            graphNodes.push(existingSource);
          }
          
          graphEdges.push({
            id: `edge-${node.id}-${source.id}`,
            source: node.id,
            target: source.id,
            type: 'citation'
          });
        }
      });
    });

    return { nodes: graphNodes, edges: graphEdges };
  }, [nodes, sources]);

  const handleNodeClick = (gn: GraphNode) => {
    setSelectedId(prev => prev === gn.id ? null : gn.id);
    onNodeClick?.(gn.data, gn.type);
  };

  const selectedNode = graphData.nodes.find(n => n.id === selectedId);

  return (
    <div className={cn("relative w-full h-full flex flex-col", className)}>
      <div className="absolute top-4 left-4 z-10 space-y-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
          <div className="w-2 h-2 rounded-full bg-lime-400" />
          <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Knowledge Graph</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden cursor-grab active:cursor-grabbing">
        <svg 
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <radialGradient id="nodeGradient">
              <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>

          {/* Edges */}
          {graphData.edges.map(edge => {
            const source = graphData.nodes.find(n => n.id === edge.source);
            const target = graphData.nodes.find(n => n.id === edge.target);
            if (!source || !target) return null;

            const isActive = selectedId === source.id || selectedId === target.id || 
                             hoveredId === source.id || hoveredId === target.id;

            return (
              <motion.line
                key={edge.id}
                x1={source.x} y1={source.y}
                x2={target.x} y2={target.y}
                stroke={isActive ? "rgba(163, 230, 53, 0.4)" : "rgba(255,255,255,0.08)"}
                strokeWidth={isActive ? 1.5 : 1}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
              />
            );
          })}

          {/* Nodes */}
          {graphData.nodes.map(gn => {
            const isSelected = selectedId === gn.id;
            const isHovered = hoveredId === gn.id;
            const isRelated = selectedId && graphData.edges.some(e => 
              (e.source === selectedId && e.target === gn.id) || 
              (e.target === selectedId && e.source === gn.id)
            );
            
            const color = gn.type === 'finding' ? '#84cc16' : '#22d3ee';
            const opacity = (!selectedId || isSelected || isRelated) ? 1 : 0.2;

            return (
              <motion.g
                key={gn.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity }}
                whileHover={{ scale: 1.1 }}
                onClick={() => handleNodeClick(gn)}
                onMouseEnter={() => setHoveredId(gn.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="cursor-pointer"
              >
                {/* Glow */}
                {(isSelected || isHovered) && (
                  <circle cx={gn.x} cy={gn.y} r={gn.r + 10} fill={color} fillOpacity={0.15} />
                )}
                
                <circle
                  cx={gn.x} cy={gn.y} r={gn.r}
                  fill={gn.type === 'finding' ? "rgba(132, 204, 22, 0.2)" : "rgba(34, 211, 238, 0.2)"}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 1.5}
                  strokeOpacity={isSelected || isHovered ? 1 : 0.6}
                />
                
                {gn.type === 'finding' ? (
                  <Zap x={gn.x - 6} y={gn.y - 6} size={12} className="text-lime-400" />
                ) : (
                  <BookMarked x={gn.x - 6} y={gn.y - 6} size={12} className="text-cyan-400" />
                )}

                <text
                  x={gn.x} y={gn.y + gn.r + 15}
                  textAnchor="middle"
                  className="text-[10px] fill-white/60 font-medium select-none pointer-events-none"
                >
                  {gn.label.length > 20 ? gn.label.slice(0, 17) + '...' : gn.label}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>

      {/* Info Overlay */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl border border-white/10 bg-[#0a0c11]/90 backdrop-blur-xl shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {selectedNode.type === 'finding' ? (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-lime-500/10 border border-lime-500/20">
                      <Zap className="w-3 h-3 text-lime-400" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-lime-400">Finding</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                      <BookMarked className="w-3 h-3 text-cyan-400" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400">Source</span>
                    </div>
                  )}
                  {selectedNode.status && (
                    <span className={cn(
                      "text-[9px] font-bold px-2 py-0.5 rounded-full border",
                      selectedNode.status === 'verified' ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" : "text-amber-400 border-amber-500/30 bg-amber-500/5"
                    )}>
                      {selectedNode.status}
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-white leading-relaxed line-clamp-2">
                  {selectedNode.label}
                </h4>
                {selectedNode.type === 'source' && selectedNode.domain && (
                  <p className="text-[11px] text-white/40 mt-1">{selectedNode.domain}</p>
                )}
              </div>
              
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => setSelectedId(null)}
                  className="p-2 rounded-xl hover:bg-white/5 text-white/30 transition-colors"
                >
                  <Search className="w-4 h-4" />
                </button>
                {selectedNode.type === 'source' && (
                  <a 
                    href={selectedNode.data.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>

            {selectedNode.type === 'finding' && selectedNode.confidence !== undefined && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between text-[10px] mb-2">
                  <span className="text-white/40 uppercase tracking-widest font-bold">Confidence Score</span>
                  <span className="text-lime-400 font-mono">{Math.round(selectedNode.confidence * 100)}%</span>
                </div>
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${selectedNode.confidence * 100}%` }}
                    className="h-full bg-lime-500"
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
