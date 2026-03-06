import React, { useMemo, useState } from 'react';
import { Lock, Shield, Zap } from 'lucide-react';
import { ModuleId, MODULE_MANIFEST } from '@/lib/module-manifest';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';

interface GuestModePanelProps {
  moduleId: ModuleId;
  description?: string;
  limitations?: string[];
  onContinue?: () => void;
  continueLabel?: string;
}

const DEFAULT_LIMITATIONS = [
  'No cross-device sync or persistent memory.',
  'Global guest quota is enforced across modules.',
  'Security preferences and vault keys are unavailable.'
];

export function GuestModePanel({
  moduleId,
  description,
  limitations = DEFAULT_LIMITATIONS,
  onContinue,
  continueLabel = 'Enter Limited Session'
}: GuestModePanelProps) {
  const [showAuth, setShowAuth] = useState(false);
  const module = MODULE_MANIFEST[moduleId];
  const Icon = module.icon;

  const summary = useMemo(
    () => description || `${module.title} is running in guest mode with constrained capabilities.`,
    [description, module.title]
  );

  return (
    <div className="flex-1 flex items-center justify-center p-8 pb-[12vh]">
      <SurfaceCard variant="strong" className="max-w-2xl w-full p-12 text-center space-y-12">
        <div className="flex items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl border border-white/10 flex items-center justify-center" style={{ backgroundColor: `${module.colorHex}22` }}>
            <Icon className="w-7 h-7" style={{ color: module.colorHex }} />
          </div>
          <div className="text-left">
            <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">Guest Link Active</div>
            <div className="text-xl font-black uppercase tracking-[0.2em]" style={{ color: module.colorHex }}>
              {module.title}
            </div>
          </div>
        </div>

        <p className="text-sm text-white/50 leading-relaxed max-w-xl mx-auto pt-2 pb-4">
          {summary}
        </p>

        <div className="grid gap-4 text-left pb-4">
          {limitations.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <Lock className="w-4 h-4 text-white/40 mt-0.5" />
              <span className="text-[11px] text-white/60 uppercase tracking-[0.2em] font-bold">{item}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          <NeuralButton size="lg" className="w-full" onClick={() => setShowAuth(true)}>
            <span className="flex items-center justify-center gap-2">
              <Shield className="w-4 h-4" /> Authenticate Identity
            </span>
          </NeuralButton>
          {onContinue && (
            <NeuralButton size="lg" variant="secondary" className="w-full" onClick={onContinue}>
              <span className="flex items-center justify-center gap-2">
                <Zap className="w-4 h-4" /> {continueLabel}
              </span>
            </NeuralButton>
          )}
        </div>
      </SurfaceCard>

      <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode={moduleId} />
    </div>
  );
}
