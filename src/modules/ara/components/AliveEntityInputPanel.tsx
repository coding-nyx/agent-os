import { Layers3 } from 'lucide-react';
import type { AliveEntityRuntimeContext, AliveEntityRuntimeReference } from '@/lib/contracts/orchestration';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { cn } from '@/lib/utils';

interface AliveEntityInputPanelProps {
  context: AliveEntityRuntimeContext | null;
  isLoading?: boolean;
  onEntitySelected?: (entity: AliveEntityRuntimeReference) => void;
}

const MODULE_COLORS: Record<string, string> = {
  agnes: 'text-indigo-300 border-indigo-500/20 bg-indigo-500/[0.06]',
  atlas: 'text-sky-300 border-sky-500/20 bg-sky-500/[0.06]',
  ledger: 'text-cyan-300 border-cyan-500/20 bg-cyan-500/[0.06]',
  soma: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/[0.06]',
  titan: 'text-orange-300 border-orange-500/20 bg-orange-500/[0.06]',
  scout: 'text-lime-300 border-lime-500/20 bg-lime-500/[0.06]',
  ara: 'text-violet-300 border-violet-500/20 bg-violet-500/[0.06]',
};

export function AliveEntityInputPanel({
  context,
  isLoading = false,
  onEntitySelected,
}: AliveEntityInputPanelProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/[0.09] bg-white/[0.045] p-4 text-sm text-white/50">
        Loading alive inputs…
      </div>
    );
  }

  if (!context || context.total === 0 || context.moduleIds.length === 0) {
    return null;
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.045]"
      data-testid="alive-entity-input-panel"
    >
      <div className="flex items-center gap-2 border-b border-white/[0.09] px-4 py-3">
        <Layers3 className="h-3.5 w-3.5 text-white/40" />
        <span className="flex-1 text-xs font-bold text-white/60">Alive inputs</span>
        <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1 text-[11px] text-white/35">
          {context.total} active
        </span>
      </div>

      <div className="grid gap-3 p-3 md:grid-cols-2">
        {context.moduleIds.map((moduleId) => {
          const entities = context.byModule[moduleId] ?? [];
          if (entities.length === 0) return null;
          const moduleLabel = MODULE_MANIFEST[moduleId]?.alias ?? moduleId;

          return (
            <div key={moduleId} className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                {moduleLabel}
              </div>
              <div className="space-y-2">
                {entities.map((entity) => (
                  <button
                    key={entity.id}
                    type="button"
                    onClick={() => onEntitySelected?.(entity)}
                    className={cn(
                      'w-full rounded-xl border px-3 py-2 text-left transition hover:bg-white/[0.05]',
                      MODULE_COLORS[moduleId] ?? 'text-white/75 border-white/[0.12] bg-white/[0.045]',
                    )}
                    data-testid={`alive-entity-${entity.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{entity.label}</span>
                      <span className="rounded-full border border-white/[0.12] bg-slate-900/50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                        {entity.type}
                      </span>
                    </div>
                    {entity.semantic_tags.length > 0 ? (
                      <p className="mt-1 line-clamp-2 text-[11px] text-white/55">
                        {entity.semantic_tags.slice(0, 4).map((tag) => `#${tag}`).join(' ')}
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
