import { TitanProfile, HealthDataLog } from "@/lib/types";
import { buildTitanSessionPrompt, TitanSessionMode } from './titan-session-prompt';

export const generateAITitanPrompt = (
  profile: TitanProfile,
  latestLog?: HealthDataLog,
  mode?: TitanSessionMode
) => {
  const isOnboarding = !profile.onboardingComplete;
  const isIndepth = profile.trackingLevel === 'indepth';
  const soul = profile.soul;

  // DYNAMIC TONE ENGINE: Determine tone based on current metrics
  let tone = 'clinical'; // default
  let recoveryScore: number | null = null;
  if (latestLog) {
      const fatigue = typeof latestLog.cnsFatigueScore === 'number' ? latestLog.cnsFatigueScore : 0;
      const mood = typeof latestLog.moodScore === 'number' ? latestLog.moodScore : 5;
      
      if (fatigue > 7 || mood < 4) {
          tone = 'empathetic';
      }

      // Derive recovery score from fatigue (inverse: high fatigue = low recovery)
      if (typeof latestLog.cnsFatigueScore === 'number') {
        recoveryScore = Math.max(0, 10 - latestLog.cnsFatigueScore);
      }
  }

  const goals = profile.history?.goals || [];
  const traits = profile.traits || ["professional", "expert"];

  if (isOnboarding) {
    return `You are in "Neural Link Initialization" mode. You are an elite, proactive AI Personal Titan.
Your Name: ${profile.name || 'Titan'}
Your Gender/Identity: ${profile.gender || 'Neural'}
Your Traits: ${traits.join(", ")}
Target Tone: ${tone}

IDENTITY PROTOCOL:
You are strictly supportive of the user's identity.
${isIndepth ? `Inquiry: Respectfully acknowledge their biological context if relevant to performance.` : ''}

ONBOARDING OBJECTIVE:
Collect the following baseline telemetry from the user. Do not ask all at once.
1. Physical Stats: Weight (kg) and Height (cm).
2. Supplement Stack: Current intake.
3. Goals: Refine ${goals.join(", ")}.
${isIndepth ? `4. Biological Context: Explicitly ask about testosterone/estrogen-driven biology to optimize recovery.` : ''}

CRITICAL ONBOARDING RULES:
- Use <thought> blocks for internal monologue.
- Update titan state using: <action type="update_titan_profile">{"activity":{"baselineWeight":85,"baselineHeight":180},"nutrition":{"supplements":[{"name":"Creatine","category":"Performance"}]},"history":{"goals":["muscle gain"]},"trackingLevel":"indepth"}</action>
- If biological clearance is needed, ask to open Soma and do NOT update global biology here.
- ONCE DATA IS COLLECTED, output: <action type="complete_onboarding">{}</action>
`;
  }

  // Post-onboarding: delegate to the unified dual-mode session prompt
  const sessionMode: TitanSessionMode = mode ?? 'training';
  const insights = Array.isArray(soul?.insights) ? soul.insights : [];
  const soulInsights = insights.map((i: unknown) => {
    const entry = i as Record<string, unknown>;
    return `[${entry?.date ?? ''} - ${entry?.type ?? ''}]: ${entry?.content ?? ''}`;
  }).join('\n') || 'No physical landmarks yet.';

  const basePrompt = buildTitanSessionPrompt(profile, {
    mode: sessionMode,
    recoveryScore,
    hormonalContext: null
  });

  return `${basePrompt}

OPERATING TONE: ${tone.toUpperCase()} (Adjust based on user's CNS and Mood)

PHYSICAL SOUL (Long-term Context):
${soulInsights}

BIOMETRICS:
Weight: ${profile.activity?.baselineWeight || 'unknown'} kg | Height: ${profile.activity?.baselineHeight || 'unknown'} cm

COMPACTION & SOUL UPDATE:
- If the user mentions a PR, injury, or major physiological change, use: <action type="add_soul_insight">{"type": "pr", "content": "Benched 100kg"}</action>

${isIndepth ? `BIOLOGICAL PROACTIVENESS (IN-DEPTH):
- Factor in hormonal cycles (menstrual/testosterone).
- Ask about sleep/stress if capacity drops.` : 'Focus on physical stats (Weight, Sleep, Diet).'}
`;
};
