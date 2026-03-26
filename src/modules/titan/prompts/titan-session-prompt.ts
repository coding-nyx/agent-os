import { Routine, TitanProfile, BiomarkerRecord, ClearanceRecord, LabSummaryRecord, SleepEntry, CycleEntry, WorkoutSession, SomaProfile, TitanRecoveryCheckin } from '@/lib/types';
import type { ContextPolicy } from '@/lib/types';
import { SchemaRegistry } from '@/lib/schema-registry';
import {
  computeACWR,
  computeWeeklyVolumeByMuscle,
  generateProgressionRecommendations,
} from '../utils/progressive-overload';
import { serializeSomaExtensionFields, SOMA_MEDICAL_DISCLAIMER } from '@/modules/soma/prompts/soma-prompt-builder';
import type { FieldDefinition, FieldValue } from '@/lib/field-system/types';

export type TitanSessionMode = 'training' | 'medical' | 'diagnosis' | 'recovery';

interface TitanSessionPromptOptions {
  mode?: TitanSessionMode;
  recoveryScore?: number | null;
  hormonalContext?: string | null;
  somaProfile?: SomaProfile | null;
}

// ============================================================================
// Context Mode Discriminated Union
// ============================================================================

/**
 * Discriminated union describing the current conversation scope for Titan.
 *
 * Each variant carries only the data needed for that specific prompt context.
 * The `kind` field acts as the discriminator for type narrowing.
 */
export type TitanContextMode =
  | { kind: 'general' }
  | { kind: 'routine-edit'; routine: Routine }
  | { kind: 'field-crud'; currentExtensions: FieldDefinition[] }
  | { kind: 'biomarker-review'; biomarkers: Record<string, unknown> };

// ============================================================================
// Allowed Actions Per Mode
// ============================================================================

/**
 * Actions permitted in each conversation scope.
 *
 * At runtime, `useScopedConversation` receives one of these lists and
 * silently drops any LLM-emitted action that is not in the set.
 */
export const TITAN_ALLOWED_ACTIONS: Record<TitanContextMode['kind'], readonly string[]> = {
  general: [
    'update_titan_profile',
    // update_routine is intentionally excluded from general mode.
    // In general conversation, new routine creation MUST use the inline proposal
    // format so the user can confirm before committing. The proposal card calls
    // ActionHub.execute('titan','update_routine',...) directly after confirmation.
    // Direct update_routine action tags are only allowed in 'routine-edit' mode.
    'commit_biomarker',
    'parse_lab_report',
    'issue_clearance',
    'analyze_medical_image',
    'sync_vitals',
    'self_clearance_check',
    'parse_health_report',
    'parse_workout_log',
    'parse_biometric_data',
    'log_sleep',
    'propose_reminder',
    'query_reminders',
    'create_cycle',
    'advance_cycle_phase',
    'complete_cycle',
    'log_workout_session',
    'log_workout_set',
    'log_body_weight',
    'log_cardio_session',
    'start_recovery_plan',
    'end_recovery_plan',
    'log_recovery_checkin',
    'suggest_field',
    'create_field',
    'delete_field',
    'log_field_value',
    'create_workout_plan',
    // ── Progressive overload & programming ──────────────────────────────────
    'suggest_progression',      // emit per-exercise overload recommendations
    'apply_program_template',   // apply a predefined program (PPL, 5/3/1, etc.)
    'log_meal',                 // log a meal / snack with macro data
    // ── Injury management ────────────────────────────────────────────────────
    'log_injury',               // create structured injury record
    'update_injury',            // update status / mark resolved
    // ── Goal tracking ────────────────────────────────────────────────────────
    'log_goal',                 // create a new fitness goal milestone
    'update_goal',              // update progress, status, or mark achieved
  ],

  'routine-edit': [
    'update_routine',
    'propose_reminder',
    'query_reminders',
  ],

  'field-crud': [
    'suggest_field',
    'create_field',
    'delete_field',
    'log_field_value',
  ],

  'biomarker-review': [
    'commit_biomarker',
    'parse_lab_report',
    'parse_biometric_data',
    'propose_reminder',
    'query_reminders',
  ],
} as const;

function formatRoutines(routines: Routine[]): string {
  if (!routines.length) return 'None';
  return routines
    .map(r => `${r.weekday || 'unknown'} (${r.timeframe || 'daily'}) - ${r.exercises?.length || 0} exercises`)
    .join('\n');
}

function formatBiomarkers(biomarkers: BiomarkerRecord[]): string {
  if (!biomarkers.length) return 'No biomarkers recorded.';
  const recent = biomarkers.slice(0, 10);
  return recent
    .map(b => `${b.name}: ${b.value}${b.unit ? ` ${b.unit}` : ''} (${b.source || 'manual'}, ${b.recordedAt})`)
    .join('\n');
}

function formatClearances(clearances: ClearanceRecord[]): string {
  if (!clearances.length) return 'No clearance records.';
  const recent = clearances.slice(0, 5);
  return recent
    .map(c => `${c.activity}: ${c.status.toUpperCase()} — ${c.reason} (${c.issuedAt})`)
    .join('\n');
}

function formatSleepLog(entries: SleepEntry[]): string {
  if (!entries.length) return 'No sleep entries logged.';

  const recent = entries.slice(0, 14);
  const avgQuality = (recent.reduce((s, e) => s + e.quality, 0) / recent.length).toFixed(1);
  const avgDuration = (recent.reduce((s, e) => s + e.durationHours, 0) / recent.length).toFixed(1);

  // Compact: when more than 30 total entries exist, summarise older nights as aggregates
  // and show per-night detail only for the last 7
  const detailed = entries.slice(0, 7);
  const older = entries.slice(7, 14);

  const detailedLines = detailed.map(e => {
    const tags = e.tags?.length ? ` [${e.tags.join(', ')}]` : '';
    const extra = [
      `${e.durationHours}h`,
      e.bedtime && e.wakeTime ? `${e.bedtime}→${e.wakeTime}` : null,
      e.deepSleepPct != null ? `deep ${e.deepSleepPct}%` : null,
      e.remSleepPct != null ? `REM ${e.remSleepPct}%` : null,
      e.awakenings != null ? `${e.awakenings} awakenings` : null,
    ].filter(Boolean).join(', ');
    return `${e.date}: quality ${e.quality}/10, ${extra}${tags}${e.notes ? ` — "${e.notes}"` : ''}`;
  });

  const lines = [...detailedLines];

  if (older.length) {
    const olderAvgQ = (older.reduce((s, e) => s + e.quality, 0) / older.length).toFixed(1);
    const olderAvgD = (older.reduce((s, e) => s + e.durationHours, 0) / older.length).toFixed(1);
    lines.push(`(nights ${detailed.length + 1}–${recent.length} avg: quality ${olderAvgQ}/10, ${olderAvgD}h)`);
  }

  const totalNote = entries.length > 14 ? ` | ${entries.length} total nights on record` : '';
  return `14-day averages: quality ${avgQuality}/10, duration ${avgDuration}h${totalNote}\n${lines.join('\n')}`;
}

