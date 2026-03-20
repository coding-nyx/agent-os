import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Heart, Pill, FlaskConical, ChevronRight, SkipForward, CheckCircle2 } from 'lucide-react';
import { SOMA_MEDICAL_DISCLAIMER } from '../prompts/soma-prompt-builder';
import { saveSomaProfile, createEmptySomaProfile } from '../services/soma-profile-service';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import type { SomaProfile } from '../types';

interface SomaOnboardingProps {
  profile: SomaProfile | null;
  userId: string;
  encryptionKey: CryptoKey;
  onComplete: () => void;
}

type Step = 0 | 1 | 2;

const STEPS = [
  { label: 'Conditions & Allergies', icon: Heart },
  { label: 'Medications', icon: Pill },
  { label: 'Health Information', icon: FlaskConical },
] as const;

function parseLines(text: string): string[] {
  return text.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
}

export function SomaOnboarding({ profile, userId, encryptionKey, onComplete }: SomaOnboardingProps) {
  const [step, setStep] = useState<Step>(0);
  const [conditions, setConditions] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medications, setMedications] = useState('');
  const [lastCheckup, setLastCheckup] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveAndComplete = useCallback(async (data: Partial<SomaProfile>) => {
    setSaving(true);
    setError(null);
    try {
      const base = profile ?? createEmptySomaProfile(userId);
      await saveSomaProfile(
        {
          ...base,
          ...data,
          userId,
          medicalOnboardingComplete: true,
          updatedAt: new Date().toISOString(),
        },
        { userId, encryptionKey }
      );
      onComplete();
    } catch (err) {
      setError('Failed to save. Please try again.');
      console.error('[SomaOnboarding] Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [profile, userId, encryptionKey, onComplete]);

  const handleSkip = useCallback(() => {
    saveAndComplete({});
  }, [saveAndComplete]);

  const handleComplete = useCallback(() => {
    saveAndComplete({
      knownConditions: parseLines(conditions),
      allergies: parseLines(allergies),
      medications: parseLines(medications),
      lastCheckup: lastCheckup || undefined,
    });
  }, [saveAndComplete, conditions, allergies, medications, lastCheckup]);

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto">
      <div className="w-full max-w-2xl bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-gradient-to-r from-[var(--module-accent-faint)] to-transparent">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--module-color-400)] opacity-70 mb-1">
            SOMA — MEDICAL INTAKE
          </p>
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--module-color-400)]">
            Health Setup
          </h2>
          <p className="text-xs text-white/50 mt-1 leading-relaxed max-w-lg">
            Optional medical context helps Soma provide accurate readiness assessment and clearance tracking.
          </p>
        </div>

        {/* Medical disclaimer */}
        <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <p className="text-[10px] text-amber-300/60 leading-relaxed">{SOMA_MEDICAL_DISCLAIMER}</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 px-6 pt-5">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.label}>
              <div className={cn(
                'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                i === step ? 'text-[var(--module-color-400)]' : i < step ? 'text-white/40' : 'text-white/20'
              )}>
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                  i === step
                    ? 'bg-[var(--module-accent-glow)] border border-[var(--module-accent-border)] text-[var(--module-color-300)]'
                    : i < step
                    ? 'bg-white/10 border border-white/20 text-white/50'
                    : 'bg-white/5 border border-white/10 text-white/20'
                )}>
                  {i < step ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <span className="text-[9px] font-black">{i + 1}</span>
                  )}
                </div>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-white/10" />}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <div className="p-6 space-y-4">
          {step === 0 && (
            <>
              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                  Known Medical Conditions
                </label>
                <NeuralTextarea
                  value={conditions}
                  onChange={e => setConditions(e.target.value)}
                  placeholder="e.g. Type 2 Diabetes, Hypertension (one per line or comma-separated)"
                  rows={3}
                  className="w-full resize-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                  Allergies
                </label>
                <NeuralTextarea
                  value={allergies}
                  onChange={e => setAllergies(e.target.value)}
                  placeholder="e.g. Penicillin, Latex, Shellfish (one per line or comma-separated)"
                  rows={2}
                  className="w-full resize-none transition-colors"
                />
              </div>
            </>
          )}

          {step === 1 && (
            <div>
              <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                Current Medications & Supplements
              </label>
              <NeuralTextarea
                value={medications}
                onChange={e => setMedications(e.target.value)}
                placeholder="e.g. Metformin 500mg, Vitamin D 2000IU, Omega-3 (one per line or comma-separated)"
                rows={5}
                className="w-full resize-none transition-colors"
              />
              <p className="text-xs text-white/30 mt-2">
                Include dosage where relevant for better analysis.
              </p>
            </div>
          )}

          {step === 2 && (
            <div>
              <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                Date of Last Medical Checkup
              </label>
              <NeuralInput
                type="date"
                value={lastCheckup}
                onChange={e => setLastCheckup(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="bg-white/5"
              />
              <p className="text-xs text-white/30 mt-2">
                Leave blank if you have not had a recent checkup.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400" role="alert">{error}</p>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 pb-6">
          <NeuralButton
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={saving}
            className="flex items-center gap-1.5 text-white/40 hover:text-white/60"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip setup
          </NeuralButton>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <NeuralButton
                variant="secondary"
                size="sm"
                onClick={() => setStep(s => (s - 1) as Step)}
                disabled={saving}
                className="font-semibold text-white/60 hover:text-white/80"
              >
                Back
              </NeuralButton>
            )}
            {step < 2 ? (
              <NeuralButton
                size="sm"
                themeColor="module"
                onClick={() => setStep(s => (s + 1) as Step)}
                disabled={saving}
                className="flex items-center gap-1.5 font-semibold"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </NeuralButton>
            ) : (
              <NeuralButton
                size="sm"
                themeColor="module"
                loading={saving}
                onClick={handleComplete}
                className="flex items-center gap-1.5 font-semibold"
              >
                Complete Setup
                <CheckCircle2 className="w-3.5 h-3.5" />
              </NeuralButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
