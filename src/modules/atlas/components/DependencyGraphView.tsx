/**
 * DependencyGraphView — Task Dependency DAG
 * Pure SVG, no external graph libraries.
 * Shows tasks as nodes and dependencies as directed edges.
 */
import React, { useMemo } from 'react';
import type { AtlasTask } from '../services/atlas-profile-service';

interface DependencyGraphViewProps {
  tasks: AtlasTask[];
}

interface NodeLayout {
  id: string;
  title: string;
  x: number;
  y: number;
  status: AtlasTask['status'];
  priority: number;
}

interface EdgeLayout {
  fromId: string;
  toId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

const NODE_W = 120;
const NODE_H = 36;
const H_GAP = 40;
const V_GAP = 20;

function layoutGraph(tasks: AtlasTask[]): { nodes: NodeLayout[]; edges: EdgeLayout[] } {
  const depSet = new Set(tasks.flatMap(t => t.dependencies));
  const relevant = tasks.filter(t => t.dependencies.length > 0 || depSet.has(t.id));

  if (relevant.length === 0) return { nodes: [], edges: [] };

  const depth = new Map<string, number>();
  const getDepth = (id: string, visited = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const task = relevant.find(t => t.id === id);
    if (!task || task.dependencies.length === 0) { depth.set(id, 0); return 0; }
    const maxDep = Math.max(...task.dependencies.map(d => getDepth(d, new Set(visited))));
    const d = maxDep + 1;
    depth.set(id, d);
    return d;
  };
  relevant.forEach(t => getDepth(t.id));

  const byDepth = new Map<number, AtlasTask[]>();
  relevant.forEach(t => {
    const d = depth.get(t.id) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(t);
  });

  const nodes: NodeLayout[] = [];
  let x = 10;
  Array.from(byDepth.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([, group]) => {
      group.forEach((task, i) => {
        nodes.push({
          id: task.id,
          title: task.title.slice(0, 14) + (task.title.length > 14 ? '…' : ''),
          x,
          y: 10 + i * (NODE_H + V_GAP),
          status: task.status,
          priority: task.priority,
        });
      });
      x += NODE_W + H_GAP;
    });

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const edges: EdgeLayout[] = [];
  relevant.forEach(task => {
    const toNode = nodeMap.get(task.id);
    if (!toNode) return;
    task.dependencies.forEach(depId => {
      const fromNode = nodeMap.get(depId);
      if (!fromNode) return;
      edges.push({
        fromId: depId,
        toId: task.id,
        fromX: fromNode.x + NODE_W,
        fromY: fromNode.y + NODE_H / 2,
        toX: toNode.x,
        toY: toNode.y + NODE_H / 2,
      });
    });
  });

  return { nodes, edges };
}

function statusColor(status: AtlasTask['status']): string {
  switch (status) {
    case 'done': return '#34d399';
    case 'blocked': return '#f87171';
    case 'active': return '#60a5fa';
    default: return '#a3a3a3';
  }
}

export function DependencyGraphView({ tasks }: DependencyGraphViewProps) {
  const { nodes, edges } = useMemo(() => layoutGraph(tasks), [tasks]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-white/30 italic">
        No task dependencies to visualize
      </div>
    );
  }

  const svgW = Math.max(...nodes.map(n => n.x + NODE_W)) + 20;
  const svgH = Math.max(...nodes.map(n => n.y + NODE_H)) + 20;

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-white/[0.12] bg-white/[0.045] p-3">
      <h4 className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-3">Task Dependencies</h4>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(255,255,255,0.3)" />
          </marker>
        </defs>
        {edges.map((e, i) => (
          <line
            key={i}
            x1={e.fromX} y1={e.fromY}
            x2={e.toX} y2={e.toY}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1.5}
            markerEnd="url(#arrow)"
          />
        ))}
        {nodes.map(node => (
          <g key={node.id}>
            <rect
              x={node.x} y={node.y}
              width={NODE_W} height={NODE_H}
              rx={6}
              fill="rgba(255,255,255,0.05)"
              stroke={statusColor(node.status)}
              strokeWidth={1.5}
            />
            <text
              x={node.x + 8} y={node.y + NODE_H / 2 + 4}
              fontSize={10}
              fill="rgba(255,255,255,0.8)"
              fontFamily="system-ui, sans-serif"
            >
              {node.title}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex items-center gap-3 mt-2">
        {([['done', '#34d399', 'Done'], ['active', '#60a5fa', 'Active'], ['blocked', '#f87171', 'Blocked'], ['queued', '#a3a3a3', 'Queued']] as const).map(([s, c, l]) => (
          <span key={s} className="flex items-center gap-1 text-[11px] text-white/40">
            <span className="w-2 h-2 rounded-sm" style={{ background: c }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
