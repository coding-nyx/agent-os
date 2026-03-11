import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { NexusRecord } from '@/lib/data-layer/index';

/**
 * Read a single document once from the data layer (non-reactive).
 * Routes through NexusDataLayer — no direct Firestore dependency.
 */
export function readDocOnce<T>(collection: string, id: string): Promise<NexusRecord<T> | null> {
  return getNexusDataLayer().getDocument<T>(collection, id);
}
