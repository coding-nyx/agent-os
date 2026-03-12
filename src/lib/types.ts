// --- Core Platform Contracts (v2) ---

export type GenderPersonality = 'female' | 'male' | 'non-binary' | 'gender-fluid';

export interface AgentPersonalityProvision {
  orchestratorAlias: string;
  moduleAliases: {
    agnes: string;
    titan: string;
    ledger: string;
    [key: string]: string;
  };
  agentGenders: {
    orchestrator: GenderPersonality;
    agnes: GenderPersonality;
    titan: GenderPersonality;
    ledger: GenderPersonality;
    [key: string]: GenderPersonality;
  };
  personaOverlays: {
    [moduleId: string]: {
      tone?: string;
      style?: string;
    };
  };
}

export interface UserSecurityPreferences {
  vaultLocks: Record<string, boolean>;
  /** Per-category data-sharing overrides keyed by categoryId → targetModuleId → enabled */
  dataSharingOverrides?: Record<string, Record<string, boolean>>;
}

export interface CoreUserProfile {
  uid: string;
  email: string;
  preferredName: string;
  pronouns: string;
  age?: number;
  assignedSexAtBirth?: 'female' | 'male';
  genderIdentity?: string;
  occupation?: string;
  typicalSleepHours?: number;
  onboardingComplete: boolean;
  agentPersonalityProvision: AgentPersonalityProvision;
  securityPreferences: UserSecurityPreferences;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

// --- Module & Memory Contracts ---

export interface SessionEventSummary {
  id: string;
  timestamp: string;
  summary: string;
  keyInsights: string[];
  sentiment: number;
  tokenUsage: number;
  embedding?: number[];
}

export interface ModuleMemoryEnvelope {
  moduleId: string;
  lastActive: string;
  activeSessionId?: string;
  latestSnapshot: string;
  eventHistory: SessionEventSummary[];
  metadata: Record<string, unknown>;
}

export interface NeuralStateVector {
  biological: {
    cnsFatigue: number | null;
    sleepQuality: number | null;
    recoveryScore?: number | null;
    hormonalContext?: string | null;
  };
  emotional: {
    emotionalResilience: number | null;
    stressLoad?: number | null;
    moodTrend?: string | null;
    traumaMarkers?: string[] | null;
  };
  cognitive: {
    energyBudget?: number | null;
    focusScore?: number | null;
    activeLoad?: number | null;
    researchLoad?: number | null;
    /** Atlas-owned: open loop count + planning complexity (0-10). High (>8) triggers plan compression. */
    planningLoad?: number | null;
    /** Atlas-owned: rolling 7-day ratio of completed tasks to scheduled tasks (0.0–1.0). */
    taskCompletionRate?: number | null;
    /** Scout-owned: breadth of active research interests (0-10). Low diversity may indicate hyperfocus. */
    interestDiversity?: number | null;
    /** Scout-owned: fraction of verified high-confidence nodes (0-1). */
    researchDepth?: number | null;
  };
  /** Atlas-owned planning domain — habit/deadline health metrics. */
  planning: {
    /** Composite habit streak health (0-10). Drop >3 in 24h triggers STREAK_BROKEN cascade. */
    streakHealth?: number | null;
    /** Urgency pressure from nearest deadlines (0-10). ≥8 triggers DEADLINE_CRUNCH cascade. */
    deadlinePressure?: number | null;
    /** Consecutive days with a saved journal entry. */
    reflectionStreak?: number;
    /** Proportion of active goals with at least one linked task (0-1). */
    goalAlignment?: number | null;
    /** Ratio of active habits with streak > 0 (0-1). */
    habitMomentum?: number | null;
  };
  resource: {
    financialFriction?: number | null;
    resonanceROI?: number | null;
  };
  version: number;
  lastUpdated: Record<string, string>;
  // Legacy aliases kept for existing UI/hooks while migrating to domain-based reads.
  cnsFatigue: number | null;
  emotionalResilience: number | null;
  sleepQuality: number | null;
  hormonalContext?: string | null;
  traumaMarkers?: string[] | null;
}

export type NeuralStateVectorPatch = {
  biological?: Partial<NeuralStateVector['biological']>;
  emotional?: Partial<NeuralStateVector['emotional']>;
  cognitive?: Partial<NeuralStateVector['cognitive']>;
  planning?: Partial<NeuralStateVector['planning']>;
  resource?: Partial<NeuralStateVector['resource']>;
} & Partial<Omit<NeuralStateVector, 'biological' | 'emotional' | 'cognitive' | 'planning' | 'resource'>>;

export interface GlobalProjection {
  lastSync: string;
  overallWellnessScore: number | null;
  displayNames: { [moduleId: string]: string };
  agentGenders: { [moduleId: string]: GenderPersonality };
  crossFunctionalState: NeuralStateVector;
  compactedInsights: string[];
  therapeuticBaseline?: {
    isInitialized: boolean;
    initializedAt?: string;
  };
}

export interface RetrievedMemory {
  sessionDate: string;
  summary: string;
  keyInsights: string[];
  score: number;
  moduleId: string;
}

export interface SemanticFact {
  id: string;
  moduleId: string;
  fact: string;
  confidence: number;
  updatedAt: string;
}

export interface MemorySearchOptions {
  moduleIds: string[];
  topK?: number;
  recencyWeight?: number;
}

export type SpineEventType =
  | 'VITAL_UPDATED'
  | 'REDUCE_TRAINING_LOAD'
  | 'BLOCK_HIGH_INTENSITY'
  | 'FLATTEN_ENERGY_WAVE'
  | 'RECOVERY_AVAILABLE'
  | 'BURNOUT_WARNING'
  /** @deprecated Sunset after 90 days — use BLOCK_HIGH_INTENSITY instead */
  | 'CLEARANCE_DENIED'
  /** @deprecated Sunset after 90 days — use BLOCK_HIGH_INTENSITY instead */
  | 'CLEARANCE_GRANTED'
  | 'COGNITIVE_OVERLOAD'
  | 'SECURITY_POLICY_UPDATED'
  | 'FINANCIAL_STRESS'
  | 'MEDICAL_ALERT'
  | 'CRISIS_DETECTED'
  | 'DRAFT_PROPOSED'
  | 'DRAFT_APPROVED'
  | 'DRAFT_DISMISSED'
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'MODULE_DELEGATED'
  | 'PLANNING_OVERLOAD'
  | 'DEADLINE_CRUNCH'
  | 'COMPOUND_STRESS'
  | 'CRISIS_MODE'
  | 'EXECUTION_COLLAPSE'
  | 'STREAK_BROKEN'
  | 'TASK_COMPLETED'
  | 'DEADLINE_APPROACHING'
  | 'HABIT_STREAK_BROKEN'
  | 'TEMPORAL_REVIEW_COMPLETE'
  | 'DELEGATION_REQUEST'
  | 'NSV_CALIBRATION_REQUEST'
  | 'SCHEMA_EXTENDED'
  | 'SCHEMA_MODIFIED'
  | 'SCHEMA_MIGRATED'
  | 'FIELD_CREATED'
  | 'FIELD_DELETED'
  | 'FIELD_VALUE_UPDATED'
  | 'SPENDING_DETECTED'
  | 'CONFLICT_DETECTED'
  | 'CONFLICT_RESOLVED'
  | 'ATLAS_RECOVERY_SCHEDULED'
  | 'ATLAS_PREDICTIVE_ALERT'
  | 'ATLAS_STATE_CHANGED'
  | 'GOAL_MISSING_PROGRESS'
  // Atlas Spine Events
  | 'ATLAS_TASK_COMPLETED'
  | 'ATLAS_HABIT_LOGGED'
  | 'ATLAS_GOAL_MILESTONE'
  | 'ATLAS_GOAL_COMPLETED'
  | 'ATLAS_ENERGY_UPDATED'
  | 'ATLAS_ENERGY_OVERLOAD'
  | 'ATLAS_RECOVERY_WINDOW_CREATED'
  | 'ATLAS_TASK_CREATED'
  | 'ATLAS_TASK_BLOCKED'
  | 'ATLAS_TASK_UNBLOCKED'
  | 'ATLAS_HABIT_MILESTONE'
  | 'ATLAS_FIELD_CREATED'
  | 'ATLAS_FIELD_DELETED'
  | 'ATLAS_FIELD_VALUE_UPDATED'
  | 'ATLAS_GOAL_UPDATED'
  | 'DEADLINE_PRESSURE_CHANGED'
  | 'PLANNING_STATE_UPDATED'
  // Ledger Spine Events
  | 'BUDGET_UPDATED'
  | 'GOAL_PROGRESS'
  | 'FINANCIAL_FRICTION_CHANGED'
  | 'RESONANCE_ROI_UPDATED'
  | 'FINANCIAL_PLAN_CREATED'
  | 'DOCUMENT_ANALYZED'
  // Ledger Transaction / Budget / Goal / Risk Events
  | 'TRANSACTION_CREATED'
  | 'TRANSACTION_UPDATED'
  | 'TRANSACTION_DELETED'
  | 'BUDGET_CREATED'
  | 'BUDGET_MODIFIED'
  | 'GOAL_CREATED'
  | 'GOAL_COMPLETED'
  | 'FINANCIAL_HEALTH_CHECK'
  | 'RISK_DETECTED'
  // Ledger Cross-Verification / Cashflow Events (S2-L-004)
  | 'FINANCIAL_FRICTION_UPDATED'
  | 'BUDGET_ALERT'
  | 'OVERSPEND_DETECTED'
  | 'DEBT_MILESTONE'
  | 'SAVINGS_MILESTONE'
  | 'INCOME_CHANGE'
  | 'EXPENSE_SPIKE'
  | 'CASHFLOW_POSITIVE'
  | 'CASHFLOW_NEGATIVE'
  // Soma Spine Events
  | 'SOMA_BIOMARKER_COMMITTED'
  | 'SOMA_READINESS_UPDATED'
  | 'SOMA_CLEARANCE_CHANGED'
  | 'SOMA_FIELD_CREATED'
  | 'SOMA_FIELD_UPDATED'
  | 'SOMA_FIELD_DELETED'
  | 'SOMA_VITAL_LOGGED'
  | 'SOMA_LAB_REPORT_PARSED'
  | 'SOMA_PROFILE_UPDATED'
  // Soma Cascade Derived Events
  | 'HEALTH_CONTEXT_STALE'
  // Titan Cycle Events
  | 'CYCLE_STARTED'
  | 'CYCLE_COMPLETED'
  // Titan Workout Events
  | 'WORKOUT_COMPLETED'
  // AI Validation Events
  | 'ai_validation_suggestion'
  | 'ai_contextual_validation'
  | 'ai_error_explanation'
  // Soul Write Protocol Events (S10-002)
  | 'SOUL_WRITE_REQUESTED'
  | 'SOUL_WRITE_APPROVED'
  | 'SOUL_WRITE_REJECTED'
  // Contextual Inference Engine Events (S10-008)
  | 'CONTEXT_HINT_DETECTED'
  | 'CONTEXT_HINT_CONFIRMED'
  | 'CONTEXT_HINT_DISMISSED'
  // Atlas Weekly Review (S9-005)
  | 'WEEKLY_REVIEW_DUE'
  // Atlas Schedule Events (S9-002)
  | 'ROUTINE_UPDATED'
  // Agnes Somatic Support (S14-006)
  | 'SOMATIC_SUPPORT_REQUESTED'
  // Atlas Morning/Evening Intelligence Cadence (S9-007)
  | 'MORNING_BRIEF_DUE'
  | 'EVENING_CHECKIN_DUE'
  // Atlas Failure Notification Loop (S9-008)
  | 'COMMITMENT_MISSED'
  // Atlas Intelligent Loop (S19-atlas-01)
  | 'MORNING_BRIEF'
  | 'ATLAS_OVERLOAD_DETECTED'
  // Agnes Somatic Sessions (S19-agnes-02)
  | 'SOMATIC_SESSION_COMPLETE'
  // Atlas Journal Events — Added by spine agent — deduplicated with schema agent
  | 'JOURNAL_ENTRY_CREATED'
  | 'JOURNAL_ENTRY_UPDATED'
  // Atlas Habit Milestone Events
  | 'HABIT_STREAK_MILESTONE'
  // Scout v2 Research Events
  | 'DEEP_RESEARCH_REQUESTED'
  | 'DEEP_RESEARCH_BACKUP_FOUND'
  | 'DEEP_RESEARCH_STARTED'
  | 'DEEP_RESEARCH_COMPLETED'
  | 'DIGEST_GENERATION_STARTED'
  | 'DIGEST_GENERATED'
  | 'DIGEST_GENERATION_FAILED'
  | 'EXPORT_REQUESTED'
  | 'SOURCE_ADDED';

export type SpineDomain = 'B' | 'E' | 'C' | 'R' | 'system';
export type SpineEventPriority = 'info' | 'alert' | 'critical';

export interface SpineEventPayload {
  type: SpineEventType;
  source: string;
  target?: string;
  domain: SpineDomain;
  data: Record<string, unknown>;
  cascadeDepth?: number;
  priority: SpineEventPriority;
}

export interface SpineEvent {
  id: string;
  type: SpineEventType;
  source: string;
  target?: string;
  domain: SpineDomain;
  data: Record<string, unknown>;
  timestamp: number;
  cascadeDepth: number;
  priority: SpineEventPriority;
}

// --- Soul Write Protocol (S10-002) ---

/**
 * Represents a cross-module request to write to a protected NSV field.
 * Saved to `pending_soul_writes/{uid}/{id}` and tracked via Spine events.
 */
export interface SoulWriteRequest {
  /** Unique request identifier — crypto.randomUUID() or nanoid(). */
  id: string;
  /** Module ID that owns the target NSV domain (the authoritative agent). */
  moduleId: string;
  /** Dot-notation NSV field path, e.g. "cognitive.focusScore". */
  field: string;
  value: unknown;
  /** Module ID of the module requesting the write. */
  requestedBy: string;
  /** Human-readable justification for the write, surfaced to the owning agent. */
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

// --- Active Chat & Engine Types ---

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export type MessageContent = string | MessageContentPart[];

/** Metadata attached by the LLM runtime for debug-mode inspection. */
export interface MessageDebugMeta {
  reasoning?: string;
  actionTagsExtracted?: Array<{ type: string; payload: unknown }>;
  actionTagsDispatched?: string[];
  actionsExecuted?: string[];
  apiLatencyMs?: number;
  apiRequestSnippet?: string;
  /** Spine event types fired during the turn this message was produced. */
  spineEvents?: string[];
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: MessageContent;
  timestamp?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** Optional debug metadata — populated only when debug instrumentation is active. */
  debugMeta?: MessageDebugMeta;
}

export interface ActiveSessionState {
  sessionId: string;
  moduleId: string;
  startTime: string;
  lastMessageAt: string;
  history: Message[];
  tokenCount: number;
  isGuestTrial: boolean;
  threadTitle?: string;
  contextPolicy?: ContextPolicy;
  docIds?: string[];
}

export type ContextPolicy = 'doc-only' | 'prompted' | 'base-context';

export interface ChatThread {
  id: string;
  moduleId: string;
  userId: string;
  title: string;
  contextPolicy: ContextPolicy;
  docIds: string[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface DocumentRecord {
  id: string;
  userId: string;
  moduleId: string;
  threadId: string;
  filename: string;
  fileType: 'pdf' | 'image' | 'txt' | 'csv' | 'md' | 'unknown';
  pageCount: number | null;
  wordCount: number;
  extractedTitle: string | null;
  notes: string[];
  encryptedData: {
    ciphertext: string;
    iv: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface NotebookCell {
  id: string;
  userId: string;
  moduleId: string;
  threadId: string;
  type: 'markdown' | 'analysis' | 'citation';
  content: string;
  encryptedData: {
    ciphertext: string;
    iv: string;
  };
  citations: Array<{ pageIndex: number; snippet: string; docId?: string }>;
  docIds: string[];
  createdAt: string;
  updatedAt: string;
  order: number;
}

// --- Domain Specific: Soma/Medical Records (absorbed into Titan) ---

export interface BiomarkerRecord {
  id: string;
  name: string;
  value: number | string;
  unit?: string;
  source?: string;
  recordedAt: string;
}

export interface ClearanceRecord {
  id: string;
  activity: string;
  status: 'granted' | 'denied' | 'conditional';
  reason: string;
  issuedAt: string;
}

export interface LabSummaryRecord {
  id: string;
  panel: string;
  findings: string[];
  flags: string[];
  recordedAt: string;
}

export interface MedicalImageAnalysis {
  id: string;
  analyzedAt: string;
  reportType: string;
  sourceLabel: string;
  biomarkerCount: number;
  clinicalFlags: Array<{ flag: string; severity: string }>;
}

// --- Domain Specific: Titan (Consolidated) ---

export type TitanPrivacyLevel = 'basic' | 'complete';

export interface TitanSupplement {
  name: string;
  category?: string;
}

export interface TitanMacroEstimate {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  source?: string;
}

export interface TitanNutrition {
  dietNotes?: string;
  supplements?: TitanSupplement[];
  macroEstimate?: TitanMacroEstimate;
  mealsPerDay?: number;
  [key: string]: unknown;
}

export type EquipmentType = 'barbell' | 'dumbbells' | 'cables' | 'kettlebells' | 'bodyweight' | 'machines' | 'bands' | 'trx';

export interface TitanActivity {
  activityLevel?: string;
  workoutsPerWeek?: number;
  sleepHours?: number;
  dayToDayNotes?: string;
  occupation?: string;
  baselineWeight?: number;
  baselineHeight?: number;
  /** Equipment available to the user. Drives safe exercise substitutions. */
  equipment?: EquipmentType[];
  /** Preferred weight unit for session logging. */
  preferredWeightUnit?: 'kg' | 'lbs';
  [key: string]: unknown;
}

export interface TitanHistory {
  yearsTraining?: number;
  injuries?: string[];
  goals?: string[];
  bodyGoals?: string;
  [key: string]: unknown;
}

export interface SleepEntry {
  id: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  bedtime?: string;
  wakeTime?: string;
  durationHours: number;
  /** 0–10 subjective quality */
  quality: number;
  deepSleepPct?: number;
  remSleepPct?: number;
  awakenings?: number;
  notes?: string;
  /** e.g. 'alcohol', 'late_meal', 'stress', 'caffeine' */
  tags?: string[];
  recordedAt: string;
}

export type CycleType = 'workout' | 'recovery' | 'custom';

export interface CyclePhase {
  id: string;
  name: string;
  durationDays: number;
  notes?: string;
  /** e.g. dosage for supplement cycles */
  dosage?: string;
  trainingModifier?: 'increase' | 'maintain' | 'reduce' | 'rest';
}

export interface CycleEntry {
  id: string;
  name: string;
  type: CycleType;
  description?: string;
  startDate: string;        // ISO date YYYY-MM-DD
  endDate?: string;
  phases: CyclePhase[];
  currentPhaseIndex: number;
  currentPhaseStartDate: string;
  status: 'active' | 'completed' | 'paused';
  notes?: string;
  /** For hormonal cycles: typical cycle length in days */
  cycleLength?: number;
  /** For hormonal cycles: date of last period */
  lastPeriodDate?: string;
  /** Routine IDs this training cycle is linked to. */
  linkedRoutineIds?: string[];
  /**
   * For workout mesocycles: the week number within the current phase that is
   * designated as a deload week (1-based). When the computed current week
   * matches this value the system injects a deload-week warning into the
   * Titan session prompt.
   */
  deloadWeekNumber?: number;
  /**
   * Progression scheme description used to populate the session prompt context.
   * e.g. "linear", "double-progression", "RPE-based", "undulating periodisation"
   */
  progressionScheme?: 'linear' | 'wave' | 'block' | 'undulating';
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseSet {
  setNumber: number;
  weight?: number;       // kg or lbs
  repsCompleted: number;
  completed: boolean;
  notes?: string;
  /** Set-level RPE (1–10). More precise than session-level RPE. */
  rpe?: number;
  /** Reps in reserve — modern auto-regulation standard. */
  rir?: number;
}

export interface ExerciseLog {
  exerciseName: string;
  plannedSets: number;
  plannedReps: string;
  sets: ExerciseSet[];
}

export interface WorkoutSession {
  id: string;
  routineId: string;
  routineName: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  startedAt: string;
  completedAt?: string;
  exercises: ExerciseLog[];
  /** Total volume in weight units (sum of weight × repsCompleted across all completed sets) */
  totalVolume?: number;
  /** Rate of perceived exertion 1–10 */
  rpe?: number;
  notes?: string;
  status: 'completed' | 'partial' | 'abandoned';
}

/** Personal record for a single exercise. */
export interface PersonalRecord {
  exerciseName: string;
  /** Best weight lifted for a completed set (any rep range). */
  maxWeight: number;
  /** Reps performed at maxWeight. */
  repsAtMax: number;
  /** Estimated 1-rep max using Epley formula: weight × (1 + reps/30). */
  e1RM: number;
  /** Date of the PR (ISO YYYY-MM-DD). */
  achievedDate: string;
  /** Session ID where PR was set. */
  sessionId: string;
}

/**
 * A user-defined custom tracking field stored in TitanProfile.customFields.
 * Created / deleted by the AI via the `create_field` / `delete_field` actions.
 */
export interface CustomField {
  /** Stable unique identifier (crypto.randomUUID). */
  id: string;
  /** Human-readable label shown in the UI. */
  name: string;
  /** Semantic data type — determines how the value is rendered and validated. */
  type: 'number' | 'text' | 'boolean' | 'select';
  /** Optional unit label (e.g. "kg", "mg/dL"). */
  unit?: string;
  /** Short description of what the field tracks. */
  description?: string;
  /** Numeric range guard [min, max] — only meaningful when type === 'number'. */
  range?: [number, number];
  /** Selectable options — only meaningful when type === 'select'. Max 10 items. */
  options?: string[];
  /** Unix-ms timestamp when the field was created. */
  createdAt: number;
}

export interface TitanProfile {
  onboardingComplete: boolean;
  privacyLevel: TitanPrivacyLevel;
  trackingLevel: 'standard' | 'indepth';
  nutrition: TitanNutrition;
  activity: TitanActivity;
  history: TitanHistory;
  summary: string;
  routines: Routine[];
  sleepLog?: SleepEntry[];
  cycles?: CycleEntry[];
  workoutSessions?: WorkoutSession[];
  /** Personal records keyed by exercise name (lowercase). Auto-updated on session log. */
  personalRecords?: Record<string, PersonalRecord>;
  /** Structured workout logs keyed to canonical exercise library IDs. */
  workoutLogs?: TitanWorkoutLog[];
  /** User's personal exercise library (defaults to the canonical set, extensible). */
  exerciseLibrary?: TitanExerciseEntry[];
  /** Whether Direct Write Mode is enabled (bypasses AI gating for logging operations). */
  directWriteMode?: boolean;
  /** User-defined custom tracking fields created via AI `create_field` action. Max 20. */
  customFields?: CustomField[];
  createdAt: string;
  updatedAt: string;
  traits?: string[];
  // --- Absorbed from SomaProfile ---
  /** @deprecated Moving to SomaProfile — dual-write phase */
  medicalOnboardingComplete?: boolean;
  /** @deprecated Moving to SomaProfile — dual-write phase */
  knownConditions: string[];
  /** @deprecated Moving to SomaProfile — dual-write phase */
  medications: string[];
  /** @deprecated Moving to SomaProfile — dual-write phase */
  allergies: string[];
  /** @deprecated Moving to SomaProfile — dual-write phase */
  biomarkers: BiomarkerRecord[];
  /** @deprecated Moving to SomaProfile — dual-write phase */
  labSummaries: LabSummaryRecord[];
  /** @deprecated Moving to SomaProfile — dual-write phase */
  clearances: ClearanceRecord[];
  /** @deprecated Moving to SomaProfile — dual-write phase */
  medicalImageAnalyses: MedicalImageAnalysis[];
  /** @deprecated Moving to SomaProfile — dual-write phase */
  medicalSummary?: string;
  // Transient/Legacy compat for prompts
  name?: string;
  gender?: string;
  soul?: Record<string, unknown>;
}

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface Routine {
  id: string;
  name: string;
  exercises: Exercise[];
  rationale: string;
  weekday?: Weekday;
  timeframe?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// Titan exercise-library types (granular muscle groups, canonical exercise
// identities). Prefixed with `Titan` to avoid collision with the routine
// Exercise/MuscleGroup types defined below.
// ---------------------------------------------------------------------------

export type TitanMuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'forearms' | 'core' | 'glutes' | 'quads' | 'hamstrings'
  | 'calves' | 'traps' | 'lats' | 'full_body' | 'cardio';

export type TitanExerciseCategory = 'compound' | 'isolation' | 'cardio' | 'mobility';

/** An entry in the canonical exercise library (distinct from Routine > Exercise). */
export interface TitanExerciseEntry {
  id: string;
  name: string;
  muscleGroups: TitanMuscleGroup[];
  category: TitanExerciseCategory;
  equipment: string[];
  aliases?: string[];
}

/** A single logged set linked to a canonical exercise ID. */
export interface TitanWorkoutSet {
  exerciseId: string;
  weight: number;
  reps: number;
  rir?: number;
  notes?: string;
}

/** A dated workout log composed of one or more TitanWorkoutSets. */
export interface TitanWorkoutLog {
  id: string;
  date: string;            // ISO YYYY-MM-DD
  sets: TitanWorkoutSet[];
  durationMinutes?: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Original (routine) muscle-group / exercise types — kept unchanged below.
// ---------------------------------------------------------------------------

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'quads' | 'hamstrings'
  | 'glutes' | 'arms' | 'core' | 'calves' | 'fullbody';

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  notes?: string;
  /** Target RPE for the exercise (1–10). Optional — used by AI to auto-regulate load. */
  targetRPE?: number;
  /** Tempo scheme, e.g. "3-1-1-0" (eccentric-pause-concentric-top). */
  tempoScheme?: string;
  /** Target rest between sets in seconds. Drives live rest timer in session logger. */
  restSeconds?: number;
  /** Equipment required for this exercise. */
  equipment?: 'barbell' | 'dumbbell' | 'cable' | 'kettlebell' | 'bodyweight' | 'machine' | 'band' | 'other';
  /** Primary muscle groups trained. Used for frequency analytics. */
  muscleGroups?: MuscleGroup[];
}

export interface HealthDataLog {
  date: string;
  weight?: number;
  sleepHours?: number;
  stressLevel?: number;
  moodScore?: number;
  cnsFatigueScore?: number;
}

// --- Module Profile Types ---

// Agnes (therapy intake)
export interface SessionSummary {
  date: string;
  summary: string;
  keyInsights: string[];
  theme: string;
}

export type AgnesMode = 'intake' | 'analysis' | 'selection' | 'session';
export type Gender = 'female' | 'male' | 'non-binary';

export interface AgnesArchetype {
  id: string;
  name: string;
  basePrompt: string;
  traits: string[];
}

export interface GeneratedAgnes {
  id: string;
  name: string;
  gender: Gender;
  archetypeId: string;
  role: string;
  description: string;
  systemPrompt: string;
  greeting: string;
}

export interface BaseContext {
  identity?: string | {
    name?: string;
    pronouns?: string;
    ageGroup?: string;
  };
  struggles?: string | string[];
  goals?: string | string[];
  backgroundSummary?: string;
  integratedInsights: SessionSummary[];
  communicationStyle?: 'direct' | 'gentle' | 'analytical';
  sessionCount?: number;
  lastSessionSummary?: string;
  occupation?: string;
  typicalSleepHours?: number;
  preferredAgnes?: {
    gender?: Gender | 'no-preference';
    tone?: string;
    traits?: string[];
  };
  somaticEnabled?: boolean; // default true when absent
  childhood?: string;
  trauma?: string;
  history?: string;
  intakeTranscript?: Message[];
}

export interface TherapyIntakeProfile {
  onboardingComplete: boolean;
  baseContext: Partial<BaseContext>;
  createdAt: string;
  updatedAt: string;
}

// Atlas
export interface RoutineBlock {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  category: 'deep_work' | 'admin' | 'social' | 'physical' | 'creative' | 'other' | 'recovery';
  energyCost: number;
}

export interface AtlasRoutine {
  id: string;
  blocks: RoutineBlock[];
  isActive: boolean;
}

export interface EnergyWavePoint {
  id: string;
  slot: string;
  energy: number;
  focus: number;
  load: number;
}

export interface RecoveryWindow {
  id: string;
  title: string;
  start: string;
  end: string;
  reason: string;
  status: 'planned' | 'active' | 'completed';
}

export interface AtlasTaskNode {
  id: string;
  title: string;
  energyCost: number;
  status: 'queued' | 'active' | 'done';
  dependencies?: string[];
}

export interface ScheduledTask {
  id: string;
  title: string;
  energyCost: number;
  focusCost: number;
  scheduledAt: string;
  duration: number;
  category: 'deep_work' | 'admin' | 'social' | 'physical' | 'creative' | 'other';
  status: 'scheduled' | 'done' | 'deferred' | 'skipped';
  dependencies?: string[];
  blockedBy?: 'low_energy' | 'low_focus' | 'recovery' | null;
  deferredFrom?: string;
  createdAt: string;
}

export interface DailyIntention {
  id: string;
  date: string;
  theme: string;
  focusDomain: string;
  energyTarget: number;
  createdAt: string;
}

export interface HabitRecord {
  id: string;
  habitId: string;
  name: string;
  completed: boolean;
  streak: number;
  loggedAt: string;
}

export interface AtlasTask {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  priority: 1 | 2 | 3 | 4 | 5;
  energyCost: number;
  status: 'queued' | 'active' | 'blocked' | 'done' | 'deferred';
  dependencies: string[];
  projectId?: string;
  goalId?: string;
  notes?: string;
  completedAt?: string;
  actualEnergyCost?: number;
  tags?: string[];
  recurrenceRule?: string;
  /** ISO date string ("YYYY-MM-DD") for which occurrence this task is scheduled */
  scheduledSlot?: string;
  /** ISO date string of the next recurrence after this task completes */
  nextOccurrenceDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AtlasMilestone {
  id: string;
  title: string;
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
}

export interface AtlasGoal {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  milestones: AtlasMilestone[];
  associatedTaskIds: string[];
  successCriteria: string;
  progressPercent: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AtlasHabit {
  id: string;
  title: string;
  type?: 'boolean' | 'counter' | 'timer' | 'sober' | 'learning';
  frequency: 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom';
  customDays?: number[];
  targetStreak: number;
  currentStreak: number;
  bestStreak: number;
  lastCompleted?: string;
  energyCost: number;
  minimumViableVersion: string;
  status: 'active' | 'paused' | 'archived';
  pauseReason?: string;
  pausedAt?: string;
  resumeDate?: string;
  metricValue?: number;
  logs?: { date: string; value: string | number; notes?: string }[];
  /** Sprint-B: ISO date strings (YYYY-MM-DD) for each day the habit was marked complete */
  completionLog?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AtlasProject {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  goalId?: string;
  taskIds: string[];
  deadline?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HabitWeekSummary {
  habitId: string;
  habitTitle: string;
  streak: number;
  completions: number;
  status: 'active' | 'paused';
}

export interface GoalWeekProgress {
  goalId: string;
  goalTitle: string;
  progressPercent: number;
  milestonesCompleted: number;
  milestonesTotal: number;
}

export interface TemporalReview {
  id: string;
  scope: 'daily' | 'weekly' | 'monthly' | 'yearly';
  periodStart: string;
  periodEnd: string;
  completionRate: number;
  totalScheduled: number;
  totalCompleted: number;
  habitSummary: HabitWeekSummary[];
  goalProgress: GoalWeekProgress[];
  nsvTrend: {
    energyBudgetAvg: number;
    resilienceTrend: 'improving' | 'stable' | 'declining';
    focusScoreAvg: number;
  };
  insights: string[];
  driftScore?: number;
  nextPeriodFocus: string;
  notes?: string;
  createdAt: string;
}

export interface AtlasPreferences {
  timezone: string;
  wakeTime: string;
  sleepTime: string;
  peakEnergyStart: string;
  peakEnergyEnd: string;
  workStyle: 'deep_blocks' | 'pomodoro' | 'flexible';
  planningHorizon: 'day' | 'week' | 'month';
  recoveryPreference: 'aggressive' | 'moderate' | 'minimal';
}

export interface AtlasProfile {
  onboardingComplete: boolean;
  energyWave: EnergyWavePoint[];
  recoveryWindows: RecoveryWindow[];
  taskGraph: AtlasTaskNode[];
  flattenedUntil?: string;
  summary: string;
  scheduledTasks: ScheduledTask[];
  dailyIntentions: DailyIntention[];
  habitRecords: HabitRecord[];
  tasks: AtlasTask[];
  goals: AtlasGoal[];
  projects: AtlasProject[];
  habits: AtlasHabit[];
  routine: AtlasRoutine;
  reviews: TemporalReview[];
  /** Daily evening check-in entries — fed into weekly review aggregation. */
  dailyCheckIns?: DailyCheckInEntry[];
  preferences?: AtlasPreferences;
  preferenceMode?: 'conversational' | 'structured';
  /** Extension field values, persisted alongside the profile. */
  fieldValues?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** One evening check-in submission, stored in the Atlas profile for weekly review. */
export interface DailyCheckInEntry {
  date: string;           // YYYY-MM-DD
  tasksCompleted: number;
  totalTasks: number;
  energyLevel: number;    // 1–5
  blockers: string;
  loggedAt: string;       // ISO timestamp
}

// Atlas Journal

export interface JournalHabitReflection {
  habitId: string;
  note: string;
  felt: 'great' | 'okay' | 'struggled';
}

export interface JournalGoalReflection {
  goalId: string;
  note: string;
}

export interface JournalEntry {
  id: string;               // YYYY-MM-DD (one per day, acts as doc ID)
  date: string;             // YYYY-MM-DD
  createdAt: string;        // ISO timestamp
  updatedAt: string;        // ISO timestamp
  morningIntent: string;    // Pre-filled from morning check-in AI brief
  eveningReflection: string; // Pre-filled from evening check-in blockers
  freeform: string;         // Open writing field
  mood: number;             // 1–5 (1=rough, 5=great)
  energyLevel: number;      // 1–5, synced from evening check-in
  gratitude: string[];      // Up to 3 items
  blockers: string;         // Synced from evening check-in
  habitsReflection: JournalHabitReflection[];
  goalsReflection: JournalGoalReflection[];
  aiPromptUsed: string | null; // The AI prompt that was shown, if any
  tags: string[];
}

// Soma

/**
 * A single timestamped vital-signs reading.
 * Stored in SomaProfile.vitalReadings (persisted, E2EE).
 */
export interface VitalReading {
  /** Unix timestamp (ms) when the reading was recorded */
  timestamp: number;
  heartRate?: number;
  bloodPressure?: string;
  temperature?: number;
  spo2?: number;
  weight?: number;
}

export interface SomaProfile {
  id: string;
  userId: string;
  knownConditions: string[];
  medications: string[];
  allergies: string[];
  biomarkers: BiomarkerRecord[];
  labSummaries: LabSummaryRecord[];
  clearances: ClearanceRecord[];
  medicalImageAnalyses: MedicalImageAnalysis[];
  medicalSummary?: string;
  medicalOnboardingComplete?: boolean;
  onboardingComplete?: boolean;
  createdAt: string;
  updatedAt: string;
  encryptedData?: string;
  iv?: string;
  // --- Flat vitals (UI layer — filled by VitalsEntryForm, SomaDashboard) ---
  restingHeartRate?: number;
  bloodPressure?: string;
  temperature?: number;
  spo2?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  bodyFatPercentage?: number;
  muscleMass?: number;
  vo2Max?: number;
  strength?: number;
  flexibility?: number;
  endurance?: number;
  dailySteps?: number;
  activeMinutes?: number;
  sleepHours?: number;
  sleepQuality?: number;
  hydrationLevel?: number;
  energyLevel?: number;
  stressPhysical?: number;
  lastCheckup?: string;
  nextCheckup?: string;
  clearanceStatus?: 'cleared' | 'pending' | 'restricted';
  readinessScore?: number;
  /** Timestamped vital-sign readings persisted into the encrypted profile */
  vitalReadings?: VitalReading[];
}

export interface GuestQuota {
  totalTurnsUsed: number;
  maxTurnsAllowed: number;
  isHardLocked: boolean;
}

// ---------------------------------------------------------------------------
// Agent Validation — S4 Agent Review UI
// ---------------------------------------------------------------------------

/**
 * Represents the result of an AI agent's review of a health data entry.
 * Drives the AgentPendingBadge, AgentOverridePanel, and AgentApprovalLog components.
 */
export interface AgentReview {
  /** Current review lifecycle state for the health entry. */
  status: 'pending_review' | 'approved' | 'rejected' | 'modified';
  /** Human-readable reasoning or note left by the agent. */
  agentNote?: string;
  /**
   * Agent's proposed replacement value (present when status is 'modified').
   * Typed as string | number to cover both scalar health metrics and formatted strings.
   */
  suggestedValue?: string | number;
  /** ISO-8601 timestamp of when the agent completed its review. */
  reviewedAt?: string;
}

// --- Global Aliases for LLM Engine ---
export type GlobalSoul = GlobalProjection;

// ---------------------------------------------------------------------------
// Contextual Inference Engine — S10-008
// ---------------------------------------------------------------------------

/**
 * A cross-module data hint detected by an AI module while processing user input.
 * Represents a passive signal that another module's profile data may need updating.
 */
export interface DataHint {
  /** Module whose AI detected the hint (e.g. "agnes", "titan"). */
  sourceModule: string;
  /** Module that owns the referenced data field (e.g. "titan", "ledger"). */
  targetModule: string;
  /** Dot-notation field path within the target profile (e.g. "weeklyWorkouts"). */
  field: string;
  /** The value inferred from the user's message. */
  inferredValue: unknown;
  /** Confidence score from 0 (none) to 1 (certain). */
  confidence: number;
  /** The user's exact phrasing that triggered the inference. */
  rawQuote: string;
  /** Sentiment context around the hint. */
  sentiment: 'neutral' | 'positive' | 'negative';
}

/**
 * Result of verifying a DataHint against the current stored profile value.
 * Drives the DataSyncToast UI decision.
 */
export interface HintVerificationResult {
  hint: DataHint;
  /** True when the inferred value meaningfully differs from the stored value. */
  isDiscrepant: boolean;
  /** Current stored value in the target profile (undefined when not set). */
  currentValue: unknown;
  /** Human-readable representation of the stored state. E.g. "Titan shows: 5 days/week". */
  displayLabel: string;
  /** ActionHub action type to dispatch when the user confirms the update. */
  confirmActionType: string;
}


