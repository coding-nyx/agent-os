/**
 * supabase-data-layer.test.ts
 *
 * Runs the shared NexusDataLayer contract suite against a real Supabase instance.
 *
 * Prerequisites:
 *   1. Apply supabase-schema.sql to your database.
 *   2. Enable Realtime on the nexus_documents table.
 *   3. Set env vars (e.g. in .env.test.local):
 *        SUPABASE_URL=https://<project>.supabase.co
 *        SUPABASE_ANON_KEY=<anon-key>
 *
 * The suite is skipped automatically when the env vars are absent so CI does not
 * require a live Supabase project.  Run locally or in an integration environment:
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... npx vitest run supabase-data-layer.test.ts
 *
 * Run in Node environment (not jsdom) to avoid the undici/jsdom Event class clash
 * that causes "The 'event' argument must be an instance of Event" errors from
 * Supabase Realtime WebSocket subscriptions.
 */

// @vitest-environment node

// Polyfill WebSocket using the 'ws' package so Supabase Realtime can open
// connections in Node without hitting undici's built-in WebSocket Event mismatch.
import WebSocket from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).WebSocket = WebSocket;
}

import { describe, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SupabaseDataLayer } from './supabase-data-layer';
import { describeAdapterContract } from './adapter-contract';

const SUPABASE_URL = import.meta.env.SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.SUPABASE_ANON_KEY as string | undefined;

const TABLE = 'nexus_documents';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  describe('SupabaseDataLayer — NexusDataLayer contract', () => {
    it.skip('skipped — set SUPABASE_URL and SUPABASE_ANON_KEY to run against a live Supabase instance', () => {});
  });
} else {
  // Reduce the Realtime channel timeout from 10 s (default) to 5 s so that
  // TIMED_OUT fires quickly enough to trigger the subscription retry within
  // the contract suite's 10-second waitUntil window.
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { timeout: 5000 },
  });

  // Each harness gets a unique collection prefix so test runs don't interfere.
  // All documents are cleaned up in teardown.
  const TEST_PREFIX = `test_${Date.now()}`;
  const allCollections = new Set<string>();

  describeAdapterContract('SupabaseDataLayer', async () => {
    const runId = Math.random().toString(36).slice(2, 8);
    const collectionNamespace = `${TEST_PREFIX}_${runId}`;

    const adapter = new SupabaseDataLayer(client);

    return {
      adapter: {
        // Wrap every method to namespace collections with the run prefix
        async getDocument(collection: string, id: string) {
          const ns = `${collectionNamespace}/${collection}`;
          allCollections.add(ns);
          return adapter.getDocument(ns, id);
        },
        async listDocuments(collection: string) {
          const ns = `${collectionNamespace}/${collection}`;
          allCollections.add(ns);
          return adapter.listDocuments(ns);
        },
        async createDocument(collection: string, data: any) {
          const ns = `${collectionNamespace}/${collection}`;
          allCollections.add(ns);
          return adapter.createDocument(ns, data);
        },
        async setDocument(collection: string, id: string, data: any) {
          const ns = `${collectionNamespace}/${collection}`;
          allCollections.add(ns);
          return adapter.setDocument(ns, id, data);
        },
        async updateDocument(collection: string, id: string, updates: any) {
          const ns = `${collectionNamespace}/${collection}`;
          allCollections.add(ns);
          return adapter.updateDocument(ns, id, updates);
        },
        async deleteDocument(collection: string, id: string) {
          const ns = `${collectionNamespace}/${collection}`;
          allCollections.add(ns);
          return adapter.deleteDocument(ns, id);
        },
        async query(query: any) {
          const ns = `${collectionNamespace}/${query.collection}`;
          allCollections.add(ns);
          return adapter.query({ ...query, collection: ns });
        },
        async batchWrite(ops: any[]) {
          const nsOps = ops.map((op: any) => {
            const ns = `${collectionNamespace}/${op.collection}`;
            allCollections.add(ns);
            return { ...op, collection: ns };
          });
          return adapter.batchWrite(nsOps);
        },
        subscribeToDocument(collection: string, id: string, listener: any) {
          const ns = `${collectionNamespace}/${collection}`;
          allCollections.add(ns);
          return adapter.subscribeToDocument(ns, id, listener);
        },
        subscribeToQuery(query: any, listener: any) {
          const ns = `${collectionNamespace}/${query.collection}`;
          allCollections.add(ns);
          return adapter.subscribeToQuery({ ...query, collection: ns }, listener);
        },
      } as any,

      async teardown() {
        // Delete all documents written in this harness
        const collections = Array.from(allCollections).filter((c) => c.startsWith(collectionNamespace));
        if (collections.length === 0) return;
        await client.from(TABLE).delete().in('collection', collections);
        collections.forEach((c) => allCollections.delete(c));
      },
    };
  });
}
