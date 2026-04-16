/**
 * in-memory-provider.test.ts
 *
 * Parity test suite for InMemoryDataLayer — the zero-dependency AraDataLayer
 * implementation used in tests, Storybook, and offline-first workflows.
 *
 * Covers every method mandated by the AraDataLayer interface:
 *   getDocument · listDocuments · createDocument · setDocument
 *   updateDocument · deleteDocument · query · batchWrite
 *   subscribeToDocument · subscribeToQuery
 *
 * Environment: jsdom (configured in vitest.config.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryDataLayer } from './in-memory-data-layer';
import type {
  AraDataLayer,
  AraQuery,
  AraRecord,
  BatchOperation,
} from './index';

/** Resolve all pending microtasks (subscribeToQuery uses Promise internally). */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ─── Fixture factory ─────────────────────────────────────────────────────────

function makeLayer(seed?: ConstructorParameters<typeof InMemoryDataLayer>[0]): InMemoryDataLayer {
  return new InMemoryDataLayer(seed);
}

// ─── Type-check: InMemoryDataLayer satisfies AraDataLayer ─────────────────
// This is a compile-time assertion — if the class drifts from the interface
// TypeScript will surface the error here before any test runs.
const _typeCheck: AraDataLayer = new InMemoryDataLayer();
void _typeCheck;

// ─── getDocument ─────────────────────────────────────────────────────────────

describe('getDocument', () => {
  it('returns null for a document that does not exist', async () => {
    const layer = makeLayer();
    const result = await layer.getDocument('users', 'missing');
    expect(result).toBeNull();
  });

  it('returns the document when it exists', async () => {
    const layer = makeLayer({ users: [{ id: 'u1', name: 'Ada' }] });
    const doc = await layer.getDocument<{ name: string }>('users', 'u1');
    expect(doc).toEqual({ id: 'u1', name: 'Ada' });
  });

  it('returns an isolated clone — mutations do not corrupt the store', async () => {
    const layer = makeLayer({ users: [{ id: 'u1', name: 'Ada' }] });
    const doc = await layer.getDocument<{ name: string }>('users', 'u1');
    doc!.name = 'Grace';
    const refetch = await layer.getDocument<{ name: string }>('users', 'u1');
    expect(refetch!.name).toBe('Ada');
  });

  it('is collection-isolated — same id in different collections are distinct', async () => {
    const layer = makeLayer({
      col_a: [{ id: 'shared', value: 'A' }],
      col_b: [{ id: 'shared', value: 'B' }],
    });
    const a = await layer.getDocument<{ value: string }>('col_a', 'shared');
    const b = await layer.getDocument<{ value: string }>('col_b', 'shared');
    expect(a!.value).toBe('A');
    expect(b!.value).toBe('B');
  });
});

// ─── listDocuments ───────────────────────────────────────────────────────────

describe('listDocuments', () => {
  it('returns an empty array for an unknown collection', async () => {
    const layer = makeLayer();
    const docs = await layer.listDocuments('ghost');
    expect(docs).toEqual([]);
  });

  it('returns all documents in a collection', async () => {
    const layer = makeLayer({
      tasks: [
        { id: 't1', title: 'A' },
        { id: 't2', title: 'B' },
      ],
    });
    const docs = await layer.listDocuments<{ title: string }>('tasks');
    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.id).sort()).toEqual(['t1', 't2']);
  });
});

// ─── createDocument ──────────────────────────────────────────────────────────

describe('createDocument', () => {
  it('auto-generates an id when none is provided', async () => {
    const layer = makeLayer();
    const doc = await layer.createDocument('notes', { text: 'hello' });
    expect(typeof doc.id).toBe('string');
    expect(doc.id.length).toBeGreaterThan(0);
    expect(doc.text).toBe('hello');
  });

  it('respects an explicit id', async () => {
    const layer = makeLayer();
    const doc = await layer.createDocument('notes', { id: 'note-42', text: 'explicit' });
    expect(doc.id).toBe('note-42');
    const fetched = await layer.getDocument('notes', 'note-42');
    expect(fetched).not.toBeNull();
  });

  it('persists the document so it can be retrieved', async () => {
    const layer = makeLayer();
    const created = await layer.createDocument<{ score: number }>('scores', { score: 99 });
    const fetched = await layer.getDocument<{ score: number }>('scores', created.id);
    expect(fetched).toEqual(created);
  });

  it('multiple creates in the same collection stack correctly', async () => {
    const layer = makeLayer();
    await layer.createDocument('items', { label: 'one' });
    await layer.createDocument('items', { label: 'two' });
    const all = await layer.listDocuments('items');
    expect(all).toHaveLength(2);
  });
});

