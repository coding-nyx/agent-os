import React from 'react';
import { motion } from 'framer-motion';
import { LogOut, Info, Activity } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { GlassCard } from '@/core/components/GlassCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { MODULE_MANIFEST } from '@/lib/module-manifest';

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '1.0.0-beta';

const ACTIVE_MODULES: Array<{
  id: keyof typeof MODULE_MANIFEST;
  label: string;
  colorHex: string;
}> = [
  { id: 'agnes', label: 'Agnes', colorHex: '#6366F1' },
  { id: 'titan', label: 'Titan', colorHex: '#F59E0B' },
  { id: 'atlas', label: 'Atlas', colorHex: '#0EA5E9' },
  { id: 'ledger', label: 'Ledger', colorHex: '#10B981' },
  { id: 'scout', label: 'Scout', colorHex: '#84CC16' },
  { id: 'forge', label: 'Forge', colorHex: '#F43F5E' },
];

const panelVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.05, duration: 0.3 },
  }),
};

export function SystemPanel() {
  const { logout } = useAuth();

  const handleSignOut = () => {
    void logout();
  };

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Module health grid */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-7 h-7 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
            Module Health
          </h3>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] uppercase tracking-[0.2em] text-emerald-400 font-black">
              Live
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ACTIVE_MODULES.map((mod, i) => {
            const manifest = MODULE_MANIFEST[mod.id];
            const Icon = manifest?.icon;
            return (
              <motion.div
                key={mod.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="rounded-2xl bg-black/30 border border-white/5 p-4 space-y-3 hover:border-white/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {Icon ? (
                    <Icon
                      className="w-4 h-4 shrink-0"
                      style={{ color: mod.colorHex }}
                    />
                  ) : (
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: mod.colorHex }}
                    />
                  )}
                  <span className="text-xs font-bold text-white/85 truncate">
                    {mod.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: mod.colorHex, opacity: 0.85 }}
                  />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">
                    Active
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </GlassCard>

      {/* App version */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-7 h-7 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Info className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
            System Info
          </h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/35 font-black">
              App Version
            </span>
            <span className="text-xs font-black text-violet-300 uppercase tracking-widest">
              {APP_VERSION}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/35 font-black">
              Platform
            </span>
            <span className="text-xs font-black text-white/50 uppercase tracking-widest">
              AGNES_OS
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/35 font-black">
              Encryption
            </span>
            <span className="text-xs font-black text-emerald-300 uppercase tracking-widest">
              E2EE Active
            </span>
          </div>
        </div>
      </GlassCard>

      {/* Sign out */}
      <GlassCard className="p-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-4">
          Session
        </h3>
        <div className="flex items-center justify-between p-4 rounded-2xl bg-rose-950/20 border border-rose-500/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <LogOut className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white/90">Sign Out</p>
              <p className="text-[10px] text-white/35 uppercase tracking-widest font-bold">
                End this session
              </p>
            </div>
          </div>
          <NeuralButton size="sm" variant="danger" onClick={handleSignOut}>
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </NeuralButton>
        </div>
      </GlassCard>
    </motion.div>
  );
}
