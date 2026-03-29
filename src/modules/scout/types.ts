export interface EvidenceHighlight {
  id: string;
  sourceId: string;
  text: string;
  contextBefore?: string;
  contextAfter?: string;
  pageNumber?: number;
  confidence: number;
  addedAt: string;
}

export interface SourceEntry {
  id: string;
  url: string;
  normalizedUrl: string;
  title: string;
  domain: string;
  snippet: string;
  imageUrl?: string;
  favicon?: string;
  addedAt: string;
  lastAccessedAt?: string;
  discoveredVia: 'search' | 'manual' | 'deep_research';
  readStatus: 'unread' | 'reading' | 'read';
  starred: boolean;
  archived: boolean;
  notes?: string;
  tags: string[];
  citingNodeIds: string[];
  highlights?: EvidenceHighlight[];
}

export interface SubQuestion {
  id: string;
  text: string;
  intent: 'factual' | 'comparative' | 'temporal' | 'causal';
  status: 'pending' | 'approved' | 'rejected' | 'searching' | 'completed' | 'failed';
  results?: any[];
}

export type ResearchSessionStatus = 'idle' | 'decomposing' | 'awaiting_review' | 'searching' | 'synthesizing' | 'complete' | 'error' | 'cancelled' | 'archived';

export interface ReasoningEntry {
  id: string;
  type: 'reasoning' | 'search' | 'result' | 'synthesis' | 'source' | 'user';
  text: string;
  timestamp: number;
  data?: any;
}

export interface ResearchSession {
  id: string;
  userId: string;
  topic: string;
  mode?: 'web' | 'deep';
  seedState?: 'unseeded' | 'seeding' | 'seeded';
  seededAt?: string;
  lastSearchAt?: string;
  status: ResearchSessionStatus;
  subQuestions: SubQuestion[];
  createdAt: string;
  updatedAt: string;
  resultNodeId?: string;
  archived?: boolean;
  reasoningHistory?: ReasoningEntry[];
}

export interface ScoutKnowledgeNode {
  id: string;
  claim: string;
  confidence: number;
  evidence: string[]; // Array of SourceEntry IDs
  highlights?: string[]; // Array of EvidenceHighlight IDs
  embedding?: number[]; // Vector embedding for semantic search
  tags?: string[]; // User-assigned topic tags for filtering/clustering
  // Optional aliases used by export/UI layers.
  // Some views treat these as either a single source URL/domain or a list.
  source?: string;
  sources?: string[];
  status: 'pending' | 'verified' | 'contested';
  updatedAt: string;
  parentSessionId?: string;
  provenance?: {
    source: 'scout';
    sourceEntityId: string;
    sourceIds: string[];
    sessionId?: string;
    synthesizedAt: string;
  };
}

export interface ScoutDigest {
  id: string;
  userId: string;
  generatedAt: string;
  generationType: 'manual' | 'scheduled';
  periodStart: string;
  periodEnd: string;
  summary: {
    totalNodes: number;
    newNodesThisPeriod: number;
    verifiedCount: number;
    contestedCount: number;
  };
  topClaims: Array<{
    nodeId: string;
    claim: string;
    confidence: number;
    evidenceCount: number;
  }>;
  trendingInterests: Array<{
    topic: string;
    score: number;
    trend: 'rising' | 'steady' | 'cooling';
  }>;
  synthesizedContent: string; // Markdown
}
