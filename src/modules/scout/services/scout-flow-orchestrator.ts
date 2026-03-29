import type { WebCrawlerResult } from '@/lib/services/web-crawler-service';

type MasterTopicState = {
  lastTopic: string | null;
  streak: number;
  proposedTopics: string[];
};

const MASTER_TOPIC_STATE_KEY = 'scout.master.topic.state.v1';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'what',
  'how', 'why', 'who', 'which', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'about', 'into', 'through',
  'latest', 'current', 'today', 'please', 'tell', 'me', 'check', 'again',
]);

export type MasterIntentClass =
  | 'acknowledgment'
  | 'smalltalk'
  | 'factual_non_temporal'
  | 'factual_temporal_or_verification'
  | 'research_request'
  | 'conversational';

export type MasterIntentDecision = {
  intentClass: MasterIntentClass;
  shouldSearch: boolean;
  shouldIncludeSources: boolean;
  shouldTrackTopic: boolean;
  conversationStyle: 'brief_ack' | 'chatty' | 'analytical';
};

function sanitizeQuery(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, 300);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .slice(0, 8);
}

function inferTopicKey(text: string): string {
  const tokens = tokenize(text);
  if (tokens.length === 0) return 'general';
  return tokens.slice(0, 3).join(' ');
}

function readTopicState(): MasterTopicState {
  if (typeof window === 'undefined') return { lastTopic: null, streak: 0, proposedTopics: [] };
  try {
    const raw = sessionStorage.getItem(MASTER_TOPIC_STATE_KEY);
    if (!raw) return { lastTopic: null, streak: 0, proposedTopics: [] };
    const parsed = JSON.parse(raw) as MasterTopicState;
    return {
      lastTopic: typeof parsed.lastTopic === 'string' ? parsed.lastTopic : null,
      streak: Number.isFinite(parsed.streak) ? parsed.streak : 0,
      proposedTopics: Array.isArray(parsed.proposedTopics)
        ? parsed.proposedTopics.filter((topic) => typeof topic === 'string')
        : [],
    };
  } catch {
    return { lastTopic: null, streak: 0, proposedTopics: [] };
  }
}

function writeTopicState(state: MasterTopicState): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(MASTER_TOPIC_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
}

export function updateMasterTopicStreak(input: { userText: string }): {
  topicKey: string;
  streak: number;
  shouldProposeSession: boolean;
} {
  return updateMasterTopicStreakWithPolicy({ ...input, shouldTrack: true });
}

export function updateMasterTopicStreakWithPolicy(input: { userText: string; shouldTrack: boolean }): {
  topicKey: string;
  streak: number;
  shouldProposeSession: boolean;
} {
  if (!input.shouldTrack) {
    return { topicKey: inferTopicKey(input.userText), streak: 0, shouldProposeSession: false };
  }
  const topicKey = inferTopicKey(input.userText);
  const state = readTopicState();
  const streak = state.lastTopic === topicKey ? state.streak + 1 : 1;
  const alreadyProposed = state.proposedTopics.includes(topicKey);
  const shouldProposeSession = streak >= 3 && !alreadyProposed;
  const nextState: MasterTopicState = {
    lastTopic: topicKey,
    streak,
    proposedTopics: shouldProposeSession ? [...state.proposedTopics, topicKey] : state.proposedTopics,
  };
  writeTopicState(nextState);
  return { topicKey, streak, shouldProposeSession };
}

function isAcknowledgment(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /^(ok|okay|kk|k|cool|got it|understood|makes sense|thanks|thank you|noted|fine|sure|alright)[.!]*$/.test(normalized);
}

function isSmallTalk(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /^(hi|hello|hey|yo|how are you|what's up|whats up|good morning|good evening)[!?]*$/.test(normalized);
}

function isTemporalOrVerificationIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(latest|current|newest|today|recent|as of now|right now|breaking)\b/.test(lower) ||
    /\b(version|price|stock|score|who won|release date)\b/.test(lower) ||
    /\b(verify|recheck|validate|fact check|double check|check again)\b/.test(lower)
  );
}

function isResearchRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(search|look up|find sources|source this|web search|google|research this)\b/.test(lower);
}

function isFactualQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    text.includes('?') ||
    /^\s*(what|why|how|who|where|when|which|define|explain)\b/.test(lower)
  );
}

function isEvidenceRequested(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(source|citation|cite|references|links?|proof|evidence)\b/.test(lower);
}

export function classifyMasterIntent(text: string): MasterIntentDecision {
  if (isAcknowledgment(text)) {
    return {
      intentClass: 'acknowledgment',
      shouldSearch: false,
      shouldIncludeSources: false,
      shouldTrackTopic: false,
      conversationStyle: 'brief_ack',
    };
  }

  if (isSmallTalk(text)) {
    return {
      intentClass: 'smalltalk',
      shouldSearch: false,
      shouldIncludeSources: false,
      shouldTrackTopic: false,
      conversationStyle: 'chatty',
    };
  }

  if (isResearchRequest(text)) {
    return {
      intentClass: 'research_request',
      shouldSearch: true,
      shouldIncludeSources: true,
      shouldTrackTopic: true,
      conversationStyle: 'analytical',
    };
  }

  if (isTemporalOrVerificationIntent(text)) {
    return {
      intentClass: 'factual_temporal_or_verification',
      shouldSearch: true,
      shouldIncludeSources: true,
      shouldTrackTopic: true,
      conversationStyle: 'analytical',
    };
  }

  if (isFactualQuestion(text)) {
    return {
      intentClass: 'factual_non_temporal',
      shouldSearch: false,
      shouldIncludeSources: isEvidenceRequested(text),
      shouldTrackTopic: true,
      conversationStyle: 'analytical',
    };
  }

  return {
    intentClass: 'conversational',
    shouldSearch: false,
    shouldIncludeSources: false,
    shouldTrackTopic: false,
    conversationStyle: 'chatty',
  };
}

export function isRecheckIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(check|verify|recheck|validate|confirm)\b/.test(lower) ||
    /\b(again|latest|re-?search|double check)\b/.test(lower)
  );
}

export function formatSearchDigest(query: string, results: WebCrawlerResult[]): string {
  const lines = results.slice(0, 5).map((result, index) => {
    const content = (result.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
    return `${index + 1}. ${result.title}\nURL: ${result.url}\nSnippet: ${content}`;
  });
  return [
    `[SCOUT_PREFETCH_QUERY] ${sanitizeQuery(query)}`,
    '[SCOUT_PREFETCH_RESULTS]',
    lines.join('\n\n'),
    '[END_SCOUT_PREFETCH_RESULTS]',
  ].join('\n');
}
