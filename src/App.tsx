import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './core/components/ThemeProvider';
import { AuthProvider, useAuth } from './lib/auth-context';
import { VaultProvider } from './lib/vault-context';
import { GlobalSoulProvider, useGlobalSoul } from './lib/global-soul-context';
import { AIProvider, useAI } from './llm-engine/ai-context';
import { BootLoader } from './core/components/BootLoader';
import { ProtectedRoute } from './core/components/ProtectedRoute';

// Module Pages
import LandingPage from './modules/landing/LandingPage';
import HubPage from './modules/hub/HubPage';
import TherapyPage from './modules/therapy/TherapyPage';
import TrainerPage from './modules/trainer/TrainerPage';
import LedgerPage from './modules/ledger/LedgerPage';
import OrchestratorPage from './modules/orchestrator/OrchestratorPage';

function AIWrapper({ children }: { children: React.ReactNode }) {
  const { handleToolCall } = useGlobalSoul() as any; // Temporary cast as handleToolCall is being refactored
  return <AIProvider onToolCall={handleToolCall}>{children}</AIProvider>;
}

function AppContent() {
  const { loading: authLoading } = useAuth();
  const { isInitialized: aiReady } = useAI();

  if (authLoading || !aiReady) {
    return <BootLoader />;
  }

  return (
    <Suspense fallback={<BootLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        
        <Route path="/orchestrator" element={
          <ProtectedRoute requireOnboarding={false}>
            <OrchestratorPage />
          </ProtectedRoute>
        } />

        <Route path="/hub" element={
          <ProtectedRoute>
            <HubPage />
          </ProtectedRoute>
        } />

        <Route path="/therapy" element={
          <ProtectedRoute>
            <TherapyPage />
          </ProtectedRoute>
        } />

        <Route path="/trainer" element={
          <ProtectedRoute>
            <TrainerPage />
          </ProtectedRoute>
        } />

        <Route path="/ledger" element={
          <ProtectedRoute>
            <LedgerPage />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <VaultProvider>
          <GlobalSoulProvider>
            <AIWrapper>
              <AppContent />
            </AIWrapper>
          </GlobalSoulProvider>
        </VaultProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
