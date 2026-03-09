import type {
  Message,
  SessionSummary,
  AgnesMode,
  Gender,
  AgnesArchetype,
  GeneratedAgnes,
  BaseContext
} from '@/lib/types';

export {
  SessionSummary,
  AgnesMode,
  Gender,
  AgnesArchetype,
  GeneratedAgnes,
  BaseContext
};

// 2. Short-Term Memory (The "Moment" - Active Conversation)
export interface ActiveSession {
  id: string;
  messages: Message[]; // The actual chat log
  emotionalTrend: string[]; // e.g. ["anxious", "calm", "reflective"]
  startedAt: number;
  lastUpdatedAt: number;
}

// 3. Storage Schema (Firestore Document - The "Vault")
export interface EncryptedProfile {
  uid?: string;
  
  // The "Soul" (BaseContext + Agnes Choice)
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
    agnesName?: string;
    sessionCount: number;
    email?: string;
  };
}

export type AgnesProfile = EncryptedProfile;
