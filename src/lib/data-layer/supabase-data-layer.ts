/**
 * supabase-data-layer.ts
 *
 * NexusDataLayer implementation backed by Supabase (Postgres + Realtime).
 *
 * Schema (see supabase-schema.sql):
 *   nexus_documents (collection TEXT, id TEXT, data JSONB, updated_at TIMESTAMPTZ)
 *
 * Collection names may include "/" path segments for subcollection-style
 * namespacing (e.g. "sessions/s1/messages") — they are stored as plain strings,
 * matching the InMemoryDataLayer behaviour.
 *
 * Query operators supported natively via JSONB:
 *   ==  !=  <  <=  >  >=  in  not-in  array-contains
 *
 * "contains" (string substring) falls back to client-side filtering because
 * PostgREST does not expose `ILIKE` on JSONB text values without a cast.
 *
 * Subscriptions use Supabase Realtime (postgres_changes).  The table must be
 * added to the supabase_realtime publication (see supabase-schema.sql).
 */

import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import type {
  NexusDataLayer,
  NexusDocumentId,
  NexusRecord,
  NexusQuery,
  NexusQueryFilter,
  BatchOperation,
  NexusDocumentListener,
  NexusQueryListener,
  NexusUnsubscribe,
} from './index';

const TABLE = 'nexus_documents';

// ── Helpers ──────────────────────────────────────────────────────────────────

function toRecord<T>(row: { collection: string; id: string; data: Record<string, unknown> }): NexusRecord<T> {
  return { ...(row.data as T), id: row.id };
}

