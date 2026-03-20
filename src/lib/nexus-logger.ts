/**
 * NexusLogger — debug-mode-aware console controller with observable event stream.
 *
 * Default (debug=OFF): console.log / console.debug / console.info are silenced.
 *                      console.warn and console.error always pass through.
 * Debug ON:            All console methods restored + structured action/spine
 *                      output with colour-coded group labels.
 *
 * Observable stream: subscribe to real-time events for the DebugActivityOverlay.
 *   NexusLogger.subscribe('action', cb)  → unsubscribe fn
 *   NexusLogger.subscribe('*', cb)       → all categories
 *   NexusLogger.emit('profile', { ... }) → custom structured event
 *
 * Usage:
 *   NexusLogger.init(readDebugMode())   — call once at app boot (main.tsx)
 *   NexusLogger.setDebugMode(true)      — called by useDebugMode on toggle
 *   NexusLogger.action(moduleId, type, payload)
 *   NexusLogger.spine(eventType, source, data)
 *   NexusLogger.warn(tag, msg, data?)
 *   NexusLogger.error(tag, err)
 *   NexusLogger.emit(category, event)   — structured debug event
 */

type SuppressibleLevel = 'log' | 'debug' | 'info';

export interface CapturedError {
  tag: string;
  message: string;
  stack?: string;
  timestamp: number;
}

