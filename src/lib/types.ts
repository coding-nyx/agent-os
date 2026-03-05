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
}

export interface ModuleMemoryEnvelope {
  moduleId: string;
  lastActive: string;
  activeSessionId?: string;
  latestSnapshot: string;
  eventHistory: SessionEventSummary[];
  metadata: Record<string, any>;
}

export interface GlobalProjection {
  lastSync: string;
  overallWellnessScore: number;
  displayNames: { [moduleId: string]: string };
  agentGenders: { [moduleId: string]: GenderPersonality };
  crossFunctionalState: {
    cnsFatigue: number;
    emotionalResilience: number;
    sleepQuality: number;
    hormonalContext?: string;
    traumaMarkers?: string[];
  };
  compactedInsights: string[];
  therapeuticBaseline?: {
    isInitialized: boolean;
    initializedAt?: string;
  };
}

// --- Active Chat & Engine Types ---

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: string;
  tool_calls?: any[];
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

export interface TrainerProfile {
  onboardingComplete: boolean;
  privacyLevel: TrainerPrivacyLevel;
  trackingLevel: 'standard' | 'indepth';
  nutrition: any;
  activity: any;
  history: any;
  summary: string;
  routines: Routine[];
  createdAt: string;
  updatedAt: string;
  traits?: string[];
  // Transient/Legacy compat for prompts
  name?: string;
  gender?: string;
  soul?: any;
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
