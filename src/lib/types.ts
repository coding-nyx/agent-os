// --- Core Platform Contracts (v2) ---

export type GenderPersonality = 'female' | 'male' | 'non-binary' | 'gender-fluid';

export interface AgentPersonalityProvision {
  orchestratorAlias: string;
  moduleAliases: {
    therapy: string;
    trainer: string;
    ledger: string;
    [key: string]: string;
  };
  moduleGenderProfiles: {
    orchestrator: GenderPersonality;
    therapy: GenderPersonality;
    trainer: GenderPersonality;
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
  resource?: Partial<NeuralStateVector['resource']>;
} & Partial<Omit<NeuralStateVector, 'biological' | 'emotional' | 'cognitive' | 'resource'>>;

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
  | 'CLEARANCE_DENIED'
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
  | 'MODULE_DELEGATED';

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

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
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

// --- Domain Specific: Trainer (Consolidated) ---

export type TrainerPrivacyLevel = 'basic' | 'complete';

export interface TrainerSupplement {
  name: string;
  category?: string;
}

export interface TrainerMacroEstimate {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  source?: string;
}

export interface TrainerNutrition {
  dietNotes?: string;
  supplements?: TrainerSupplement[];
  macroEstimate?: TrainerMacroEstimate;
  mealsPerDay?: number;
  [key: string]: unknown;
}

export interface TrainerActivity {
  activityLevel?: string;
  workoutsPerWeek?: number;
  sleepHours?: number;
  dayToDayNotes?: string;
  occupation?: string;
  baselineWeight?: number;
  baselineHeight?: number;
  [key: string]: unknown;
}

export interface TrainerHistory {
  yearsTraining?: number;
  injuries?: string[];
  goals?: string[];
  bodyGoals?: string;
  [key: string]: unknown;
}

export interface TrainerProfile {
  onboardingComplete: boolean;
  privacyLevel: TrainerPrivacyLevel;
  trackingLevel: 'standard' | 'indepth';
  nutrition: TrainerNutrition;
  activity: TrainerActivity;
  history: TrainerHistory;
  summary: string;
  routines: Routine[];
  createdAt: string;
  updatedAt: string;
  traits?: string[];
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
