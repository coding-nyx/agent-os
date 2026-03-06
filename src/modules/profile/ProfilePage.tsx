import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CircleDashed, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { NeuralButton } from '@/core/components/NeuralButton';
import { HUB_MODULE_ORDER, MODULE_MANIFEST } from '@/lib/module-manifest';
import { getFirebase } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { requiresModuleOnboarding } from '@/lib/constants';

type ModuleHealth = 'complete' | 'pending' | 'unknown';

const MODULE_STORAGE_MAP: Record<string, { collection: string; guestKey?: string }> = {
  therapy: { collection: 'therapist_profiles', guestKey: 'agnes_therapy_profile_guest' },
  trainer: { collection: 'ai_trainers', guestKey: 'agnes_trainer_profile_guest' },
  soma: { collection: 'soma_profiles', guestKey: 'agnes_soma_profile_guest' },
  ledger: { collection: 'ai_ledgers', guestKey: 'agnes_ledger_profile_guest' },
  atlas: { collection: 'atlas_profiles', guestKey: 'agnes_atlas_profile_guest' },
  scout: { collection: 'scout_knowledge', guestKey: 'agnes_scout_profile_guest' },
  forge: { collection: 'forge_sessions', guestKey: 'agnes_forge_profile_guest' },
  pulse: { collection: 'pulse_profiles', guestKey: 'agnes_pulse_profile_guest' }
};

function parseGuestOnboarding(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { onboardingComplete?: unknown };
    return parsed.onboardingComplete === true;
  } catch {
    return false;
  }
}

