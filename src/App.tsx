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
import { AppVaultGate } from './core/components/AppVaultGate';
import { NexusOverlay } from './core/components/NexusOverlay';
import { NeuralDraftPanel } from './core/components/NeuralDraftPanel';
import { SpineOverlay } from './core/components/SpineOverlay';
import { SpineToastProvider } from './core/components/SpineToast';
import { NexusRouteBanner } from './core/components/NexusRouteBanner';
import { ConflictResolutionOverlay } from './core/components/ConflictResolutionOverlay';
import { useIntelligencePipeline } from './lib/services/intelligence-pipeline';
import { BridgeService } from './lib/services/bridge-service';
import { ReminderScheduler } from './lib/notifications/reminder-scheduler-service';
import { Spine } from './lib/spine/spine-event-bus';
import { CORE_CASCADE_RULES, ATLAS_CASCADE_RULES, ATLAS_PLANNING_CASCADE_RULES, AGNES_CASCADE_RULES, ATLAS_FAILURE_RULES, SOMA_CASCADE_RULES, TITAN_CASCADE_RULES } from './lib/spine/cascade-rules';
import { useEffect } from 'react';
import { DataLayerProvider } from './lib/data-layer/provider';

// Route-level lazy loading for chunk splitting.
const LandingPage = lazy(() => import('./modules/landing/LandingPage'));
const HubPage = lazy(() => import('./modules/hub/HubPage'));
const AgnesPage = lazy(() => import('./modules/agnes/AgnesPage'));
const TitanPage = lazy(() => import('./modules/titan/TitanPage'));
const LedgerPage = lazy(() => import('./modules/ledger/LedgerPage'));
const OrchestratorPage = lazy(() => import('./modules/orchestrator/OrchestratorPage'));
const SomaPage = lazy(() => import('./modules/soma/SomaPage'));
const AtlasPage = lazy(() => import('./modules/atlas/AtlasPage'));
const ScoutPage = lazy(() => import('./modules/scout/ScoutPage'));
const ForgePage = lazy(() => import('./modules/forge/ForgePage'));
const ProfilePage = lazy(() => import('./modules/profile/ProfilePage'));

function AIWrapper({ children }: { children: React.ReactNode }) {
  const { isGuest } = useAuth();
  return <AIProvider guestMode={isGuest}>{children}</AIProvider>;
}

function SpineRuntimeBootstrap() {
  const { user } = useAuth();

  useEffect(() => {
    Spine.registerCascadeRules(CORE_CASCADE_RULES);
    Spine.registerCascadeRules(ATLAS_CASCADE_RULES);
    Spine.registerCascadeRules(ATLAS_PLANNING_CASCADE_RULES);
    Spine.registerCascadeRules(AGNES_CASCADE_RULES);
    Spine.registerCascadeRules(ATLAS_FAILURE_RULES);
    Spine.registerCascadeRules(SOMA_CASCADE_RULES);
    Spine.registerCascadeRules(TITAN_CASCADE_RULES);
  }, []);

  useEffect(() => {
    Spine.setUser(user?.uid ?? null);
  }, [user?.uid]);

  return null;
}

function AIRuntimeGate({ children }: { children: React.ReactNode }) {
  const { loading: authLoading } = useAuth();
  const { isInitialized: aiReady, initFailed } = useAI();

  if (authLoading) return <BootLoader />;

  // Still initializing — wait with the boot screen.
  if (!aiReady && !initFailed) return <BootLoader />;

  // Initialization timed out / API keys missing — render app in degraded mode
  // with a persistent banner so the user knows AI features are offline.
  if (initFailed) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/20 border-b border-amber-500/30 px-4 py-2 text-center text-xs text-amber-300">
          AI assistant is unavailable — check your API key in Profile settings
        </div>
        {children}
      </>
    );
  }

  return <>{children}</>;
}

function IntelligencePipelineMount() {
  useIntelligencePipeline();
  return null;
}

function BridgeMount() {
  const { user, isGuest } = useAuth();

  useEffect(() => {
    if (!user || isGuest) return;

    BridgeService.start(user.uid).catch((err) =>
      console.warn('[Bridge] Start failed:', err)
    );
    ReminderScheduler.start(user.uid);

    return () => {
      BridgeService.stop();
      ReminderScheduler.stop();
    };
  }, [user?.uid, isGuest]);

  return null;
}

function AppContent() {
  return (
    <Suspense fallback={<BootLoader />}>
      <SpineRuntimeBootstrap />
      <IntelligencePipelineMount />
      <BridgeMount />
      <NexusOverlay />
      <SpineOverlay />
      <NeuralDraftPanel />
      <SpineToastProvider />
      <NexusRouteBanner />
      <ConflictResolutionOverlay />
      <Routes>
        <Route path="/" element={<LandingPage />} />

        {/* Vault unlock gate — outside ProtectedRoute so it's always reachable */}
        <Route path="/vault-gate" element={<AppVaultGate />} />
        
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

        <Route path="/soma" element={
          <ProtectedRoute>
            <SomaPage />
          </ProtectedRoute>
        } />

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
      <DataLayerProvider>
        <Router>
          <AuthProvider>
            <AIWrapper>
              <VaultProvider>
                <GlobalSoulProvider>
                  <AppErrorBoundary>
                    <AIRuntimeGate>
                      <AppContent />
                    </AIRuntimeGate>
                  </AppErrorBoundary>
                </GlobalSoulProvider>
              </VaultProvider>
            </AIWrapper>
          </AuthProvider>
        </Router>
      </DataLayerProvider>
    </ThemeProvider>
  );
}

export default App;
