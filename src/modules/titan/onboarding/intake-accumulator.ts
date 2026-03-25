import { Message, TitanProfile, Routine } from '@/lib/types';

export type RequiredSectionKey = 'nutrition' | 'activity' | 'history';

export type TitanIntakeAccumulator = {
  nutrition: {
    dietNotes?: string;
    supplements: string[];
    calories?: number;
    proteinGrams?: number;
    carbGrams?: number;
    fatGrams?: number;
    mealsPerDay?: number;
  };
  activity: {
    activityLevel?: string;
    workoutsPerWeek?: number;
    sleepHours?: number;
    dayToDayNotes?: string;
    occupation?: string;
  };
  history: {
    yearsTraining?: number;
    injuries: string[];
    goals: string[];
    bodyGoals?: string;
  };
  summary?: string;
  routines: Routine[];
  lastUpdatedAt: string;
};

type AnyRecord = Record<string, unknown>;

function appendUnique(base: string[], incoming: string[]): string[] {
  const next = new Set(base.map((s) => s.trim().toLowerCase()).filter(Boolean));
  for (const item of incoming) {
    const normalized = item.trim();
    if (!normalized) continue;
    next.add(normalized.toLowerCase());
  }
  return Array.from(next.values());
}

function pickPositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function asRecord(value: unknown): AnyRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as AnyRecord;
}

function coerceString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function coerceStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object' && 'name' in entry && typeof (entry as Record<string, unknown>).name === 'string') return (entry as Record<string, unknown>).name as string;
        return '';
      })
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return parseCsvText(value);
  }
  return [];
}

function hasAnyKeys(value: AnyRecord): boolean {
  return Object.keys(value).length > 0;
}

export function normalizeTitanProfilePatch(input: Partial<TitanProfile> | Record<string, unknown>): Partial<TitanProfile> {
  const source = (input || {}) as AnyRecord;

  const nutritionSource =
    asRecord(source.nutrition) ??
    asRecord(source.nutritionProfile) ??
    asRecord(source.dietProfile) ??
    {};
  const activitySource =
    asRecord(source.activity) ??
    asRecord(source.activityProfile) ??
    asRecord(source.physicalProfile) ??
    asRecord(source.lifestyleProfile) ??
    {};
  const historySource =
    asRecord(source.history) ??
    asRecord(source.historyProfile) ??
    asRecord(source.trainingHistoryProfile) ??
    {};

  const nutritionPatch: AnyRecord = {};
  const activityPatch: AnyRecord = {};
  const historyPatch: AnyRecord = {};

  const nutritionNotes = coerceString(nutritionSource.dietNotes) ?? coerceString(nutritionSource.notes);
  if (nutritionNotes) nutritionPatch.dietNotes = nutritionNotes;

  const supplements = coerceStringList(nutritionSource.supplements ?? source.supplements);
  if (supplements.length > 0) nutritionPatch.supplements = supplements;

  const mealsPerDay = pickPositiveNumber(nutritionSource.mealsPerDay ?? source.mealsPerDay);
  if (mealsPerDay) nutritionPatch.mealsPerDay = mealsPerDay;

  const macroSource = asRecord(nutritionSource.macroEstimate) ?? asRecord(source.macroEstimate) ?? {};
  const calories = pickPositiveNumber(macroSource.calories ?? nutritionSource.calories ?? source.calories);
  const protein = pickPositiveNumber(macroSource.protein ?? nutritionSource.protein ?? nutritionSource.proteinGrams ?? source.proteinGrams);
  const carbs = pickPositiveNumber(macroSource.carbs ?? nutritionSource.carbs ?? nutritionSource.carbGrams ?? source.carbGrams);
  const fat = pickPositiveNumber(macroSource.fat ?? nutritionSource.fat ?? nutritionSource.fatGrams ?? source.fatGrams);
  if (calories || protein || carbs || fat) {
    nutritionPatch.macroEstimate = {
      ...(calories ? { calories } : {}),
      ...(protein ? { protein } : {}),
      ...(carbs ? { carbs } : {}),
      ...(fat ? { fat } : {}),
      source: 'user'
    };
  }

  const activityLevel =
    coerceString(activitySource.activityLevel) ??
    coerceString(activitySource.dailyActivityLevel) ??
    coerceString(activitySource.activity);
  if (activityLevel) activityPatch.activityLevel = activityLevel;

  const workoutsPerWeek = pickPositiveNumber(
    activitySource.workoutsPerWeek ?? activitySource.trainingDaysPerWeek ?? source.workoutsPerWeek
  );
  if (workoutsPerWeek) activityPatch.workoutsPerWeek = workoutsPerWeek;

  const sleepHours = pickPositiveNumber(
    activitySource.sleepHours ??
      activitySource.sleepDuration ??
      activitySource.sleepDurationHours ??
      activitySource.typicalSleepHours ??
      source.sleepHours ??
      source.typicalSleepHours
  );
  if (sleepHours) activityPatch.sleepHours = sleepHours;

  const dayToDayNotes = coerceString(activitySource.dayToDayNotes) ?? coerceString(activitySource.notes);
  if (dayToDayNotes) activityPatch.dayToDayNotes = dayToDayNotes;

  const occupation = coerceString(activitySource.occupation) ?? coerceString(source.occupation);
  if (occupation) activityPatch.occupation = occupation;

  const yearsTraining = pickPositiveNumber(
    historySource.yearsTraining ?? historySource.trainingYears ?? source.yearsTraining ?? source.trainingYears
  );
  if (yearsTraining) historyPatch.yearsTraining = yearsTraining;

  const injuries = coerceStringList(historySource.injuries ?? historySource.injuryHistory ?? source.injuries);
  if (injuries.length > 0) historyPatch.injuries = injuries;

  const goals = coerceStringList(historySource.goals ?? historySource.targets ?? source.goals ?? source.targets);
  if (goals.length > 0) historyPatch.goals = goals;

  const bodyGoals = coerceString(historySource.bodyGoals) ?? coerceString(historySource.primaryGoal) ?? coerceString(source.bodyGoals);
  if (bodyGoals) historyPatch.bodyGoals = bodyGoals;

  const patch: Partial<TitanProfile> = {};
  if (hasAnyKeys(nutritionPatch)) patch.nutrition = nutritionPatch;
  if (hasAnyKeys(activityPatch)) patch.activity = activityPatch;
  if (hasAnyKeys(historyPatch)) patch.history = historyPatch;
  if (typeof source.summary === 'string' && source.summary.trim()) patch.summary = source.summary.trim();
  if (Array.isArray(source.routines)) patch.routines = source.routines as Routine[];

  if (typeof source.onboardingComplete === 'boolean') patch.onboardingComplete = source.onboardingComplete;
  if (source.privacyLevel === 'basic' || source.privacyLevel === 'complete') patch.privacyLevel = source.privacyLevel;
  if (source.trackingLevel === 'standard' || source.trackingLevel === 'indepth') patch.trackingLevel = source.trackingLevel;

  return patch;
}

