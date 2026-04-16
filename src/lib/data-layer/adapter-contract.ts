/**
 * adapter-contract.ts
 *
 * Parameterised AraDataLayer contract suite.
 *
 * Usage:
 *   describeAdapterContract('MyAdapter', () => ({
 *     adapter: new MyAdapter(...),
 *     teardown: async () => { ... },   // wipe test data
 *   }));
 *
 * Every AraDataLayer implementation must pass this suite for the abstraction
 * to be considered portable.  The suite covers:
 *
 *   getDocument · listDocuments · createDocument · setDocument
 *   updateDocument · deleteDocument · query (all operators, ordering, limit)
 *   batchWrite · subscribeToDocument · subscribeToQuery
 *   subcollection paths · idempotency · isolation · clone safety
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AraDataLayer, AraRecord, BatchOperation } from './index';

export interface AdapterHarness {
  /** Fresh adapter instance for the test.  Must start empty. */
  adapter: AraDataLayer;
  /**
   * Called after each test group that writes data.
   * Must remove every document written during the test.
   */
  teardown(): Promise<void>;
}

type HarnessFactory = () => AdapterHarness | Promise<AdapterHarness>;

/**
 * Resolves after all pending microtasks.  Needed for subscribeToQuery which
 * delivers the initial snapshot via a Promise internally.
 */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * Polls `condition` every `interval` ms until it returns true or `timeout` ms
 * elapses.  Used to tolerate async subscription delivery (e.g. Realtime).
 *
 * Default timeout is 10 s to accommodate network-backed adapters (e.g. Supabase
 * Realtime) which may need several seconds to establish the WebSocket connection
 * on the first subscription.
 */
async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  timeout = 10_000,
  interval = 25,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('waitUntil timed out');
}

