import { Message, ConversationContext, MessageContent } from '../types';
import { EngineConfig, StructuredResponse, StreamChunk, ParsedAction } from './types';
import { CognitiveEngineJs, CancellableTask, UserIdentityJs } from '@cortex-logic';
import type { CoreUserProfile } from '@/lib/types';
import type { ExtractedMutation } from '../sanitize';
import { sanitizeJsonPayload } from '../sanitize';

// Singleton KMP engine instance — shared across all CognitiveAgent instances.
let _kmpEngine: CognitiveEngineJs | null = null;

function getOrCreateKmpEngine(config: EngineConfig): CognitiveEngineJs {
  if (!_kmpEngine) {
    _kmpEngine = new CognitiveEngineJs();
  }
  // Legacy path: raw keys passed directly.
  if (!config.credentialStore) {
    _kmpEngine.init(
      config.openrouterKey ?? '',
      config.googleKey ?? '',
      config.grokKey ?? '',
      config.mercuryKey ?? '',
      config.preferredModelId ?? '',
      config.isMockMode ?? false,
      config.preferredProvider ?? ''
    );
  }
  return _kmpEngine;
}

export class CognitiveAgent {
  private config: EngineConfig;
  private kmpEngine: CognitiveEngineJs;
  private _initPromise: Promise<void> | null = null;

  constructor(config: EngineConfig) {
    this.config = config;
    this.kmpEngine = getOrCreateKmpEngine(config);
  }

  /**
   * Initialize the engine. When a credentialStore is configured, keys are
   * resolved asynchronously from encrypted storage. Otherwise this is a no-op
   * (legacy keys were already passed in the constructor).
   */
  async initialize(): Promise<void> {
    if (!this.config.credentialStore) return;

    if (this._initPromise) return this._initPromise;

    this._initPromise = new Promise<void>((resolve, reject) => {
      this.kmpEngine.initWithCredentialStore(
        this.config.credentialStore!,
        this.config.freeModelsOnly
          ? 'google/gemini-2.0-flash:free'
          : (this.config.preferredModelId ?? ''),
        this.config.isMockMode ?? false,
        () => resolve(),
        (err) => reject(new Error(err)),
        this.config.preferredProvider ?? '',
      );
    });

    return this._initPromise;
  }

  setFreeModelsOnly(enabled: boolean): void {
    this.config.freeModelsOnly = enabled;

    if (this.config.credentialStore) {
      // Re-init from credential store with new model preference.
      this.kmpEngine.reinitFromCredentialStore(
        enabled ? 'google/gemini-2.0-flash:free' : (this.config.preferredModelId ?? ''),
        () => { /* ready */ },
        (err) => console.warn('CognitiveAgent: reinit failed', err),
        this.config.preferredProvider ?? '',
      );
      return;
    }

    // Legacy path.
    this.kmpEngine.init(
      this.config.openrouterKey ?? '',
      this.config.googleKey ?? '',
      this.config.grokKey ?? '',
      this.config.mercuryKey ?? '',
      enabled ? 'google/gemini-2.0-flash:free' : (this.config.preferredModelId ?? ''),
      this.config.isMockMode ?? false,
      this.config.preferredProvider ?? ''
    );
  }

  /**
   * Clear all in-memory credentials from the KMP engine. Call on logout.
   */
  static clearCredentials(): void {
    _kmpEngine?.clearCredentials();
    _kmpEngine = null;
  }

