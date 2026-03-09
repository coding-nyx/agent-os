import { describe, expect, it, vi } from 'vitest';

import {
  InMemoryDataProvider,
  NexusQuery,
  NexusRecord,
} from './index';

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('InMemoryDataProvider', () => {
  it('creates, reads, updates, and deletes documents', async () => {
    const provider = new InMemoryDataProvider();

    const created = await provider.createDocument<{ name: string }>('profiles', { name: 'Ada' });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Ada');

    const fetched = await provider.getDocument<{ name: string }>('profiles', created.id);
    expect(fetched).toEqual(created);

    const updated = await provider.updateDocument<{ name: string }>('profiles', created.id, { name: 'Grace' });
    expect(updated?.name).toBe('Grace');

    await provider.deleteDocument('profiles', created.id);
    const afterDelete = await provider.getDocument('profiles', created.id);
    expect(afterDelete).toBeNull();
  });

  it('queries with filters, ordering, and limits', async () => {
    const provider = new InMemoryDataProvider();
    await provider.createDocument('tasks', { id: 'a', title: 'Prep', priority: 2 });
    await provider.createDocument('tasks', { id: 'b', title: 'Ship', priority: 1 });
    await provider.createDocument('tasks', { id: 'c', title: 'Archive', priority: 3 });

    const query: NexusQuery = {
      collection: 'tasks',
      where: [{ field: 'priority', op: '>=', value: 1 }],
      orderBy: [{ field: 'priority', direction: 'asc' }],
      limit: 2,
    };

    const results = await provider.query<{ title: string; priority: number }>(query);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.title)).toEqual(['Ship', 'Prep']);
  });

  it('notifies document subscribers on mutations', async () => {
    const provider = new InMemoryDataProvider();
    const listener = vi.fn<(doc: NexusRecord<{ title: string }> | null) => void>();

    const unsubscribe = provider.subscribeToDocument('notes', 'doc-1', listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(null);

    await provider.setDocument('notes', 'doc-1', { title: 'Hello' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]?.title).toBe('Hello');

    await provider.updateDocument('notes', 'doc-1', { title: 'Updated' });
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls[2][0]?.title).toBe('Updated');

    unsubscribe();
    await provider.deleteDocument('notes', 'doc-1');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('notifies query subscribers with sorted results', async () => {
    const provider = new InMemoryDataProvider();
    const listener = vi.fn<(docs: NexusRecord<{ status: string; priority: number }>[]) => void>();
    const query: NexusQuery = {
      collection: 'queue',
      where: [{ field: 'status', op: '==', value: 'open' }],
      orderBy: [{ field: 'priority', direction: 'asc' }],
    };

    const unsubscribe = provider.subscribeToQuery(query, listener);
    await flushMicrotasks();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toEqual([]);

    await provider.createDocument('queue', { status: 'closed', priority: 2 });
    await flushMicrotasks();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]).toEqual([]);

    await provider.createDocument('queue', { status: 'open', priority: 5, title: 'Later' });
    await flushMicrotasks();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls[2][0]).toHaveLength(1);
    expect(listener.mock.calls[2][0][0].priority).toBe(5);

    await provider.createDocument('queue', { status: 'open', priority: 1, title: 'First' });
    await flushMicrotasks();
    expect(listener).toHaveBeenCalledTimes(4);
    expect(listener.mock.calls[3][0]).toHaveLength(2);
    expect(listener.mock.calls[3][0][0].priority).toBe(1);

    unsubscribe();
    await provider.createDocument('queue', { status: 'open', priority: 0 });
    await flushMicrotasks();
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('applies dot-notation updates to nested paths', async () => {
    const provider = new InMemoryDataProvider();
    await provider.setDocument('profiles', 'user-1', { uid: 'user-1', nested: { value: 1 } });

    await provider.updateDocument('profiles', 'user-1', {
      'nested.value': 5,
      'preferences.theme': 'dark',
    } as any);

    const updated = await provider.getDocument<any>('profiles', 'user-1');
    expect(updated?.nested?.value).toBe(5);
    expect(updated?.preferences?.theme).toBe('dark');
  });
});
