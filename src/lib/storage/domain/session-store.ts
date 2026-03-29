import type { ActiveSessionState, Message, MessageContent, MessageContentPart } from '@/lib/types';

export interface SaveSessionResult {
  saved: boolean;
  compacted: boolean;
  droppedCount: number;
  truncatedCount: number;
  estimatedBytes: number;
  debugStripped: boolean;
  nearLimit: boolean;
  hardLimitExceeded: boolean;
}

export interface SessionStore {
  save(sessionKey: SessionKey, session: ActiveSessionState): Promise<SaveSessionResult>;
  read(sessionKey: SessionKey): Promise<ActiveSessionState | null>;
  subscribe(sessionKey: SessionKey, onUpdate: (session: ActiveSessionState | null) => void): () => void;
  clear(sessionKey: SessionKey): Promise<void>;
}

export interface SessionKey {
  uid: string;
  moduleId: string;
  sessionId?: string;
}

export interface PersistedSessionMeta {
  sessionId: string;
  moduleId: string;
  startTime: string;
  lastMessageAt: string;
  tokenCount: number;
  isGuestTrial: boolean;
  threadTitle?: string;
  contextPolicy?: ActiveSessionState['contextPolicy'];
  docIds?: string[];
  historyVersion: number;
  messageCount: number;
  chunkCount: number;
  updatedAt: string;
  /**
   * Ordered list of chunk identifiers written during the last save.
   * Used by read() for lazy loading — fetch chunks in reverse order and stop
   * once enough messages are loaded, rather than fetching all chunks.
   * Absent on sessions saved before this field was introduced (falls back to
   * listDocuments).
   */
  chunkIndex?: { id: string; seqStart: number; seqEnd: number }[];
  metadata?: {
    droppedCountTotal?: number;
    truncatedCountTotal?: number;
    debugStripped?: boolean;
    compactedAt?: string;
    estimatedBytes?: number;
    nearLimit?: boolean;
    hardLimitExceeded?: boolean;
  };
}

export interface PersistedSessionChunk {
  id: string;
  seqStart: number;
  seqEnd: number;
  messageCount: number;
  estimatedBytes: number;
  messages: PersistedMessage[];
  createdAt: string;
  updatedAt: string;
}

export type PersistedMessage = {
  role: Message['role'];
  content: MessageContent;
  timestamp?: string;
  threadId?: string;
  tool_call_id?: string;
  actor?: Message['actor'];
};

export const MAX_PERSISTED_SESSION_MESSAGES = 220;
export const SESSION_SIZE_SOFT_LIMIT_BYTES = 850_000;
export const SESSION_SIZE_HARD_LIMIT_BYTES = 1_000_000;
const MAX_TEXT_CONTENT_CHARS = 8_000;
const MAX_PART_TEXT_CHARS = 4_000;

function toUtf8Bytes(text: string): number {
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length;
  }
}

function estimateBytes(payload: unknown): number {
  try {
    return toUtf8Bytes(JSON.stringify(payload));
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function trimText(value: string, maxChars: number): { value: string; truncated: boolean } {
  if (value.length <= maxChars) return { value, truncated: false };
  return { value: `${value.slice(0, Math.max(0, maxChars - 14))}[truncated]`, truncated: true };
}

function sanitizeContent(content: MessageContent): { content: MessageContent; truncated: boolean } {
  if (typeof content === 'string') {
    const result = trimText(content, MAX_TEXT_CONTENT_CHARS);
    return { content: result.value, truncated: result.truncated };
  }

  let truncated = false;
  const next: MessageContentPart[] = [];
  for (const part of content) {
    if (part.type === 'text') {
      const result = trimText(part.text, MAX_PART_TEXT_CHARS);
      truncated = truncated || result.truncated;
      next.push({ type: 'text', text: result.value });
      continue;
    }
    // Keep image URLs but drop oversized detail metadata variance.
    next.push({ type: 'image_url', image_url: { url: part.image_url.url, detail: part.image_url.detail } });
  }
  return { content: next, truncated };
}

export function sanitizeSessionMessages(messages: Message[]): {
  messages: PersistedMessage[];
  debugStripped: boolean;
  truncatedCount: number;
} {
  let debugStripped = false;
  let truncatedCount = 0;

  const sanitized = messages.map((msg) => {
    const { content, truncated } = sanitizeContent(msg.content);
    if (truncated) truncatedCount += 1;
    if ((msg as { debugMeta?: unknown }).debugMeta !== undefined || msg.tool_calls !== undefined) {
      debugStripped = true;
    }

    const next: PersistedMessage = {
      role: msg.role,
      content,
      timestamp: msg.timestamp,
      ...(msg.threadId !== undefined && { threadId: msg.threadId }),
      ...(msg.tool_call_id !== undefined && { tool_call_id: msg.tool_call_id }),
      ...(msg.actor !== undefined && { actor: msg.actor }),
    };

    return next;
  });

  return { messages: sanitized, debugStripped, truncatedCount };
}

export function compactSessionMessages(messages: PersistedMessage[]): {
  messages: PersistedMessage[];
  droppedCount: number;
} {
  if (messages.length <= MAX_PERSISTED_SESSION_MESSAGES) {
    return { messages, droppedCount: 0 };
  }
  const keep = messages.slice(-MAX_PERSISTED_SESSION_MESSAGES);
  return { messages: keep, droppedCount: messages.length - keep.length };
}

export function estimateSessionBytes(meta: PersistedSessionMeta, chunks: PersistedSessionChunk[]): number {
  return estimateBytes(meta) + chunks.reduce((sum, chunk) => sum + estimateBytes(chunk), 0);
}

export function buildSessionDocId({ uid, moduleId, sessionId }: SessionKey): string {
  if (sessionId && sessionId !== 'current') return `${uid}_${moduleId}_${sessionId}`;
  return `${uid}_${moduleId}`;
}