export function createAccumulatorFromProfile(profile?: TitanProfile | null): TitanIntakeAccumulator {
  const nutrition = (profile?.nutrition || {}) as Record<string, unknown>;
  const activity = (profile?.activity || {}) as Record<string, unknown>;
  const history = (profile?.history || {}) as Record<string, unknown>;

  const rawSupplements = Array.isArray(nutrition.supplements) ? nutrition.supplements : [];
  const supplements = rawSupplements
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && 'name' in entry && typeof (entry as Record<string, unknown>).name === 'string') return (entry as Record<string, unknown>).name as string;
      return '';
    })
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    nutrition: {
      dietNotes: typeof nutrition.dietNotes === 'string' ? nutrition.dietNotes : undefined,
      supplements,
      calories: pickPositiveNumber((nutrition.macroEstimate as Record<string, unknown> | undefined)?.calories),
      proteinGrams: pickPositiveNumber((nutrition.macroEstimate as Record<string, unknown> | undefined)?.protein),
      carbGrams: pickPositiveNumber((nutrition.macroEstimate as Record<string, unknown> | undefined)?.carbs),
      fatGrams: pickPositiveNumber((nutrition.macroEstimate as Record<string, unknown> | undefined)?.fat),
      mealsPerDay: pickPositiveNumber(nutrition.mealsPerDay)
    },
    activity: {
      activityLevel: typeof activity.activityLevel === 'string' ? activity.activityLevel : undefined,
      workoutsPerWeek: pickPositiveNumber(activity.workoutsPerWeek),
      sleepHours: pickPositiveNumber(activity.sleepHours),
      dayToDayNotes: typeof activity.dayToDayNotes === 'string' ? activity.dayToDayNotes : undefined,
      occupation: typeof activity.occupation === 'string' ? activity.occupation : undefined
    },
    history: {
      yearsTraining: pickPositiveNumber(history.yearsTraining),
      injuries: Array.isArray(history.injuries) ? history.injuries.filter((i): i is string => typeof i === 'string') : [],
      goals: Array.isArray(history.goals) ? history.goals.filter((g): g is string => typeof g === 'string') : [],
      bodyGoals: typeof history.bodyGoals === 'string' ? history.bodyGoals : undefined
    },
    summary: profile?.summary || undefined,
    routines: profile?.routines || [],
    lastUpdatedAt: new Date().toISOString()
  };
}

