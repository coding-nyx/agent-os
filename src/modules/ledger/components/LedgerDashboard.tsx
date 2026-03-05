import React from 'react';
import { motion } from 'framer-motion';
import { Activity, ShieldCheck, Database, ChevronRight, Zap, Droplets, TrendingUp } from 'lucide-react';
import { GlassCard } from '@/core/components/GlassCard';
import { GlobalSoul } from '@/lib/types';

function SimpleLineChart({ data, color }: { data: number[], color: string }) {
    const max = 10;
    const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - (v / max) * 100}`).join(' ');
    
    return (
        <div className="h-32 w-full mt-4">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.2 }} />
                        <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
                    </linearGradient>
                </defs>
                <motion.path
                    d={`M 0,100 L ${points} L 100,100 Z`}
                    fill="url(#grad)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                />
                <motion.polyline
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    points={points}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 2, ease: "easeInOut" }}
                />
            </svg>
        </div>
    );
}

interface LedgerDashboardProps {
  soul: GlobalSoul | null;
}

export function LedgerDashboard({ soul }: LedgerDashboardProps) {
  const state = soul?.crossFunctionalState;

  // Mock historical data for charts
  const fatigueHistory = [4, 5, 7, 6, 8, 5, 6];
  const resilienceHistory = [6, 6, 5, 7, 8, 8, 9];

  const logs = [
    { metric: 'CNS_FATIGUE_OS', value: `${state?.cnsFatigue || 5}/10`, status: 'NOMINAL', icon: Zap, color: 'text-orange-400' },
    { metric: 'EMOTIONAL_RES_BASE', value: `${state?.emotionalResilience || 5}/10`, status: 'STABLE', icon: ShieldCheck, color: 'text-indigo-400' },
    { metric: 'SLEEP_LATENCY_DELTA', value: `${state?.sleepQuality || 7}/10`, status: 'OPTIMAL', icon: Activity, color: 'text-cyan-400' },
    { metric: 'HORMONAL_FLOW_CONTEXT', value: state?.hormonalContext || 'SYNCED', status: 'STABLE', icon: Droplets, color: 'text-rose-400' },
  ];

  return (
    <div className="p-6 space-y-6 overflow-y-auto no-scrollbar bg-black/40 border-b border-white/5 backdrop-blur-xl h-full">
      {/* Top HUD Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {logs.map((log, i) => (
          <motion.div key={log.metric} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <GlassCard className="p-4 border-white/5 bg-white/[0.01]">
              <div className="flex items-center justify-between mb-2">
                <log.icon className={`w-4 h-4 ${log.color}`} />
                <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">{log.status}</span>
              </div>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none mb-1">{log.metric}</p>
              <p className="text-xl font-black italic uppercase tracking-tighter">{log.value}</p>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Detailed Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard className="p-4 border-orange-500/10">
          <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-400" />
                  <h2 className="text-xs font-black uppercase tracking-[0.3em] italic">CNS Fatigue Trend</h2>
              </div>
              <span className="text-[8px] font-mono text-white/20">7_DAY_CYCLE</span>
          </div>
          <SimpleLineChart data={fatigueHistory} color="#fb923c" />
        </GlassCard>

        <GlassCard className="p-4 border-indigo-500/10">
          <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <h2 className="text-xs font-black uppercase tracking-[0.3em] italic">Resilience Stability</h2>
              </div>
              <span className="text-[8px] font-mono text-white/20">PSYCH_METRIC</span>
          </div>
          <SimpleLineChart data={resilienceHistory} color="#6366f1" />
        </GlassCard>
      </div>

      {/* Technical Ledger Table - Pulling from actual active insights if available */}
      <GlassCard className="p-4">
          <div className="flex items-center gap-3 mb-4">
              <Database className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-black uppercase tracking-[0.3em] italic">Diagnostic Anomalies</h2>
          </div>
          <div className="space-y-2">
              {soul?.activeInsights && soul.activeInsights.length > 0 ? (
                  soul.activeInsights.map((insight, i) => (
                      <div key={insight.id} className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/5 transition-all group">
                          <div className="flex items-center gap-4">
                              <span className="text-[9px] font-mono text-white/20">{insight.id.toUpperCase()}</span>
                              <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{insight.type}</span>
                              <span className="text-[10px] text-white/40 truncate max-w-xs">{insight.content}</span>
                          </div>
                          <div className="flex items-center gap-4">
                              <span className={`text-[8px] font-mono uppercase ${insight.intensity > 7 ? 'text-orange-400/60' : 'text-cyan-400/40'}`}>
                                  {insight.isResolved ? 'RESOLVED' : 'ACTIVE_ISSUE'}
                              </span>
                              <ChevronRight className="w-3 h-3 text-white/10 group-hover:text-cyan-400 transition-colors" />
                          </div>
                      </div>
                  ))
              ) : (
                  [...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/5 transition-all group">
                          <div className="flex items-center gap-4">
                              <span className="text-[9px] font-mono text-white/20">0x{Math.random().toString(16).slice(2, 10).toUpperCase()}</span>
                              <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Biometric_Handshake</span>
                          </div>
                          <div className="flex items-center gap-4">
                              <span className="text-[8px] font-mono text-cyan-400/40 uppercase">E2EE_VERIFIED</span>
                              <ChevronRight className="w-3 h-3 text-white/10 group-hover:text-cyan-400 transition-colors" />
                          </div>
                      </div>
                  ))
              )}
          </div>
      </GlassCard>
    </div>
  );
}
