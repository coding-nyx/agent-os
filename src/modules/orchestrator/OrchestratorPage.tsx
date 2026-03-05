import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { useAuth } from '@/lib/auth-context';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { User, Shield, Sparkles, ArrowRight, Check, BrainCircuit, Activity, Database, ChevronRight, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GenderPersonality, CoreUserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';

type OnboardingStep = 'IDENTITY' | 'BIO' | 'PERSONALITY' | 'REVIEW';

export default function OrchestratorPage() {
  const { user, profile, refreshProfile, initializeNewUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<OnboardingStep>('IDENTITY');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // If we're authenticated but have no profile record at all, initialize it first
    if (user && !profile && !isSubmitting) {
        initializeNewUser();
    }
  }, [user, profile, initializeNewUser, isSubmitting]);

  // Form State
  const [name, setName] = useState(profile?.preferredName || '');
  const [pronouns, setPronouns] = useState(profile?.pronouns || '');
  const [age, setAge] = useState<number | undefined>(profile?.age);
  const [sex, setSex] = useState<'female' | 'male' | undefined>(profile?.assignedSexAtBirth);
  const [gender, setGender] = useState(profile?.genderIdentity || '');

  // Personality State
  const [orchAlias, setOrchAlias] = useState(profile?.agentPersonalityProvision?.orchestratorAlias || 'Agnes');
  const [moduleAliases, setModuleAliases] = useState(profile?.agentPersonalityProvision?.moduleAliases || { therapy: 'Agnes', trainer: 'Titan', ledger: 'Ledger' });
  const [moduleGenders, setModuleGenders] = useState<CoreUserProfile['agentPersonalityProvision']['moduleGenderProfiles']>(profile?.agentPersonalityProvision?.moduleGenderProfiles || { orchestrator: 'female', therapy: 'female', trainer: 'female', ledger: 'female' });

  useEffect(() => {
    if (profile?.onboardingComplete) {
      navigate('/hub');
    }
  }, [profile, navigate]);

  const handleComplete = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const updates = {
        preferredName: name,
        pronouns,
        age,
        assignedSexAtBirth: sex,
        genderIdentity: gender,
        agentPersonalityProvision: {
          orchestratorAlias: orchAlias,
          moduleAliases,
          moduleGenderProfiles: moduleGenders,
          personaOverlays: {}
        },
        onboardingComplete: true,
        schemaVersion: 2
      };

      await CoreProfileService.updateProfile(user.uid, updates);
      await refreshProfile();
      navigate('/hub');
    } catch (e) {
      console.error("Failed to complete onboarding:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-3 mb-12">
      {(['IDENTITY', 'BIO', 'PERSONALITY', 'REVIEW'] as OnboardingStep[]).map((s, i) => (
        <React.Fragment key={s}>
          <div className={cn(
            "w-2.5 h-2.5 rounded-full transition-all duration-500",
            step === s ? "bg-indigo-500 scale-125 shadow-[0_0_10px_rgba(99,102,241,0.5)]" : 
            (i < ['IDENTITY', 'BIO', 'PERSONALITY', 'REVIEW'].indexOf(step) ? "bg-indigo-500/40" : "bg-white/10")
          )} />
          {i < 3 && <div className="w-8 h-px bg-white/5" />}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <ModuleLayout title="Agnes Orchestrator" themeColor="indigo">
      <div className="h-full flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full">
        
        <div className="w-full max-w-2xl">
          <StepIndicator />

          <AnimatePresence mode="wait">
            {step === 'IDENTITY' && (
              <motion.div key="identity" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                <div className="text-center space-y-3">
                  <h2 className="text-4xl font-black italic tracking-tighter uppercase text-white">Neural Identity</h2>
                  <p className="text-white/40 text-sm italic font-medium">How should AGNES address you within the nexus?</p>
                </div>
                
                <div className="space-y-6 bg-white/[0.02] border border-white/5 p-10 rounded-[40px] backdrop-blur-3xl">
                  <NeuralInput label="Preferred Name" icon={<User className="w-4 h-4" />} placeholder="What should we call you?" value={name} onChange={(e) => setName(e.target.value)} />
                  <NeuralInput label="Pronouns" icon={<Sparkles className="w-4 h-4" />} placeholder="e.g. They/Them, She/Her" value={pronouns} onChange={(e) => setPronouns(e.target.value)} />
                  
                  <NeuralButton size="xl" className="w-full mt-4" disabled={!name || !pronouns} onClick={() => setStep('BIO')}>
                    Initialize Baseline <ArrowRight className="w-4 h-4 ml-2" />
                  </NeuralButton>
                </div>
              </motion.div>
            )}

            {step === 'BIO' && (
              <motion.div key="bio" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                <div className="text-center space-y-3">
                  <h2 className="text-4xl font-black italic tracking-tighter uppercase text-white">Biological Baseline</h2>
                  <p className="text-white/40 text-sm italic font-medium">This data calibrates Titan Performance and Ledger Medical protocols.</p>
                </div>

                <div className="space-y-8 bg-white/[0.02] border border-white/5 p-10 rounded-[40px] backdrop-blur-3xl">
                  <div className="grid grid-cols-2 gap-6">
                    <NeuralInput label="Age" type="number" placeholder="Years" value={age?.toString() || ''} onChange={(e) => setAge(parseInt(e.target.value))} />
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-4 italic">Assigned Sex</label>
                        <div className="flex gap-2">
                            {['female', 'male'].map((s) => (
                                <button key={s} onClick={() => setSex(s as any)} className={cn(
                                    "flex-1 py-3.5 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                    sex === s ? "bg-indigo-500/20 border-indigo-500 text-indigo-400" : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                                )}>{s}</button>
                            ))}
                        </div>
                    </div>
                  </div>

                  <NeuralInput label="Gender Identity" icon={<Shield className="w-4 h-4" />} placeholder="How do you identify?" value={gender} onChange={(e) => setGender(e.target.value)} />

                  <div className="flex gap-4">
                    <NeuralButton variant="secondary" size="xl" className="flex-1" onClick={() => setStep('IDENTITY')}>Back</NeuralButton>
                    <NeuralButton size="xl" className="flex-[2]" onClick={() => setStep('PERSONALITY')}>Configure Nexus</NeuralButton>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'PERSONALITY' && (
              <motion.div key="personality" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                <div className="text-center space-y-3">
                  <h2 className="text-4xl font-black italic tracking-tighter uppercase text-white">Neural Naming</h2>
                  <p className="text-white/40 text-sm italic font-medium">Customize the personas of your neural agents.</p>
                </div>

                <div className="space-y-6 bg-white/[0.02] border border-white/5 p-8 rounded-[40px] backdrop-blur-3xl overflow-y-auto max-h-[50vh] no-scrollbar">
                  {/* Orchestrator / Therapy */}
                  <div className="space-y-4 p-6 rounded-3xl bg-white/5 border border-white/5">
                    <div className="flex items-center gap-3 mb-2">
                        <BrainCircuit className="w-4 h-4 text-indigo-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Therapy / Orchestrator</span>
                    </div>
                    <NeuralInput placeholder="Alias" value={orchAlias} onChange={(e) => { setOrchAlias(e.target.value); setModuleAliases({...moduleAliases, therapy: e.target.value}); }} />
                    <div className="grid grid-cols-4 gap-2">
                        {(['female', 'male', 'non-binary', 'gender-fluid'] as GenderPersonality[]).map(g => (
                            <button key={g} onClick={() => setModuleGenders({...moduleGenders, orchestrator: g, therapy: g})} className={cn(
                                "py-2 rounded-xl border text-[8px] font-black uppercase tracking-tighter transition-all",
                                moduleGenders.orchestrator === g ? "bg-indigo-500/20 border-indigo-500 text-indigo-400" : "bg-white/5 border-white/5 text-white/20"
                            )}>{g}</button>
                        ))}
                    </div>
                  </div>

                  {/* Trainer */}
                  <div className="space-y-4 p-6 rounded-3xl bg-white/5 border border-white/5">
                    <div className="flex items-center gap-3 mb-2">
                        <Activity className="w-4 h-4 text-orange-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Titan Trainer</span>
                    </div>
                    <NeuralInput placeholder="Alias" value={moduleAliases.trainer} onChange={(e) => setModuleAliases({...moduleAliases, trainer: e.target.value})} />
                    <div className="grid grid-cols-4 gap-2">
                        {(['female', 'male', 'non-binary', 'gender-fluid'] as GenderPersonality[]).map(g => (
                            <button key={g} onClick={() => setModuleGenders({...moduleGenders, trainer: g})} className={cn(
                                "py-2 rounded-xl border text-[8px] font-black uppercase tracking-tighter transition-all",
                                moduleGenders.trainer === g ? "bg-orange-500/20 border-orange-500 text-orange-400" : "bg-white/5 border-white/5 text-white/20"
                            )}>{g}</button>
                        ))}
                    </div>
                  </div>

                  {/* Ledger */}
                  <div className="space-y-4 p-6 rounded-3xl bg-white/5 border border-white/5">
                    <div className="flex items-center gap-3 mb-2">
                        <Database className="w-4 h-4 text-cyan-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">The Ledger</span>
                    </div>
                    <NeuralInput placeholder="Alias" value={moduleAliases.ledger} onChange={(e) => setModuleAliases({...moduleAliases, ledger: e.target.value})} />
                    <div className="grid grid-cols-4 gap-2">
                        {(['female', 'male', 'non-binary', 'gender-fluid'] as GenderPersonality[]).map(g => (
                            <button key={g} onClick={() => setModuleGenders({...moduleGenders, ledger: g})} className={cn(
                                "py-2 rounded-xl border text-[8px] font-black uppercase tracking-tighter transition-all",
                                moduleGenders.ledger === g ? "bg-cyan-500/20 border-cyan-500 text-cyan-400" : "bg-white/5 border-white/5 text-white/20"
                            )}>{g}</button>
                        ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <NeuralButton variant="secondary" size="xl" className="flex-1" onClick={() => setStep('BIO')}>Back</NeuralButton>
                  <NeuralButton size="xl" className="flex-[2]" onClick={() => setStep('REVIEW')}>Finalize Protocol</NeuralButton>
                </div>
              </motion.div>
            )}

            {step === 'REVIEW' && (
                <motion.div key="review" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-8">
                    <div className="text-center space-y-3">
                        <div className="w-20 h-20 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(99,102,241,0.3)] animate-pulse">
                            <Settings2 className="w-10 h-10 text-indigo-400" />
                        </div>
                        <h2 className="text-4xl font-black italic tracking-tighter uppercase text-white">Review Protocol</h2>
                        <p className="text-white/40 text-sm italic font-medium">Confirm your neural configuration before synchronization.</p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-10 rounded-[40px] backdrop-blur-3xl space-y-8">
                        <div className="grid grid-cols-2 gap-10">
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 italic">Identity Baseline</h4>
                                <div className="space-y-2">
                                    <p className="text-xs text-white/60 font-medium">Name: <span className="text-white">{name}</span></p>
                                    <p className="text-xs text-white/60 font-medium">Pronouns: <span className="text-white">{pronouns}</span></p>
                                    <p className="text-xs text-white/60 font-medium">Identity: <span className="text-white">{gender || 'Not specified'}</span></p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 italic">Agent Config</h4>
                                <div className="space-y-2">
                                    <p className="text-xs text-white/60 font-medium">Orchestrator: <span className="text-white">{orchAlias} ({moduleGenders.orchestrator})</span></p>
                                    <p className="text-xs text-white/60 font-medium">Trainer: <span className="text-white">{moduleAliases.trainer} ({moduleGenders.trainer})</span></p>
                                    <p className="text-xs text-white/60 font-medium">Medical: <span className="text-white">{moduleAliases.ledger} ({moduleGenders.ledger})</span></p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-white/5">
                            <NeuralButton size="xl" className="w-full" loading={isSubmitting} onClick={handleComplete}>
                                <Check className="w-4 h-4 mr-2" /> Commit to Nexus
                            </NeuralButton>
                            <button onClick={() => setStep('PERSONALITY')} disabled={isSubmitting} className="w-full mt-4 text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors italic">Re-adjust Config</button>
                        </div>
                    </div>
                </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </ModuleLayout>
  );
}