// ─── setDocument ─────────────────────────────────────────────────────────────

describe('setDocument', () => {
  it('creates a new document when id does not exist', async () => {
    const layer = makeLayer();
    const doc = await layer.setDocument('profiles', 'p1', { age: 30 });
    expect(doc.id).toBe('p1');
    expect(doc.age).toBe(30);
  });

  it('fully replaces an existing document', async () => {
    const layer = makeLayer({ profiles: [{ id: 'p1', age: 30, legacy: true }] });
    await layer.setDocument('profiles', 'p1', { age: 31 });
    const fetched = await layer.getDocument<{ age: number; legacy?: boolean }>('profiles', 'p1');
    expect(fetched!.age).toBe(31);
    // Full replace — the old `legacy` field must be gone
    expect(fetched!.legacy).toBeUndefined();
  });

  it('always assigns the provided id to the returned record', async () => {
    const layer = makeLayer();
    const doc = await layer.setDocument('x', 'custom-id', { foo: 'bar' });
    expect(doc.id).toBe('custom-id');
  });
});

// ─── updateDocument ──────────────────────────────────────────────────────────

describe('updateDocument', () => {
  it('returns null when the document does not exist', async () => {
    const layer = makeLayer();
    const result = await layer.updateDocument('users', 'ghost', { name: 'X' });
    expect(result).toBeNull();
  });

  it('merges partial updates into the existing document', async () => {
    const layer = makeLayer({ users: [{ id: 'u1', name: 'Ada', role: 'admin' }] });
    const updated = await layer.updateDocument<{ name: string; role: string }>(
      'users',
      'u1',
      { name: 'Grace' },
    );
    expect(updated!.name).toBe('Grace');
    expect(updated!.role).toBe('admin'); // untouched
  });

  it('preserves the id after an update', async () => {
    const layer = makeLayer({ users: [{ id: 'u1', name: 'Ada' }] });
    const updated = await layer.updateDocument('users', 'u1', { name: 'Grace' });
    expect(updated!.id).toBe('u1');
  });

  it('supports dot-notation for nested path updates', async () => {
    const layer = makeLayer();
    await layer.setDocument('settings', 's1', { theme: { color: 'blue', font: 'sans' } });
    await layer.updateDocument('settings', 's1', { 'theme.color': 'red' } as any);
    const doc = await layer.getDocument<any>('settings', 's1');
    expect(doc!.theme.color).toBe('red');
    expect(doc!.theme.font).toBe('sans'); // sibling key untouched
  });

  it('creates deeply nested paths via dot-notation when intermediate keys are absent', async () => {
    const layer = makeLayer();
    await layer.setDocument('cfg', 'c1', { version: 1 });
    await layer.updateDocument('cfg', 'c1', { 'ui.sidebar.open': true } as any);
    const doc = await layer.getDocument<any>('cfg', 'c1');
    expect(doc!.ui.sidebar.open).toBe(true);
    expect(doc!.version).toBe(1);
  });
});

// ─── deleteDocument ──────────────────────────────────────────────────────────

describe('deleteDocument', () => {
  it('removes the document from the collection', async () => {
    const layer = makeLayer({ items: [{ id: 'i1', label: 'X' }] });
    await layer.deleteDocument('items', 'i1');
    expect(await layer.getDocument('items', 'i1')).toBeNull();
  });

  it('is a no-op when the document does not exist', async () => {
    const layer = makeLayer();
    await expect(layer.deleteDocument('items', 'ghost')).resolves.toBeUndefined();
  });

  it('does not affect other documents in the collection', async () => {
    const layer = makeLayer({
      items: [
        { id: 'i1', label: 'A' },
        { id: 'i2', label: 'B' },
      ],
    });
    await layer.deleteDocument('items', 'i1');
    const remaining = await layer.listDocuments('items');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('i2');
  });
});

