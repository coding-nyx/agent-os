
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TherapistLayout } from './ui/TherapistLayout';
import { ArtisticAvatar, AvatarState } from './ui/ArtisticAvatar';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea'; // Assuming exists, checking later
import { Input } from '../ui/input'; // Assuming exists
import { useAuth } from '../../lib/auth-context';
import { getFirebase } from '../../lib/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { encryptData } from '../../lib/encryption';
import { OpenRouterProvider } from '../../lib/ai/openrouter';
import { selectPersonaForContext, getPersonaById, getDefaultPersona, THERAPIST_PERSONAS } from '../../lib/ai/personas';
import { BaseContext, Persona, TherapistProfile } from '../../lib/ai/types';
import { Loader2, ShieldCheck } from 'lucide-react';

interface OnboardingFlowProps {
  onComplete: () => void;
}

type Step = 'intro' | 'childhood' | 'trauma' | 'identity' | 'history' | 'goals' | 'analyze' | 'persona' | 'secure';

const STEPS: Step[] = ['intro', 'childhood', 'trauma', 'identity', 'history', 'goals', 'analyze', 'persona', 'secure'];

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { user } = useAuth();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');

  // Form Data
  const [contextData, setContextData] = useState<BaseContext>({
    childhood: '',
    trauma: '',
    identity: '',
    history: '',
    goals: '',
    integratedInsights: []
  });

  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [vaultPassword, setVaultPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const currentStep = STEPS[currentStepIndex];

  const handleNext = async () => {
    if (currentStep === 'goals') {
        // Move to Analyze
        setDirection(1);
        setCurrentStepIndex(prev => prev + 1);
        analyzeProfile();
    } else if (currentStep === 'secure') {
        saveProfile();
    } else {
        setDirection(1);
        setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setDirection(-1);
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const analyzeProfile = async () => {
    setAvatarState('thinking');
    // Simulate analysis delay or call LLM
    try {
        const fullContext = JSON.stringify(contextData);
        // Attempt to use LLM to pick persona
        const llm = new OpenRouterProvider();
        // For now, use the simple heuristic/random function as fallback or primary
        // In a real scenario, we'd prompt the LLM here.
        // Let's use the local helper for speed and reliability in this MVP
        const persona = selectPersonaForContext(fullContext);

        setTimeout(() => {
            setSelectedPersona(persona);
            setAvatarState('idle');
            setCurrentStepIndex(prev => prev + 1); // Move to Persona Reveal
        }, 2000);
    } catch (e) {
        console.error("Analysis failed", e);
        setSelectedPersona(getDefaultPersona());
        setCurrentStepIndex(prev => prev + 1);
    }
  };

  const saveProfile = async () => {
    if (vaultPassword !== confirmPassword) {
        alert("Passwords do not match");
        return;
    }
    if (!vaultPassword) {
        alert("Password required");
        return;
    }
    if (!user || !selectedPersona) return;

    setIsSaving(true);
    setAvatarState('thinking');

    try {
        // Prepare data to encrypt: Context + Selected Persona ID
        const secretData = JSON.stringify({
            context: contextData,
            personaId: selectedPersona.id
        });

        // Encrypt
        const encrypted = await encryptData(secretData, vaultPassword);

        // Save to Firestore
        const profile: TherapistProfile = {
            encryptedData: encrypted.ciphertext,
            iv: encrypted.iv,
            salt: encrypted.salt,
            metadata: {
                hasVault: true,
                hasActiveSession: false,
                lastActive: new Date().toISOString(),
                therapistName: selectedPersona.name,
                sessionCount: 0,
                email: user.email || undefined
            }
        };

        const { db } = getFirebase();
        if (db) {
            await setDoc(doc(db, 'therapist_profiles', user.uid), profile);
        }

        onComplete();
    } catch (e) {
        console.error("Save failed", e);
        alert("Failed to save profile. Please try again.");
        setIsSaving(false);
        setAvatarState('idle');
    }
  };

  // Render helpers
  const renderStepContent = () => {
    switch (currentStep) {
        case 'intro':
            return (
                <div className="text-center space-y-6">
                    <h2 className="text-3xl font-light text-indigo-900 dark:text-indigo-100">Hello. I am your AI Therapist.</h2>
                    <p className="text-lg text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
                        I am here to listen, understand, and guide you.
                        To do that effectively, I need to know a bit about your past, your identity, and your goals.
                    </p>
                    <p className="text-sm text-slate-500">
                        Everything you share is encrypted on your device. Only you hold the key.
                    </p>
                </div>
            );
        case 'childhood':
            return (
                <div className="space-y-4">
                    <h3 className="text-2xl font-light">Let's start from the beginning.</h3>
                    <p className="text-slate-600 dark:text-slate-400">Tell me briefly about your childhood. What was the atmosphere like?</p>
                    <Textarea
                        className="h-40 bg-white/50 dark:bg-black/20 text-lg"
                        placeholder="I grew up in..."
                        value={contextData.childhood}
                        onChange={e => setContextData({...contextData, childhood: e.target.value})}
                    />
                </div>
            );
        case 'trauma':
            return (
                <div className="space-y-4">
                    <h3 className="text-2xl font-light">Difficult moments define us.</h3>
                    <p className="text-slate-600 dark:text-slate-400">Have you experienced significant trauma or loss? It's okay to be brief.</p>
                    <Textarea
                        className="h-40 bg-white/50 dark:bg-black/20 text-lg"
                        placeholder="When I was..."
                        value={contextData.trauma}
                        onChange={e => setContextData({...contextData, trauma: e.target.value})}
                    />
                </div>
            );
        case 'identity':
            return (
                 <div className="space-y-4">
                    <h3 className="text-2xl font-light">Who are you today?</h3>
                    <p className="text-slate-600 dark:text-slate-400">How do you identify yourself? What are your core values?</p>
                    <Textarea
                        className="h-40 bg-white/50 dark:bg-black/20 text-lg"
                        placeholder="I value..."
                        value={contextData.identity as string}
                        onChange={e => setContextData({...contextData, identity: e.target.value})}
                    />
                </div>
            );
        case 'history':
             return (
                 <div className="space-y-4">
                    <h3 className="text-2xl font-light">Your mental health history.</h3>
                    <p className="text-slate-600 dark:text-slate-400">Any past diagnoses, therapy experiences, or recurring struggles?</p>
                    <Textarea
                        className="h-40 bg-white/50 dark:bg-black/20 text-lg"
                        placeholder="I have struggled with..."
                        value={contextData.history}
                        onChange={e => setContextData({...contextData, history: e.target.value})}
                    />
                </div>
            );
        case 'goals':
             return (
                 <div className="space-y-4">
                    <h3 className="text-2xl font-light">Looking forward.</h3>
                    <p className="text-slate-600 dark:text-slate-400">What do you hope to achieve through our sessions?</p>
                    <Textarea
                        className="h-40 bg-white/50 dark:bg-black/20 text-lg"
                        placeholder="I want to..."
                        value={contextData.goals}
                        onChange={e => setContextData({...contextData, goals: e.target.value})}
                    />
                </div>
            );
        case 'analyze':
            return (
                <div className="text-center py-10">
                    <h3 className="text-2xl font-light animate-pulse">Analyzing your profile...</h3>
                    <p className="text-slate-500 mt-4">Connecting the dots to find the best approach for you.</p>
                </div>
            );
        case 'persona':
             if (!selectedPersona) return null;
             return (
                <div className="text-center space-y-6">
                    <h3 className="text-2xl font-light">I think we'll work well together.</h3>
                    <div className="bg-white/60 dark:bg-white/5 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 shadow-sm">
                        <h4 className="text-xl font-semibold text-indigo-700 dark:text-indigo-300">{selectedPersona.name}</h4>
                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wide mt-1">{selectedPersona.role}</p>
                        <p className="mt-4 text-slate-700 dark:text-slate-300 italic">"{selectedPersona.description}"</p>
                    </div>
                    <p className="text-slate-500">I have adapted my personality to best suit your needs.</p>
                </div>
             );
        case 'secure':
            return (
                <div className="space-y-6 max-w-sm mx-auto">
                    <div className="text-center">
                         <div className="inline-flex p-3 bg-indigo-100 dark:bg-indigo-900/50 rounded-full mb-4">
                             <ShieldCheck className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                         </div>
                         <h3 className="text-2xl font-light">Secure your Vault.</h3>
                         <p className="text-slate-500 mt-2">Create a password to encrypt your data. We cannot recover this if lost.</p>
                    </div>

                    <div className="space-y-4">
                        <Input
                            type="password"
                            placeholder="Create Vault Password"
                            value={vaultPassword}
                            onChange={e => setVaultPassword(e.target.value)}
                            className="text-lg py-6"
                        />
                        <Input
                            type="password"
                            placeholder="Confirm Password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className="text-lg py-6"
                        />
                    </div>
                </div>
            );
        default:
            return null;
    }
  };

  return (
    <TherapistLayout title="Onboarding" showBack={false}>
      <div className="flex flex-col h-full max-w-2xl mx-auto">
        {/* Avatar Section */}
        <div className="flex-none py-6 flex justify-center">
            <ArtisticAvatar gender="female" archetype="nurturer" state={avatarState} className="w-32 h-32" />
        </div>

        {/* Dynamic Content */}
        <div className="flex-1 relative overflow-hidden px-4">
            <AnimatePresence mode='wait' initial={false} custom={direction}>
                <motion.div
                    key={currentStep}
                    custom={direction}
                    initial={{ x: direction > 0 ? 50 : -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: direction > 0 ? -50 : 50, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="h-full flex flex-col justify-center"
                >
                    {renderStepContent()}
                </motion.div>
            </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex-none py-8 flex justify-between px-4">
            {currentStepIndex > 0 && currentStep !== 'analyze' && currentStep !== 'secure' && (
                <Button variant="ghost" onClick={handleBack} disabled={isSaving}>
                    Back
                </Button>
            )}
            <div className="flex-1" />

            {currentStep !== 'analyze' && (
                <Button
                    onClick={handleNext}
                    className="min-w-[120px]"
                    disabled={isSaving || (currentStep === 'secure' && (!vaultPassword || vaultPassword !== confirmPassword))}
                >
                    {isSaving ? <Loader2 className="animate-spin" /> : (currentStep === 'secure' ? 'Encrypt & Save' : 'Next')}
                </Button>
            )}
        </div>
      </div>
    </TherapistLayout>
  );
}
