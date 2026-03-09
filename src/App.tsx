import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './core/components/ThemeProvider';
import { AuthProvider, useAuth } from './lib/auth-context';
import { VaultProvider } from './lib/vault-context';
import { GlobalSoulProvider } from './lib/global-soul-context';
import { AIProvider, useAI } from './llm-engine/ai-context';
import { BootLoader } from './core/components/BootLoader';
import { AppErrorBoundary } from './core/components/AppErrorBoundary';
import { ProtectedRoute } from './core/components/ProtectedRoute';
import { NexusOverlay } from './core/components/NexusOverlay';
import { NeuralDraftPanel } from './core/components/NeuralDraftPanel';
import { SpineOverlay } from './core/components/SpineOverlay';
import { SpineToastProvider } from './core/components/SpineToast';
import { NexusRouteBanner } from './core/components/NexusRouteBanner';
import { Spine } from './lib/spine/spine-event-bus';
import { CORE_CASCADE_RULES } from './lib/spine/cascade-rules';
import { useEffect } from 'react';

// Route-level lazy loading for chunk splitting.
const LandingPage = lazy(() => import('./modules/landing/LandingPage'));
const HubPage = lazy(() => import('./modules/hub/HubPage'));
const AgnesPage = lazy(() => import('./modules/agnes/AgnesPage'));
const TitanPage = lazy(() => import('./modules/titan/TitanPage'));
const LedgerPage = lazy(() => import('./modules/ledger/LedgerPage'));
const OrchestratorPage = lazy(() => import('./modules/orchestrator/OrchestratorPage'));
// Soma absorbed into Titan — SomaPage no longer used; /soma redirects to /titan?tab=biomarkers
const AtlasPage = lazy(() => import('./modules/atlas/AtlasPage'));
const ScoutPage = lazy(() => import('./modules/scout/ScoutPage'));
const ForgePage = lazy(() => import('./modules/forge/ForgePage'));
const ProfilePage = lazy(() => import('./modules/profile/ProfilePage'));
const DocumentsPage = lazy(() => import('./modules/documents/DocumentsPage'));

function AIWrapper({ children }: { children: React.ReactNode }) {
  const { isGuest } = useAuth();
  return <AIProvider guestMode={isGuest}>{children}</AIProvider>;
}

function SpineRuntimeBootstrap() {
  const { user } = useAuth();

  useEffect(() => {
    Spine.registerCascadeRules(CORE_CASCADE_RULES);
  }, []);

  useEffect(() => {
    Spine.setUser(user?.uid ?? null);
  }, [user?.uid]);

  return null;
}

function AIRuntimeGate({ children }: { children: React.ReactNode }) {
  const { loading: authLoading } = useAuth();
  const { isInitialized: aiReady } = useAI();

  if (authLoading || !aiReady) {
    return <BootLoader />;
  }

  return <>{children}</>;
}

function AppContent() {
  return (
    <Suspense fallback={<BootLoader />}>
      <SpineRuntimeBootstrap />
      <NexusOverlay />
      <SpineOverlay />
      <NeuralDraftPanel />
      <SpineToastProvider />
      <NexusRouteBanner />
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

        <Route path="/agnes" element={
          <ProtectedRoute>
            <AgnesPage />
          </ProtectedRoute>
        } />

        <Route path="/titan" element={
          <ProtectedRoute>
            <TitanPage />
          </ProtectedRoute>
        } />

        <Route path="/ledger" element={
          <ProtectedRoute>
            <LedgerPage />
          </ProtectedRoute>
        } />

        {/* Soma absorbed into Titan — redirect to biomarkers tab */}
        <Route path="/soma" element={<Navigate to="/titan?tab=biomarkers" replace />} />

        <Route path="/atlas" element={
          <ProtectedRoute>
            <AtlasPage />
          </ProtectedRoute>
        } />

        <Route path="/scout" element={
          <ProtectedRoute>
            <ScoutPage />
          </ProtectedRoute>
        } />

        <Route path="/forge" element={
          <ProtectedRoute>
            <ForgePage />
          </ProtectedRoute>
        } />

        <Route path="/documents" element={
          <ProtectedRoute>
            <DocumentsPage />
          </ProtectedRoute>
        } />

        {/* Pulse absorbed into Scout */}
        <Route path="/pulse" element={<Navigate to="/scout" replace />} />

        <Route path="/profile" element={
          <ProtectedRoute>
            <ProfilePage />
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
      <Router>
        <AuthProvider>
          <VaultProvider>
            <GlobalSoulProvider>
              <AIWrapper>
                <AppErrorBoundary>
                  <AIRuntimeGate>
                    <AppContent />
                  </AIRuntimeGate>
                </AppErrorBoundary>
              </AIWrapper>
            </GlobalSoulProvider>
          </VaultProvider>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
}

export default App;