export function appendProfilePatch(
  base: TitanIntakeAccumulator,
  patch: Partial<TitanProfile>
): TitanIntakeAccumulator {
  const next = { ...base };

  if (patch.nutrition && typeof patch.nutrition === 'object') {
    const nutrition = patch.nutrition as Record<string, unknown>;
    next.nutrition = {
      ...next.nutrition,
      ...(typeof nutrition.dietNotes === 'string' ? { dietNotes: nutrition.dietNotes } : {}),
      ...(pickPositiveNumber(nutrition.mealsPerDay) ? { mealsPerDay: pickPositiveNumber(nutrition.mealsPerDay) } : {})
    };

    const rawSupplements = Array.isArray(nutrition.supplements) ? nutrition.supplements : [];
    if (rawSupplements.length > 0) {
      const parsed = rawSupplements
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object' && 'name' in entry && typeof (entry as Record<string, unknown>).name === 'string') return (entry as Record<string, unknown>).name as string;
          return '';
        })
        .filter(Boolean);
      next.nutrition.supplements = appendUnique(next.nutrition.supplements, parsed);
    }

    const macroEstimate = nutrition.macroEstimate as Record<string, unknown> | undefined;
    if (macroEstimate && typeof macroEstimate === 'object') {
      const calories = pickPositiveNumber(macroEstimate.calories);
      const proteinGrams = pickPositiveNumber(macroEstimate.protein);
      const carbGrams = pickPositiveNumber(macroEstimate.carbs);
      const fatGrams = pickPositiveNumber(macroEstimate.fat);
      if (calories) next.nutrition.calories = calories;
      if (proteinGrams) next.nutrition.proteinGrams = proteinGrams;
      if (carbGrams) next.nutrition.carbGrams = carbGrams;
      if (fatGrams) next.nutrition.fatGrams = fatGrams;
    }
  }

  if (patch.activity && typeof patch.activity === 'object') {
    const activity = patch.activity as Record<string, unknown>;
    next.activity = {
      ...next.activity,
      ...(typeof activity.activityLevel === 'string' ? { activityLevel: activity.activityLevel } : {}),
      ...(pickPositiveNumber(activity.workoutsPerWeek) ? { workoutsPerWeek: pickPositiveNumber(activity.workoutsPerWeek) } : {}),
      ...(pickPositiveNumber(activity.sleepHours) ? { sleepHours: pickPositiveNumber(activity.sleepHours) } : {}),
      ...(typeof activity.dayToDayNotes === 'string' ? { dayToDayNotes: activity.dayToDayNotes } : {}),
      ...(typeof activity.occupation === 'string' ? { occupation: activity.occupation } : {})
    };
  }

  if (patch.history && typeof patch.history === 'object') {
    const history = patch.history as Record<string, unknown>;
    next.history = {
      ...next.history,
      ...(pickPositiveNumber(history.yearsTraining) ? { yearsTraining: pickPositiveNumber(history.yearsTraining) } : {}),
      ...(typeof history.bodyGoals === 'string' ? { bodyGoals: history.bodyGoals } : {})
    };

    if (Array.isArray(history.injuries)) {
      const injuries = history.injuries.filter((i): i is string => typeof i === 'string');
      next.history.injuries = appendUnique(next.history.injuries, injuries);
    }
    if (Array.isArray(history.goals)) {
      const goals = history.goals.filter((g): g is string => typeof g === 'string');
      next.history.goals = appendUnique(next.history.goals, goals);
    }
  }

  if (typeof patch.summary === 'string' && patch.summary.trim()) {
    next.summary = patch.summary.trim();
  }

  if (patch.routines && Array.isArray(patch.routines)) {
    next.routines = patch.routines;
  }

  next.lastUpdatedAt = new Date().toISOString();
  return next;
}