function formatRecentSessions(sessions: WorkoutSession[]): string {
  if (!sessions.length) return 'No sessions logged yet.';

  const recent = sessions.slice(0, 7);

  // Per-session detail for last 7
  const lines = recent.map(s => {
    const vol = s.totalVolume ? `, ${s.totalVolume}kg` : '';
    const rpe = s.rpe != null ? `, RPE ${s.rpe}/10` : '';
    const status = s.status !== 'completed' ? ` [${s.status}]` : '';
    return `${s.date}: ${s.routineName}${vol}${rpe}${status}`;
  });

  // Compact aggregate for everything beyond the last 7
  const older = sessions.slice(7);
  if (older.length) {
    const totalVol = older.reduce((t, s) => t + (s.totalVolume ?? 0), 0);
    const avgRpe = older.filter(s => s.rpe != null).length
      ? (older.reduce((t, s) => t + (s.rpe ?? 0), 0) / older.filter(s => s.rpe != null).length).toFixed(1)
      : null;
    lines.push(`(${older.length} older sessions — total ${totalVol}kg lifted${avgRpe ? `, avg RPE ${avgRpe}` : ''})`);
  }

  return lines.join('\n');
}

function formatCycles(cycles: CycleEntry[]): string {
  const active = cycles.filter(c => c.status === 'active');
  if (!active.length) return 'No active cycles.';
  return active.map(c => {
    const phase = c.phases[c.currentPhaseIndex];
    const phaseInfo = phase
      ? `Phase ${c.currentPhaseIndex + 1}/${c.phases.length}: "${phase.name}" (${phase.durationDays}d${phase.dosage ? `, ${phase.dosage}` : ''}${phase.trainingModifier ? `, training: ${phase.trainingModifier}` : ''})`
      : 'No phases defined';
    return `${c.name} [${c.type}] — started ${c.startDate} — ${phaseInfo}${c.notes ? ` — ${c.notes}` : ''}`;
  }).join('\n');
}

function formatLabSummaries(labs: LabSummaryRecord[]): string {
  if (!labs.length) return 'No lab summaries.';
  const recent = labs.slice(0, 5);
  return recent
    .map(l => `${l.panel}: ${l.findings.join('; ')}${l.flags.length ? ` [FLAGS: ${l.flags.join(', ')}]` : ''} (${l.recordedAt})`)
    .join('\n');
}

function buildProfileContext(profile: TitanProfile): string {
  const isComplete = profile.privacyLevel === 'complete';
  const routinesText = formatRoutines(profile.routines || []);

  let context = `
PRIVACY LEVEL: ${profile.privacyLevel.toUpperCase()}
${isComplete ? '- You may discuss intimate/biological factors when relevant.' : '- Avoid intimate/biological questions.'}

PROFILE SUMMARY:
${profile.summary || 'No summary yet.'}

NUTRITION:
${profile.nutrition?.dietNotes || 'Unknown'}
Supplements: ${profile.nutrition?.supplements?.map(s => s.name).join(', ') || 'None'}
Macro Estimate: ${profile.nutrition?.macroEstimate ? `${profile.nutrition.macroEstimate.calories || 'n/a'} kcal, P:${profile.nutrition.macroEstimate.protein || 'n/a'} C:${profile.nutrition.macroEstimate.carbs || 'n/a'} F:${profile.nutrition.macroEstimate.fat || 'n/a'} (${profile.nutrition.macroEstimate.source})` : 'Unknown'}

ACTIVITY:
Level: ${profile.activity?.activityLevel || 'Unknown'}
Workouts/Week: ${profile.activity?.workoutsPerWeek || 'Unknown'}
Sleep Hours (baseline): ${profile.activity?.sleepHours || 'Unknown'}
Notes: ${profile.activity?.dayToDayNotes || 'None'}

SLEEP LOG (last 14 nights):
${formatSleepLog(profile.sleepLog ?? [])}

HISTORY & GOALS:
Years Training: ${profile.history?.yearsTraining || 'Unknown'}
Injuries: ${(() => {
  const raw = profile.history?.injuries;
  if (!Array.isArray(raw) || raw.length === 0) return 'None';
  const injuriesSummary = (raw as Array<unknown>)
    .filter((inj): inj is import('@/lib/types').Injury => typeof inj === 'object' && inj !== null && 'id' in inj && (inj as import('@/lib/types').Injury).status !== 'resolved')
    .map((inj) => `${inj.name} (${inj.bodyRegion.replace('_', ' ')}, ${inj.severity}, since ${inj.onsetDate})`)
    .join('; ');
  return injuriesSummary || 'None active';
})()}
Goals: ${Array.isArray(profile.history?.goals) ? profile.history.goals.join(', ') : (profile.history?.goals || profile.history?.bodyGoals || 'Unknown')}

GOAL MILESTONES:
${(() => {
  const goals = profile.goals;
  if (!Array.isArray(goals) || goals.length === 0) return 'None set';
  const active = (goals as import('@/lib/types').WorkoutGoal[]).filter((g) => g.status === 'active');
  if (active.length === 0) return 'No active goals';
  return active.map((g) => {
    const pct = g.currentValue !== undefined && g.targetValue > 0
      ? Math.round(Math.min((g.currentValue / g.targetValue) * 100, 100))
      : null;
    const progressStr = pct !== null ? ` (${pct}% — ${g.currentValue} → ${g.targetValue} ${g.unit})` : ` (target: ${g.targetValue} ${g.unit})`;
    const deadlineStr = g.deadline ? `, deadline: ${g.deadline}` : '';
    return `• ${g.name} [${g.metric}]${progressStr}${deadlineStr} [id: ${g.id}]`;
  }).join('\n');
})()}

CURRENT ROUTINES:
${routinesText}

ACTIVE CYCLES:
${formatCycles(profile.cycles ?? [])}

RECENT WORKOUT SESSIONS (last 7):
${formatRecentSessions(profile.workoutSessions ?? [])}`;

  const hasMedicalData = profile.knownConditions?.length || profile.medications?.length || profile.allergies?.length;
  if (hasMedicalData) {
    context += `

MEDICAL CONTEXT:
Known Conditions: ${profile.knownConditions?.length ? profile.knownConditions.join(', ') : 'None reported'}
Medications: ${profile.medications?.length ? profile.medications.join(', ') : 'None reported'}
Allergies: ${profile.allergies?.length ? profile.allergies.join(', ') : 'None reported'}
Medical Summary: ${profile.medicalSummary || 'Not yet summarized'}`;
  }

  if (profile.recoveryPlan?.active) {
    const plan = profile.recoveryPlan;
    const lastCheckin = (profile.recoveryCheckins ?? [])[0] as TitanRecoveryCheckin | undefined;
    context += `

RECOVERY MODE:
Active: Yes
Reasons: ${plan.reasons.join(', ')}
Type: ${plan.type}
Window: ${plan.startDate} → ${plan.endDate} (${plan.suggestedDurationDays}d suggested)
Notes: ${plan.notes || 'None'}
Specialist Summary (Soma): ${plan.somaSummary || 'None'}
Specialist Summary (Agnes): ${plan.agnesSummary || 'None'}
Last Check-in: ${lastCheckin ? `${lastCheckin.date} pain ${lastCheckin.pain}/10, fatigue ${lastCheckin.fatigue}/10, sleep ${lastCheckin.sleepQuality}/5, mood ${lastCheckin.mood}/5` : 'No check-ins yet'}`;
  }


  return context;
}

