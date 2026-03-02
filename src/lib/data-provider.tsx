'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { DataProviderType } from './types';
import { FirebaseDataService } from './services/firebase-service';
import { useAuth } from './auth-context';

const DataContext = createContext<DataProviderType | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [service, setService] = useState<DataProviderType | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    // Determine if we are in mock mode? No, mock mode removed.
    // Always use Firebase Service.
    // We pass the current user (which might be the super-admin fake user or real firebase user) to the service.
    setService(new FirebaseDataService(user));
  }, [user]);

  return (
    <DataContext.Provider value={service}>
      {service ? children : null}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