function parseCsvText(chunk: string): string[] {
  return chunk
    .split(/,| and /gi)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function appendFromUserMessage(base: TitanIntakeAccumulator, message?: string): TitanIntakeAccumulator {
  if (!message) return base;

  const next: TitanIntakeAccumulator = {
    ...base,
    nutrition: { ...base.nutrition },
    activity: { ...base.activity },
    history: { ...base.history, injuries: [...base.history.injuries], goals: [...base.history.goals] }
  };

  const supplementsMatch = message.match(/\b(?:take|supplements?|include|using)\b[^.!\n]*?\b([^.!\n]+)/i);
  if (supplementsMatch) {
    const list = parseCsvText(supplementsMatch[1])
      .filter(s => !/^(and|a|the|some|various|many|few|include)$/i.test(s));
    if (list.length > 0) {
      next.nutrition.supplements = appendUnique(next.nutrition.supplements, list);
    }
  }

  const caloriesMatch = message.match(/\b(\d{3,4})\s*(?:k?cal|calories)\b/i);
  if (caloriesMatch) {
    const parsed = Number.parseInt(caloriesMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) next.nutrition.calories = parsed;
  }

  const proteinMatch = message.match(/\b(\d{2,3})\s*(?:g|grams?)\s*protein\b/i) || message.match(/\bprotein(?:\s*[:=])?\s*(\d{2,3})\s*(?:g|grams?)\b/i);
  if (proteinMatch) next.nutrition.proteinGrams = Number.parseInt(proteinMatch[1], 10);
  
  const carbsMatch = message.match(/\b(\d{2,3})\s*(?:g|grams?)\s*carb(?:s)?\b/i) || message.match(/\bcarb(?:s)?(?:\s*[:=])?\s*(\d{2,3})\s*(?:g|grams?)\b/i);
  if (carbsMatch) next.nutrition.carbGrams = Number.parseInt(carbsMatch[1], 10);
  
  const fatMatch = message.match(/\b(\d{2,3})\s*(?:g|grams?)\s*fat\b/i) || message.match(/\bfat(?:\s*[:=])?\s*(\d{2,3})\s*(?:g|grams?)\b/i);
  if (fatMatch) next.nutrition.fatGrams = Number.parseInt(fatMatch[1], 10);

  const mealsMatch = message.match(/\b(\d{1,2})\s*meals?\s*(?:per|a)\s*day\b/i) || message.match(/\b(\d{1,2})\s*(?:times?)\s*a\s*day\b/i);
  if (mealsMatch) next.nutrition.mealsPerDay = Number.parseInt(mealsMatch[1], 10);

  const sleepMatch = message.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:hours?|hrs?)\b/i);
  if (sleepMatch) {
    const parsed = Number.parseFloat(sleepMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 24) next.activity.sleepHours = parsed;
  }

  const workoutsMatch = message.match(/\b(\d{1,2})\s*(?:x|times?|days?)\s*(?:per|a)\s*week\b/i);
  if (workoutsMatch) {
    const parsed = Number.parseInt(workoutsMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) next.activity.workoutsPerWeek = parsed;
  }

  const levelMatch = message.match(/\b(sedentary|lightly active|moderately active|active|very active|athlete)\b/i);
  if (levelMatch) next.activity.activityLevel = levelMatch[1].toLowerCase();

  const occupationMatch = message.match(/\b(?:i(?:'m| am)|i work as|my job is|occupation is)\s+([a-z][a-z0-9'/&,\- ]{1,50})/i);
  if (occupationMatch) next.activity.occupation = occupationMatch[1].trim();

  const yearsTrainingMatch = message.match(/\b(\d{1,2})\s*(?:years?|yrs?)\s*(?:of)?\s*training\b/i);
  if (yearsTrainingMatch) {
    const parsed = Number.parseInt(yearsTrainingMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) next.history.yearsTraining = parsed;
  }
  const yearsTrainingAltMatch = message.match(
    /\b(?:lifting|working out|in the gym|training)\s*(?:for)?\s*(\d{1,2})\s*(?:years?|yrs?)\b/i
  );
  if (yearsTrainingAltMatch) {
    const parsed = Number.parseInt(yearsTrainingAltMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) next.history.yearsTraining = parsed;
  }

  const injuryMatch = message.match(/\b(?:injur(?:y|ies)|pain|strain|tear|surgery)\b[^.!?\n]*/i);
  if (injuryMatch) {
    next.history.injuries = appendUnique(next.history.injuries, [injuryMatch[0]]);
  }

  const goalsMatch = message.match(/\b(?:goal|goals|target|targets|aim|aims)(?:\s*(?:is|are|:))?\s*([^.!\n]+)/i);
  if (goalsMatch) {
    next.history.goals = appendUnique(next.history.goals, parseCsvText(goalsMatch[1]));
  }
  const implicitGoalsMatch = message.match(/\b(?:want to|looking to|trying to|aiming to|plan to)\s+([^.!\n]+)/i);
  if (implicitGoalsMatch) {
    next.history.goals = appendUnique(next.history.goals, parseCsvText(implicitGoalsMatch[1]));
  }
  const bodyGoalsMatch = message.match(/\b(lose fat|lose weight|gain muscle|build muscle|recomposition|cutting|bulking)\b/i);
  if (bodyGoalsMatch) {
    next.history.bodyGoals = bodyGoalsMatch[1].toLowerCase();
  }

  next.lastUpdatedAt = new Date().toISOString();
  return next;
}

