import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Orbit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toneClass, toneTextClass, CORE_MODULES, type NodeCardProps, type OrchestratorNode, type ModuleStat } from '../../constants';

const NodeCard = React.memo(function NodeCard({
  node, stat, canEnter, isHovered, onClick, onMouseEnter, onMouseLeave
}: NodeCardProps) {
  const Icon = node.icon;
  const title = node.title;
  const isLeft = node.x < 50;
  const isPlugin = !CORE_MODULES.includes(node.id);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <motion.button
      onClick={onClick}
      onMouseEnter={() => { onMouseEnter(); setShowTooltip(true); }}
      onMouseLeave={() => { onMouseLeave(); setShowTooltip(false); }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: isPlugin ? 0.85 : 1 }}
      whileHover={{ y: -2, scale: isPlugin ? 0.9 : 1.02, transition: { duration: 0.2 } }}
      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto group focus:outline-none focus:ring-2 focus:ring-violet-500/50 rounded-2xl"
      style={{ left: `${node.x}%`, top: `${node.y}%`, zIndex: isHovered ? 100 : isPlugin ? 5 : 10 }}
    >
      <div className={cn(
        "relative transition-all duration-300",
        isPlugin ? "p-2 rounded-xl w-[140px]" : "p-3 rounded-2xl w-[185px]",
        "bg-[#05050a]/70 backdrop-blur-xl",
        isHovered ? "border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.05)] bg-white/[0.02] border" : "border-white/10 shadow-xl border",
        !canEnter && "opacity-60",
        isPlugin && !isHovered && "opacity-40"
      )}>
        <div className="flex gap-2.5 items-center">
          <div className={cn(
            "rounded-xl flex items-center justify-center shrink-0 border transition-colors",
            isPlugin ? "w-7 h-7" : "w-8 h-8",
            isHovered ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10"
          )}>
            <Icon className={isPlugin ? "w-3.5 h-3.5" : "w-4 h-4"} style={{ color: node.color }} />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <span className={cn("font-bold uppercase tracking-wider text-white/90 truncate", isPlugin ? "text-[9px]" : "text-[10px]")}>
                {title}
              </span>
              {!canEnter && <Lock className="w-2.5 h-2.5 text-white/50" />}
            </div>
            {stat && !isPlugin ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={cn("w-1 h-1 rounded-full", toneClass(stat.tone))} />
                <span className={cn("text-[9px] font-mono", toneTextClass(stat.tone))}>{stat.display}</span>
              </div>
            ) : (
              <p className="text-[8px] text-white/50 uppercase tracking-tight truncate mt-0.5">{node.description}</p>
            )}
          </div>
        </div>

        {/* Hover tooltip with expanded info */}
        <AnimatePresence>
          {showTooltip && !isPlugin && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              className="absolute left-1/2 -translate-x-1/2 w-52 p-3 rounded-xl bg-[#05050a]/90 backdrop-blur-xl border border-white/15 shadow-2xl z-50"
              style={{ top: node.y > 50 ? 'auto' : '100%', bottom: node.y > 50 ? '100%' : 'auto', marginTop: node.y > 50 ? undefined : '8px', marginBottom: node.y > 50 ? '8px' : undefined }}
            >
              <p className="text-[10px] text-white/60 leading-relaxed mb-2">{node.description}</p>
              {stat && (
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wider text-white/40">{stat.label}</span>
                  <span className={cn("text-[10px] font-bold", toneTextClass(stat.tone))}>{stat.display}</span>
                </div>
              )}
              <p className="text-[8px] text-white/50 mt-2 uppercase tracking-wider">Click to enter →</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Connector dot — faces toward center */}
        <div className={cn(
          "absolute w-1.5 h-1.5 rounded-full transition-all duration-500",
          // Position dot on the edge closest to center (50,50)
          Math.abs(node.x - 50) > Math.abs(node.y - 50)
            ? cn("top-1/2 -translate-y-1/2", isLeft ? "-right-0.5" : "-left-0.5")
            : cn("left-1/2 -translate-x-1/2", node.y < 50 ? "-bottom-0.5" : "-top-0.5"),
          isHovered ? "bg-white scale-125 shadow-[0_0_8px_white]" : "bg-white/20"
        )} />
      </div>
    </motion.button>
  );
});

