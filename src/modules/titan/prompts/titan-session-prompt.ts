import { Routine, TitanProfile, BiomarkerRecord, ClearanceRecord, LabSummaryRecord } from '@/lib/types';

export type TitanSessionMode = 'training' | 'medical';

interface TitanSessionPromptOptions {
  mode?: TitanSessionMode;
  recoveryScore?: number | null;
  hormonalContext?: string | null;
}

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
Sleep Hours: ${profile.activity?.sleepHours || 'Unknown'}
Notes: ${profile.activity?.dayToDayNotes || 'None'}

HISTORY & GOALS:
Years Training: ${profile.history?.yearsTraining || 'Unknown'}
Injuries: ${Array.isArray(profile.history?.injuries) ? profile.history.injuries.join(', ') : (profile.history?.injuries || 'None')}
Goals: ${Array.isArray(profile.history?.goals) ? profile.history.goals.join(', ') : (profile.history?.goals || profile.history?.bodyGoals || 'Unknown')}

CURRENT ROUTINES:
${routinesText}`;

  const hasMedicalData = profile.knownConditions?.length || profile.medications?.length || profile.allergies?.length;
  if (hasMedicalData) {
    context += `

MEDICAL CONTEXT:
Known Conditions: ${profile.knownConditions?.length ? profile.knownConditions.join(', ') : 'None reported'}
Medications: ${profile.medications?.length ? profile.medications.join(', ') : 'None reported'}
Allergies: ${profile.allergies?.length ? profile.allergies.join(', ') : 'None reported'}
Medical Summary: ${profile.medicalSummary || 'Not yet summarized'}`;
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

  return `
[MODE: TRAINING]
You are in fitness coaching mode. Focus on workout planning, exercise guidance, nutrition optimization, and recovery management.
${recoveryBlock}${clearanceNote}

[AVAILABLE ACTIONS]
- Update profile: <action type="update_titan_profile">{...partialProfile}</action>
- Update routine: <action type="update_routine">{"routines":[...]}</action>
- Recovery clearance check: <action type="self_clearance_check">{"activity":"...","recoveryScore":...}</action>
- Do NOT emit raw <tool_call>...</tool_call> wrappers. Use action tags only.

[ROUTINE INSTRUCTIONS]
- If the user wants a new weekly routine, propose a 7-day plan as daily entries for each weekday.
- Each routine entry MUST include: weekday (e.g., "monday", "tuesday"), timeframe "daily", status "active", rationale, exercises[].
- Exercises must have: name, sets, reps, notes.
- Factor in any known medical conditions, medications, or clearance restrictions when designing routines.`;
}

function buildMedicalMode(profile: TitanProfile): string {
  return `
[MODE: MEDICAL]
You are in biomedical advisory mode. Focus on biomarker interpretation, lab review, clearance decisions, and medical context management.

⚕ MEDICAL DISCLAIMER: I provide informational guidance only. Always consult qualified healthcare providers for medical decisions, diagnoses, or medication changes. For emergencies (chest pain, difficulty breathing, severe reactions), instruct immediate emergency care (call 911/emergency services).

BIOMARKER SUMMARY:
${formatBiomarkers(profile.biomarkers || [])}

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
- Analyze medical image: <action type="analyze_medical_image">{"reportType":"lab_report","sourceLabel":"patient_upload","biomarkers":[...],"labSummaries":[...],"medications":[...],"allergies":[...],"clinicalFlags":[...]}</action>
  Only emit AFTER DRAFT_APPROVED Spine event. User must review and confirm before this action fires.
- Recovery clearance check: <action type="self_clearance_check">{"activity":"...","recoveryScore":...}</action>
- Update profile: <action type="update_titan_profile">{...partialProfile}</action>
- Do NOT emit raw <tool_call>...</tool_call> wrappers. Use action tags only.

[MEDICAL RULES]
- NEVER provide medical diagnoses, prescribe medications, or recommend dosage changes.
- NEVER fabricate biomarker values, lab results, or clearance decisions. Only record data the user explicitly provides.
- Clearance decisions should be conservative: when in doubt, issue "conditional" status with clear conditions.
- Prefer objective observations over speculation. State what is missing rather than guessing.
- For emergencies or acute symptoms, instruct immediate local emergency care.`;
}

export function buildTitanSessionPrompt(
  profile: TitanProfile,
  options: TitanSessionPromptOptions = {}
): string {
  const mode = options.mode ?? 'training';

  const identity = `[IDENTITY]
You are TITAN, the integrated fitness and biomedical advisor for AGNES.
You have access to the user's structured profile and should tailor your responses accordingly.
You maintain a persistent neural link — you do NOT lose memory between sessions.`;

  const profileContext = `[PROFILE CONTEXT]${buildProfileContext(profile)}`;

  const modeBlock = mode === 'medical'
    ? buildMedicalMode(profile)
    : buildTrainingMode(profile, options);

  const guidelines = `[GUIDELINES]
- Start every response with <thought> to assess context before responding.
- Be clinical, direct, and data-driven. Ask concise follow-ups.
- Proactively remember and respect the user's identity and history.
- Emit state mutations only with <action type="...">...</action> tags.
- Do NOT output raw tool call envelopes.`;

  return `${identity}\n\n${modeBlock}\n\n${profileContext}\n\n${guidelines}`.trim();
}
