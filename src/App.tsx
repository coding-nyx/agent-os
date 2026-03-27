import React, { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './core/components/ThemeProvider';
import { AuthProvider, useAuth } from './lib/auth-context';
import { VaultProvider, useVault } from './lib/vault-context';
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
import { ReminderFallbackBanner } from './core/components/ReminderFallbackBanner';
import { SoulWriteInbox } from './core/components/SoulWriteInbox';
import { DebugActivityOverlay } from './core/components/debug';
import { ConflictResolutionOverlay } from './core/components/ConflictResolutionOverlay';
import { useIntelligencePipeline } from './lib/services/intelligence-pipeline';
import { BridgeService } from './lib/services/bridge-service';
import { ReminderScheduler } from './lib/notifications/reminder-scheduler-service';
import { SchedulerService } from './lib/spine/scheduler-service';
import { OrchestrationRetryWorkerService } from './lib/services/orchestration-retry-worker-service';
import { Spine } from './lib/spine/spine-event-bus';
import { useOrchestrationProfileSync } from './lib/hooks/use-orchestration-profile-sync';
import { 
  CORE_CASCADE_RULES, 
  ATLAS_CASCADE_RULES, 
  ATLAS_PLANNING_CASCADE_RULES, 
  AGNES_CASCADE_RULES, 
  ATLAS_FAILURE_RULES, 
  SOMA_CASCADE_RULES, 
  TITAN_CASCADE_RULES,
  ATLAS_MORNING_RULES
} from './lib/spine/cascade-rules';
import { DataLayerProvider } from './lib/data-layer/provider';
import { registerScoutHandoffConsumer } from './modules/scout/services/scout-handoff-consumer';

// Route-level lazy loading for chunk splitting.
const LandingPage = lazy(() => import('./modules/landing/LandingPage'));
const HubPage = lazy(() => import('./modules/hub/HubPage'));
const AgnesPage = lazy(() => import('./modules/agnes/AgnesPage'));
const TitanPage = lazy(() => import('./modules/titan/TitanPage'));
const LedgerPage = lazy(() => import('./modules/ledger/LedgerPage'));
const NexusPage = lazy(() => import('./modules/nexus/NexusPage'));
const SomaPage = lazy(() => import('./modules/soma/SomaPage'));
const AtlasPage = lazy(() => import('./modules/atlas/AtlasPage'));
const ScoutPage = lazy(() => import('./modules/scout/ScoutPage'));
const ForgePage = lazy(() => import('./modules/forge/ForgePage'));
const ProfilePage = lazy(() => import('./modules/profile/ProfilePage'));
const NotificationsPage = lazy(() => import('./modules/notifications/NotificationsPage'));

function AIWrapper({ children }: { children: React.ReactNode }) {
  const { isGuest } = useAuth();
  return <AIProvider guestMode={isGuest}>{children}</AIProvider>;
}

function SpineRuntimeBootstrap() {
  const { user } = useAuth();
  const { getMasterKey, isUnlocked } = useVault();
  const userId = user?.uid ?? null;

  useEffect(() => {
    Spine.registerCascadeRules(CORE_CASCADE_RULES);
    Spine.registerCascadeRules(ATLAS_CASCADE_RULES);
    Spine.registerCascadeRules(ATLAS_PLANNING_CASCADE_RULES);
    Spine.registerCascadeRules(AGNES_CASCADE_RULES);
    Spine.registerCascadeRules(ATLAS_FAILURE_RULES);
    Spine.registerCascadeRules(SOMA_CASCADE_RULES);
    Spine.registerCascadeRules(TITAN_CASCADE_RULES);
    Spine.registerCascadeRules(ATLAS_MORNING_RULES);
  }, []);

  useEffect(() => {
    Spine.setUser(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      registerScoutHandoffConsumer({ userId: null, encryptionKey: null });
      return;
    }
    let cancelled = false;

    void getMasterKey().then((encryptionKey) => {
      if (cancelled) return;
      registerScoutHandoffConsumer({
        userId,
        encryptionKey,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [userId, getMasterKey, isUnlocked]);

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
        <div className="fixed top-0 left-0 right-0 z-[var(--z-header)] bg-amber-500/20 border-b border-amber-500/30 px-4 py-2 text-center text-xs text-amber-300">
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

function SchedulerRuntimeBootstrap() {
  useEffect(() => {
    // 1. Start the platform scheduler
    SchedulerService.start();

    // 2. Register global core schedules
    // S9-007: Atlas Morning Brief (Daily 09:00)
    SchedulerService.register({
      id: 'atlas.morning_brief',
      moduleId: 'atlas',
      type: 'morning_brief',
      time: '09:00',
      spineEventType: 'MORNING_BRIEF_DUE',
      defaultEnabled: true,
    });

    // S9-007: Atlas Evening Check-in (Daily 20:30)
    SchedulerService.register({
      id: 'atlas.evening_checkin',
      moduleId: 'atlas',
      type: 'evening_checkin',
      time: '20:30',
      spineEventType: 'EVENING_CHECKIN_DUE',
      defaultEnabled: true,
    });

    // S18-002: Atlas Weekly Review (Sundays 18:00)
    SchedulerService.register({
      id: 'atlas.weekly_review',
      moduleId: 'atlas',
      type: 'weekly_review',
      time: 'Sun 18:00',
      spineEventType: 'WEEKLY_REVIEW_DUE',
      defaultEnabled: true,
    });

    return () => {
      SchedulerService.stop();
    };
  }, []);

  return null;
}

function BridgeMount() {
  const { user, isGuest } = useAuth();
  const mountedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!user || isGuest) {
      if (mountedUserId.current) {
        BridgeService.stop();
        ReminderScheduler.stop();
        SchedulerService.stop();
        OrchestrationRetryWorkerService.stop();
        mountedUserId.current = null;
      }
      return;
    }

    if (mountedUserId.current === user.uid) return;
    
    mountedUserId.current = user.uid;
    console.log('[BridgeMount] Initializing services for:', user.uid);

    void BridgeService.start(user.uid)
      .then(() => {
        // Only request permission once per session, not on every login
        if ('Notification' in window && Notification.permission === 'default' && !sessionStorage.getItem('notification_permission_requested')) {
          sessionStorage.setItem('notification_permission_requested', 'true');
          void BridgeService.requestPermissionAndInit();
        }
      });
    
    ReminderScheduler.start(user.uid);
    SchedulerService.start();
    OrchestrationRetryWorkerService.start(user.uid);

    return () => {
      // Immediate stop when BridgeMount is actually removed from the tree (e.g. lock down)
      BridgeService.stop();
      ReminderScheduler.stop();
      SchedulerService.stop();
      OrchestrationRetryWorkerService.stop();
      mountedUserId.current = null;
    };
  }, [user?.uid, isGuest]);

  return null;
}

function AppContent() {
  const { profile, isGuest, isAuthenticated } = useAuth();
  useOrchestrationProfileSync();
  
  // A session is "onboarded" if it's a guest session (which bypasses Nexus onboarding)
  // or if the authenticated user has completed their core profile.
  const isOnboardingComplete = isGuest || !!profile?.onboardingComplete;

  // We are in "lock down" if authenticated but not yet onboarded.
  // This prevents background services and global UI from leaking before the user
  // initializes their identity.
  const isLockedDown = isAuthenticated && !isGuest && !isOnboardingComplete;

  return (
    <Suspense fallback={<BootLoader />}>
      {!isLockedDown && (
        <>
          <SpineRuntimeBootstrap />
          <SchedulerRuntimeBootstrap />
          <IntelligencePipelineMount />
          <BridgeMount />
          <NexusOverlay />
          <SpineOverlay />
          <NeuralDraftPanel />
          <ReminderFallbackBanner />
          <NexusRouteBanner />
        </>
      )}

      <SpineToastProvider />
      <DebugActivityOverlay />
      
      <Routes>
        <Route path="/" element={<LandingPage />} />

        {/* Vault unlock gate — outside ProtectedRoute so it's always reachable */}
        <Route path="/vault-gate" element={<AppVaultGate />} />
        
        <Route path="/nexus/*" element={
          <ProtectedRoute requireOnboarding={false}>
            <NexusPage />
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

        <Route path="/notifications" element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

import { NotificationProvider } from './lib/notifications/NotificationContext';

function App() {
  return (
    <ThemeProvider>
      <DataLayerProvider>
        <Router>
          <AuthProvider>
            <AIWrapper>
              <NotificationProvider>
                <VaultProvider>
                  <GlobalSoulProvider>
                    <AppErrorBoundary>
                      <AIRuntimeGate>
                        <AppContent />
                      </AIRuntimeGate>
                    </AppErrorBoundary>
                  </GlobalSoulProvider>
                </VaultProvider>
              </NotificationProvider>
            </AIWrapper>
          </AuthProvider>
        </Router>
      </DataLayerProvider>
    </ThemeProvider>
  );
}

export default App;