export function backfillFromHistory(base: TitanIntakeAccumulator, history: Message[]): TitanIntakeAccumulator {
  let next = { ...base };
  for (const entry of history) {
    if (entry.role !== 'user') continue;
    const content = typeof entry.content === 'string'
      ? entry.content
      : entry.content.filter(p => p.type === 'text').map(p => (p as any).text).join(' ');
    next = appendFromUserMessage(next, content);
  }
  return next;
}

function hasNutrition(acc: TitanIntakeAccumulator): boolean {
  return Boolean(
    acc.nutrition.dietNotes ||
      acc.nutrition.supplements.length > 0 ||
      acc.nutrition.calories ||
      acc.nutrition.proteinGrams ||
      acc.nutrition.carbGrams ||
      acc.nutrition.fatGrams
  );
}

function hasActivity(acc: TitanIntakeAccumulator): boolean {
  return Boolean(
    acc.activity.activityLevel ||
      acc.activity.workoutsPerWeek ||
      acc.activity.sleepHours ||
      acc.activity.dayToDayNotes ||
      acc.activity.occupation
  );
}

function hasHistory(acc: TitanIntakeAccumulator): boolean {
  return Boolean(
    acc.history.yearsTraining ||
      acc.history.injuries.length > 0 ||
      acc.history.goals.length > 0 ||
      acc.history.bodyGoals
  );
}

export function getMissingSectionsFromAccumulator(acc: TitanIntakeAccumulator): RequiredSectionKey[] {
  const missing: RequiredSectionKey[] = [];
  if (!hasNutrition(acc)) missing.push('nutrition');
  if (!hasActivity(acc)) missing.push('activity');
  if (!hasHistory(acc)) missing.push('history');
  return missing;
}

export function toProfilePatchFromAccumulator(acc: TitanIntakeAccumulator): Partial<TitanProfile> {
  return {
    nutrition: {
      ...(acc.nutrition.dietNotes ? { dietNotes: acc.nutrition.dietNotes } : {}),
      supplements: acc.nutrition.supplements.map((name) => ({ name })),
      ...(acc.nutrition.calories || acc.nutrition.proteinGrams || acc.nutrition.carbGrams || acc.nutrition.fatGrams
        ? {
            macroEstimate: {
              ...(acc.nutrition.calories ? { calories: acc.nutrition.calories } : {}),
              ...(acc.nutrition.proteinGrams ? { protein: acc.nutrition.proteinGrams } : {}),
              ...(acc.nutrition.carbGrams ? { carbs: acc.nutrition.carbGrams } : {}),
              ...(acc.nutrition.fatGrams ? { fat: acc.nutrition.fatGrams } : {}),
              source: 'user'
            }
          }
        : {}),
      ...(acc.nutrition.mealsPerDay ? { mealsPerDay: acc.nutrition.mealsPerDay } : {})
    },
    activity: {
      ...(acc.activity.activityLevel ? { activityLevel: acc.activity.activityLevel } : {}),
      ...(acc.activity.workoutsPerWeek ? { workoutsPerWeek: acc.activity.workoutsPerWeek } : {}),
      ...(acc.activity.sleepHours ? { sleepHours: acc.activity.sleepHours } : {}),
      ...(acc.activity.dayToDayNotes ? { dayToDayNotes: acc.activity.dayToDayNotes } : {}),
      ...(acc.activity.occupation ? { occupation: acc.activity.occupation } : {})
    },
    history: {
      ...(acc.history.yearsTraining ? { yearsTraining: acc.history.yearsTraining } : {}),
      ...(acc.history.injuries.length > 0 ? { legacyInjuryStrings: acc.history.injuries } : {}),
      ...(acc.history.goals.length > 0 ? { goals: acc.history.goals } : {}),
      ...(acc.history.bodyGoals ? { bodyGoals: acc.history.bodyGoals } : {})
    },
    ...(acc.summary ? { summary: acc.summary } : {}),
    ...(acc.routines.length > 0 ? { routines: acc.routines } : {})
  };
}