// ─── query ───────────────────────────────────────────────────────────────────

describe('query', () => {
  let layer: InMemoryDataLayer;

  beforeEach(async () => {
    layer = makeLayer();
    await layer.createDocument('products', { id: 'p1', category: 'fruit', price: 2, stock: 100 });
    await layer.createDocument('products', { id: 'p2', category: 'veggie', price: 1, stock: 50 });
    await layer.createDocument('products', { id: 'p3', category: 'fruit', price: 5, stock: 10 });
    await layer.createDocument('products', { id: 'p4', category: 'fruit', price: 3, stock: 0 });
  });

  it('returns all documents when no filters are specified', async () => {
    const results = await layer.query({ collection: 'products' });
    expect(results).toHaveLength(4);
  });

  it('filters with == operator', async () => {
    const results = await layer.query<{ category: string }>({
      collection: 'products',
      where: [{ field: 'category', op: '==', value: 'fruit' }],
    });
    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.category).toBe('fruit'));
  });

  it('filters with != operator', async () => {
    const results = await layer.query({
      collection: 'products',
      where: [{ field: 'category', op: '!=', value: 'fruit' }],
    });
    expect(results).toHaveLength(1);
  });

  it('filters with < and >= operators', async () => {
    const cheap = await layer.query<{ price: number }>({
      collection: 'products',
      where: [{ field: 'price', op: '<', value: 3 }],
    });
    expect(cheap.every((r) => r.price < 3)).toBe(true);

    const available = await layer.query<{ stock: number }>({
      collection: 'products',
      where: [{ field: 'stock', op: '>=', value: 1 }],
    });
    expect(available.every((r) => r.stock >= 1)).toBe(true);
  });

  it('filters with <= and > operators', async () => {
    const results = await layer.query<{ price: number }>({
      collection: 'products',
      where: [{ field: 'price', op: '<=', value: 3 }],
    });
    expect(results.every((r) => r.price <= 3)).toBe(true);

    const expensive = await layer.query<{ price: number }>({
      collection: 'products',
      where: [{ field: 'price', op: '>', value: 3 }],
    });
    expect(expensive.every((r) => r.price > 3)).toBe(true);
  });

  it('filters with in operator', async () => {
    const results = await layer.query<{ price: number }>({
      collection: 'products',
      where: [{ field: 'price', op: 'in', value: [1, 5] }],
    });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.price).sort()).toEqual([1, 5]);
  });

  it('filters with not-in operator', async () => {
    const results = await layer.query<{ price: number }>({
      collection: 'products',
      where: [{ field: 'price', op: 'not-in', value: [1, 5] }],
    });
    expect(results).toHaveLength(2);
    results.forEach((r) => expect([1, 5]).not.toContain(r.price));
  });

  it('filters with array-contains operator', async () => {
    const l2 = makeLayer();
    await l2.createDocument('posts', { id: 'post1', tags: ['a', 'b'] });
    await l2.createDocument('posts', { id: 'post2', tags: ['b', 'c'] });
    await l2.createDocument('posts', { id: 'post3', tags: ['d'] });

    const results = await l2.query({ collection: 'posts', where: [{ field: 'tags', op: 'array-contains', value: 'b' }] });
    expect(results).toHaveLength(2);
  });

  it('filters with contains operator on strings', async () => {
    const l2 = makeLayer();
    await l2.createDocument('notes', { id: 'n1', text: 'hello world' });
    await l2.createDocument('notes', { id: 'n2', text: 'goodbye' });

    const results = await l2.query({ collection: 'notes', where: [{ field: 'text', op: 'contains', value: 'hello' }] });
    expect(results).toHaveLength(1);
  });

  it('stacks multiple where clauses (AND semantics)', async () => {
    const results = await layer.query<{ category: string; stock: number }>({
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
  });

  it('orders results ascending', async () => {
    const results = await layer.query<{ price: number }>({
      collection: 'products',
      orderBy: [{ field: 'price', direction: 'asc' }],
    });
    const prices = results.map((r) => r.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('orders results descending', async () => {
    const results = await layer.query<{ price: number }>({
      collection: 'products',
      orderBy: [{ field: 'price', direction: 'desc' }],
    });
    const prices = results.map((r) => r.price);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  it('applies multi-field ordering correctly', async () => {
    const l2 = makeLayer();
    await l2.createDocument('rec', { id: 'r1', cat: 'a', rank: 2 });
    await l2.createDocument('rec', { id: 'r2', cat: 'b', rank: 1 });
    await l2.createDocument('rec', { id: 'r3', cat: 'a', rank: 1 });

    const results = await l2.query<{ cat: string; rank: number }>({
      collection: 'rec',
      orderBy: [
        { field: 'cat', direction: 'asc' },
        { field: 'rank', direction: 'asc' },
      ],
    });
    expect(results.map((r) => r.id)).toEqual(['r3', 'r1', 'r2']);
  });

  it('applies limit correctly', async () => {
    const results = await layer.query({ collection: 'products', limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('combines filter + orderBy + limit', async () => {
    const results = await layer.query<{ price: number }>({
      collection: 'products',
      where: [{ field: 'category', op: '==', value: 'fruit' }],
      orderBy: [{ field: 'price', direction: 'asc' }],
      limit: 2,
    });
    expect(results).toHaveLength(2);
    expect(results[0].price).toBeLessThanOrEqual(results[1].price);
  });

  it('returns an empty array when no documents match', async () => {
    const results = await layer.query({
      collection: 'products',
      where: [{ field: 'price', op: '>', value: 1000 }],
    });
    expect(results).toEqual([]);
  });

  it('queries a dot-notation nested field', async () => {
    const l2 = makeLayer();
    await l2.setDocument('items', 'i1', { meta: { priority: 1 } });
    await l2.setDocument('items', 'i2', { meta: { priority: 3 } });

    const results = await l2.query({
      collection: 'items',
      where: [{ field: 'meta.priority', op: '>', value: 2 }],
    });
    expect(results).toHaveLength(1);
    expect((results[0] as any).id).toBe('i2');
  });
});

// ─── batchWrite ──────────────────────────────────────────────────────────────

describe('batchWrite', () => {
  it('executes set, update, and delete operations atomically', async () => {
    const layer = makeLayer({
      col: [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 },
      ],
    });

    const ops: BatchOperation[] = [
      { type: 'set', collection: 'col', id: 'a', data: { v: 10 } },
      { type: 'update', collection: 'col', id: 'b', data: { v: 20 } },
      { type: 'delete', collection: 'col', id: 'c' },
    ];

    await layer.batchWrite(ops);

    const a = await layer.getDocument<{ v: number }>('col', 'a');
    expect(a!.v).toBe(10);
    expect(a!.id).toBe('a');

    const b = await layer.getDocument<{ v: number }>('col', 'b');
    expect(b!.v).toBe(20);

    const c = await layer.getDocument('col', 'c');
    expect(c).toBeNull();
  });

  it('skips update ops for documents that do not exist', async () => {
    const layer = makeLayer();
    await expect(
      layer.batchWrite([{ type: 'update', collection: 'col', id: 'ghost', data: { v: 1 } }]),
    ).resolves.toBeUndefined();
  });

  it('handles an empty ops array without error', async () => {
    const layer = makeLayer();
    await expect(layer.batchWrite([])).resolves.toBeUndefined();
  });

  it('cross-collection batch operations work correctly', async () => {
    const layer = makeLayer();
    await layer.batchWrite([
      { type: 'set', collection: 'users', id: 'u1', data: { name: 'Ada' } },
      { type: 'set', collection: 'posts', id: 'p1', data: { title: 'Hello' } },
    ]);

    expect((await layer.getDocument('users', 'u1'))!).toMatchObject({ name: 'Ada' });
    expect((await layer.getDocument('posts', 'p1'))!).toMatchObject({ title: 'Hello' });
  });
});

// ─── subscribeToDocument ─────────────────────────────────────────────────────

describe('subscribeToDocument', () => {
  it('emits null immediately for a non-existent document', () => {
    const layer = makeLayer();
    const listener = vi.fn();
    const unsub = layer.subscribeToDocument('users', 'u1', listener);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(null);
    unsub();
  });

  it('emits the current document immediately when it exists', () => {
    const layer = makeLayer({ users: [{ id: 'u1', name: 'Ada' }] });
    const listener = vi.fn();
    const unsub = layer.subscribeToDocument('users', 'u1', listener);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', name: 'Ada' }));
    unsub();
  });

  it('notifies on setDocument', async () => {
    const layer = makeLayer();
    const listener = vi.fn<[AraRecord<{ title: string }> | null]>();
    const unsub = layer.subscribeToDocument<{ title: string }>('notes', 'n1', listener);

    await layer.setDocument('notes', 'n1', { title: 'First' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]?.title).toBe('First');
    unsub();
  });

  it('notifies on updateDocument', async () => {
    const layer = makeLayer({ notes: [{ id: 'n1', title: 'Old' }] });
    const listener = vi.fn<[AraRecord<{ title: string }> | null]>();
    const unsub = layer.subscribeToDocument<{ title: string }>('notes', 'n1', listener);

    await layer.updateDocument('notes', 'n1', { title: 'New' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]?.title).toBe('New');
    unsub();
  });

  it('notifies with null after deleteDocument', async () => {
    const layer = makeLayer({ notes: [{ id: 'n1', title: 'Bye' }] });
    const listener = vi.fn();
    const unsub = layer.subscribeToDocument('notes', 'n1', listener);

    await layer.deleteDocument('notes', 'n1');
    const lastCall = listener.mock.calls[listener.mock.calls.length - 1];
    expect(lastCall[0]).toBeNull();
    unsub();
  });

  it('unsubscribe stops further notifications', async () => {
    const layer = makeLayer();
    const listener = vi.fn();
    const unsub = layer.subscribeToDocument('notes', 'n1', listener);
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();

    await layer.setDocument('notes', 'n1', { title: 'Silent' });
    // Still only the initial null call
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('multiple subscribers each receive independent notifications', async () => {
    const layer = makeLayer();
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    const unsubA = layer.subscribeToDocument('x', 'doc', listenerA);
    const unsubB = layer.subscribeToDocument('x', 'doc', listenerB);

    await layer.setDocument('x', 'doc', { v: 42 });

    expect(listenerA).toHaveBeenCalledTimes(2);
    expect(listenerB).toHaveBeenCalledTimes(2);

    unsubA();
    await layer.setDocument('x', 'doc', { v: 99 });
    // A was unsubscribed, B still receives
    expect(listenerA).toHaveBeenCalledTimes(2);
    expect(listenerB).toHaveBeenCalledTimes(3);

    unsubB();
  });

  it('delivers an isolated clone so listener mutations cannot corrupt the store', async () => {
    const layer = makeLayer();
    const captured: Array<AraRecord<{ count: number }> | null> = [];
    const unsub = layer.subscribeToDocument<{ count: number }>('stats', 's1', (doc) => {
      captured.push(doc);
    });
    await layer.setDocument('stats', 's1', { count: 1 });

    // Mutate the captured snapshot
    if (captured[1]) captured[1].count = 9999;

    // The store should be unaffected
    const fresh = await layer.getDocument<{ count: number }>('stats', 's1');
    expect(fresh!.count).toBe(1);
    unsub();
  });
});

// ─── subscribeToQuery ─────────────────────────────────────────────────────────

describe('subscribeToQuery', () => {
  it('emits an empty array immediately for an empty collection', async () => {
    const layer = makeLayer();
    const listener = vi.fn();
    const query: AraQuery = { collection: 'tasks' };

    const unsub = layer.subscribeToQuery(query, listener);
    await flush();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith([]);
    unsub();
  });

  it('re-emits when a matching document is created', async () => {
    const layer = makeLayer();
    const listener = vi.fn();
    const query: AraQuery = {
      collection: 'tasks',
      where: [{ field: 'done', op: '==', value: false }],
    };
    const unsub = layer.subscribeToQuery(query, listener);
    await flush();

    await layer.createDocument('tasks', { done: false, title: 'Buy milk' });
    await flush();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]).toHaveLength(1);
    unsub();
  });

  it('does not re-emit when the mutation is in a different collection', async () => {
    const layer = makeLayer();
    const listener = vi.fn();
    const query: AraQuery = { collection: 'tasks' };

    const unsub = layer.subscribeToQuery(query, listener);
    await flush();

    await layer.createDocument('notes', { text: 'unrelated' });
    await flush();

    expect(listener).toHaveBeenCalledOnce();
    unsub();
  });

  it('applies filter to emitted snapshots — non-matching docs are excluded', async () => {
    const layer = makeLayer();
    const listener = vi.fn();
    const query: AraQuery = {
      collection: 'items',
      where: [{ field: 'active', op: '==', value: true }],
    };
    const unsub = layer.subscribeToQuery(query, listener);
    await flush();

    await layer.createDocument('items', { active: false, name: 'Inactive' });
    await flush();
    // Non-matching document created — snapshot should still be empty
    expect(listener.mock.calls[listener.mock.calls.length - 1][0]).toHaveLength(0);

    await layer.createDocument('items', { active: true, name: 'Active' });
    await flush();
    // Matching document created — snapshot should have one entry
    expect(listener.mock.calls[listener.mock.calls.length - 1][0]).toHaveLength(1);

    unsub();
  });

  it('respects orderBy in live snapshots', async () => {
    const layer = makeLayer();
    const snapshots: number[][] = [];
    const query: AraQuery = {
      collection: 'q',
      orderBy: [{ field: 'rank', direction: 'asc' }],
    };

    const unsub = layer.subscribeToQuery<{ rank: number }>(query, (docs) => {
      snapshots.push(docs.map((d) => d.rank));
    });
    await flush();

    await layer.createDocument('q', { rank: 3 });
    await flush();
    await layer.createDocument('q', { rank: 1 });
    await flush();
    await layer.createDocument('q', { rank: 2 });
    await flush();

    const lastSnapshot = snapshots[snapshots.length - 1];
    expect(lastSnapshot).toEqual([1, 2, 3]);
    unsub();
  });

  it('unsubscribe stops further emissions', async () => {
    const layer = makeLayer();
    const listener = vi.fn();
    const query: AraQuery = { collection: 'events' };

    const unsub = layer.subscribeToQuery(query, listener);
    await flush();
    unsub();

    await layer.createDocument('events', { type: 'silent' });
    await flush();

    // Only the initial empty-array call, nothing after unsub
    expect(listener).toHaveBeenCalledOnce();
  });

  it('handles simultaneous document and query subscriptions on the same collection', async () => {
    const layer = makeLayer();
    const docListener = vi.fn();
    const queryListener = vi.fn();

    const unsubDoc = layer.subscribeToDocument<{ value: number }>('data', 'item1', docListener);
    const unsubQ = layer.subscribeToQuery<{ value: number }>(
      { collection: 'data' },
      queryListener,
    );
    await flush();

    await layer.setDocument('data', 'item1', { value: 7 });
    await flush();

    expect(docListener).toHaveBeenCalledTimes(2);
    expect(docListener.mock.calls[1][0]?.value).toBe(7);

    expect(queryListener).toHaveBeenCalledTimes(2);
    expect(queryListener.mock.calls[1][0][0]?.value).toBe(7);

    unsubDoc();
    unsubQ();
  });
});

// ─── Seeded constructor ───────────────────────────────────────────────────────

describe('constructor seed', () => {
  it('pre-populates collections from the seed argument', async () => {
    const layer = makeLayer({
      users: [
        { id: 'u1', name: 'Ada' },
        { id: 'u2', name: 'Grace' },
      ],
      posts: [{ id: 'p1', title: 'First Post' }],
    });

    const users = await layer.listDocuments('users');
    expect(users).toHaveLength(2);

    const post = await layer.getDocument<{ title: string }>('posts', 'p1');
    expect(post!.title).toBe('First Post');
  });

  it('seed data does not leak between separate instances', async () => {
    const a = makeLayer({ shared: [{ id: 'doc', v: 1 }] });
    const b = makeLayer({ shared: [{ id: 'doc', v: 2 }] });

    const docA = await a.getDocument<{ v: number }>('shared', 'doc');
    const docB = await b.getDocument<{ v: number }>('shared', 'doc');

    expect(docA!.v).toBe(1);
    expect(docB!.v).toBe(2);
  });
});
