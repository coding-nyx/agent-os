import React, { Suspense, useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useVault } from '@/lib/vault-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { UnifiedAuthModal, AuthMode } from '@/core/components/UnifiedAuthModal';
import { cn } from '@/lib/utils';
import { ModuleId } from '@/lib/module-manifest';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import type { SpineEvent } from '@/lib/types';
import { useModules, useModuleStats, useHubLayout } from './hooks';
import { HubViewSwitcher, HubBottomDashboard } from './components/HubControls';
import { CardsView } from './components/cards/CardsView';
import { GraphView } from './components/graph/GraphView';
import { DailyBrief } from './components/DailyBrief';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

import { NeuralButton } from '@/core/components/NeuralButton';

const ThreeDView = React.lazy(() => import('./components/three/ThreeDView'));

type ViewMode = '3D' | 'GRAPH' | 'CARDS';

export default function HubPage() {
  const navigate = useNavigate();
  const { isModuleAccessible } = useVault();
  const { globalSoul } = useGlobalSoul();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('global');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('nexus-hub-view');
    return (saved === '3D' || saved === 'GRAPH' || saved === 'CARDS') ? saved : 'CARDS';
  });
  const [webglError, setWebglError] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  );
  const [showBottomDashboard, setShowBottomDashboard] = useState(false);

  useEffect(() => {
    if (viewMode === '3D' && webglError) {
      setViewMode('CARDS');
    }
    localStorage.setItem('nexus-hub-view', viewMode);
  }, [viewMode, webglError]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [edgePulse, setEdgePulse] = useState(0);
  const [edgePulsePriority, setEdgePulsePriority] = useState<SpineEvent['priority']>('info');
  const edgePulseRef = useRef<{ at: number; priority: SpineEvent['priority'] }>({ at: 0, priority: 'info' });

  const modules = useModules();
  const { podLayout, spinePoints, orchestratorNodes } = useHubLayout(modules);

  const openAuth = useCallback((mode: AuthMode) => {
    setAuthMode(mode);
    setIsAuthOpen(true);
  }, []);

  const pushSpineEvent = useCallback((event: SpineEvent) => {
    edgePulseRef.current = { at: Date.now(), priority: event.priority };
    setEdgePulsePriority(event.priority);
    setEdgePulse(1);
  }, []);

  useSpineEvent('*', pushSpineEvent, { minPriority: 'alert' });

  // Edge pulse decay with debounced state updates — skips when tab is hidden
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (!edgePulseRef.current.at) {
        setEdgePulse((prev) => (prev === 0 ? prev : 0));
        return;
      }
      const elapsed = Date.now() - edgePulseRef.current.at;
      const newDecay = Math.max(0, 1 - elapsed / 1600);
      setEdgePulse((prev) => (Math.abs(newDecay - prev) > 0.05 ? newDecay : prev));
    }, 120);
    return () => window.clearInterval(interval);
  }, []);

  // Reset cursor when leaving 3D view
  useEffect(() => {
    if (viewMode !== '3D') document.body.style.cursor = 'default';
  }, [viewMode]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const moduleAccess = useMemo(() => {
    return modules.reduce<Record<string, boolean>>((acc, module) => {
      acc[module.id] = isModuleAccessible(module.id as ModuleId);
      return acc;
    }, {});
  }, [modules, isModuleAccessible]);

  const handleModuleNavigate = useCallback(
    (moduleId: string, route: string) => {
      if (moduleAccess[moduleId]) {
        navigate(route);
        return;
      }
      openAuth(moduleId as AuthMode);
    },
    [moduleAccess, navigate, openAuth]
  );

  const lockedModules = useMemo(() => modules.filter((m) => !moduleAccess[m.id]), [modules, moduleAccess]);
  const primaryLockedModule = lockedModules[0]?.id as ModuleId | undefined;

  const moduleStats = useModuleStats(globalSoul, moduleAccess);

  const reducedMotion = useReducedMotion();
  const edgePulseBoost = edgePulsePriority === 'critical' ? 1.5 : edgePulsePriority === 'alert' ? 1.2 : 0.8;
  const edgeIntensity = Math.min(1, edgePulse * edgePulseBoost);

  const cnsFatigue = globalSoul?.crossFunctionalState?.biological?.cnsFatigue;
  const emotionalResilience = globalSoul?.crossFunctionalState?.emotional?.emotionalResilience;
  const coreModulesAccessible = ['agnes', 'titan', 'ledger', 'atlas'].every((id) => moduleAccess[id as ModuleId]);
  const stabilityGauge = moduleAccess.titan && typeof cnsFatigue === 'number'
    ? Math.max(0, Math.min(100, 100 - cnsFatigue * 10)) : null;
  const resilienceGauge = moduleAccess.agnes && typeof emotionalResilience === 'number'
    ? Math.max(0, Math.min(100, emotionalResilience * 10)) : null;
  const wellnessGauge = coreModulesAccessible ? globalSoul?.overallWellnessScore ?? null : null;

  return (
    <ModuleLayout title="Neural Hub" themeColor="violet" hideBack={false} onExit={() => navigate('/nexus')}>
      <div className="flex-1 relative flex flex-col w-full h-full min-h-0 bg-[#020205]">

        {/* Breathing ambient background */}
        <div className="absolute inset-0 hub-ambient pointer-events-none" aria-hidden="true" />
{/* Universal spine pulse overlay */}
<AnimatePresence>
  {edgePulse > 0.3 && (
    <motion.div
      key="spine-pulse"
      initial={reducedMotion ? false : { opacity: 0, scale: 0.8 }}
      animate={reducedMotion ? { opacity: edgeIntensity * 0.12 } : { opacity: edgeIntensity * 0.12, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={reducedMotion ? { duration: 0 } : undefined}
      className="absolute inset-0 z-[var(--z-base)] pointer-events-none"
      style={{ background: 'radial-gradient(circle at center, rgba(139,92,246,0.25) 0%, transparent 70%)' }}
    />
  )}
</AnimatePresence>

        {/* --- View Mode Content --- */}
        {/* 3D Canvas Background (lazy loaded) — sits behind everything at z-0 */}
        <div
          className={cn(
            "absolute inset-0 z-0 transition-opacity duration-1000",
            viewMode === '3D' && !webglError ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          style={{ touchAction: 'none' }}
        >
          {viewMode === '3D' && !webglError && (
            <Canvas
              camera={{ position: [0, 5, 20], fov: 50 }}
              dpr={1}
              performance={{ min: 0.5 }}
              gl={{ 
                antialias: false, 
                alpha: true,
                powerPreference: "low-power",
                stencil: false,
                depth: true
              }}
              onError={(err) => {
                console.warn('[Hub3D] WebGL initialization failed:', err);
                setWebglError(true);
              }}
              style={{ touchAction: 'none' }}
            >
              <color attach="background" args={['#020205']} />
              <fogExp2 attach="fog" args={['#020205', 0.045]} />
              <Suspense fallback={null}>
                <ThreeDView
                  podLayout={podLayout}
                  spinePoints={spinePoints}
                  moduleAccess={moduleAccess}
                  globalSoul={globalSoul}
                  onModuleNavigate={handleModuleNavigate}
                />
              </Suspense>
            </Canvas>
          )}
        </div>

        {/* Content Layers — flex column so the switcher sits above the scroll area in normal flow */}
        <div className="absolute inset-0 z-[var(--z-content)] flex flex-col pointer-events-none">

          {/* View Switcher — top of the flex column; no absolute positioning, never overlaps cards */}
          <div className="relative z-[var(--z-fab)] flex justify-center pt-4 pb-2 pointer-events-auto shrink-0">
            <HubViewSwitcher viewMode={viewMode} setViewMode={setViewMode} hide3D={webglError} />
          </div>

          <AnimatePresence mode="wait">
            {viewMode === 'CARDS' && (
              <CardsView
                key="cards"
                modules={modules}
                moduleAccess={moduleAccess}
                moduleStats={moduleStats}
                displayNames={globalSoul?.displayNames}
                onModuleNavigate={handleModuleNavigate}
              />
            )}

            {viewMode === 'GRAPH' && (
              <GraphView
                key="graph"
                orchestratorNodes={orchestratorNodes}
                moduleStats={moduleStats}
                moduleAccess={moduleAccess}
                hoveredNodeId={hoveredNodeId}
                edgeIntensity={edgeIntensity}
                onModuleNavigate={handleModuleNavigate}
                setHoveredNodeId={setHoveredNodeId}
              />
            )}

            {viewMode === '3D' && (
              <motion.div
                key="3d"
                role="tabpanel"
                id="panel-3d"
                aria-labelledby="tab-3d"
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reducedMotion ? { duration: 0 } : undefined}
                className="flex-1 pointer-events-none"
              />
            )}
          </AnimatePresence>

          {/* Bottom Dashboard */}
          <div className="shrink-0 max-h-[30vh] md:max-h-none overflow-y-auto pointer-events-auto">
            {isMobile ? (
              <div className="px-4 pb-4">
                <NeuralButton
                  onClick={() => setShowBottomDashboard((v) => !v)}
                  variant="secondary"
                  size="sm"
                  className="w-full text-[11px] font-bold uppercase tracking-[0.16em]"
                >
                  {showBottomDashboard ? 'Hide System Status' : 'Show System Status'}
                </NeuralButton>
                {showBottomDashboard && (
                  <HubBottomDashboard
                    lockedModules={lockedModules}
                    wellnessGauge={wellnessGauge}
                    stabilityGauge={stabilityGauge}
                    resilienceGauge={resilienceGauge}
                    openAuth={openAuth}
                    primaryLockedModule={primaryLockedModule}
                  />
                )}
              </div>
            ) : (
              <HubBottomDashboard
                lockedModules={lockedModules}
                wellnessGauge={wellnessGauge}
                stabilityGauge={stabilityGauge}
                resilienceGauge={resilienceGauge}
                openAuth={openAuth}
                primaryLockedModule={primaryLockedModule}
              />
            )}
          </div>
        </div>
      </div>
      <UnifiedAuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} mode={authMode} />
    </ModuleLayout>
  );
}
