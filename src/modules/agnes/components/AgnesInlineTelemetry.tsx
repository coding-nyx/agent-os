import React from 'react';
import { Zap, Heart, Shield } from 'lucide-react';
import { useGlobalSoulStore } from '@/lib/global-soul-context';

/**
 * Ultra-compact inline telemetry strip shown during an active Agnes session.
 * Renders only icon + value (no labels) on a single row: `R 5 · S 6 · E2EE`.
 * Full labels are exposed via `title` tooltips for a11y.
 */
export function AgnesInlineTelemetry() {
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
  const emotional = globalSoul?.crossFunctionalState?.emotional;

  if (!emotional) return null;

  const stress = emotional.stressLoad ?? 0;
  const stressColor = stress > 7 ? 'text-rose-400' : 'text-amber-400';

  const items: Array<{ key: string; label: string; value: string; Icon: typeof Heart; color: string }> = [
    {
      key: 'resilience',
      label: `Resilience ${emotional.emotionalResilience ?? 0}/10`,
      value: `${emotional.emotionalResilience ?? 0}`,
      Icon: Heart,
      color: 'text-indigo-400',
    },
    {
      key: 'stress',
      label: `Stress Load ${stress}/10`,
      value: `${stress}`,
      Icon: Zap,
      color: stressColor,
    },
    {
      key: 'sync',
      label: 'Sync Status: E2EE',
      value: 'E2EE',
      Icon: Shield,
      color: 'text-emerald-400',
    },
  ];

  return (
    <div className="inline-flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-1 rounded-full bg-white/[0.045] border border-white/[0.09] backdrop-blur-xl max-w-full">
      {items.map((item, idx) => (
        <React.Fragment key={item.key}>
          <div
            className="flex items-center gap-1.5 min-w-0"
            title={item.label}
            aria-label={item.label}
          >
            <item.Icon className={`w-3 h-3 shrink-0 ${item.color}`} />
            <span className="text-[10px] sm:text-[11px] font-bold text-white/85 tabular-nums leading-none truncate">
              {item.value}
            </span>
          </div>
          {idx < items.length - 1 && (
            <span className="text-white/15 text-[10px] leading-none select-none" aria-hidden>·</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
