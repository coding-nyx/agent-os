
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type TherapyMode = 'intake' | 'analysis' | 'selection' | 'session';

export type Gender = 'female' | 'male' | 'non-binary';

export interface TherapistArchetype {
  id: string;
  name: string; // Internal name e.g. "The Analyst"
  basePrompt: string; // The core personality instructions
  traits: string[];
}

export interface GeneratedTherapist {
  id: string;
  name: string;
  gender: Gender;
  archetypeId: string;
  role: string; // displayed role e.g. "Clinical Psychologist"
  description: string; // "I specialize in..."
  systemPrompt: string; // The final compiled prompt with user context
  greeting: string;
}

export interface Persona {
  id: string;
  name: string;
  role: string;
  description: string;
  prompt: string; // The system prompt for this persona
}

// 1. Long-Term Memory (The "Soul" - Optimized for System Prompt Injection)
export interface BaseContext {
  // Core Identity
  identity?: string | {
    name?: string;
    pronouns?: string;
    ageGroup?: string;
  };
  // The "Why"
  struggles?: string | string[]; // e.g., ["anxiety", "insomnia"]
  goals?: string | string[];     // e.g., ["better sleep", "conflict resolution"]
  
  // The "Deep" Context (Summarized)
  backgroundSummary?: string; // Condensed childhood/trauma summary
  
  // Integrated Insights (Past Sessions)
  integratedInsights: SessionSummary[];
  
  // Therapy State
  communicationStyle?: 'direct' | 'gentle' | 'analytical';
  sessionCount?: number;
  lastSessionSummary?: string; // Recap of where we left off
  
  // Legacy/Compatibility (Optional)
  childhood?: string;
  trauma?: string;
  history?: string;
  intakeTranscript?: any[];
}

// 2. Short-Term Memory (The "Moment" - Active Conversation)
export interface ActiveSession {
  id: string;
  messages: Message[]; // The actual chat log
  emotionalTrend: string[]; // e.g. ["anxious", "calm", "reflective"]
  startedAt: number;
  lastUpdatedAt: number;
}

export interface SessionSummary {
  date: string;
  summary: string;
  keyInsights: string[];
  theme: string;
}

export interface ConversationContext {
  systemPrompt: string;
  insights: SessionSummary[];
  summary: string;
  history: Message[];
}

// 3. Storage Schema (Firestore Document - The "Vault")
export interface EncryptedProfile {
  uid?: string;
  
  // The "Soul" (BaseContext + Therapist Choice)
  encryptedData: string; 
  iv: string;
  salt: string;

  // The "Moment" (ActiveSession) - Null when no session is active
  encryptedMoment?: string | null;
  momentIv?: string;
  momentSalt?: string;
  
  // Metadata (Unencrypted for UI/Querying)
  metadata: {
    hasVault: boolean;
    hasActiveSession: boolean;
    lastActive: string;
    therapistName?: string;
    sessionCount: number;
    email?: string;
  };
}

export type TherapistProfile = EncryptedProfile;

export interface LLMProvider {
  sendMessage(messages: Message[]): Promise<string>;
  streamMessage(messages: Message[], onChunk: (chunk: string) => void): Promise<string>;
}
