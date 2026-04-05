import { NexusLogger } from '@/lib/nexus-logger';

/**
 * Safely parse a JSON string returned by a KMP @JsExport method.
 * On malformed JSON, logs a warning and returns the provided fallback
 * instead of crashing the calling service.
 */
export function safeParseKmp<T>(raw: string, fallback: T, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    NexusLogger.warn('KMP', `${label} JSON.parse failed: ${err}`);
    return fallback;
  }
}