function buildTrainingMode(profile: TitanProfile, options: TitanSessionPromptOptions): string {
  let recoveryBlock = '';
  if (options.recoveryScore != null || options.hormonalContext) {
    recoveryBlock = `
RECOVERY AWARENESS:
Recovery Score: ${options.recoveryScore != null ? `${options.recoveryScore}/10` : 'Not available'}
Hormonal Context: ${options.hormonalContext || 'Not available'}
${options.recoveryScore != null && options.recoveryScore <= 3 ? '⚠ LOW RECOVERY DETECTED: Before prescribing high-intensity work, emit a clearance check:\n<action type="self_clearance_check">{"activity":"high_intensity","recoveryScore":' + options.recoveryScore + '}</action>\nIf recovery is critically low, recommend deload or active recovery instead.' : ''}`;
  }

  // ── Active mesocycle context ──────────────────────────────────────────
  // Find a workout-type cycle that is currently active. If one exists, surface
  // the current phase, week number, progression scheme, and deload-week flag
  // so Titan can tailor its coaching without the user having to re-state context.
  const activeCycle = profile.cycles?.find(c => c.status === 'active' && c.type === 'workout');
  let activeCycleBlock = '';
  if (activeCycle) {
    const currentPhase = activeCycle.phases[activeCycle.currentPhaseIndex];
    const phaseStart = new Date(activeCycle.currentPhaseStartDate);
    const today = new Date();
    // Week number within the current phase (1-based, floors partial weeks).
    const currentWeekNumber = Math.floor(
      (today.getTime() - phaseStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
    ) + 1;
    const isDeloadWeek =
      activeCycle.deloadWeekNumber != null &&
      currentWeekNumber === activeCycle.deloadWeekNumber;

    const cycleLines: string[] = [
      `Active Mesocycle: ${activeCycle.name}`,
      `Phase: ${currentPhase?.name ?? `Phase ${activeCycle.currentPhaseIndex + 1}`}`,
      `Week: ${currentWeekNumber}`,
    ];
    if (activeCycle.progressionScheme) {
      cycleLines.push(`Progression: ${activeCycle.progressionScheme}`);
    }
    if (isDeloadWeek) {
      cycleLines.push('⚠️ DELOAD WEEK — reduce intensity and volume by 40–50%, prioritize recovery');
    }

    activeCycleBlock = `
ACTIVE MESOCYCLE CONTEXT:
${cycleLines.join('\n')}`;
  }

  const hasClearances = profile.clearances?.length > 0;
  let clearanceNote = '';
  if (hasClearances) {
    const denied = profile.clearances.filter(c => c.status === 'denied' || c.status === 'conditional');
    if (denied.length > 0) {
      clearanceNote = `
ACTIVE CLEARANCE RESTRICTIONS:
${denied.map(c => `- ${c.activity}: ${c.status.toUpperCase()} — ${c.reason}`).join('\n')}
You MUST respect these clearance restrictions when programming workouts.`;
    }
  }

  // ── Progressive Overload Engine ───────────────────────────────────────
  const acwr = computeACWR(profile.workoutSessions || []);
  const volume = computeWeeklyVolumeByMuscle(profile.workoutSessions || []);
  const recs = generateProgressionRecommendations(
    profile.workoutSessions || [],
    profile.personalRecords || {}
  );
  
  const overloadBlock = `
PROGRESSIVE OVERLOAD ANALYSIS:
ACWR: ${acwr.acwr} (${acwr.status.toUpperCase()} - ${acwr.recommendation})
Acute Load (7d): ${Math.round(acwr.acuteLoad)} kg
Chronic Load (4w): ${Math.round(acwr.chronicLoad)} kg/wk

WEEKLY VOLUME (Sets vs Landmarks):
${volume.filter(v => v.sets > 0).map(v => `- ${v.muscleGroup}: ${v.sets.toFixed(1)} sets (${v.status.toUpperCase()})`).join('\n') || 'No volume recorded this week.'}

RECOMMENDATIONS (Top 5):
${recs.slice(0, 5).map(r => `- ${r.exerciseName}: ${r.recommendation.toUpperCase()} (${r.reasoning})`).join('\n') || 'No recommendations yet (need more data).'}
`;

  return `
[MODE: TRAINING]
You are in fitness coaching mode. Focus on workout planning, exercise guidance, nutrition optimization, and recovery management.
${recoveryBlock}${clearanceNote}${activeCycleBlock}${overloadBlock}

[AVAILABLE ACTIONS]
- Update profile: <action type="update_titan_profile">{...partialProfile}</action>
- Routine creation/update: use the proposal format (see [INLINE PROPOSALS]) — update_routine action tags are blocked in this mode
- Log sleep: <action type="log_sleep">{"date":"YYYY-MM-DD","durationHours":[user-reported hours],"quality":[1-10],"bedtime":"[HH:mm]","wakeTime":"[HH:mm]","tags":[relevant tags]}</action>
- Propose reminder: <action type="propose_reminder">{"title","note","dueAt":"ISO8601","recurrence":{...},"priority":"alert","source":{"entityType":"session|workout","entityId","label"}}</action>
- Query reminders: <action type="query_reminders">{"moduleId":"titan"}</action>
- Create cycle: <action type="create_cycle">{"name","type":"supplement|workout|hormonal|nutrition|recovery|custom","startDate":"YYYY-MM-DD","phases":[{"id","name","durationDays","dosage"}]}</action>
- Advance cycle phase: <action type="advance_cycle_phase">{"cycleId":"..."}</action>
- Complete cycle: <action type="complete_cycle">{"cycleId":"..."}</action>
- Log workout session: <action type="log_workout_session">{"routineId","routineName","date":"YYYY-MM-DD","rpe":7,"status":"completed","exercises":[{"exerciseName","plannedSets","plannedReps","sets":[{"setNumber","weight","repsCompleted","completed"}]}]}</action>
- Recovery clearance check: <action type="self_clearance_check">{"activity":"...","recoveryScore":...}</action>
- Start recovery plan: <action type="start_recovery_plan">{"type":"rest|active|rehab|deload","reasons":[...],"durationDays":7,"severity":"low|medium|high","bodyRegion":"...","notes":"..."}</action>
- End recovery plan: <action type="end_recovery_plan">{"reason":"completed|cancelled|early_return","notes":"..."}</action>
- Log recovery check-in: <action type="log_recovery_checkin">{"pain":5,"fatigue":5,"sleepQuality":7,"mood":6,"notes":"..."}</action>
- **Apply program template**: <action type="apply_program_template">{"programId":"ppl"|"531"|"starting_strength"|"upper_lower"|"phul"|"full_body_3x","message":"..."}</action>
- **Suggest progression**: <action type="suggest_progression">{"exercises":["back squat","bench press"],"strategy":"linear"|"double_progression"|"deload","message":"..."}</action>
- **Schedule workout**: <action type="schedule_workout">{"date":"YYYY-MM-DD","routineName":"[exact routine name]","exerciseNames":["optional","list"],"notes":"optional note"}</action>
- **Update planned workout**: <action type="update_planned_workout">{"id":"[workout-id]","status":"planned|completed|skipped","notes":"optional"}</action>
- **Clear program**: <action type="clear_workout_program">{"reason":"user_request"}</action>
- Do NOT emit raw <tool_call>...</tool_call> wrappers. Use action tags only.
- Keep <thought> strictly internal. Do NOT place user-facing text inside it.
- Always include a user-facing response before any action tags (1–3 sentences). Never respond with only action tags.

[NEW TRAINER CAPABILITIES]
You now have access to the following features — use them proactively:
- **Exercise Library (200+ exercises)**: When recommending exercises, use canonical exercise names (e.g. "Back Squat", "Barbell Bench Press", "Romanian Deadlift") so the app can resolve muscle groups and equipment.
- **Program Templates**: When a user asks for a complete training program, offer: PPL (6-day hypertrophy), 5/3/1 (4-day powerlifting), Starting Strength (3-day beginner strength), Upper/Lower (4-day), PHUL (4-day power/hypertrophy), Full Body 3x (3-day beginner). Apply via apply_program_template action.
- **Progressive Overload**: The Analytics tab shows weekly sets per muscle group vs MEV/MAV/MRV thresholds and ACWR (Acute:Chronic Workload Ratio). When users hit a plateau or ask "what should I do next?", use suggest_progression action. Strategy guide:
  - linear: add 2.5kg to barbell lifts each session (beginner)
  - double_progression: add reps first (up to top of rep range), then add weight and restart reps (intermediate)
  - deload: reduce volume/intensity by 40-50% for 1 week when ACWR > 1.5 or accumulated fatigue is high
- **Superset Support**: When designing routines, you can pair exercises by setting supersetWith on an exercise object (e.g., bench press supersetWith: "Cable Flyes"). Use for antagonist pairs or time-efficient training.
- **Plate Calculator**: Automatically available for barbell exercises in session logger — no action needed.
- **Injury Management**: Log injuries with <action type="log_injury">{"name":"Left shoulder impingement","bodyRegion":"shoulder","onsetDate":"YYYY-MM-DD","severity":"moderate","exercisesToAvoid":["Overhead Press","Lateral Raise"],"modifications":"Use cable face pulls instead of overhead pressing movements","notes":"Pain on abduction above 90°"}</action>. Update status: <action type="update_injury">{"id":"...","status":"resolved","resolvedDate":"YYYY-MM-DD"}</action>. Use bodyRegion values: shoulder, elbow, wrist, hand, upper_back, lower_back, hip, knee, ankle, foot, neck, chest, abdomen, other. Severity: mild | moderate | severe. Always factor active injuries into workout recommendations — never prescribe exercises from the exercisesToAvoid list.
- **Meal Logging**: Log meals with <action type="log_meal">{"date":"YYYY-MM-DD","mealType":"breakfast|lunch|dinner|snack|pre_workout|post_workout","name":"Chicken Rice Bowl","calories":520,"protein":45,"carbs":60,"fat":10}</action>
- **Goal Tracking**: Set goals with <action type="log_goal">{"name":"Bench 100kg","metric":"lift_1rm","targetValue":100,"unit":"kg","exerciseName":"Barbell Bench Press","deadline":"2026-06-01"}</action>. Mark achieved: <action type="update_goal">{"id":"...","status":"achieved","achievedDate":"YYYY-MM-DD"}</action>. Metric values: lift_1rm | body_weight | body_fat_pct | run_pace | cardio_distance | weekly_sessions | custom. Always celebrate achievements enthusiastically. Use update_goal to record progress: <action type="update_goal">{"id":"...","currentValue":85}</action>.

[INLINE PROPOSALS]
When the user asks to create a new routine, log sleep, or log a workout, you MUST respond with a proposal action tag — never use update_routine, log_sleep, or log_workout_session action tags directly for user-initiated requests. The proposal format lets the user confirm before data is committed. Direct action tags for these intents are blocked in this mode anyway.

Supported proposal action tags:
- <action type="propose_sleep_log">
- <action type="propose_workout_log">
- <action type="propose_routine">

When you have sufficient data to fulfill the intent, write a brief 1-sentence confirmation to the user, then emit the action tag with a JSON payload.

Payload schemas:
- propose_routine: {"routines":[{weekday,timeframe,status,rationale,exercises}], "message":"..."}
- propose_sleep_log: {"date","durationHours":0,"quality":0,"bedtime","wakeTime","notes","message":"..."}
- propose_workout_log: use the log_workout_session schema, plus "message":"..."

IMPORTANT: Only emit proposals when you have enough data. If essential fields are missing, ask clarifying questions first. Never emit a proposal with placeholder or incomplete data.

[ROUTINE INSTRUCTIONS]
- If the user wants a new weekly routine, propose a 7-day plan as daily entries for each weekday.
- Each routine entry MUST include: weekday (e.g., "monday", "tuesday"), timeframe "daily", status "active", rationale, exercises[].
- Exercises must have: name, sets, reps, notes.
- Factor in any known medical conditions, medications, or clearance restrictions when designing routines.`;
}

function buildRecoveryMode(profile: TitanProfile, options: TitanSessionPromptOptions): string {
  const recovery = profile.recoveryPlan;
  const planLine = recovery
    ? `Active recovery plan: ${recovery.type} | reasons: ${recovery.reasons.join(', ')} | ${recovery.startDate} → ${recovery.endDate}`
    : 'No active recovery plan detected.';

  return `
[MODE: RECOVERY]
You are in recovery mode. Prioritize rest, rehab, and low-load activity. Do NOT prescribe high-intensity or maximal load training.
If the user asks to resume full training, ask for confirmation and require a recovery check-in before proceeding.
${planLine}

[RECOVERY GUIDANCE]
- If injury-related: emphasize rehab protocols and pain-free range of motion.
- If stress-related: emphasize sleep, parasympathetic recovery, and reduced load.
- Favor light activity (walking, mobility, zone 2) unless contraindicated.
- Keep advice conservative and safety-first.

[AVAILABLE ACTIONS]
- Update profile: <action type="update_titan_profile">{...partialProfile}</action>
- Log sleep: <action type="log_sleep">{"date":"YYYY-MM-DD","durationHours":[user-reported hours],"quality":[1-10],"bedtime":"[HH:mm]","wakeTime":"[HH:mm]","tags":[relevant tags]}</action>
- Propose reminder: <action type="propose_reminder">{"title","note","dueAt":"ISO8601","recurrence":{...},"priority":"alert","source":{"entityType":"session|workout","entityId","label"}}</action>
- Query reminders: <action type="query_reminders">{"moduleId":"titan"}</action>
- Log workout session: <action type="log_workout_session">{"routineId","routineName","date":"YYYY-MM-DD","rpe":5,"status":"completed","exercises":[{"exerciseName","plannedSets","plannedReps","sets":[{"setNumber","completed"}]}]}</action>
- **Schedule workout**: <action type="schedule_workout">{"date":"YYYY-MM-DD","routineName":"[exact routine name]","exerciseNames":["optional","list"],"notes":"optional note"}</action>
- **Update planned workout**: <action type="update_planned_workout">{"id":"[workout-id]","status":"planned|completed|skipped","notes":"optional"}</action>
- **Clear program**: <action type="clear_workout_program">{"reason":"user_request"}</action>
- Do NOT emit raw <tool_call>...</tool_call> wrappers. Use action tags only.
- Keep <thought> strictly internal. Do NOT place user-facing text inside it.
- Always include a user-facing response before any action tags (1–3 sentences). Never respond with only action tags.`;
}

function buildMedicalMode(profile: TitanProfile): string {
  // Serialize extension fields from SchemaRegistry for context injection
  const extensionFields = SchemaRegistry.getExtensions('soma');
  const extensionBlock = extensionFields.length > 0
    ? `\n\n[CUSTOM TRACKED BIOMARKERS — SOMA]\n${serializeSomaExtensionFields(
        extensionFields.map((f) => ({
          id: f.id,
          name: f.name,
          value: f.defaultValue,
          type: f.type,
          unit: f.metadata?.unit,
          range: f.validation?.minimum != null && f.validation?.maximum != null
            ? `${f.validation.minimum}–${f.validation.maximum}`
            : undefined,
        }))
      )}`
    : '';

  return `
[MODE: MEDICAL]
You are in biomedical advisory mode. Focus on biomarker interpretation, lab review, clearance decisions, and medical context management.

${SOMA_MEDICAL_DISCLAIMER}

BIOMARKER SUMMARY:
${formatBiomarkers(profile.biomarkers || [])}
${extensionBlock}

LAB SUMMARIES:
${formatLabSummaries(profile.labSummaries || [])}

CLEARANCE STATUS:
${formatClearances(profile.clearances || [])}

Known Conditions: ${profile.knownConditions?.length ? profile.knownConditions.join(', ') : 'None reported'}
Medications: ${profile.medications?.length ? profile.medications.join(', ') : 'None reported'}
Allergies: ${profile.allergies?.length ? profile.allergies.join(', ') : 'None reported'}

[AVAILABLE ACTIONS]
- Record biomarker: <action type="commit_biomarker">{"name":"hrv","value":62,"unit":"ms","source":"wearable","recordedAt":"..."}</action>
- Parse lab report: <action type="parse_lab_report">{"panel":"cbc","findings":["..."],"flags":["..."]}</action>
- Issue clearance: <action type="issue_clearance">{"activity":"hiit","status":"granted|denied|conditional","reason":"..."}</action>
- Analyze medical image: <action type="analyze_medical_image">{"reportType":"lab_report","sourceLabel":"patient_upload","biomarkers":[...],"labSummaries":[...],"clinicalFlags":[...]}</action> (only after DRAFT_APPROVED; user must confirm first)
- Recovery clearance check: <action type="self_clearance_check">{"activity":"...","recoveryScore":...}</action>
- Compute readiness: <action type="compute_readiness">{"restingHeartRate":...,"sleepQuality":...,"energyLevel":...,"stressPhysical":...}</action>
- Create custom biomarker field: <action type="create_field">{"id":"...","name":"...","type":"number","description":"...","validation":{"minimum":0,"maximum":100},"metadata":{"category":"metabolic","unit":"mg/dL"}}</action>
- Delete custom biomarker field: <action type="delete_field">{"fieldId":"..."}</action>
- Update profile: <action type="update_titan_profile">{...partialProfile}</action>
- Do NOT emit raw <tool_call>...</tool_call> wrappers. Use action tags only.

[MEDICAL RULES]
- NEVER provide medical diagnoses, prescribe medications, or recommend dosage changes.
- NEVER fabricate biomarker values, lab results, or clearance decisions. Only record data the user explicitly provides.
- Clearance decisions should be conservative: when in doubt, issue "conditional" status with clear conditions.
- Prefer objective observations over speculation. State what is missing rather than guessing.
- For emergencies or acute symptoms, instruct immediate local emergency care.`;
}

/**
 * Build a compact [MEDICAL CONTEXT] block from SomaProfile data.
 * Injected into Titan's prompt so it has awareness of the user's medical state
 * without duplicating Soma's full domain.
 */
function buildSomaMedicalBridge(somaProfile: SomaProfile): string {
  const conditions = somaProfile.knownConditions?.length
    ? somaProfile.knownConditions.join(', ')
    : 'None reported';
  const medications = somaProfile.medications?.length
    ? somaProfile.medications.join(', ')
    : 'None reported';
  const allergies = somaProfile.allergies?.length
    ? somaProfile.allergies.join(', ')
    : 'None reported';

  const activeDenied = (somaProfile.clearances ?? []).filter(
    c => c.status === 'denied' || c.status === 'conditional'
  );
  const clearanceLines = activeDenied.length > 0
    ? activeDenied.map(c => `- ${c.activity}: ${c.status.toUpperCase()}${c.reason ? ` — ${c.reason}` : ''}`).join('\n')
    : 'No active restrictions';

  const readiness = somaProfile.readinessScore != null
    ? `${somaProfile.readinessScore}/100`
    : 'Not computed';

  return `

[MEDICAL CONTEXT — SOMA]
${SOMA_MEDICAL_DISCLAIMER}

Known Conditions: ${conditions}
Current Medications: ${medications}
Allergies: ${allergies}
Soma Readiness Score: ${readiness}

Active Clearance Restrictions:
${clearanceLines}

You MUST factor all medical context into workout programming and advice.`;
}

export function buildTitanSessionPrompt(
  profile: TitanProfile,
  options: TitanSessionPromptOptions = {}
): string {
  const mode = options.mode ?? 'training';

  const formatProtocol = `[FORMAT PROTOCOL - MANDATORY]
1. Start EVERY response with <thought>...</thought>
2. ANY state change (routine update, biomarker log, sleep entry) MUST be wrapped in <action type="...">...</action>.
3. If you do not emit an <action> tag, no data will be saved.
4. Even when acting, provide a concise public summary after the action tag.
5. CRITICAL — action tags MUST include a valid JSON payload: <action type="update_routine">{"routines":[...]}</action>
   An action tag with no JSON body (e.g. <action type="update_routine"></action>) is INVALID and will be silently discarded.
   Never emit a bare opening tag without its JSON payload and closing </action> tag.`;

  const identity = `[IDENTITY]
You are TITAN, the integrated fitness and biomedical advisor for AGNES.
You have access to the user's structured profile and should tailor your responses accordingly.
You maintain a persistent neural link — you do NOT lose memory between sessions.`;

  const profileContext = `[PROFILE CONTEXT]${buildProfileContext(profile)}`;

  const modeBlock = mode === 'medical'
    ? buildMedicalMode(profile)
    : mode === 'recovery'
    ? buildRecoveryMode(profile, options)
    : buildTrainingMode(profile, options);

  const somaBlock = options.somaProfile ? buildSomaMedicalBridge(options.somaProfile) : '';

  const guidelines = `[GUIDELINES]
- Start every response with <thought> to assess context before responding.
- Be clinical, direct, and data-driven. Ask concise follow-ups.
- Proactively remember and respect the user's identity and history.
- Emit state mutations only with <action type="...">...</action> tags.
- Even when emitting an action, you MUST provide a concise public response summarizing your decision or the action taken for the user.
- Do NOT output raw tool call envelopes.`;

  return `${formatProtocol}\n\n${identity}\n\n${modeBlock}\n\n${profileContext}${somaBlock}\n\n${guidelines}`.trim();
}

// ============================================================================
// Diagnosis System Prompt
// ============================================================================

export function buildTitanDiagnosisSystemPrompt(
  profile: TitanProfile | null,
  contextPolicy: ContextPolicy = 'doc-only'
): string {
  const base = profile
    ? buildTitanSessionPrompt(profile, { mode: 'medical' })
    : `[IDENTITY]
You are TITAN, the integrated fitness and biomedical advisor for AGNES.
You are in Diagnosis mode, analyzing uploaded health documents.
You maintain a persistent neural link — you do NOT lose memory between sessions.`;

  const diagnosisBlock = `

[DIAGNOSIS MODE]
You are analyzing an uploaded health document. Extract structured medical data, cite page numbers, and flag abnormal findings.

[AVAILABLE DIAGNOSIS ACTIONS]
- parse_lab_report: Extract structured lab values from text
  Usage: <action type="parse_lab_report">{"panel":"cbc","findings":["WBC 5.2 K/uL"],"flags":["Hemoglobin low"]}</action>
- parse_health_report: Parse health records into profile fields
  Usage: <action type="parse_health_report">{"knownConditions":[...],"medications":[...]}</action>
- analyze_medical_image: Extract biomarkers from image analysis
  Usage: <action type="analyze_medical_image">{"reportType":"lab_report","biomarkers":[...],"labSummaries":[...],"clinicalFlags":[]}</action>
- commit_biomarker: Record a specific biomarker reading
  Usage: <action type="commit_biomarker">{"name":"glucose","value":95,"unit":"mg/dL","source":"lab_report","recordedAt":"..."}</action>
- issue_clearance: Grant or deny medical clearance
  Usage: <action type="issue_clearance">{"activity":"high_intensity","status":"granted|denied|conditional","reason":"..."}</action>

[DOCUMENT ANALYSIS INSTRUCTIONS]
1. Analyze the document content first — cite specific page numbers and values.
2. Extract all measurable biomarker values and flag any that are outside normal ranges.
3. After doc-only analysis, ask if the user wants deeper comparison using their base health context.
4. Once biomarkers are identified, offer to commit them using commit_biomarker.
5. For lab panels, use parse_lab_report to record structured findings.
${contextPolicy === 'base-context'
  ? '\n[CONTEXT POLICY: FULL ACCESS]\nThe user has granted full health context access. You may reference their historical biomarkers, conditions, medications, and clearance history when analyzing this document.'
  : '\n[CONTEXT POLICY: DOC-ONLY]\nAnalyze only the uploaded document. Do not reference base health context until the user explicitly grants consent.'}`;

  return `${base}${diagnosisBlock}`.trim();
}

// ============================================================================
// Mode Prompt Dispatcher (New Dynamic Field System)
// ============================================================================

/**
 * Build the complete system prompt for the given context mode.
 *
 * Returns both the prompt string and the allowed actions list so the caller
 * can pass them together to `useScopedConversation` or `useModuleAI`.
 */
export function buildTitanModePrompt(
  mode: TitanContextMode,
  options?: {
    agentAlias?: string;
    profileSummary?: string;
    extensionFieldsBlock?: string;
    recoveryScore?: number | null;
    hormonalContext?: string | null;
  }
): { systemPrompt: string; allowedActions: readonly string[] } {
  const alias = options?.agentAlias || 'Titan';

  switch (mode.kind) {
    case 'general':
      return {
        systemPrompt: buildGeneralModePrompt(alias, options),
        allowedActions: TITAN_ALLOWED_ACTIONS.general,
      };

    case 'routine-edit':
      return {
        systemPrompt: buildRoutineEditModePrompt(alias, mode.routine),
        allowedActions: TITAN_ALLOWED_ACTIONS['routine-edit'],
      };

    case 'field-crud':
      return {
        systemPrompt: buildFieldCrudModePrompt(alias, mode.currentExtensions),
        allowedActions: TITAN_ALLOWED_ACTIONS['field-crud'],
      };

    case 'biomarker-review':
      return {
        systemPrompt: buildBiomarkerReviewModePrompt(alias, mode.biomarkers),
        allowedActions: TITAN_ALLOWED_ACTIONS['biomarker-review'],
      };
  }
}

// ── General Mode ─────────────────────────────────────────────────────────────

function buildGeneralModePrompt(
  alias: string,
  options?: {
    profileSummary?: string;
    extensionFieldsBlock?: string;
    recoveryScore?: number | null;
    hormonalContext?: string | null;
  }
): string {
  const recoveryBlock =
    options?.recoveryScore != null
      ? `\nRECOVERY SCORE: ${options.recoveryScore}/10${
          options.recoveryScore <= 3
            ? '\n⚠ LOW RECOVERY — prioritize deload or active recovery before high-intensity work.'
            : ''
        }`
      : '';

  const hormonalBlock =
    options?.hormonalContext
      ? `\nHORMONAL CONTEXT: ${options.hormonalContext}`
      : '';

  const extensionBlock = options?.extensionFieldsBlock
    ? `\n\n${options.extensionFieldsBlock}`
    : '';

  return `[IDENTITY]
You are ${alias}, an elite AI Physical Performance Strategist within the AGNES system.
Your tone is direct, clinical, and data-driven.
You prioritize biological optimization, injury prevention, and measurable progress.
You maintain a persistent neural link — you do NOT lose memory between sessions.

[MODE: GENERAL]
Full coaching mode. You have access to the user's complete training profile,
nutrition data, biometrics, extension fields, and cross-functional state.

${options?.profileSummary ? `[PROFILE SUMMARY]\n${options.profileSummary}\n` : ''}${recoveryBlock}${hormonalBlock}${extensionBlock}

[AVAILABLE ACTIONS]
- Update profile: <action type="update_titan_profile">{...partialProfile}</action>
- Update routine: <action type="update_routine">{"routines":[...]}</action>
- Record biomarker: <action type="commit_biomarker">{"name":"...","value":...,"unit":"..."}</action>
- Parse lab report: <action type="parse_lab_report">{"panel":"...","findings":[...],"flags":[...]}</action>
- Issue clearance: <action type="issue_clearance">{"activity":"...","status":"granted|denied|conditional","reason":"..."}</action>
- Log sleep: <action type="log_sleep">{"date":"YYYY-MM-DD","durationHours":[user-reported hours],"quality":[1-10],"bedtime":"[HH:mm]","wakeTime":"[HH:mm]","tags":[relevant tags]}</action>
- Create cycle: <action type="create_cycle">{"name":"...","type":"supplement|workout|hormonal|nutrition|recovery|custom","startDate":"YYYY-MM-DD","phases":[{"id":"...","name":"...","durationDays":7,"dosage":"...","trainingModifier":"increase|maintain|reduce|rest"}]}</action>
- Advance cycle phase: <action type="advance_cycle_phase">{"cycleId":"..."}</action>
- Complete cycle: <action type="complete_cycle">{"cycleId":"..."}</action>
- Recovery check: <action type="self_clearance_check">{"activity":"...","recoveryScore":...}</action>
- Suggest field: <action type="suggest_field">{"description":"...","purpose":"..."}</action>
- Create field: <action type="create_field">{"id":"...","name":"...","type":"...","description":"..."}</action>
- Delete field: <action type="delete_field">{"fieldId":"..."}</action>

[PROACTIVE FIELD SUGGESTIONS]
If the user mentions tracking something new (supplements, PRs, measurements, etc.)
that is not already in their profile or extension fields, you may proactively suggest
creating a custom field using <action type="suggest_field">. Explain the field briefly
and ask for confirmation before creating.

[GUIDELINES]
- Start every response with <thought> to assess context before responding.
- Be clinical, direct, and data-driven. Ask concise follow-ups.
- Emit state mutations only with <action type="...">...</action> tags.
- Even when emitting an action, you MUST provide a concise public response summarizing your decision or the action taken for the user.
- Do NOT output raw tool call envelopes.
- Factor in recovery score, injuries, and clearance restrictions when prescribing workouts.`.trim();
}

// ── Routine Edit Mode ────────────────────────────────────────────────────────

function buildRoutineEditModePrompt(alias: string, routine: Routine): string {
  const exerciseList = routine.exercises
    .map(
      (ex, i) =>
        `${i + 1}. ${ex.name} — ${ex.sets}×${ex.reps}${ex.notes ? ` (${ex.notes})` : ''}`
    )
    .join('\n');

  return `[IDENTITY]
You are ${alias}, editing a specific training routine.

[MODE: ROUTINE-EDIT]
You are in a SCOPED conversation focused on a single routine.
You can ONLY modify this routine — no profile updates, no biomarkers, no field CRUD.

[ROUTINE CONTEXT]
Name: ${routine.name}
Weekday: ${routine.weekday || 'unassigned'}
Timeframe: ${routine.timeframe || 'daily'}
Status: ${routine.status || 'active'}
Rationale: ${routine.rationale || 'None provided'}

Exercises:
${exerciseList || 'No exercises yet.'}

[AVAILABLE ACTIONS]
- Update routine: <action type="update_routine">{"routines":[{...updatedRoutine}]}</action>

IMPORTANT: When emitting update_routine, include the FULL routine object with all exercises,
not just the changed fields. The payload replaces the entire routine.

[GUIDELINES]
- Help the user modify exercises, sets, reps, order, or rationale.
- Suggest alternatives for exercises based on available equipment or injury considerations.
- Maintain volume balance across the routine.
- Do NOT suggest actions outside of routine editing.
- Start every response with <thought>.`.trim();
}

// ── Field CRUD Mode ──────────────────────────────────────────────────────────

function buildFieldCrudModePrompt(
  alias: string,
  currentExtensions: FieldDefinition[]
): string {
  const extensionList =
    currentExtensions.length > 0
      ? currentExtensions
          .map(
            (f) =>
              `- ${f.id}: "${f.name}" (${f.type})${f.description ? ` — ${f.description}` : ''}`
          )
          .join('\n')
      : 'No custom fields yet.';

  return `[IDENTITY]
You are ${alias}, managing custom tracking fields for the fitness training module.

[MODE: FIELD-CRUD]
You are in a SCOPED conversation for creating, reviewing, and deleting custom fields.
You have access to the module schema but NOT to user wellness data, profile details,
biomarkers, or routines. This is a schema-only context.

[MODULE SCHEMA INFO]
Module: trainer (Titan — Fitness Training)
Domain: Fitness, workout programming, nutrition, recovery, body composition, supplements
Core fields (immutable, always present):
  - fitnessLevel, fitnessGoals, currentWeight, targetWeight, height
  - workoutFrequency, preferredActivities, injuries, activityLevel
  - nutritionGoals, sleepQuality, recoveryScore, lastWorkout, nextWorkout

Current extension fields (user-created, max 20):
${extensionList}

[AVAILABLE ACTIONS]
- Suggest field: <action type="suggest_field">{"description":"...","purpose":"..."}</action>
- Create field: <action type="create_field">{"id":"kebab-case-id","name":"Human Readable Name","type":"text|number|select|multiSelect|date|textarea|boolean|range","description":"...","validation":{...},"options":[...],"metadata":{"category":"...","icon":"...","helpText":"..."}}</action>
- Delete field: <action type="delete_field">{"fieldId":"..."}</action>

[DOMAIN VALIDATION RULES]
You are the semantic domain validator. When the user requests a new field:
1. Assess whether the field is relevant to fitness, training, nutrition, recovery,
   supplements, body composition, or physical performance.
2. If RELEVANT: generate a well-structured FieldDefinition with appropriate type,
   validation rules, and metadata. Emit <action type="create_field">.
3. If NOT RELEVANT: explain why the field does not fit this module's domain.
   If the field belongs to another AGNES module, suggest the correct module:
   - Health/biometrics → Soma (within Titan's Biomarkers tab)
   - Financial → Ledger
   - Productivity → Atlas
   - Emotional/therapeutic → Agnes (Therapy)
4. Never approve fields that duplicate existing core fields.
5. Never approve fields with non-kebab-case IDs.

[FIELD TYPE GUIDANCE]
- NUMBER: weights, reps, distances, durations, calorie counts
- RANGE: subjective scales (RPE, soreness 1-10), hydration targets
- SELECT: categorical (creatine phase, training split, equipment type)
- MULTI_SELECT: supplements, muscle groups, exercise tags
- TEXT: short labels, exercise names
- TEXTAREA: notes, rationale, form cues
- BOOLEAN: yes/no flags (took supplement, completed workout)
- DATE: PR dates, cycle start dates

[GUIDELINES]
- Be concise and precise when describing fields.
- Always include validation rules (minimum/maximum for numbers, enum for selects).
- Always include metadata.category for dashboard grouping.
- Start every response with <thought>.
- Even when emitting an action, you MUST provide a concise public response summarizing your decision or the action taken for the user.
- Do NOT discuss workout programming, nutrition advice, or recovery. Only field management.`.trim();
}

// ── Biomarker Review Mode ────────────────────────────────────────────────────

function buildBiomarkerReviewModePrompt(
  alias: string,
  biomarkers: Record<string, unknown>
): string {
  const biomarkerEntries = Object.entries(biomarkers);
  const biomarkerList =
    biomarkerEntries.length > 0
      ? biomarkerEntries
          .map(([key, val]) => {
            if (typeof val === 'object' && val !== null) {
              const obj = val as Record<string, unknown>;
              return `- ${key}: ${obj.value ?? 'N/A'}${obj.unit ? ` ${obj.unit}` : ''} (${obj.source || 'manual'}, ${obj.recordedAt || 'unknown'})`;
            }
            return `- ${key}: ${val}`;
          })
          .join('\n')
      : 'No biomarkers recorded.';

  return `[IDENTITY]
You are ${alias}, reviewing biomarker and laboratory data.

[MODE: BIOMARKER-REVIEW]
You are in a SCOPED conversation focused on biomarker data review and correction.
You can ONLY record, correct, or parse biomarker data — no routine changes, no profile
updates, no field CRUD.

⚕ MEDICAL DISCLAIMER: You provide informational guidance only. You do not diagnose,
prescribe medications, or replace professional medical advice.

[BIOMARKER DATA]
${biomarkerList}

[AVAILABLE ACTIONS]
- Record biomarker: <action type="commit_biomarker">{"name":"...","value":...,"unit":"...","source":"...","recordedAt":"..."}</action>
- Parse lab report: <action type="parse_lab_report">{"panel":"...","findings":[...],"flags":[...]}</action>
- Parse biometric data: <action type="parse_biometric_data">{...}</action>

[GUIDELINES]
- Help the user review, correct, or add biomarker entries.
- Flag any values that appear abnormal (outside typical physiological ranges).
- Never fabricate values — only record what the user explicitly provides.
- For lab report imports, extract structured data from the user's text/file content.
- Start every response with <thought>.
- Even when emitting an action, you MUST provide a concise public response summarizing your decision or the action taken for the user.
- Do NOT suggest workout changes, routine modifications, or field creation.`.trim();
}

// ============================================================================
// Utility: Serialize Extension Fields for Context Injection
// ============================================================================

/**
 * Serialize extension fields and their current values into a text block
 * suitable for injection into the system prompt.
 *
 * This is called by `enhanceContextForModule()` in GlobalSoulProvider
 * and produces the `[CUSTOM TRACKED FIELDS — TRAINER]` block.
 *
 * @param moduleLabel - Display label for the module (e.g. 'TRAINER', 'SOMA')
 * @param extensions  - FieldDefinition[] from SchemaRegistry.getExtensions()
 * @param values      - Record<string, FieldValue> from useExtensionFieldValues()
 * @returns Formatted string block, or empty string if no extensions exist
 */
export function serializeExtensionFields(
  moduleLabel: string,
  extensions: FieldDefinition[],
  values: Record<string, FieldValue>
): string {
  if (extensions.length === 0) return '';

  const lines = extensions.map((field) => {
    const val = values[field.id];
    const displayValue = val?.value !== undefined ? formatFieldDisplayValue(field, val.value) : 'Not set';
    const typeHint = formatFieldTypeHint(field);
    return `- ${field.name}: ${displayValue}${typeHint ? ` (${typeHint})` : ''}`;
  });

  return `[CUSTOM TRACKED FIELDS — ${moduleLabel.toUpperCase()}]\n${lines.join('\n')}`;
}

function formatFieldDisplayValue(field: FieldDefinition, value: unknown): string {
  if (value === null || value === undefined) return 'Not set';

  switch (field.type) {
    case 'multiSelect':
      return Array.isArray(value) ? JSON.stringify(value) : String(value);
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'date':
      return typeof value === 'string' ? value : new Date(value as number).toISOString().slice(0, 10);
    case 'object':
      return JSON.stringify(value);
    default:
      return String(value);
  }
}

function formatFieldTypeHint(field: FieldDefinition): string {
  switch (field.type) {
    case 'select':
      return field.options ? `select: ${field.options.map((o) => o.value).join('/')}` : 'select';
    case 'multiSelect':
      return 'multi-select';
    case 'range':
      return field.validation
        ? `range: ${field.validation.minimum ?? 0}-${field.validation.maximum ?? 10}`
        : 'range';
    case 'number':
      return field.validation?.minimum !== undefined || field.validation?.maximum !== undefined
        ? `number, range: ${field.validation?.minimum ?? '∞'}-${field.validation?.maximum ?? '∞'}`
        : 'number';
    case 'boolean':
      return 'yes/no';
    default:
      return field.type;
  }
}
