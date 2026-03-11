import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { InMemoryDataProvider, NexusDataLayer } from './index';
import { createFirebaseDataLayer } from './firebase-data-layer';

// ── DI Guard ──────────────────────────────────────────────────────────────────
// Modules that import firebase/firestore directly (outside the allowlist) must
// call _reportDirectFirestoreImport() at module load time.  The DataLayerProvider
// will then warn loudly in DEV mode so the violation is immediately visible.
//
// Allowlist (never need to call this):
//   • src/lib/firebase.ts
//   • src/lib/data-layer/* (this directory)
//
// Any other file calling this is a boundary violation that must be fixed.
const _directFirestoreImporters = new Set<string>();

export function _reportDirectFirestoreImport(importerPath: string): void {
  _directFirestoreImporters.add(importerPath);
}

let globalDataLayer: NexusDataLayer | null = null;

export function getNexusDataLayer(): NexusDataLayer {
  if (globalDataLayer) return globalDataLayer;
  const firebaseAdapter = createFirebaseDataLayer();
  globalDataLayer = firebaseAdapter ?? new InMemoryDataProvider();
  return globalDataLayer;
}

export function setNexusDataLayer(adapter: NexusDataLayer) {
  globalDataLayer = adapter;
}

const DataLayerContext = createContext<NexusDataLayer | null>(null);

export function DataLayerProvider({
  children,
  adapter,
}: {
  children: React.ReactNode;
  adapter?: NexusDataLayer;
}) {
  const value = useMemo(() => adapter ?? getNexusDataLayer(), [adapter]);

  useEffect(() => {
    setNexusDataLayer(value);
  }, [value]);

  useEffect(() => {
    if (import.meta.env.DEV && _directFirestoreImporters.size > 0) {
      const violations = [..._directFirestoreImporters];
      console.error(
        '[Nexus DI Guard] Direct firebase/firestore imports detected outside the allowlist.\n' +
          'Only src/lib/firebase.ts and src/lib/data-layer/ may import from firebase/firestore.\n' +
          'Route all data access through useDataLayer() or the NexusDataLayer interface.\n\n' +
          violations.map((v) => `  ✗ ${v}`).join('\n'),
      );
    }
    // Run once on mount; _directFirestoreImporters is populated at module load time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <DataLayerContext.Provider value={value}>{children}</DataLayerContext.Provider>;
}

export function useDataLayer(): NexusDataLayer {
  const ctx = useContext(DataLayerContext);
  if (ctx) return ctx;
  return getNexusDataLayer();
}
