/**
 * in-memory-contract.test.ts
 *
 * Runs the shared AraDataLayer contract suite against InMemoryDataLayer.
 * This is the baseline: every other adapter must pass the same suite.
 */

import { describeAdapterContract } from './adapter-contract';
import { InMemoryDataLayer } from './in-memory-data-layer';

describeAdapterContract('InMemoryDataLayer', () => ({
  adapter: new InMemoryDataLayer(),
  teardown: async () => {
    // InMemoryDataLayer is ephemeral per-instance — nothing to clean up.
  },
}));
