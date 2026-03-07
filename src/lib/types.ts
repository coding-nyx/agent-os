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
  };
  /** Atlas-owned planning domain — habit/deadline health metrics. */
  planning: {
    /** Composite habit streak health (0-10). Drop >3 in 24h triggers STREAK_BROKEN cascade. */
    streakHealth?: number | null;
    /** Urgency pressure from nearest deadlines (0-10). ≥8 triggers DEADLINE_CRUNCH cascade. */
    deadlinePressure?: number | null;
  };
  resource: {
    financialFriction?: number | null;
    resonanceROI?: number | null;
  };
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
  | 'WEEKLY_REVIEW_COMPLETE'
  | 'DELEGATION_REQUEST'
  | 'NSV_CALIBRATION_REQUEST';

export interface SpineEvent {
  id: string;
  type: SpineEventType;
  source: string;
  target?: string;
  domain: 'B' | 'E' | 'C' | 'R' | 'system';
  data: Record<string, unknown>;
  timestamp: number;
  cascadeDepth: number;
  priority: 'info' | 'alert' | 'critical';
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

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: MessageContent;
  timestamp?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ActiveSessionState {
  sessionId: string;
  moduleId: string;
  startTime: string;
  lastMessageAt: string;
  history: Message[];
  tokenCount: number;
  isGuestTrial: boolean;
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

export interface TitanActivity {
  activityLevel?: string;
  workoutsPerWeek?: number;
  sleepHours?: number;
  dayToDayNotes?: string;
  occupation?: string;
  baselineWeight?: number;
  baselineHeight?: number;
  [key: string]: unknown;
}

export interface TitanHistory {
  yearsTraining?: number;
  injuries?: string[];
  goals?: string[];
  bodyGoals?: string;
  [key: string]: unknown;
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
  createdAt: string;
  updatedAt: string;
  traits?: string[];
  // --- Absorbed from SomaProfile ---
  medicalOnboardingComplete?: boolean;
  knownConditions: string[];
  medications: string[];
  allergies: string[];
  biomarkers: BiomarkerRecord[];
  labSummaries: LabSummaryRecord[];
  clearances: ClearanceRecord[];
  medicalImageAnalyses: MedicalImageAnalysis[];
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

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  notes?: string;
}

export interface HealthDataLog {
  date: string;
  weight?: number;
  sleepHours?: number;
  stressLevel?: number;
  moodScore?: number;
  cnsFatigueScore?: number;
}

export interface GuestQuota {
  totalTurnsUsed: number;
  maxTurnsAllowed: number;
  isHardLocked: boolean;
}

// --- Global Aliases for LLM Engine ---
export type GlobalSoul = GlobalProjection;
