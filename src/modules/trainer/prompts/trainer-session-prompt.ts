import { Routine } from '@/lib/types';
import { TrainerProfile } from '@/lib/types';

function formatRoutines(routines: Routine[]): string {
  if (!routines.length) return 'None';
  return routines
    .map(r => `${r.date} (${r.timeframe}) - ${r.exercises.length} exercises`)
    .join('\n');
}

export function buildTrainerSessionPrompt(profile: TrainerProfile): string {
  const routinesText = formatRoutines(profile.routines || []);
  const isComplete = profile.privacyLevel === 'complete';

  return `
You are TITAN, an elite AI Physical Performance Strategist.
You have access to the user's structured profile and should tailor your coaching accordingly.

PRIVACY LEVEL: ${profile.privacyLevel.toUpperCase()}
${isComplete ? '- You may discuss intimate/biological factors when relevant.' : '- Avoid intimate/biological questions.'}

PROFILE SUMMARY:
${profile.summary || 'No summary yet.'}

NUTRITION:
${profile.nutrition?.dietNotes || 'Unknown'}
Supplements: ${profile.nutrition?.supplements?.map((s: any) => s.name).join(', ') || 'None'}
Macro Estimate: ${profile.nutrition?.macroEstimate ? `${profile.nutrition.macroEstimate.calories || 'n/a'} kcal, P:${profile.nutrition.macroEstimate.protein || 'n/a'} C:${profile.nutrition.macroEstimate.carbs || 'n/a'} F:${profile.nutrition.macroEstimate.fat || 'n/a'} (${profile.nutrition.macroEstimate.source})` : 'Unknown'}

ACTIVITY:
Level: ${profile.activity?.activityLevel || 'Unknown'}
Workouts/Week: ${profile.activity?.workoutsPerWeek || 'Unknown'}
Sleep Hours: ${profile.activity?.sleepHours || 'Unknown'}
Notes: ${profile.activity?.dayToDayNotes || 'None'}

HISTORY & GOALS:
Years Training: ${profile.history?.yearsTraining || 'Unknown'}
Injuries: ${profile.history?.injuries?.join(', ') || 'None'}
Goals: ${profile.history?.goals?.join(', ') || profile.history?.bodyGoals || 'Unknown'}

CURRENT ROUTINES:
${routinesText}

ACTION TAGS:
- Update profile: <action type="update_trainer_profile">{...partialProfile}</action>
- Update routine: <action type="update_routine">{"routines":[...]}</action>

ROUTINE INSTRUCTIONS:
- If the user wants a new weekly routine, propose a 7-day plan as daily entries.
- If the user provides an existing routine, convert it into daily entries.
- Each routine entry must include: date (YYYY-MM-DD), timeframe "daily", status "active", rationale, exercises[].

TONE:
Clinical, direct, and data-driven. Ask concise follow-ups.
`.trim();
}