/**
 * Translates a NexusQueryFilter to a Supabase PostgREST filter applied on
 * the JSONB `data` column.  Returns null for operators handled client-side.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPostgrestFilter(query: any, filter: NexusQueryFilter): any | null {
  // PostgREST JSONB path syntax — no SQL quotes around field names:
  //   data->>field  text extraction  — for equality checks (== != in)
  //   data->field   JSONB extraction — for range comparisons (< <= > >=) so that
  //                  Postgres compares numbers numerically, not lexicographically.
  //                  PostgREST casts the RHS literal to jsonb when the LHS is jsonb.
  const textCol = `data->>${filter.field}`;
  const jsonbCol = `data->${filter.field}`;

  switch (filter.op) {
    case '==':
      return query.eq(textCol, String(filter.value));
    case '!=':
      return query.neq(textCol, String(filter.value));
    case '<':
      return query.lt(jsonbCol, filter.value);
    case '<=':
      return query.lte(jsonbCol, filter.value);
    case '>':
      return query.gt(jsonbCol, filter.value);
    case '>=':
      return query.gte(jsonbCol, filter.value);
    case 'in':
      if (Array.isArray(filter.value)) {
        return query.in(textCol, filter.value.map(String));
      }
      return null;
    case 'not-in':
      // PostgREST doesn't have a direct not-in for text; handle client-side
      return null;
    case 'array-contains':
      // JSONB containment: data->field @> '["value"]'
      return query.contains(`data->${filter.field}`, JSON.stringify([filter.value]));
    case 'contains':
      // Client-side only
      return null;
    default:
      return null;
  }
}

function applyClientFilter<T>(records: NexusRecord<T>[], filter: NexusQueryFilter): NexusRecord<T>[] {
  return records.filter((rec) => {
    const value = (rec as Record<string, unknown>)[filter.field];
    switch (filter.op) {
      case 'not-in':
        return Array.isArray(filter.value) ? !filter.value.includes(value) : true;
      case 'contains':
        return typeof value === 'string' && typeof filter.value === 'string'
          ? value.includes(filter.value)
          : false;
      default:
        return true;
    }
  });
}

const CLIENT_SIDE_OPS = new Set<NexusQueryFilter['op']>(['not-in', 'contains']);

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : 1;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class SupabaseDataLayer implements NexusDataLayer {
  private readonly db: SupabaseClient;

  constructor(supabaseUrl: string, supabaseAnonKey: string);
  constructor(client: SupabaseClient);
  constructor(urlOrClient: string | SupabaseClient, anonKey?: string) {
    if (typeof urlOrClient === 'string') {
      this.db = createClient(urlOrClient, anonKey!);
    } else {
      this.db = urlOrClient;
    }
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  async getDocument<T>(collection: string, id: NexusDocumentId): Promise<NexusRecord<T> | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('collection, id, data')
      .eq('collection', collection)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`[SupabaseDataLayer] getDocument failed: ${error.message}`);
    if (!data) return null;
    return toRecord<T>(data as { collection: string; id: string; data: Record<string, unknown> });
  }

  async listDocuments<T>(collection: string, options?: { limit?: number }): Promise<NexusRecord<T>[]> {
    const cap = options?.limit ?? 100;
    return this.query<T>({ collection, ...(cap > 0 ? { limit: cap } : {}) });
  }

  async query<T>(nexusQuery: NexusQuery): Promise<NexusRecord<T>[]> {
    const { collection, where, orderBy, limit } = nexusQuery;

    let q = this.db
      .from(TABLE)
      .select('collection, id, data')
      .eq('collection', collection);

    // Separate server-side and client-side filters
    const clientFilters: NexusQueryFilter[] = [];
    for (const filter of where ?? []) {
      if (CLIENT_SIDE_OPS.has(filter.op)) {
        clientFilters.push(filter);
        continue;
      }
      const applied = toPostgrestFilter(q, filter);
      if (applied === null) {
        clientFilters.push(filter);
      } else {
        q = applied;
      }
    }

    // Server-side ordering — use JSONB operator (data->field) rather than the
    // text cast (data->>field) so Postgres sorts numbers numerically, not
    // lexicographically (e.g. 1 < 2 < 10, not 1 < 10 < 2).
    // PostgREST path syntax: no SQL quotes around field name.
    for (const order of orderBy ?? []) {
      q = q.order(`data->${order.field}`, { ascending: order.direction !== 'desc' }) as typeof q;
    }

    // If client-side filters are present we can't rely on server-side limit
    const serverLimit = clientFilters.length === 0 && typeof limit === 'number' ? limit : undefined;
    if (serverLimit !== undefined) {
      q = q.limit(serverLimit) as typeof q;
    }

    const { data, error } = await q;
    if (error) throw new Error(`[SupabaseDataLayer] query failed: ${error.message}`);

    let records: NexusRecord<T>[] = (data as Array<{ collection: string; id: string; data: Record<string, unknown> }>).map(
      (row) => toRecord<T>(row),
    );

    // Client-side filters
    for (const filter of clientFilters) {
      records = applyClientFilter(records, filter);
    }

    // Client-side ordering (when not delegated to server)
    if ((orderBy?.length ?? 0) > 0 && clientFilters.length > 0) {
      records.sort((a, b) => {
        for (const rule of orderBy!) {
          const av = (a as Record<string, unknown>)[rule.field];
          const bv = (b as Record<string, unknown>)[rule.field];
          const cmp = compareValues(av, bv);
          if (cmp !== 0) return rule.direction === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
    }

    // Client-side limit (after client-side filtering)
    if (typeof limit === 'number' && serverLimit === undefined) {
      records = records.slice(0, limit);
    }

    return records;
  }

  // ── Write ───────────────────────────────────────────────────────────────────

  async createDocument<T>(
    collection: string,
    docData: Omit<NexusRecord<T>, 'id'> & Partial<Pick<NexusRecord<T>, 'id'>>,
  ): Promise<NexusRecord<T>> {
    const id = docData.id ?? crypto.randomUUID();
    const { id: _drop, ...payload } = docData as Record<string, unknown>;
    void _drop;
    return this.setDocument<T>(collection, id, payload as T);
  }

  async setDocument<T>(collection: string, id: NexusDocumentId, docData: T): Promise<NexusRecord<T>> {
    const { id: _drop, ...payload } = { ...(docData as Record<string, unknown>) };
    void _drop;

    const { error } = await this.db.from(TABLE).upsert(
      { collection, id, data: payload },
      { onConflict: 'collection,id' },
    );

    if (error) throw new Error(`[SupabaseDataLayer] setDocument failed: ${error.message}`);
    return { ...docData, id } as NexusRecord<T>;
  }

  async updateDocument<T>(
    collection: string,
    id: NexusDocumentId,
    updates: Partial<T>,
  ): Promise<NexusRecord<T> | null> {
    const existing = await this.getDocument<T>(collection, id);
    if (!existing) return null;

    const { id: _drop, ...existingData } = existing as Record<string, unknown>;
    void _drop;

    // Merge updates — support dot-notation for nested paths
    const merged = { ...existingData };
    for (const [path, value] of Object.entries(updates as Record<string, unknown>)) {
      setNestedPath(merged, path, value);
    }

    return this.setDocument<T>(collection, id, merged as T);
  }

  async deleteDocument(collection: string, id: NexusDocumentId): Promise<void> {
    const { error } = await this.db
      .from(TABLE)
      .delete()
      .eq('collection', collection)
      .eq('id', id);

    if (error) throw new Error(`[SupabaseDataLayer] deleteDocument failed: ${error.message}`);
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    if (operations.length === 0) return;

    // Execute sequentially — Supabase JS v2 doesn't expose multi-statement
    // transactions via the REST API.  For true atomicity, use an RPC/Edge Function.
    for (const op of operations) {
      if (op.type === 'set') {
        await this.setDocument(op.collection, op.id, op.data ?? {});
      } else if (op.type === 'update') {
        await this.updateDocument(op.collection, op.id, (op.data ?? {}) as Record<string, unknown>);
      } else if (op.type === 'delete') {
        await this.deleteDocument(op.collection, op.id);
      }
    }
  }

  // ── Subscriptions ───────────────────────────────────────────────────────────

  subscribeToDocument<T>(
    collection: string,
    id: NexusDocumentId,
    listener: NexusDocumentListener<T>,
  ): NexusUnsubscribe {
    // Track whether the subscription is still active so we never call listener
    // after unsubscribe.
    let active = true;
    let currentChannel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const refetch = () => {
      this.getDocument<T>(collection, id)
        .then((doc) => { if (active) listener(doc); })
        .catch((err) => { console.warn('[SupabaseDataLayer] subscribeToDocument refetch failed:', err); });
    };

    const startChannel = () => {
      if (!active) return;

      // Use a unique suffix so rapid recreations don't collide in the client registry.
      const ch: RealtimeChannel = this.db
        .channel(`doc:${collection}:${id}:${Date.now()}`)
        .on(
          'postgres_changes' as Parameters<RealtimeChannel['on']>[0],
          {
            event: '*',
            schema: 'public',
            table: TABLE,
            filter: `collection=eq.${collection}`,
          },
          (payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
            if (!active) return;

            if (payload.eventType === 'DELETE') {
              // For DELETE, payload.new is {} with REPLICA IDENTITY DEFAULT.
              // The deleted row's primary key is in payload.old.
              const oldRow = payload.old as { id?: string } | undefined;
              if (oldRow?.id !== id) return;
              listener(null);
              return;
            }

            const row = payload.new as { collection?: string; id?: string; data?: Record<string, unknown> } | undefined;
            if (row?.id !== id) return;
            if (row?.data !== undefined) {
              listener(toRecord<T>(row as { collection: string; id: string; data: Record<string, unknown> }));
            }
          },
        )
        .subscribe((status: string) => {
          if (!active) return;
          if (status === 'SUBSCRIBED') {
            // Re-fetch via HTTP once the Realtime subscription is confirmed.
            // This closes the race window between initial fetch and first event.
            refetch();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Transient failure (rate limit, network hiccup, or slow connection).
            // Re-fetch immediately to catch any pending change, then retry the
            // Realtime subscription after a 1-second back-off.
            refetch();
            void this.db.removeChannel(ch);
            retryTimer = setTimeout(() => {
              retryTimer = null;
              startChannel();
            }, 1_000);
          }
        });

      currentChannel = ch;
    };

    // Emit initial value immediately via HTTP.
    this.getDocument<T>(collection, id)
      .then((doc) => { if (active) listener(doc); })
      .catch(() => { if (active) listener(null); });

    startChannel();

    return () => {
      active = false;
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (currentChannel) void this.db.removeChannel(currentChannel);
    };
  }

  subscribeToQuery<T>(nexusQuery: NexusQuery, listener: NexusQueryListener<T>): NexusUnsubscribe {
    const { collection } = nexusQuery;
    let active = true;
    let currentChannel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const requery = () => {
      this.query<T>(nexusQuery)
        .then((docs) => { if (active) listener(docs); })
        .catch(() => { if (active) listener([]); });
    };

    const startChannel = () => {
      if (!active) return;

      const ch: RealtimeChannel = this.db
        .channel(`query:${collection}:${Date.now()}`)
        .on(
          'postgres_changes' as Parameters<RealtimeChannel['on']>[0],
          {
            event: '*',
            schema: 'public',
            table: TABLE,
            filter: `collection=eq.${collection}`,
          },
          () => {
            if (active) requery();
          },
        )
        .subscribe((status: string) => {
          if (!active) return;
          if (status === 'SUBSCRIBED') {
            // Re-query on confirmed subscription to close the race window.
            requery();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Re-query immediately then retry the subscription.
            requery();
            void this.db.removeChannel(ch);
            retryTimer = setTimeout(() => {
              retryTimer = null;
              startChannel();
            }, 1_000);
          }
        });

      currentChannel = ch;
    };

    // Emit initial snapshot immediately (async)
    this.query<T>(nexusQuery).then(listener).catch(() => listener([]));

    startChannel();

    return () => {
      active = false;
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (currentChannel) void this.db.removeChannel(currentChannel);
    };
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function setNestedPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  if (segments.length === 1) {
    target[path] = value;
    return;
  }
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    if (typeof cursor[key] !== 'object' || cursor[key] === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createSupabaseDataLayer(url: string, anonKey: string): SupabaseDataLayer {
  return new SupabaseDataLayer(url, anonKey);
}
