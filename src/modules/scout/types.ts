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
}

export interface SubQuestion {
  id: string;
  text: string;
  intent: 'factual' | 'comparative' | 'temporal' | 'causal';
  status: 'pending' | 'approved' | 'rejected' | 'searching' | 'completed' | 'failed';
  results?: any[];
}

export type ResearchSessionStatus = 'idle' | 'decomposing' | 'awaiting_review' | 'searching' | 'synthesizing' | 'complete' | 'error' | 'cancelled';

export interface ResearchSession {
  id: string;
  userId: string;
  topic: string;
  status: ResearchSessionStatus;
  subQuestions: SubQuestion[];
  createdAt: string;
  updatedAt: string;
  resultNodeId?: string;
  reasoningHistory?: Array<{
    id: string;
    type: 'reasoning' | 'search' | 'result' | 'synthesis' | 'source' | 'user';
    text: string;
    timestamp: number;
    data?: any;
  }>;
}

export interface ScoutKnowledgeNode {
  id: string;
  claim: string;
  confidence: number;
  evidence: string[]; // Array of SourceEntry IDs
  status: 'pending' | 'verified' | 'contested';
  updatedAt: string;
  parentSessionId?: string;
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
