import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from './core/components/ThemeProvider';
import { AuthProvider, useAuth } from './lib/auth-context';
import { VaultProvider } from './lib/vault-context';
import { GlobalSoulProvider } from './lib/global-soul-context';
import { AIProvider, useAI } from './llm-engine/ai-context';
import { BootLoader } from './core/components/BootLoader';
import { AppErrorBoundary } from './core/components/AppErrorBoundary';
import { ProtectedRoute } from './core/components/ProtectedRoute';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

// Module Pages
import LandingPage from './modules/landing/LandingPage';
import HubPage from './modules/hub/HubPage';
import TherapyPage from './modules/therapy/TherapyPage';
import TrainerPage from './modules/trainer/TrainerPage';
import LedgerPage from './modules/ledger/LedgerPage';
import OrchestratorPage from './modules/orchestrator/OrchestratorPage';

function AIWrapper({ children }: { children: React.ReactNode }) {
  return <AIProvider>{children}</AIProvider>;
}

function GlobalNyxTrigger() {
  const { profile, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user || !profile?.onboardingComplete || location.pathname === '/orchestrator') {
    return null;
  }

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileHover={{ scale: 1.1, y: -5 }}
      whileTap={{ scale: 0.9 }}
      onClick={() => navigate('/orchestrator')}
      className="fixed bottom-8 right-8 z-[100] flex items-center gap-3 px-6 py-4 bg-indigo-600/90 backdrop-blur-xl border border-indigo-400/30 rounded-full shadow-[0_0_30px_rgba(99,102,241,0.4)] group overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <Sparkles className="w-5 h-5 text-white" />
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white italic">Consult Nyx</span>
    </motion.button>
  );
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
      <GlobalNyxTrigger />
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
