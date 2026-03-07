import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { Skeleton } from '@/core/components/Skeleton';
import { GuestModePanel } from '@/core/components/GuestModePanel';
import { useAuth } from '@/lib/auth-context';
import { useModuleProfile, UseModuleProfileOptions } from '@/lib/hooks/use-module-profile';
import { MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';
import { cn } from '@/lib/utils';

export type WorkspaceType = 'focus' | 'lab' | 'command' | 'terminal';

interface UnifiedModulePageProps<TProfile extends { onboardingComplete?: boolean }> {
  moduleId: ModuleId;
  profileOptions: Omit<UseModuleProfileOptions<TProfile>, 'moduleId'>;
  workspaceType?: WorkspaceType;
  renderOnboarding?: React.ComponentType<{ profile: TProfile | null; onComplete: (profile: TProfile) => void }>;
  renderContent: React.ComponentType<{ profile: TProfile | null; encryptionKey: CryptoKey | null }>;
  renderDashboard?: React.ComponentType<{ profile: TProfile | null; encryptionKey: CryptoKey | null }>;
  requireVault?: boolean;
  sessionActive?: boolean;
}

export function UnifiedModulePage<TProfile extends { onboardingComplete?: boolean }>({
  moduleId,
  profileOptions,
  workspaceType = 'command',
  renderOnboarding,
  renderContent,
  renderDashboard,
  requireVault = true,
  sessionActive = false
}: UnifiedModulePageProps<TProfile>) {
  const { isGuest } = useAuth();
  const [guestReady, setGuestReady] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(`nexus_guest_module_${moduleId}`) === 'true';
  });

  const { profile, setProfile, isOnboarding, setIsOnboarding, isLoading, encryptionKey, persistProfile } = useModuleProfile<TProfile>({
    moduleId,
    ...profileOptions
  });

  const manifest = MODULE_MANIFEST[moduleId];
  const themeColor = manifest.themeColor;
  const title = manifest.title;

  // Stabilize render props so inline arrow functions don't cause
  // unmount/remount of the child tree on every parent re-render.
  const renderContentRef = useRef(renderContent);
  renderContentRef.current = renderContent;
  const RenderContent = useMemo(() => {
    return function StableContent(props: { profile: TProfile | null; encryptionKey: CryptoKey | null }) {
      const Comp = renderContentRef.current;
      return <Comp {...props} />;
    };
  }, []);

  const renderOnboardingRef = useRef(renderOnboarding);
  renderOnboardingRef.current = renderOnboarding;
  const RenderOnboarding = useMemo(() => {
    if (!renderOnboarding) return undefined;
    return function StableOnboarding(props: { profile: TProfile | null; onComplete: (profile: TProfile) => void }) {
      const Comp = renderOnboardingRef.current;
      if (!Comp) return null;
      return <Comp {...props} />;
    };
  }, [!!renderOnboarding]);

  const renderDashboardRef = useRef(renderDashboard);
  renderDashboardRef.current = renderDashboard;
  const RenderDashboard = useMemo(() => {
    if (!renderDashboard) return undefined;
    return function StableDashboard(props: { profile: TProfile | null; encryptionKey: CryptoKey | null }) {
      const Comp = renderDashboardRef.current;
      if (!Comp) return null;
      return <Comp {...props} />;
    };
  }, [!!renderDashboard]);

  if (isLoading) {
    return (
      <ModuleLayout title={title} themeColor={themeColor} moduleId={moduleId}>
        <div className="flex-1 flex items-center justify-center p-8">
          <SurfaceCard variant="strong" className="w-full max-w-md p-8 space-y-6 text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] italic text-white/40">
              Initializing {manifest.alias} Neural Link
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4 mx-auto rounded-md" />
              <Skeleton className="h-4 w-2/3 mx-auto rounded-md" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </SurfaceCard>
        </div>
      </ModuleLayout>
    );
  }

  if (isGuest && !guestReady) {
    return (
      <ModuleLayout title={title} themeColor={themeColor} moduleId={moduleId}>
        <GuestModePanel
          moduleId={moduleId}
          onContinue={() => {
            sessionStorage.setItem(`nexus_guest_module_${moduleId}`, 'true');
            setGuestReady(true);
          }}
        />
      </ModuleLayout>
    );
  }

   // Onboarding Screen
  if (isOnboarding && RenderOnboarding) {
    return (
      <ModuleLayout title={`${title} Intake`} themeColor={themeColor} moduleId={moduleId}>
        <RenderOnboarding
          profile={profile}
          onComplete={async (completedProfile) => {
            await persistProfile(completedProfile);
            setProfile(completedProfile);
            setIsOnboarding(false);
          }}
        />
      </ModuleLayout>
    );
  }

  const workspaceContent = (
    <div className={cn(
        "flex-1 flex flex-col w-full mx-auto relative min-h-0",
        workspaceType === 'focus' ? "max-w-4xl" : "max-w-[1600px]"
    )}>
        {/* Background Stages */}
        {workspaceType === 'focus' && (
          <div className="fixed inset-0 z-[-1] pointer-events-none opacity-40">
            <img src="/assets/images/belief_nebula.png" className="w-full h-full object-cover blur-sm" alt="" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#020205]/60 via-transparent to-[#020205]" />
          </div>
        )}

        {workspaceType === 'lab' && (
          <div className="fixed inset-0 z-[-1] pointer-events-none opacity-30">
            <img src="/assets/images/soma.png" className="w-full h-full object-cover" alt="" />
            <div className="absolute inset-0 bg-[#020205]/40 backdrop-blur-[2px]" />
          </div>
        )}

        {(workspaceType === 'command' || workspaceType === 'terminal') && (
          <div className="fixed inset-0 z-[-1] pointer-events-none opacity-10">
            <img src="/assets/images/nerve_line.png" className="w-full h-full object-cover" alt="" />
            <div className="absolute inset-0 bg-gradient-to-tr from-[#020205] via-transparent to-[#020205]/80" />
          </div>
        )}

        {workspaceType === 'command' && (
            <div className="flex-1 flex flex-col lg:flex-row h-full min-w-0">
                {RenderDashboard && (
                    <div className="w-full lg:w-[400px] xl:w-[450px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/5 overflow-y-auto no-scrollbar scrollbar-ghost bg-black/20 backdrop-blur-md">
                        <RenderDashboard profile={profile} encryptionKey={encryptionKey} />
                    </div>
                )}
                <div className="flex-1 flex flex-col h-[600px] lg:h-auto min-h-0 min-w-0">
                    <RenderContent profile={profile} encryptionKey={encryptionKey} />
                </div>
            </div>
        )}

        {workspaceType === 'lab' && (
            <div className="flex-1 flex flex-col lg:flex-row h-full">
                <div className="flex-1 border-b lg:border-b-0 lg:border-r border-white/5 overflow-y-auto no-scrollbar scrollbar-ghost p-8 bg-black/10 backdrop-blur-sm">
                    {RenderDashboard ? (
                      <RenderDashboard profile={profile} encryptionKey={encryptionKey} />
                    ) : (
                      <EmptyState
                        title="Diagnostic Stage Pending"
                        description="Upload lab work or connect devices to populate your clinical dashboard."
                        size="lg"
                      />
                    )}
                </div>
                <div className="w-full lg:w-[450px] xl:w-[500px] flex flex-col h-[600px] lg:h-auto min-h-0 bg-black/20 backdrop-blur-md">
                    <RenderContent profile={profile} encryptionKey={encryptionKey} />
                </div>
            </div>
        )}

        {workspaceType === 'focus' && (
            <div className="flex-1 flex flex-col min-h-0 py-6 relative">
                <div className="flex-1 flex flex-col min-h-0 bg-black/10 backdrop-blur-[1px] rounded-[40px] border border-white/5 shadow-2xl overflow-hidden">
                    <RenderContent profile={profile} encryptionKey={encryptionKey} />
                </div>
                <AnimatePresence>
                    {RenderDashboard && !sessionActive && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 0.6, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="mt-12 hover:opacity-100 transition-opacity"
                        >
                            <RenderDashboard profile={profile} encryptionKey={encryptionKey} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        )}

        {workspaceType === 'terminal' && (
            <div className="flex-1 flex flex-col h-full bg-black/40 backdrop-blur-xl">
                <div className="flex-1 border-b border-white/5 p-4 font-mono text-xs overflow-y-auto no-scrollbar scrollbar-ghost">
                    {RenderDashboard ? <RenderDashboard profile={profile} encryptionKey={encryptionKey} /> : "FILE_SYSTEM_IDLE"}
                </div>
                <div className="h-[40%] flex flex-col min-h-0">
                    <RenderContent profile={profile} encryptionKey={encryptionKey} />
                </div>
            </div>
        )}
    </div>
  );

  return (
    <ModuleLayout title={title} themeColor={themeColor} moduleId={moduleId}>
      {workspaceContent}
    </ModuleLayout>
  );
}
