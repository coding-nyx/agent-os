import { getAraDataLayer } from '@/lib/data-layer/provider';
import type { AraRecord } from '@/lib/data-layer/index';

/**
 * Read a single document once from the data layer (non-reactive).
 * Routes through AraDataLayer — no direct Firestore dependency.
 */
export function readDocOnce<T>(collection: string, id: string): Promise<AraRecord<T> | null> {
  return getAraDataLayer().getDocument<T>(collection, id);
}
