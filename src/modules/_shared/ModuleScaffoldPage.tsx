import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';

interface ModuleScaffoldPageProps {
  moduleId: ModuleId;
}

export function ModuleScaffoldPage({ moduleId }: ModuleScaffoldPageProps) {
  const module = MODULE_MANIFEST[moduleId];
  const Icon = module.icon;

  return (
    <ModuleLayout title={module.title} themeColor={module.themeColor} moduleId={moduleId}>
      <div className="h-full p-6 md:p-10 overflow-y-auto">
        <div className="max-w-5xl mx-auto grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="rounded-card border border-white/10 bg-white/[0.045] p-6 md:p-8">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-2xl border border-white/15 flex items-center justify-center"
                style={{ backgroundColor: `${module.colorHex}1f` }}
              >
                <Icon className="w-6 h-6" style={{ color: module.colorHex }} />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase italic tracking-wide" style={{ color: module.colorHex }}>
                  {module.title}
                </h2>
                <p className="text-xs text-white/50 uppercase tracking-widest">{module.description}</p>
              </div>
            </div>

            <p className="mt-6 text-sm text-white/70 leading-relaxed">
              Core scaffolding is active. This module is connected to shared routing, NSV state, spine events,
              and design system primitives. Domain workflows can now be added without changing global architecture.
            </p>
          </section>

          <aside className="rounded-card border border-white/10 bg-slate-900/60 p-6">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Next Build Targets</h3>
            <ul className="mt-4 space-y-3 text-xs text-white/65">
              <li>Onboarding flow service + encrypted profile persistence.</li>
              <li>Domain-specific action handlers via `useModuleAI`.</li>
              <li>Dashboard widgets bound to NSV and Spine event stream.</li>
            </ul>
          </aside>
        </div>
      </div>
    </ModuleLayout>
  );
}
