/**
 * NexusLogger — debug-mode-aware console controller.
 *
 * Default (debug=OFF): console.log / console.debug / console.info are silenced.
 *                      console.warn and console.error always pass through.
 * Debug ON:            All console methods restored + structured action/spine
 *                      output with colour-coded group labels.
 *
 * Usage:
 *   NexusLogger.init(readDebugMode())   — call once at app boot (main.tsx)
 *   NexusLogger.setDebugMode(true)      — called by useDebugMode on toggle
 *   NexusLogger.action(moduleId, type, payload)
 *   NexusLogger.spine(eventType, source, data)
 *   NexusLogger.warn(tag, msg, data?)
 *   NexusLogger.error(tag, err)
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

const SUPPRESSIBLE: SuppressibleLevel[] = ['log', 'debug', 'info'];
const MAX_ERRORS = 100;
const MAX_ACTIONS = 200;
const MAX_SPINE = 200;

class NexusLoggerSingleton {
  private debugMode = false;
  private initialized = false;
  private orig: Record<SuppressibleLevel, (...args: unknown[]) => void> =
    {} as Record<SuppressibleLevel, (...args: unknown[]) => void>;

  readonly errors: CapturedError[] = [];
  readonly actions: CapturedAction[] = [];
  readonly spineEvents: CapturedSpineEvent[] = [];

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

  /** Log an ActionHub dispatch. Called by action-hub.ts after execute(). */
  action(moduleId: string, type: string, payload: unknown): void {
    const entry: CapturedAction = { moduleId, type, payload, timestamp: Date.now() };
    this.actions.push(entry);
    if (this.actions.length > MAX_ACTIONS) this.actions.shift();

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