interface GraphViewProps {
  orchestratorNodes: OrchestratorNode[];
  moduleStats: Record<string, ModuleStat>;
  moduleAccess: Record<string, boolean>;
  hoveredNodeId: string | null;
  edgeIntensity: number;
  onModuleNavigate: (moduleId: string, route: string) => void;
  setHoveredNodeId: (id: string | null) => void;
}

export function GraphView({
  orchestratorNodes, moduleStats, moduleAccess, hoveredNodeId, edgeIntensity,
  onModuleNavigate, setHoveredNodeId
}: GraphViewProps) {
  return (
    <motion.div
      key="graph"
      initial={{ opacity: 0, filter: 'blur(8px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, filter: 'blur(8px)' }}
      transition={{ duration: 0.5 }}
      className="flex-1 pointer-events-auto relative pt-20 px-6 pb-28 max-w-7xl w-full mx-auto"
    >
      <div className="absolute inset-x-6 top-20 bottom-28 rounded-[48px] border border-white/5 bg-black/40 backdrop-blur-2xl overflow-hidden shadow-2xl">
        {/* Faint Grid Background */}
        <div
          className="absolute inset-0 opacity-[0.02] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '50px 50px' }}
        />
        <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0px,transparent_60%)]" />

        <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="edge-grad-left" x1="1" y1="0.5" x2="0" y2="0.5">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="edge-grad-right" x1="0" y1="0.5" x2="1" y2="0.5">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#c084fc" stopOpacity="0.15" />
            </linearGradient>
          </defs>

          {orchestratorNodes.map((node) => {
            const isLeft = node.x < 50;
            const isHovered = hoveredNodeId === node.id;
            return (
              <g key={`edge-${node.id}`}>
                <path
                  d={node.path}
                  fill="none"
                  stroke={isLeft ? "url(#edge-grad-left)" : "url(#edge-grad-right)"}
                  strokeOpacity={isHovered ? 0.8 : 0.35}
                  strokeWidth={isHovered ? 1.2 : 0.6}
                  className="transition-all duration-500"
                />
                <circle r="0.3" fill="#fff" style={{ filter: 'blur(0.2px)' }}>
                  <animateMotion
                    dur={`${4 - edgeIntensity * 2}s`}
                    repeatCount="indefinite"
                    path={node.path}
                  />
                </circle>
              </g>
            );
          })}
        </svg>

        {/* Central Nexus — clickable, opens Nexus chat */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 flex items-center justify-center">
          <div className="absolute inset-0 bg-violet-500/5 rounded-full blur-[100px] animate-pulse" />
          {/* Pulsing rings animating toward center */}
          <motion.div
            className="absolute inset-0 rounded-full border border-violet-500/20"
            animate={{ scale: [1.4, 0.85], opacity: [0, 0.4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute inset-4 rounded-full border border-violet-400/15"
            animate={{ scale: [1.3, 0.9], opacity: [0, 0.3, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          />
          <motion.div
            className="absolute inset-8 rounded-full border border-violet-300/10"
            animate={{ scale: [1.2, 0.95], opacity: [0, 0.2, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />
          <div className="absolute inset-4 border border-white/[0.03] rounded-full animate-[spin_60s_linear_infinite]" />
          <div className="absolute inset-12 border border-white/[0.05] rounded-full animate-[spin_40s_linear_reverse_infinite]" />

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-nexus'))}
            className="relative w-32 h-32 rounded-full overflow-hidden border border-violet-500/30 bg-violet-950/60 flex items-center justify-center shadow-[0_0_60px_rgba(139,92,246,0.25)] cursor-pointer hover:border-violet-400/50 hover:bg-violet-900/70 hover:shadow-[0_0_100px_rgba(139,92,246,0.4)] transition-all duration-500 group pointer-events-auto focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            aria-label="Open Nexus"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.07] to-transparent pointer-events-none" />
            <Orbit className="relative w-8 h-8 text-violet-300/80 group-hover:text-violet-200 transition-colors" />
          </button>
        </div>

        {orchestratorNodes.map((node) => (
          <NodeCard
            key={`node-${node.id}`}
            node={node}
            stat={moduleStats[node.id]}
            canEnter={moduleAccess[node.id]}
            isHovered={hoveredNodeId === node.id}
            onClick={() => onModuleNavigate(node.id, node.route)}
            onMouseEnter={() => setHoveredNodeId(node.id)}
            onMouseLeave={() => setHoveredNodeId(null)}
          />
        ))}
      </div>
    </motion.div>
  );
}