export function describeAdapterContract(suiteName: string, factory: HarnessFactory): void {
  describe(`${suiteName} — AraDataLayer contract`, () => {
    // ── getDocument ───────────────────────────────────────────────────────────

    describe('getDocument', () => {
      let h: AdapterHarness;
      beforeEach(async () => { h = await factory(); });

      it('returns null for a document that does not exist', async () => {
        expect(await h.adapter.getDocument('users', 'missing')).toBeNull();
        await h.teardown();
      });

      it('returns the document when it exists', async () => {
        await h.adapter.setDocument('users', 'u1', { name: 'Ada' });
        const doc = await h.adapter.getDocument<{ name: string }>('users', 'u1');
        expect(doc).toMatchObject({ id: 'u1', name: 'Ada' });
        await h.teardown();
      });

      it('returns an isolated clone — mutations do not corrupt the store', async () => {
        await h.adapter.setDocument('users', 'u1', { name: 'Ada' });
        const doc = await h.adapter.getDocument<{ name: string }>('users', 'u1');
        doc!.name = 'Grace';
        const refetch = await h.adapter.getDocument<{ name: string }>('users', 'u1');
        expect(refetch!.name).toBe('Ada');
        await h.teardown();
      });

      it('is collection-isolated — same id in different collections are distinct', async () => {
        await h.adapter.setDocument('col_a', 'shared', { value: 'A' });
        await h.adapter.setDocument('col_b', 'shared', { value: 'B' });
        const a = await h.adapter.getDocument<{ value: string }>('col_a', 'shared');
        const b = await h.adapter.getDocument<{ value: string }>('col_b', 'shared');
        expect(a!.value).toBe('A');
        expect(b!.value).toBe('B');
        await h.teardown();
      });
    });

    // ── listDocuments ─────────────────────────────────────────────────────────

    describe('listDocuments', () => {
      let h: AdapterHarness;
      beforeEach(async () => { h = await factory(); });

      it('returns an empty array for an unknown collection', async () => {
        expect(await h.adapter.listDocuments('ghost')).toEqual([]);
        await h.teardown();
      });

      it('returns all documents in a collection', async () => {
        await h.adapter.setDocument('tasks', 't1', { title: 'A' });
        await h.adapter.setDocument('tasks', 't2', { title: 'B' });
        const docs = await h.adapter.listDocuments<{ title: string }>('tasks');
        expect(docs).toHaveLength(2);
        expect(docs.map((d) => d.id).sort()).toEqual(['t1', 't2']);
        await h.teardown();
      });

      it('handles subcollection-style paths as distinct namespaces', async () => {
        await h.adapter.setDocument('sessions/s1/messages', 'm1', { text: 'hi' });
        await h.adapter.setDocument('sessions/s2/messages', 'm1', { text: 'bye' });
        const s1msgs = await h.adapter.listDocuments('sessions/s1/messages');
        expect(s1msgs).toHaveLength(1);
        expect((s1msgs[0] as any).text).toBe('hi');
        await h.teardown();
      });
    });

    // ── createDocument ────────────────────────────────────────────────────────

    describe('createDocument', () => {
      let h: AdapterHarness;
      beforeEach(async () => { h = await factory(); });

      it('auto-generates an id when none is provided', async () => {
        const doc = await h.adapter.createDocument<{ text: string }>('notes', { text: 'hello' });
        expect(typeof doc.id).toBe('string');
        expect(doc.id.length).toBeGreaterThan(0);
        await h.teardown();
      });

      it('respects an explicit id', async () => {
        await h.adapter.createDocument<{ text: string }>('notes', { id: 'note-42', text: 'explicit' });
        const fetched = await h.adapter.getDocument('notes', 'note-42');
        expect(fetched).not.toBeNull();
        await h.teardown();
      });

      it('persists the document so it can be retrieved', async () => {
        const created = await h.adapter.createDocument<{ score: number }>('scores', { score: 99 });
        const fetched = await h.adapter.getDocument<{ score: number }>('scores', created.id);
        expect(fetched!.score).toBe(99);
        await h.teardown();
      });
    });

    // ── setDocument ───────────────────────────────────────────────────────────

    describe('setDocument', () => {
      let h: AdapterHarness;
      beforeEach(async () => { h = await factory(); });

      it('creates a new document when id does not exist', async () => {
        const doc = await h.adapter.setDocument('profiles', 'p1', { age: 30 });
        expect(doc.id).toBe('p1');
        expect((doc as any).age).toBe(30);
        await h.teardown();
      });

      it('fully replaces an existing document (idempotent overwrite)', async () => {
        await h.adapter.setDocument('profiles', 'p1', { age: 30, legacy: true });
        await h.adapter.setDocument('profiles', 'p1', { age: 31 });
        const fetched = await h.adapter.getDocument<{ age: number; legacy?: boolean }>('profiles', 'p1');
        expect(fetched!.age).toBe(31);
        expect(fetched!.legacy).toBeUndefined();
        await h.teardown();
      });

      it('calling setDocument twice with same data is idempotent', async () => {
        await h.adapter.setDocument('items', 'i1', { value: 'x' });
        await h.adapter.setDocument('items', 'i1', { value: 'x' });
        const docs = await h.adapter.listDocuments('items');
        expect(docs).toHaveLength(1);
        await h.teardown();
      });
    });

    // ── updateDocument ────────────────────────────────────────────────────────

    describe('updateDocument', () => {
      let h: AdapterHarness;
      beforeEach(async () => { h = await factory(); });

      it('returns null when the document does not exist', async () => {
        expect(await h.adapter.updateDocument('users', 'ghost', { name: 'X' })).toBeNull();
        await h.teardown();
      });

      it('merges partial updates into the existing document', async () => {
        await h.adapter.setDocument('users', 'u1', { name: 'Ada', role: 'admin' });
        const updated = await h.adapter.updateDocument<{ name: string; role: string }>('users', 'u1', { name: 'Grace' });
        expect(updated!.name).toBe('Grace');
        expect(updated!.role).toBe('admin');
        await h.teardown();
      });

      it('preserves the id after an update', async () => {
        await h.adapter.setDocument('users', 'u1', { name: 'Ada' });
        const updated = await h.adapter.updateDocument('users', 'u1', { name: 'Grace' });
        expect(updated!.id).toBe('u1');
        await h.teardown();
      });
    });

    // ── deleteDocument ────────────────────────────────────────────────────────

    describe('deleteDocument', () => {
      let h: AdapterHarness;
      beforeEach(async () => { h = await factory(); });

      it('removes the document from the collection', async () => {
        await h.adapter.setDocument('items', 'i1', { label: 'X' });
        await h.adapter.deleteDocument('items', 'i1');
        expect(await h.adapter.getDocument('items', 'i1')).toBeNull();
        await h.teardown();
      });

      it('is a no-op when the document does not exist', async () => {
        await expect(h.adapter.deleteDocument('items', 'ghost')).resolves.toBeUndefined();
        await h.teardown();
      });

      it('does not affect sibling documents in the collection', async () => {
        await h.adapter.setDocument('items', 'i1', { label: 'A' });
        await h.adapter.setDocument('items', 'i2', { label: 'B' });
        await h.adapter.deleteDocument('items', 'i1');
        const remaining = await h.adapter.listDocuments('items');
        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).toBe('i2');
        await h.teardown();
      });
    });

    // ── query ─────────────────────────────────────────────────────────────────

    describe('query', () => {
      let h: AdapterHarness;

      beforeEach(async () => {
        h = await factory();
        await h.adapter.setDocument('products', 'p1', { category: 'fruit', price: 2, stock: 100 });
        await h.adapter.setDocument('products', 'p2', { category: 'veggie', price: 1, stock: 50 });
        await h.adapter.setDocument('products', 'p3', { category: 'fruit', price: 5, stock: 10 });
        await h.adapter.setDocument('products', 'p4', { category: 'fruit', price: 3, stock: 0 });
      });

      it('returns all documents when no filters are specified', async () => {
        expect(await h.adapter.query({ collection: 'products' })).toHaveLength(4);
        await h.teardown();
      });

      it('filters with == operator', async () => {
        const results = await h.adapter.query<{ category: string }>({
          collection: 'products',
          where: [{ field: 'category', op: '==', value: 'fruit' }],
        });
        expect(results).toHaveLength(3);
        results.forEach((r) => expect(r.category).toBe('fruit'));
        await h.teardown();
      });

      it('filters with != operator', async () => {
        const results = await h.adapter.query({
          collection: 'products',
          where: [{ field: 'category', op: '!=', value: 'fruit' }],
        });
        expect(results).toHaveLength(1);
        await h.teardown();
      });

      it('filters with < operator', async () => {
        const results = await h.adapter.query<{ price: number }>({
          collection: 'products',
          where: [{ field: 'price', op: '<', value: 3 }],
        });
        expect(results.every((r) => r.price < 3)).toBe(true);
        await h.teardown();
      });

      it('filters with <= operator', async () => {
        const results = await h.adapter.query<{ price: number }>({
          collection: 'products',
          where: [{ field: 'price', op: '<=', value: 3 }],
        });
        expect(results.every((r) => r.price <= 3)).toBe(true);
        await h.teardown();
      });

      it('filters with > operator', async () => {
        const results = await h.adapter.query<{ price: number }>({
          collection: 'products',
          where: [{ field: 'price', op: '>', value: 3 }],
        });
        expect(results.every((r) => r.price > 3)).toBe(true);
        await h.teardown();
      });

      it('filters with >= operator', async () => {
        const results = await h.adapter.query<{ stock: number }>({
          collection: 'products',
          where: [{ field: 'stock', op: '>=', value: 1 }],
        });
        expect(results.every((r) => r.stock >= 1)).toBe(true);
        await h.teardown();
      });

      it('filters with in operator', async () => {
        const results = await h.adapter.query<{ price: number }>({
          collection: 'products',
          where: [{ field: 'price', op: 'in', value: [1, 5] }],
        });
        expect(results).toHaveLength(2);
        expect(results.map((r) => r.price).sort((a, b) => a - b)).toEqual([1, 5]);
        await h.teardown();
      });

      it('filters with not-in operator', async () => {
        const results = await h.adapter.query<{ price: number }>({
          collection: 'products',
          where: [{ field: 'price', op: 'not-in', value: [1, 5] }],
        });
        expect(results).toHaveLength(2);
        results.forEach((r) => expect([1, 5]).not.toContain(r.price));
        await h.teardown();
      });

      it('filters with array-contains operator', async () => {
        await h.adapter.setDocument('posts', 'post1', { tags: ['a', 'b'] });
        await h.adapter.setDocument('posts', 'post2', { tags: ['b', 'c'] });
        await h.adapter.setDocument('posts', 'post3', { tags: ['d'] });
        const results = await h.adapter.query({
          collection: 'posts',
          where: [{ field: 'tags', op: 'array-contains', value: 'b' }],
        });
        expect(results).toHaveLength(2);
        await h.teardown();
      });

      it('filters with contains (string substring) operator', async () => {
        await h.adapter.setDocument('notes', 'n1', { text: 'hello world' });
        await h.adapter.setDocument('notes', 'n2', { text: 'goodbye' });
        const results = await h.adapter.query({
          collection: 'notes',
          where: [{ field: 'text', op: 'contains', value: 'hello' }],
        });
        expect(results).toHaveLength(1);
        await h.teardown();
      });

      it('stacks multiple where clauses with AND semantics', async () => {
        const results = await h.adapter.query<{ category: string; stock: number }>({
          collection: 'products',
          where: [
            { field: 'category', op: '==', value: 'fruit' },
            { field: 'stock', op: '>', value: 0 },
          ],
        });
        expect(results).toHaveLength(2);
        results.forEach((r) => {
          expect(r.category).toBe('fruit');
          expect(r.stock).toBeGreaterThan(0);
        });
        await h.teardown();
      });

      it('orders ascending', async () => {
        const results = await h.adapter.query<{ price: number }>({
          collection: 'products',
          orderBy: [{ field: 'price', direction: 'asc' }],
        });
        const prices = results.map((r) => r.price);
        expect(prices).toEqual([...prices].sort((a, b) => a - b));
        await h.teardown();
      });

      it('orders descending', async () => {
        const results = await h.adapter.query<{ price: number }>({
          collection: 'products',
          orderBy: [{ field: 'price', direction: 'desc' }],
        });
        const prices = results.map((r) => r.price);
        expect(prices).toEqual([...prices].sort((a, b) => b - a));
        await h.teardown();
      });

      it('applies multi-field ordering', async () => {
        await h.adapter.setDocument('rec', 'r1', { cat: 'a', rank: 2 });
        await h.adapter.setDocument('rec', 'r2', { cat: 'b', rank: 1 });
        await h.adapter.setDocument('rec', 'r3', { cat: 'a', rank: 1 });
        const results = await h.adapter.query<{ cat: string; rank: number }>({
          collection: 'rec',
          orderBy: [
            { field: 'cat', direction: 'asc' },
            { field: 'rank', direction: 'asc' },
          ],
        });
        expect(results.map((r) => r.id)).toEqual(['r3', 'r1', 'r2']);
        await h.teardown();
      });

      it('applies limit', async () => {
        expect(await h.adapter.query({ collection: 'products', limit: 2 })).toHaveLength(2);
        await h.teardown();
      });

      it('combines filter + orderBy + limit', async () => {
        const results = await h.adapter.query<{ price: number }>({
          collection: 'products',
          where: [{ field: 'category', op: '==', value: 'fruit' }],
          orderBy: [{ field: 'price', direction: 'asc' }],
          limit: 2,
        });
        expect(results).toHaveLength(2);
        expect(results[0].price).toBeLessThanOrEqual(results[1].price);
        await h.teardown();
      });

      it('returns empty array when no documents match', async () => {
        expect(await h.adapter.query({
          collection: 'products',
          where: [{ field: 'price', op: '>', value: 1000 }],
        })).toEqual([]);
        await h.teardown();
      });

      it('numeric ordering is numeric not lexicographic (1 < 2 < 10)', async () => {
        // Prices 1, 2, 10 sort as [1, 10, 2] lexicographically — adapters must
        // produce true numeric order [1, 2, 10].
        await h.adapter.setDocument('nums', 'n1', { score: 1 });
        await h.adapter.setDocument('nums', 'n2', { score: 10 });
        await h.adapter.setDocument('nums', 'n3', { score: 2 });
        const asc = await h.adapter.query<{ score: number }>({
          collection: 'nums',
          orderBy: [{ field: 'score', direction: 'asc' }],
        });
        expect(asc.map((r) => r.score)).toEqual([1, 2, 10]);
        const desc = await h.adapter.query<{ score: number }>({
          collection: 'nums',
          orderBy: [{ field: 'score', direction: 'desc' }],
        });
        expect(desc.map((r) => r.score)).toEqual([10, 2, 1]);
        await h.teardown();
      });
    });

    // ── batchWrite ────────────────────────────────────────────────────────────

    describe('batchWrite', () => {
      let h: AdapterHarness;
      beforeEach(async () => { h = await factory(); });

      it('executes set, update, and delete in one call', async () => {
        await h.adapter.setDocument('col', 'a', { v: 1 });
        await h.adapter.setDocument('col', 'b', { v: 2 });
        await h.adapter.setDocument('col', 'c', { v: 3 });

        const ops: BatchOperation[] = [
          { type: 'set',    collection: 'col', id: 'a', data: { v: 10 } },
          { type: 'update', collection: 'col', id: 'b', data: { v: 20 } },
          { type: 'delete', collection: 'col', id: 'c' },
        ];
        await h.adapter.batchWrite(ops);

        expect((await h.adapter.getDocument<{ v: number }>('col', 'a'))!.v).toBe(10);
        expect((await h.adapter.getDocument<{ v: number }>('col', 'b'))!.v).toBe(20);
        expect(await h.adapter.getDocument('col', 'c')).toBeNull();
        await h.teardown();
      });

      it('handles an empty ops array without error', async () => {
        await expect(h.adapter.batchWrite([])).resolves.toBeUndefined();
        await h.teardown();
      });

      it('handles cross-collection operations', async () => {
        await h.adapter.batchWrite([
          { type: 'set', collection: 'users', id: 'u1', data: { name: 'Ada' } },
          { type: 'set', collection: 'posts', id: 'p1', data: { title: 'Hello' } },
        ]);
        expect(await h.adapter.getDocument('users', 'u1')).toMatchObject({ name: 'Ada' });
        expect(await h.adapter.getDocument('posts', 'p1')).toMatchObject({ title: 'Hello' });
        await h.teardown();
      });

      it('batchWrite is idempotent — repeated set produces one document', async () => {
        await h.adapter.batchWrite([
          { type: 'set', collection: 'items', id: 'x', data: { v: 1 } },
          { type: 'set', collection: 'items', id: 'x', data: { v: 2 } },
        ]);
        const docs = await h.adapter.listDocuments('items');
        expect(docs).toHaveLength(1);
        expect((docs[0] as any).v).toBe(2);
        await h.teardown();
      });
    });

    // ── subscribeToDocument ───────────────────────────────────────────────────

    describe('subscribeToDocument', () => {
      let h: AdapterHarness;
      beforeEach(async () => { h = await factory(); });

      it('emits null immediately for a non-existent document', async () => {
        const calls: Array<AraRecord<unknown> | null> = [];
        const unsub = h.adapter.subscribeToDocument('users', 'u1', (d) => calls.push(d));
        await flush();
        await waitUntil(() => calls.length >= 1);
        expect(calls[0]).toBeNull();
        unsub();
        await h.teardown();
      });

      it('emits the current document immediately when it exists', async () => {
        await h.adapter.setDocument('users', 'u1', { name: 'Ada' });
        const calls: Array<AraRecord<{ name: string }> | null> = [];
        const unsub = h.adapter.subscribeToDocument<{ name: string }>('users', 'u1', (d) => calls.push(d));
        await flush();
        await waitUntil(() => calls.length >= 1);
        expect(calls[0]).toMatchObject({ id: 'u1', name: 'Ada' });
        unsub();
        await h.teardown();
      });

      it('notifies on setDocument', async () => {
        const calls: Array<AraRecord<{ title: string }> | null> = [];
        const unsub = h.adapter.subscribeToDocument<{ title: string }>('notes', 'n1', (d) => calls.push(d));
        await flush();
        await waitUntil(() => calls.length >= 1);

        await h.adapter.setDocument('notes', 'n1', { title: 'First' });
        await waitUntil(() => calls.length >= 2);

        expect(calls[calls.length - 1]?.title).toBe('First');
        unsub();
        await h.teardown();
      });

      it('notifies with null after deleteDocument', async () => {
        await h.adapter.setDocument('notes', 'n1', { title: 'Bye' });
        const calls: Array<AraRecord<unknown> | null> = [];
        const unsub = h.adapter.subscribeToDocument('notes', 'n1', (d) => calls.push(d));
        await flush();
        await waitUntil(() => calls.length >= 1);

        await h.adapter.deleteDocument('notes', 'n1');
        await waitUntil(() => calls[calls.length - 1] === null && calls.length >= 2);

        expect(calls[calls.length - 1]).toBeNull();
        unsub();
        await h.teardown();
      });

      it('unsubscribe stops further notifications', async () => {
        const calls: unknown[] = [];
        const unsub = h.adapter.subscribeToDocument('notes', 'n1', (d) => calls.push(d));
        await flush();
        await waitUntil(() => calls.length >= 1);

        unsub();
        const before = calls.length;

        await h.adapter.setDocument('notes', 'n1', { title: 'Silent' });
        await flush();
        await new Promise((r) => setTimeout(r, 50));

        expect(calls.length).toBe(before);
        await h.teardown();
      });
    });

    // ── subscribeToQuery ──────────────────────────────────────────────────────

    describe('subscribeToQuery', () => {
      let h: AdapterHarness;
      beforeEach(async () => { h = await factory(); });

      it('emits an empty array immediately for an empty collection', async () => {
        const snapshots: unknown[][] = [];
        const unsub = h.adapter.subscribeToQuery({ collection: 'tasks' }, (d) => snapshots.push(d));
        await flush();
        await waitUntil(() => snapshots.length >= 1);
        expect(snapshots[0]).toEqual([]);
        unsub();
        await h.teardown();
      });

      it('re-emits when a matching document is created', async () => {
        const snapshots: unknown[][] = [];
        const unsub = h.adapter.subscribeToQuery(
          { collection: 'tasks', where: [{ field: 'done', op: '==', value: false }] },
          (d) => snapshots.push(d),
        );
        await flush();
        await waitUntil(() => snapshots.length >= 1);

        await h.adapter.setDocument('tasks', 't1', { done: false, title: 'Buy milk' });
        await waitUntil(() => snapshots.length >= 2);

        expect(snapshots[snapshots.length - 1]).toHaveLength(1);
        unsub();
        await h.teardown();
      });

      it('does not re-emit on mutations to a different collection', async () => {
        const snapshots: unknown[][] = [];
        const unsub = h.adapter.subscribeToQuery({ collection: 'tasks' }, (d) => snapshots.push(d));
        await flush();
        await waitUntil(() => snapshots.length >= 1);

        await h.adapter.setDocument('notes', 'n1', { text: 'unrelated' });
        await flush();
        await new Promise((r) => setTimeout(r, 50));

        expect(snapshots).toHaveLength(1);
        unsub();
        await h.teardown();
      });

      it('applies filter — non-matching documents are excluded from snapshots', async () => {
        const snapshots: unknown[][] = [];
        const unsub = h.adapter.subscribeToQuery(
          { collection: 'items', where: [{ field: 'active', op: '==', value: true }] },
          (d) => snapshots.push(d),
        );
        await flush();
        await waitUntil(() => snapshots.length >= 1);

        await h.adapter.setDocument('items', 'i1', { active: false, name: 'Inactive' });
        await flush();
        await new Promise((r) => setTimeout(r, 50));
        expect(snapshots[snapshots.length - 1]).toHaveLength(0);

        await h.adapter.setDocument('items', 'i2', { active: true, name: 'Active' });
        await waitUntil(() => (snapshots[snapshots.length - 1] as unknown[]).length === 1);
        expect(snapshots[snapshots.length - 1]).toHaveLength(1);

        unsub();
        await h.teardown();
      });

      it('unsubscribe stops further emissions', async () => {
        const snapshots: unknown[][] = [];
        const unsub = h.adapter.subscribeToQuery({ collection: 'events' }, (d) => snapshots.push(d));
        await flush();
        await waitUntil(() => snapshots.length >= 1);
        unsub();

        const before = snapshots.length;
        await h.adapter.setDocument('events', 'e1', { type: 'silent' });
        await flush();
        await new Promise((r) => setTimeout(r, 50));

        expect(snapshots.length).toBe(before);
        await h.teardown();
      });
    });
  });
}
