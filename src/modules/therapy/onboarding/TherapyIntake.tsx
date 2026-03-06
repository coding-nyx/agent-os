import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Sparkles, ArrowRight, Check, Heart, Target, AlertCircle } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

interface TherapyIntakeProps {
    onComplete: (data: any) => void;
}

type IntakeStep = 'GOALS' | 'TRIGGERS' | 'HISTORY' | 'SYNC';

export function TherapyIntake({ onComplete }: TherapyIntakeProps) {
    const [step, setStep] = useState<IntakeStep>('GOALS');
    const [goals, setGoals] = useState('');
    const [triggers, setTriggers] = useState('');
    const [history, setHistory] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const reducedMotion = useReducedMotion();

    const handleSync = async () => {
        setIsSubmitting(true);
        // Simulate a brief neural sync delay for UX immersion
        await new Promise(resolve => setTimeout(resolve, 2000));
        onComplete({ goals, triggers, history, deepIntakeComplete: true });
    };

    return (
        <div className="h-full flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full">
            <AnimatePresence mode="wait">
                {step === 'GOALS' && (
                    <motion.div key="goals" initial={reducedMotion ? false : { opacity: 0, y: 20 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -20 }} transition={reducedMotion ? { duration: 0 } : undefined} className="space-y-8 w-full">
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
                                <Target className="w-8 h-8 text-indigo-400" />
                            </div>
                            <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter">Therapeutic Goals</h2>
                            <p className="text-white/40 text-sm italic font-medium">What breakthroughs are we aiming for in our synchronization?</p>
                        </div>
                        <div className="p-8 bg-white/[0.02] border border-white/5 rounded-[40px] backdrop-blur-3xl space-y-6">
                            <textarea 
                                value={goals} 
                                onChange={(e) => setGoals(e.target.value)}
                                placeholder="Describe what you'd like to work on..."
                                className="w-full h-32 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white placeholder:text-white/40 focus:border-indigo-500/50 outline-none transition-colors no-scrollbar resize-none"
                            />
                            <NeuralButton size="xl" className="w-full" disabled={!goals} onClick={() => setStep('TRIGGERS')}>
                                Next Protocol <ArrowRight className="w-4 h-4 ml-2" />
                            </NeuralButton>
                        </div>
                    </motion.div>
                )}

                {step === 'TRIGGERS' && (
                    <motion.div key="triggers" initial={reducedMotion ? false : { opacity: 0, y: 20 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -20 }} transition={reducedMotion ? { duration: 0 } : undefined} className="space-y-8 w-full">
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="w-8 h-8 text-orange-400" />
                            </div>
                            <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter">Neural Triggers</h2>
                            <p className="text-white/40 text-sm italic font-medium">Are there specific topics or patterns that disrupt your stability?</p>
                        </div>
                        <div className="p-8 bg-white/[0.02] border border-white/5 rounded-[40px] backdrop-blur-3xl space-y-6">
                            <textarea 
                                value={triggers} 
                                onChange={(e) => setTriggers(e.target.value)}
                                placeholder="This helps me maintain your emotional safety..."
                                className="w-full h-32 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white placeholder:text-white/40 focus:border-orange-500/50 outline-none transition-colors no-scrollbar resize-none"
                            />
                            <div className="flex gap-4">
                                <NeuralButton variant="secondary" size="xl" className="flex-1" onClick={() => setStep('GOALS')}>Back</NeuralButton>
                                <NeuralButton size="xl" className="flex-[2]" onClick={() => setStep('HISTORY')}>Continue</NeuralButton>
                            </div>
                        </div>
                    </motion.div>
                )}

                {step === 'HISTORY' && (
                    <motion.div key="history" initial={reducedMotion ? false : { opacity: 0, y: 20 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -20 }} transition={reducedMotion ? { duration: 0 } : undefined} className="space-y-8 w-full">
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto mb-4">
                                <Heart className="w-8 h-8 text-cyan-400" />
                            </div>
                            <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter">Support History</h2>
                            <p className="text-white/40 text-sm italic font-medium">Have you worked with a therapist or neural agent before?</p>
                        </div>
                        <div className="p-8 bg-white/[0.02] border border-white/5 rounded-[40px] backdrop-blur-3xl space-y-6">
                            <textarea 
                                value={history} 
                                onChange={(e) => setHistory(e.target.value)}
                                placeholder="Share any past experiences that are relevant..."
                                className="w-full h-32 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white placeholder:text-white/40 focus:border-cyan-500/50 outline-none transition-colors no-scrollbar resize-none"
                            />
                            <div className="flex gap-4">
                                <NeuralButton variant="secondary" size="xl" className="flex-1" onClick={() => setStep('TRIGGERS')}>Back</NeuralButton>
                                <NeuralButton size="xl" className="flex-[2]" onClick={() => setStep('SYNC')}>Review & Sync</NeuralButton>
                            </div>
                        </div>
                    </motion.div>
                )}

                {step === 'SYNC' && (
                    <motion.div key="sync" initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }} transition={reducedMotion ? { duration: 0 } : undefined} className="space-y-8 w-full text-center">
                        <div className="w-24 h-24 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mx-auto mb-8 shadow-[0_0_50px_rgba(99,102,241,0.3)] animate-pulse">
                            <Shield className="w-12 h-12 text-indigo-400" />
                        </div>
                        <div className="space-y-4">
                            <h2 className="text-4xl font-black italic uppercase text-white tracking-tighter">Baseline Ready</h2>
                            <p className="text-white/40 text-sm italic font-medium leading-relaxed max-w-md mx-auto">Your therapeutic profile is prepared for encryption. This will ground our future sessions in your unique history and goals.</p>
                        </div>
                        <div className="pt-8">
                            <NeuralButton size="xl" className="w-full" loading={isSubmitting} onClick={handleSync}>
                                <Sparkles className="w-4 h-4 mr-2" /> Encrypt & Initialize Session
                            </NeuralButton>
                            <button onClick={() => setStep('GOALS')} disabled={isSubmitting} className="w-full mt-6 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors italic">Re-adjust Protocol</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