function getStatusColor(status: ModuleHealth): string {
  if (status === 'complete') return 'text-emerald-300';
  if (status === 'pending') return 'text-amber-300';
  return 'text-white/35';
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, isGuest, profile } = useAuth();
  const { isUnlocked, hasVault, persistenceMode } = useVault();
  const { globalSoul } = useGlobalSoul();

  const [moduleStates, setModuleStates] = useState<Record<string, ModuleHealth>>({});
  const [loading, setLoading] = useState(true);

  const coreIdentity = useMemo(
    () => ({
      name: profile?.preferredName || 'Unknown',
      email: user?.email || 'Guest Session',
      pronouns: profile?.pronouns || 'Unspecified',
      occupation: profile?.occupation || 'Unspecified',
      onboardingComplete: profile?.onboardingComplete === true
    }),
    [profile, user?.email]
  );

  useEffect(() => {
    let cancelled = false;
    const unsubscribers: Array<() => void> = [];

    if (isGuest || !user) {
      const nextStates: Record<string, ModuleHealth> = {};
      for (const moduleId of HUB_MODULE_ORDER) {
        if (!requiresModuleOnboarding(moduleId)) {
          nextStates[moduleId] = 'complete';
          continue;
        }
        const guestKey = MODULE_STORAGE_MAP[moduleId]?.guestKey;
        const completed = guestKey ? parseGuestOnboarding(localStorage.getItem(guestKey)) : false;
        nextStates[moduleId] = completed ? 'complete' : 'pending';
      }
      if (!cancelled) {
        setModuleStates(nextStates);
        setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    const { db } = getFirebase();
    if (!db) {
      setModuleStates({});
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    const pending = new Set(HUB_MODULE_ORDER);

    for (const moduleId of HUB_MODULE_ORDER) {
      if (!requiresModuleOnboarding(moduleId)) {
        setModuleStates((prev) => ({ ...prev, [moduleId]: 'complete' }));
        pending.delete(moduleId);
        if (pending.size === 0 && !cancelled) setLoading(false);
        continue;
      }
      const map = MODULE_STORAGE_MAP[moduleId];
      if (!map?.collection) {
        setModuleStates((prev) => ({ ...prev, [moduleId]: 'unknown' }));
        pending.delete(moduleId);
        if (pending.size === 0 && !cancelled) setLoading(false);
        continue;
      }

      const ref = doc(db, map.collection, user.uid);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (cancelled) return;
          if (!snap.exists()) {
            setModuleStates((prev) => ({ ...prev, [moduleId]: 'pending' }));
          } else {
            const data = snap.data() as any;
            const completed =
              data?.metadata?.onboardingComplete === true ||
              data?.onboardingComplete === true;
            setModuleStates((prev) => ({ ...prev, [moduleId]: completed ? 'complete' : 'pending' }));
          }

          pending.delete(moduleId);
          if (pending.size === 0 && !cancelled) setLoading(false);
        },
        () => {
          if (cancelled) return;
          setModuleStates((prev) => ({ ...prev, [moduleId]: 'unknown' }));
          pending.delete(moduleId);
          if (pending.size === 0) setLoading(false);
        }
      );
      unsubscribers.push(unsub);
    }

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [user?.uid, isGuest]);

  return (
    <ModuleLayout title="Profile" themeColor="violet">
      <div className="h-full overflow-y-auto no-scrollbar">
        <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-violet-300 font-black">Identity Surface</p>
              <h2 className="text-3xl font-black italic uppercase tracking-tight text-white mt-2">Account + Module Status</h2>
            </div>
            <button
              onClick={() => navigate('/hub')}
              className="px-4 py-2 rounded-2xl border border-white/10 bg-white/[0.03] text-white/70 hover:text-white flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Hub
            </button>
          </div>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/50">Identity</h3>
              <div className="space-y-2 text-sm text-white/75">
                <p><span className="text-white/40">Name:</span> {coreIdentity.name}</p>
                <p><span className="text-white/40">Email:</span> {coreIdentity.email}</p>
                <p><span className="text-white/40">Pronouns:</span> {coreIdentity.pronouns}</p>
                <p><span className="text-white/40">Occupation:</span> {coreIdentity.occupation}</p>
              </div>
              <div className="pt-2">
                <span className={`text-xs uppercase tracking-[0.2em] font-black ${coreIdentity.onboardingComplete ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {coreIdentity.onboardingComplete ? 'CORE_ONBOARDED' : 'CORE_PENDING'}
                </span>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/50">Vault</h3>
              <div className="space-y-3 text-sm text-white/75">
                <p className="flex items-center gap-2">
                  {isUnlocked ? <ShieldCheck className="w-4 h-4 text-emerald-300" /> : <Lock className="w-4 h-4 text-amber-300" />}
                  <span>State: {isUnlocked ? 'UNLOCKED' : hasVault ? 'LOCKED' : 'NOT_INITIALIZED'}</span>
                </p>
                <p className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-violet-300" />
                  <span>Persistence: {persistenceMode}</span>
                </p>
                <p className="text-white/45 text-xs">
                  Global Wellness Score: {globalSoul?.overallWellnessScore ?? 'N/A'}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/50">Module Readiness</h3>
              <span className="text-xs text-white/40 uppercase tracking-[0.2em]">
                {loading ? 'SYNCING...' : 'LIVE'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {HUB_MODULE_ORDER.map((moduleId) => {
                const module = MODULE_MANIFEST[moduleId];
                const status = moduleStates[moduleId] || 'unknown';
                const Icon = module.icon;
                return (
                  <div key={moduleId} className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" style={{ color: module.colorHex }} />
                        <span className="text-sm font-bold text-white/85">{module.title}</span>
                      </div>
                      {status === 'complete' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                      ) : (
                        <CircleDashed className={`w-4 h-4 ${getStatusColor(status)}`} />
                      )}
                    </div>

                    <p className={`text-[10px] uppercase tracking-[0.2em] font-black ${getStatusColor(status)}`}>
                      {status === 'complete' ? 'READY' : status === 'pending' ? 'PENDING' : 'UNKNOWN'}
                    </p>

                    <NeuralButton
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={() => navigate(module.route)}
                    >
                      Open
                    </NeuralButton>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </ModuleLayout>
  );
}