export interface CapturedAction {
  moduleId: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface CapturedSpineEvent {
  eventType: string;
  source: string;
  data: unknown;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Observable event stream types
// ---------------------------------------------------------------------------

export type DebugEventCategory =
  | 'action'
  | 'spine'
  | 'error'
  | 'profile'
  | 'upload'
  | 'handoff'
  | 'vault'
  | 'ai';

export interface DebugEvent {
  id: string;
  category: DebugEventCategory;
  timestamp: number;
  moduleId?: string;
  label: string;
  detail?: unknown;
}

export type DebugEventSubscriber = (event: DebugEvent) => void;

const SUPPRESSIBLE: SuppressibleLevel[] = ['log', 'debug', 'info'];
const MAX_ERRORS = 100;
const MAX_ACTIONS = 200;
const MAX_SPINE = 200;
const MAX_EVENTS = 500;

let nextEventId = 1;

class NexusLoggerSingleton {
  private debugMode = false;
  private initialized = false;
  private orig: Record<SuppressibleLevel, (...args: unknown[]) => void> =
    {} as Record<SuppressibleLevel, (...args: unknown[]) => void>;

  readonly errors: CapturedError[] = [];
  readonly actions: CapturedAction[] = [];
  readonly spineEvents: CapturedSpineEvent[] = [];

  /** Unified event ring buffer for the debug overlay. */
  readonly events: DebugEvent[] = [];

  /** Per-category subscriber sets + wildcard '*'. */
  private subscribers = new Map<DebugEventCategory | '*', Set<DebugEventSubscriber>>();

  /** Call once in main.tsx before React mounts. */
  init(debugMode: boolean): void {
    if (!this.initialized) {
      SUPPRESSIBLE.forEach((lvl) => {
        this.orig[lvl] = console[lvl].bind(console) as (...args: unknown[]) => void;
      });
      this.initialized = true;
    }
    this.setDebugMode(debugMode);
  }

  setDebugMode(value: boolean): void {
    this.debugMode = value;
    this.applyOverride();
    if (value) {
      (this.orig.log ?? console.log)(
        '%c[Nexus] 🐛 Debug mode ENABLED',
        'color:#f59e0b;font-weight:bold;font-size:13px',
      );
    }
  }

  isEnabled(): boolean {
    return this.debugMode;
  }

  private applyOverride(): void {
    if (!this.initialized) return;
    SUPPRESSIBLE.forEach((lvl) => {
      console[lvl] = this.debugMode ? this.orig[lvl] : () => {};
    });
  }

  // -----------------------------------------------------------------------
  // Observable stream
  // -----------------------------------------------------------------------

  /** Subscribe to debug events. Returns an unsubscribe function. */
  subscribe(
    categoryOrWildcard: DebugEventCategory | '*',
    callback: DebugEventSubscriber,
  ): () => void {
    let set = this.subscribers.get(categoryOrWildcard);
    if (!set) {
      set = new Set();
      this.subscribers.set(categoryOrWildcard, set);
    }
    set.add(callback);
    return () => { set!.delete(callback); };
  }

  /** Emit a structured debug event. Stored in ring buffer and dispatched to subscribers. */
  emit(
    category: DebugEventCategory,
    event: Omit<DebugEvent, 'id' | 'category' | 'timestamp'>,
  ): void {
    const entry: DebugEvent = {
      id: `dbg-${nextEventId++}`,
      category,
      timestamp: Date.now(),
      ...event,
    };
    this.events.push(entry);
    if (this.events.length > MAX_EVENTS) this.events.shift();

    // Dispatch to category subscribers + wildcard
    this.subscribers.get(category)?.forEach((cb) => { try { cb(entry); } catch { /* swallow */ } });
    this.subscribers.get('*')?.forEach((cb) => { try { cb(entry); } catch { /* swallow */ } });
  }

  /** Get recent events from the unified buffer. */
  getRecentEvents(limit = 100): DebugEvent[] {
    return this.events.slice(-limit);
  }

  // -----------------------------------------------------------------------
  // Legacy structured loggers (now also emit into the stream)
  // -----------------------------------------------------------------------

  /** Log an ActionHub dispatch. Called by action-hub.ts after execute(). */
  action(moduleId: string, type: string, payload: unknown): void {
    const entry: CapturedAction = { moduleId, type, payload, timestamp: Date.now() };
    this.actions.push(entry);
    if (this.actions.length > MAX_ACTIONS) this.actions.shift();

    this.emit('action', { moduleId, label: type, detail: payload });

    if (this.debugMode) {
      (this.orig.log ?? console.log)(
        '%c[Action] %c' + type + ' %c← ' + moduleId,
        'color:#6366f1;font-weight:bold',
        'color:#a78bfa;font-weight:bold',
        'color:#6b7280;font-size:10px',
        payload,
      );
    }
  }

  /** Log a Spine event. Called by spine-event-bus.ts in emit(). */
  spine(eventType: string, source: string, data: unknown): void {
    const entry: CapturedSpineEvent = { eventType, source, data, timestamp: Date.now() };
    this.spineEvents.push(entry);
    if (this.spineEvents.length > MAX_SPINE) this.spineEvents.shift();

    this.emit('spine', { moduleId: source, label: eventType, detail: data });

    if (this.debugMode) {
      (this.orig.log ?? console.log)(
        '%c[Spine] %c' + eventType + ' %c← ' + source,
        'color:#10b981;font-weight:bold',
        'color:#34d399;font-weight:bold',
        'color:#6b7280;font-size:10px',
        data,
      );
    }
  }

  /**
   * App-level warning — always shown in debug mode, silently captured otherwise.
   * Use instead of console.warn for recoverable app issues.
   */
  warn(tag: string, message: string, data?: unknown): void {
    if (this.debugMode) {
      console.warn(`[${tag}] ${message}`, ...(data !== undefined ? [data] : []));
    }
  }

  /**
   * App-level error — ALWAYS printed to console regardless of debug mode.
   * Captured in errors buffer for DebugThoughtPanel.
   */
  error(tag: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const entry: CapturedError = { tag, message, stack, timestamp: Date.now() };
    this.errors.push(entry);
    if (this.errors.length > MAX_ERRORS) this.errors.shift();

    this.emit('error', { label: `[${tag}] ${message}`, detail: stack });

    // Errors always pass through — never suppress
    console.error(`[${tag}]`, err);
  }

  getRecentErrors(limit = 20): CapturedError[] {
    return this.errors.slice(-limit);
  }

  getRecentActions(limit = 50): CapturedAction[] {
    return this.actions.slice(-limit);
  }

  getRecentSpineEvents(limit = 50): CapturedSpineEvent[] {
    return this.spineEvents.slice(-limit);
  }
}

export const NexusLogger = new NexusLoggerSingleton();
