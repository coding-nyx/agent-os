import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { InMemoryDataProvider, NexusDataLayer } from './index';
import { createFirebaseDataLayer } from './firebase-data-layer';

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

  return <DataLayerContext.Provider value={value}>{children}</DataLayerContext.Provider>;
}

export function useDataLayer(): NexusDataLayer {
  const ctx = useContext(DataLayerContext);
  if (ctx) return ctx;
  return getNexusDataLayer();
}
