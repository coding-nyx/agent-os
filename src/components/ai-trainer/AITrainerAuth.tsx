import React, { useEffect, useMemo, useState } from 'react';
import { useAITrainer } from './AITrainerContext';
import { Button } from '../ui/button';
import { Lock, UserPlus, ArrowRight, ArrowLeft, CheckCircle2, ShieldCheck, Dumbbell, Sparkles, Save, Zap, Activity } from 'lucide-react';
import { AITrainerProfile } from '../../lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { useVault } from '../../lib/vault-context';
import { useNavigate } from 'react-router-dom';

export const AITrainerAuth = () => {
  const { unlock, setupProfile, hasProfile, isGuest, profile, isLoading, error, lastPersistenceError } = useAITrainer();
  const { hasTherapyVault, isUnlocked, getSessionPassword } = useVault();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(!hasProfile || isGuest);

  // Re-sync isRegistering when hasProfile changes (e.g., after loading finishes)
  useEffect(() => {
    if (hasProfile && !isGuest) {
      setIsRegistering(false);
    }
  }, [hasProfile, isGuest]);

  const [step, setStep] = useState(isGuest ? 4 : 0); // Step 0 is Tracking Level Selection
  const [trackingLevel, setTrackingLevel] = useState<'standard' | 'indepth'>(profile?.trackingLevel || 'standard');

  // Setup state
  const [name, setName] = useState(profile?.name || '');
  const [gender, setGender] = useState(profile?.gender || 'male');
  const [traits, setTraits] = useState(profile?.traits.join(', ') || 'Motivating, Strict');
  const [goals, setGoals] = useState(profile?.goals.join(', ') || 'Build Muscle, Lose Fat');

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password) await unlock(password);
  };

  const effectivePassword = useMemo(() => {
    if (password) return password;
    if (hasTherapyVault && isUnlocked) {
      return getSessionPassword() || '';
    }
    return '';
  }, [password, hasTherapyVault, isUnlocked, getSessionPassword]);

  useEffect(() => {
    if (effectivePassword && !password) {
      setPassword(effectivePassword);
    }
  }, [effectivePassword, password]);

  const handleSetup = async () => {
    if (!effectivePassword || !name) return;

    const newProfile: AITrainerProfile = {
      ...profile,
      name,
      gender,
      trackingLevel,
      traits: traits.split(',').map(t => t.trim()),
      goals: goals.split(',').map(g => g.trim()),
      onboardingComplete: false,
    };
    await setupProfile(effectivePassword, newProfile);
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[50vh] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-muted-foreground animate-pulse font-medium">Synchronizing Neural Data...</p>
      </div>
    );
  }

  if (hasProfile && !isRegistering && !isGuest) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto mt-20 p-8 bg-card rounded-2xl border shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50"></div>
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-primary/10 rounded-full">
            <Lock className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center mb-2">Access Secure Vault</h2>
        <p className="text-muted-foreground text-center mb-8 italic">Enter your key to decrypt your training data.</p>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <input
              type="password"
              placeholder="Encryption Password"
              className="w-full p-4 bg-background border rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm text-center font-medium bg-red-500/10 p-2 rounded-lg">{error}</p>}
          <Button type="submit" className="w-full py-7 text-lg font-bold rounded-xl shadow-lg">
             Unlock Dashboard
             <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </form>
      </motion.div>
    );
  }

  return (
    <div className="max-w-xl mx-auto mt-10 p-8 bg-card rounded-2xl border shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-muted">
         <motion.div
            className="h-full bg-primary"
            initial={{ width: "20%" }}
            animate={{ width: `${((step + 1) / 5) * 100}%` }}
         />
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
             <motion.div
               key="step0"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="space-y-6"
             >
               <div className="flex justify-center">
                 <div className="p-4 bg-primary/10 rounded-full">
                   <Zap className="w-10 h-10 text-primary" />
                 </div>
               </div>
               <div className="text-center">
                   <h2 className="text-2xl font-bold uppercase tracking-tighter italic">Select Link Tier</h2>
                   <p className="text-muted-foreground">Define the depth of your biological synchronization.</p>
               </div>

               <div className="grid grid-cols-1 gap-4">
                   <button
                       onClick={() => { setTrackingLevel('standard'); nextStep(); }}
                       className={`p-6 rounded-2xl border-2 text-left transition-all ${trackingLevel === 'standard' ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10' : 'border-muted hover:border-primary/50'}`}
                   >
                       <div className="flex items-center justify-between mb-2">
                           <span className="font-black uppercase italic tracking-widest text-sm">Standard Link</span>
                           <Activity className="w-5 h-5 text-primary" />
                       </div>
                       <p className="text-xs text-muted-foreground leading-relaxed">Focus on physical metrics, supplement consistency, and basic recovery. Professional-grade performance tracking.</p>
                   </button>

                   <button
                       onClick={() => { setTrackingLevel('indepth'); nextStep(); }}
                       className={`p-6 rounded-2xl border-2 text-left transition-all ${trackingLevel === 'indepth' ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10' : 'border-muted hover:border-primary/50'}`}
                   >
                       <div className="flex items-center justify-between mb-2">
                           <span className="font-black uppercase italic tracking-widest text-sm">Indepth Neural Link</span>
                           <Sparkles className="w-5 h-5 text-primary" />
                       </div>
                       <p className="text-xs text-muted-foreground leading-relaxed">Total biological optimization. Correlates hormonal cycles, intimate activity impact, and deep biometric telemetry for elite strategy.</p>
                   </button>
               </div>
             </motion.div>
        )}

        {step === 4 && isGuest && (
             <motion.div
               key="step4"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="space-y-6"
             >
               <div className="flex justify-center">
                 <div className="p-4 bg-orange-500/10 rounded-full">
                   <Save className="w-10 h-10 text-orange-500" />
                 </div>
               </div>
               <div className="text-center">
                   <h2 className="text-2xl font-bold">Secure Your Biometrics</h2>
                   <p className="text-muted-foreground">We've detected your guest progress. Let's encrypt and save it to your permanent vault.</p>
               </div>

               <div className="bg-muted/30 p-4 rounded-xl space-y-2 border">
                   <p className="text-xs font-bold uppercase text-muted-foreground">Current Progress</p>
                   <div className="flex justify-between text-sm">
                       <span>Profile Identity</span>
                       <span className="text-primary font-bold">{profile?.name || 'Active'}</span>
                   </div>
                   <div className="flex justify-between text-sm">
                       <span>Telemetry Logs</span>
                       <span className="text-primary font-bold">Synchronized</span>
                   </div>
               </div>

               <Button onClick={() => setStep(1)} className="w-full py-7 rounded-xl font-bold bg-primary text-primary-foreground shadow-xl">
                   Secure & Migrate Now
                   <ArrowRight className="ml-2 w-5 h-5" />
               </Button>
               <Button variant="ghost" onClick={() => setIsRegistering(false)} className="w-full text-xs text-muted-foreground">
                   Ignore and use cloud vault
               </Button>
             </motion.div>
        )}

        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-primary/10 rounded-full">
                <ShieldCheck className="w-10 h-10 text-primary" />
              </div>
            </div>
            <div className="text-center">
                <h2 className="text-2xl font-bold">Secure Your Data</h2>
                <p className="text-muted-foreground">This password encrypts your health data locally. It is never stored on our servers.</p>
            </div>

            <div className="pt-4">
                {hasTherapyVault && !isUnlocked ? (
                    <div className="bg-muted/40 border rounded-xl p-4 space-y-3">
                        <p className="text-sm text-muted-foreground">You already have a Therapy Vault. Unlock it to reuse the same password for your AI Trainer.</p>
                        <Button onClick={() => navigate('/vault?returnTo=/ai-trainer')} className="w-full">
                            Unlock Existing Vault
                        </Button>
                    </div>
                ) : (
                    <>
                        <label className="block text-sm font-medium mb-2">
                          {hasTherapyVault && isUnlocked ? 'Using Existing Vault Password' : 'Create Encryption Password'}
                        </label>
                        <input
                            type="password"
                            className="w-full p-4 bg-background border rounded-xl focus:ring-2 focus:ring-primary outline-none shadow-inner"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={hasTherapyVault && isUnlocked ? 'Vault password detected' : 'Min 6 characters...'}
                            required={!hasTherapyVault || !isUnlocked}
                            disabled={hasTherapyVault && isUnlocked}
                        />
                    </>
                )}
            </div>

            <Button onClick={nextStep} disabled={effectivePassword.length < 6} className="w-full py-7 rounded-xl font-bold">
                Continue to Profile
                <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex justify-center">
              <div className="p-4 bg-primary/10 rounded-full">
                <Sparkles className="w-10 h-10 text-primary" />
              </div>
            </div>
            <div className="text-center">
                <h2 className="text-2xl font-bold">The Architect</h2>
                <p className="text-muted-foreground">Define your personal trainer's identity and personality.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Trainer Name</label>
                    <input
                        type="text"
                        className="w-full p-3 bg-background border rounded-lg"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Coach X"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Gender Identity</label>
                    <select
                        className="w-full p-3 bg-background border rounded-lg"
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                    >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="non-binary">Non-binary</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Personality Traits</label>
                <input
                    type="text"
                    className="w-full p-3 bg-background border rounded-lg"
                    value={traits}
                    onChange={(e) => setTraits(e.target.value)}
                    placeholder="Motivating, Strict, Analytical..."
                />
            </div>

            <div className="flex gap-4 pt-4">
                <Button variant="outline" onClick={prevStep} className="flex-1 py-6 rounded-xl">Back</Button>
                <Button onClick={nextStep} disabled={!name} className="flex-[2] py-6 rounded-xl font-bold">
                    Next: Your Goals
                    <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex justify-center">
              <div className="p-4 bg-primary/10 rounded-full">
                <Dumbbell className="w-10 h-10 text-primary" />
              </div>
            </div>
            <div className="text-center">
                <h2 className="text-2xl font-bold">The Blueprint</h2>
                <p className="text-muted-foreground">Finalize your goals and activate your trainer.</p>
            </div>

            <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Your Primary Goals</label>
                <textarea
                    rows={3}
                    className="w-full p-3 bg-background border rounded-lg resize-none"
                    value={goals}
                    onChange={(e) => setGoals(e.target.value)}
                    placeholder="e.g. Lose 5kg in 2 months, run a marathon..."
                />
            </div>

            <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 space-y-2">
                <div className="flex items-center gap-2 text-sm text-primary font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    Security Verified
                </div>
                <p className="text-xs text-muted-foreground">Clicking "Initiate" will perform a one-time encryption of these details using your private vault key.</p>
            </div>

            <div className="flex gap-4 pt-4">
                <Button variant="outline" onClick={prevStep} className="flex-1 py-6 rounded-xl">Back</Button>
                <Button onClick={handleSetup} className="flex-[2] py-6 rounded-xl font-bold bg-primary text-primary-foreground shadow-xl shadow-primary/20">
                    Initiate Neural Link
                    <Sparkles className="ml-2 w-5 h-5" />
                </Button>
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            {lastPersistenceError && (
              <div className="mt-2 space-y-2">
                <div className="text-xs text-red-500 text-center bg-red-500/10 p-2 rounded-lg">
                  {lastPersistenceError}
                </div>
                <Button onClick={handleSetup} variant="outline" className="w-full text-xs">
                  Retry Save
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
