const fs = require('fs');
const file = 'src/modules/atlas/onboarding/AtlasOnboarding.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "import React, { useMemo } from 'react';",
  "import React, { useMemo, useState } from 'react';\nimport { Zap } from 'lucide-react';\nimport { cn } from '@/lib/utils';"
);

const componentStartStr = "export function AtlasOnboarding({\n  initialProfile,\n  initialBaseContext,\n  onGlobalBaseContextFinalize,\n  onComplete\n}: AtlasOnboardingProps) {\n  const { user } = useAuth();\n  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);\n";
const fastTrackCode = `
  const [fastPeakHours, setFastPeakHours] = useState('');
  const [fastCurrentLoad, setFastCurrentLoad] = useState<'low' | 'medium' | 'high'>('medium');
  const [fastPrimaryTask, setFastPrimaryTask] = useState('');

  const handleFastTrack = () => {
    if (!fastPeakHours.trim()) return;
    const now = new Date().toISOString();
    
    let activeLoad = 5;
    if (fastCurrentLoad === 'low') activeLoad = 3;
    if (fastCurrentLoad === 'high') activeLoad = 8;
    
    const taskGraph = fastPrimaryTask.trim() ? [
      {
        id: \`ft-task-0\`,
        title: fastPrimaryTask.trim(),
        energyCost: 6,
        status: 'queued' as const,
        dependencies: []
      }
    ] : [];

    const profile: AtlasProfile = {
      ...createEmptyAtlasProfile(),
      onboardingComplete: true,
      energyWave: [
        {
          id: 'ft-wave-0',
          slot: fastPeakHours.trim(),
          energy: 8,
          focus: 8,
          load: activeLoad
        }
      ],
      taskGraph,
      summary: \`Express onboarding: Peak focus \${fastPeakHours}, Load: \${fastCurrentLoad}.\`,
      createdAt: now,
      updatedAt: now
    };
    onComplete(profile);
  };
`;

code = code.replace(componentStartStr, componentStartStr + fastTrackCode);

const frameStartStr = "    <GuidedIntakeFrame\n      title=\"Atlas Guided Intake\"\n      subtitle=\"Calibrating your cognitive energy architecture.\"\n      statusLabel=\"COGNITIVE_BASELINE\"\n      steps={[...ATLAS_STEPS]}\n      currentStep={intake.stepIndex}\n      themeColor=\"sky\"\n";

const preludeCode = `      prelude={
        <div className="p-4 md:p-6 flex flex-col gap-4 border-b border-sky-500/20 bg-sky-500/5">
          <div className="flex-1 w-full space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-400 flex items-center gap-2">
              <Zap className="w-3 h-3" /> Fast Track Initialization
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  placeholder="Peak focus hours (e.g., 09:00-12:00)"
                  value={fastPeakHours}
                  onChange={e => setFastPeakHours(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-sky-500/50"
                />
                <input
                  placeholder="Primary task / current focus"
                  value={fastPrimaryTask}
                  onChange={e => setFastPrimaryTask(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-sky-500/50"
                />
              </div>
              <div>
                <p className="text-[9px] text-white/40 uppercase tracking-wider mb-2">Current Load Pressure</p>
                <div className="flex gap-2 flex-wrap">
                  {(['low', 'medium', 'high'] as const).map(l => (
                    <button
                      key={l}
                      onClick={() => setFastCurrentLoad(l)}
                      className={cn(
                        'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all',
                        fastCurrentLoad === l
                          ? 'bg-sky-600/30 border-sky-500/50 text-sky-300'
                          : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleFastTrack}
                  disabled={!fastPeakHours.trim()}
                  className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center whitespace-nowrap"
                >
                  Execute
                </button>
              </div>
            </div>
            <p className="text-[9px] text-white/40 uppercase tracking-tight">
              Bypass conversational intake. Requires peak focus hours.
            </p>
          </div>
        </div>
      }
`;

code = code.replace(frameStartStr, frameStartStr + preludeCode);

fs.writeFileSync(file, code);