  async chat(
    userMessage: MessageContent,
    context: ConversationContext,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<{ response: StructuredResponse; updatedHistory: Message[] }> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const messageText = typeof userMessage === 'string'
      ? userMessage
      : Array.isArray(userMessage)
        ? userMessage.map(p => (typeof p === 'string' ? p : (p as any).text ?? '')).join(' ')
        : '';

    const historyJson = JSON.stringify(context.history);
    const memoryContextJson = JSON.stringify(context.memoryContext);

    return new Promise((resolve, reject) => {
      let settled = false;
      let abortHandler: (() => void) | null = null;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
        fn();
      };

      const task: CancellableTask = this.kmpEngine.chatWithContext(
        context.moduleId ?? 'ara',
        messageText,
        historyJson,
        context.systemPrompt,
        memoryContextJson,
        context.summary,
        (chunk) => {
          if (settled) return;
          onChunk?.({
            delta: chunk.delta,
            isThinking: chunk.isThinking,
            isActing: chunk.isActing,
            currentActionType: chunk.currentActionType ?? null,
          });
        },
        (final) => {
          settle(() => {
            const actions = safeJsonParse<ParsedAction[]>(final.actionsJson, []);
            const mutations = safeJsonParse<ExtractedMutation[]>(final.mutationsJson, []);
            const response: StructuredResponse = {
              fullText: final.content,
              publicText: final.content,
              internalThoughts: final.thoughts ?? null,
              actions,
              mutations,
              isInterrupted: false,
            };
            const updatedHistory: Message[] = [
              ...context.history,
              { role: 'user', content: userMessage } as Message,
              { role: 'assistant', content: final.content } as Message,
            ];
            resolve({ response, updatedHistory });
          });
        },
        (err) => settle(() => reject(new Error(err)))
      );

      if (signal) {
        abortHandler = () => {
          task.cancel();
          settle(() => reject(new DOMException('Aborted', 'AbortError')));
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }

  /**
   * Full-orchestration streaming via the new KMP chatWithMemory path.
   *
   * KMP owns: PersonaFactory (system prompt assembly with NSV injection),
   * memory callback invocation, MemoryManager context optimization, LLM streaming.
   *
   * Caller owns: history slicing, moduleContextJson serialization, memory retrieval
   * Promise, post-stream action execution and NSV writes (unchanged).
   */
  async chatWithMemory(
    userMessage: MessageContent,
    context: ConversationContext & {
      nsvJson: string;
      moduleContextJson: string;
      longTermSummary?: string;
      userProfile?: Pick<CoreUserProfile, 'preferredName' | 'pronouns'> | null;
      retrieveMemory: (query: string) => Promise<string[]>;
    },
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<{ response: StructuredResponse; updatedHistory: Message[] }> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const messageText = typeof userMessage === 'string'
      ? userMessage
      : Array.isArray(userMessage)
        ? userMessage.map(p => (typeof p === 'string' ? p : (p as any).text ?? '')).join(' ')
        : '';

    const historyJson = JSON.stringify(context.history);
    const identity = new UserIdentityJs(
      context.userProfile?.preferredName ?? 'User',
      context.userProfile?.pronouns ?? 'they/them',
    );

    return new Promise((resolve, reject) => {
      let settled = false;
      let abortHandler: (() => void) | null = null;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
        fn();
      };

      const task: CancellableTask = this.kmpEngine.chatWithMemory(
        context.moduleId ?? 'ara',
        messageText,
        historyJson,
        identity,
        context.nsvJson,
        '{}', // globalSoulJson — not needed; NSV is already in nsvJson
        context.moduleContextJson,
        context.longTermSummary ?? '',
        (query, onComplete, onError) => {
          context.retrieveMemory(query)
            .then((facts) => onComplete(facts))
            .catch((err) => onError(String(err)));
        },
        (chunk) => {
          if (settled) return;
          onChunk?.({
            delta: chunk.delta,
            isThinking: chunk.isThinking,
            isActing: chunk.isActing,
            currentActionType: chunk.currentActionType ?? null,
          });
        },
        (final) => {
          settle(() => {
            const actions = safeJsonParse<ParsedAction[]>(final.actionsJson, []);
            const mutations = safeJsonParse<ExtractedMutation[]>(final.mutationsJson, []);
            const response: StructuredResponse = {
              fullText: final.content,
              publicText: final.content,
              internalThoughts: final.thoughts ?? null,
              actions,
              mutations,
              isInterrupted: false,
            };
            const updatedHistory: Message[] = [
              ...context.history,
              { role: 'user', content: userMessage } as Message,
              { role: 'assistant', content: final.content } as Message,
            ];
            resolve({ response, updatedHistory });
          });
        },
        (err) => settle(() => reject(new Error(err))),
      );

      if (signal) {
        abortHandler = () => {
          task.cancel();
          settle(() => reject(new DOMException('Aborted', 'AbortError')));
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }

  async generateJSON<T = any>(
    prompt: string,
    options: { systemPrompt?: string; signal?: AbortSignal } = {}
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      let settled = false;
      let abortHandler: (() => void) | null = null;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener('abort', abortHandler!);
        fn();
      };

      const task: CancellableTask = this.kmpEngine.generateText(
        prompt,
        options.systemPrompt ?? null,
        (text) => {
          settle(() => {
            try {
              resolve(parseStructuredJson<T>(text));
            } catch {
              reject(new Error(`Failed to parse structured LLM response as JSON: ${text.slice(0, 100)}...`));
            }
          });
        },
        (err) => settle(() => reject(new Error(err)))
      );

      if (options.signal) {
        abortHandler = () => {
          task.cancel();
          settle(() => reject(new DOMException('Aborted', 'AbortError')));
        };
        options.signal.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }

  async analyzeImage(
    imageDataUrl: string,
    prompt: string,
    options: { systemPrompt?: string; signal?: AbortSignal } = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      let settled = false;
      let abortHandler: (() => void) | null = null;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener('abort', abortHandler!);
        fn();
      };

      const task: CancellableTask = this.kmpEngine.analyzeImage(
        imageDataUrl,
        prompt,
        options.systemPrompt ?? 'You are a helpful visual assistant.',
        (text) => settle(() => resolve(text)),
        (err) => settle(() => reject(new Error(err)))
      );

      if (options.signal) {
        abortHandler = () => {
          task.cancel();
          settle(() => reject(new DOMException('Aborted', 'AbortError')));
        };
        options.signal.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }

  async analyzeImageJSON<T = any>(
    imageDataUrl: string,
    prompt: string,
    options: { systemPrompt?: string; signal?: AbortSignal } = {}
  ): Promise<T> {
    const text = await this.analyzeImage(imageDataUrl, prompt, options);
    try {
      return parseStructuredJson<T>(text);
    } catch {
      throw new Error(`Failed to parse vision JSON response: ${text.slice(0, 100)}...`);
    }
  }
}

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function parseStructuredJson<T>(raw: string): T {
  const candidates: string[] = [];
  const pushCandidate = (value: string | null | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!candidates.includes(trimmed)) candidates.push(trimmed);
  };

  pushCandidate(raw);
  pushCandidate(stripCodeFences(raw));
  pushCandidate(extractFirstJsonLikeBlock(raw));
  pushCandidate(extractFirstJsonLikeBlock(stripCodeFences(raw)));
  pushCandidate(safeSanitizeJsonPayload(raw));
  pushCandidate(safeSanitizeJsonPayload(stripCodeFences(raw)));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Continue trying alternative normalized forms.
    }
  }

  throw new Error('Unable to parse structured JSON payload');
}

function safeSanitizeJsonPayload(value: string): string {
  try {
    return sanitizeJsonPayload(value);
  } catch {
    return value;
  }
}

function stripCodeFences(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractFirstJsonLikeBlock(value: string): string | null {
  const startMatch = /[\[{]/.exec(value);
  if (!startMatch || startMatch.index < 0) return null;

  const start = startMatch.index;
  const opener = value[start];
  const closer = opener === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = start; i < value.length; i += 1) {
    const ch = value[i];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (ch === '\\') {
        escaping = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === opener) depth += 1;
    if (ch === closer) {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, i + 1);
      }
    }
  }

  return null;
}
