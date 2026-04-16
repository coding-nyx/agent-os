import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { InMemoryDataProvider, AraDataLayer } from './index';
import { createFirebaseDataLayer } from './firebase-data-layer';
import { Spine } from '@/lib/spine/spine-event-bus';

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

let globalDataLayer: AraDataLayer | null = null;

export function getAraDataLayer(): AraDataLayer {
  if (globalDataLayer) return globalDataLayer;
  if (import.meta.env.MODE === 'test') {
    globalDataLayer = new InMemoryDataProvider();
    return globalDataLayer;
  }
  const firebaseAdapter = createFirebaseDataLayer();
  globalDataLayer = firebaseAdapter ?? new InMemoryDataProvider();
  return globalDataLayer;
}

export function setAraDataLayer(adapter: AraDataLayer) {
  globalDataLayer = adapter;
}

const DataLayerContext = createContext<AraDataLayer | null>(null);

export function DataLayerProvider({
  children,
  adapter,
}: {
  children: React.ReactNode;
  adapter?: AraDataLayer;
}) {
  const value = useMemo(() => adapter ?? getAraDataLayer(), [adapter]);

  useEffect(() => {
    setAraDataLayer(value);
    Spine.setDataLayer(value);
  }, [value]);

  useEffect(() => {
    if (import.meta.env.DEV && _directFirestoreImporters.size > 0) {
      const violations = [..._directFirestoreImporters];
      console.error(
        '[Ara DI Guard] Direct firebase/firestore imports detected outside the allowlist.\n' +
          'Only src/lib/firebase.ts and src/lib/data-layer/ may import from firebase/firestore.\n' +
          'Route all data access through useDataLayer() or the AraDataLayer interface.\n\n' +
          violations.map((v) => `  ✗ ${v}`).join('\n'),
      );
    }
    // Run once on mount; _directFirestoreImporters is populated at module load time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <DataLayerContext.Provider value={value}>{children}</DataLayerContext.Provider>;
}

export function useDataLayer(): AraDataLayer {
  const ctx = useContext(DataLayerContext);
  if (ctx) return ctx;
  return getAraDataLayer();
}
