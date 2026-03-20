import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CalendarClock, Sparkles, Stethoscope } from 'lucide-react';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import type {
  TitanRecoveryBodyRegion,
  TitanRecoveryPlan,
  TitanRecoveryReason,
  TitanRecoveryType
} from '@/lib/types';
import { getRecoveryTemplate, RECOVERY_TEMPLATE_LABELS } from '../data/recovery-templates';

export interface RecoveryConsultResult {
  summary: string;
  suggestedType?: TitanRecoveryType;
  suggestedDurationDays?: number;
  rehabTemplateId?: string;
  severity?: 'low' | 'medium' | 'high';
}

export interface RecoveryPlanDraft {
  reasons?: TitanRecoveryReason[];
  type?: TitanRecoveryType;
  durationDays?: number;
  bodyRegion?: TitanRecoveryBodyRegion;
  notes?: string;
}

interface RecoveryPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (plan: TitanRecoveryPlan) => void;
  recoveryScore?: number | null;
  draft?: RecoveryPlanDraft | null;
  somaConsult?: RecoveryConsultResult | null;
  agnesConsult?: RecoveryConsultResult | null;
  pendingConsults?: { soma: boolean; agnes: boolean };
  onRequestConsults: (reasons: TitanRecoveryReason[], bodyRegion?: TitanRecoveryBodyRegion) => void;
  onOpenModule: (moduleId: 'soma' | 'agnes') => void;
}

const reasonOptions: { id: TitanRecoveryReason; label: string; }[] = [
  { id: 'injury', label: 'Injury' },
  { id: 'stress', label: 'Stress overload' },
  { id: 'overtraining', label: 'Overtraining' },
  { id: 'illness', label: 'Illness' },
  { id: 'travel', label: 'Travel' },
  { id: 'deload', label: 'Deload' },
  { id: 'other', label: 'Other' },
];

const bodyRegions: { id: TitanRecoveryBodyRegion; label: string }[] = [
  { id: 'knee', label: 'Knee' },
  { id: 'shoulder', label: 'Shoulder' },
  { id: 'back', label: 'Back' },
  { id: 'hip', label: 'Hip' },
  { id: 'ankle', label: 'Ankle' },
  { id: 'wrist', label: 'Wrist' },
  { id: 'neck', label: 'Neck' },
  { id: 'other', label: 'Other' },
];

const typeOptions: { id: TitanRecoveryType; label: string; }[] = [
  { id: 'rest', label: 'Complete Rest' },
  { id: 'active', label: 'Active Recovery' },
  { id: 'rehab', label: 'Rehab Protocol' },
  { id: 'deload', label: 'Reduced Load' },
];

function suggestType(
  reasons: TitanRecoveryReason[],
  recoveryScore?: number | null,
  soma?: RecoveryConsultResult | null,
  agnes?: RecoveryConsultResult | null
): TitanRecoveryType {
  if (soma?.suggestedType) return soma.suggestedType;
  if (agnes?.suggestedType) return agnes.suggestedType;
  if (reasons.includes('injury')) return 'rehab';
  if (reasons.includes('stress')) return recoveryScore != null && recoveryScore < 40 ? 'rest' : 'active';
  if (reasons.includes('overtraining')) return 'deload';
  if (reasons.includes('illness')) return 'rest';
  if (reasons.includes('travel')) return 'active';
  if (reasons.includes('deload')) return 'deload';
  return 'active';
}

function suggestDuration(
  type: TitanRecoveryType,
  soma?: RecoveryConsultResult | null,
  agnes?: RecoveryConsultResult | null
): number {
  if (soma?.suggestedDurationDays) return soma.suggestedDurationDays;
  if (agnes?.suggestedDurationDays) return agnes.suggestedDurationDays;
  const defaults: Record<TitanRecoveryType, number> = {
    rest: 5,
    active: 5,
    rehab: 14,
    deload: 7,
  };
  return defaults[type];
}

export function RecoveryPlanModal({
  isOpen,
  onClose,
  onConfirm,
  recoveryScore,
  draft,
  somaConsult,
  agnesConsult,
  pendingConsults,
  onRequestConsults,
  onOpenModule
}: RecoveryPlanModalProps) {
  const [step, setStep] = useState(0);
  const [reasons, setReasons] = useState<TitanRecoveryReason[]>(draft?.reasons ?? []);
  const [bodyRegion, setBodyRegion] = useState<TitanRecoveryBodyRegion | undefined>(draft?.bodyRegion);
  const [type, setType] = useState<TitanRecoveryType | null>(draft?.type ?? null);
  const [durationDays, setDurationDays] = useState<number>(draft?.durationDays ?? 5);
  const [notes, setNotes] = useState(draft?.notes ?? '');

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setReasons(draft?.reasons ?? []);
    setBodyRegion(draft?.bodyRegion);
    setType(draft?.type ?? null);
    setDurationDays(draft?.durationDays ?? 5);
    setNotes(draft?.notes ?? '');
  }, [isOpen, draft]);

  const suggestedType = useMemo(
    () => suggestType(reasons, recoveryScore, somaConsult, agnesConsult),
    [reasons, recoveryScore, somaConsult, agnesConsult]
  );

  useEffect(() => {
    if (!type && reasons.length > 0) {
      setType(suggestedType);
    }
  }, [suggestedType, reasons.length, type]);

  useEffect(() => {
    if (type) {
      setDurationDays(suggestDuration(type, somaConsult, agnesConsult));
    }
  }, [type, somaConsult, agnesConsult]);

  const template = type ? getRecoveryTemplate(type, bodyRegion) : null;

  const requiresConsult = reasons.includes('injury') || reasons.includes('stress');

  const handleNext = () => {
    if (step === 0) {
      if (reasons.length === 0) return;
      if (requiresConsult) {
        onRequestConsults(reasons, bodyRegion);
      }
    }
    setStep((s) => Math.min(s + 1, 3));
  };

  const handleConfirm = () => {
    if (!type) return;
    const startDate = new Date().toISOString().slice(0, 10);
    const end = new Date();
    end.setDate(end.getDate() + durationDays);
    const endDate = end.toISOString().slice(0, 10);
    const aiSummary = template
      ? `Focus on ${template.description.toLowerCase()} Reassess daily and keep intensity conservative.`
      : undefined;
    const plan: TitanRecoveryPlan = {
      active: true,
      reasons,
      type,
      startDate,
      endDate,
      suggestedDurationDays: durationDays,
      notes: notes.trim() || undefined,
      templateId: template?.id,
      aiSummary,
      somaSummary: somaConsult?.summary,
      agnesSummary: agnesConsult?.summary,
      bodyRegion,
      severity: somaConsult?.severity ?? agnesConsult?.severity
    };
    onConfirm(plan);
  };

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title="Start Recovery"
      subtitle="Build a recovery plan"
      icon={AlertTriangle}
      themeColor="module"
      maxWidth="lg"
    >
      <div className="space-y-5">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Reason</p>
              <div className="flex flex-wrap gap-2">
                {reasonOptions.map((option) => {
                  const active = reasons.includes(option.id);
                  return (
                    <NeuralButton
                      key={option.id}
                      variant={active ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => {
                        setReasons((prev) =>
                          prev.includes(option.id)
                            ? prev.filter((r) => r !== option.id)
                            : [...prev, option.id]
                        );
                      }}
                    >
                      {option.label}
                    </NeuralButton>
                  );
                })}
              </div>
            </div>

            {reasons.includes('injury') && (
              <div>
                <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Body Region</p>
                <div className="flex flex-wrap gap-2">
                  {bodyRegions.map((region) => (
                    <NeuralButton
                      key={region.id}
                      variant={bodyRegion === region.id ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setBodyRegion(region.id)}
                    >
                      {region.label}
                    </NeuralButton>
                  ))}
                </div>
              </div>
            )}

            {requiresConsult && (
              <div className="rounded-xl border border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] p-3 text-xs text-white/60">
                Specialist consults will be requested from Soma/Agnes to refine this plan.
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Recovery Type</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {typeOptions.map((option) => (
                  <NeuralButton
                    key={option.id}
                    variant={type === option.id ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setType(option.id)}
                  >
                    {option.label}
                  </NeuralButton>
                ))}
              </div>
              {type && (
                <p className="text-xs text-white/50 mt-2">
                  Suggested: {RECOVERY_TEMPLATE_LABELS[suggestedType]}
                </p>
              )}
            </div>

            {(pendingConsults?.soma || pendingConsults?.agnes) && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                <p className="mb-2">Waiting for specialist consults:</p>
                <div className="flex flex-wrap gap-2">
                  {pendingConsults?.soma && (
                    <NeuralButton size="sm" variant="ghost" onClick={() => onOpenModule('soma')}>
                      Open Soma
                    </NeuralButton>
                  )}
                  {pendingConsults?.agnes && (
                    <NeuralButton size="sm" variant="ghost" onClick={() => onOpenModule('agnes')}>
                      Open Agnes
                    </NeuralButton>
                  )}
                </div>
              </div>
            )}

            {(somaConsult || agnesConsult) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {somaConsult && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-2 mb-1 text-[11px] uppercase tracking-wider text-white/50">
                      <Stethoscope className="w-4 h-4 text-emerald-300" />
                      Soma
                    </div>
                    <p className="text-xs text-white/70">{somaConsult.summary}</p>
                  </div>
                )}
                {agnesConsult && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-2 mb-1 text-[11px] uppercase tracking-wider text-white/50">
                      <Sparkles className="w-4 h-4 text-indigo-300" />
                      Agnes
                    </div>
                    <p className="text-xs text-white/70">{agnesConsult.summary}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Duration (days)</p>
              <div className="flex items-center gap-3">
                <CalendarClock className="w-4 h-4 text-white/40" />
                <NeuralInput
                  type="number"
                  min={1}
                  value={durationDays}
                  onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value)))}
                  className="h-10 text-xs max-w-[140px]"
                />
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Notes</p>
              <NeuralInput
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for recovery plan."
                className="h-10 text-xs"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Summary</p>
              <div className="text-sm text-white/70 space-y-1">
                <div>Reasons: {reasons.join(', ') || 'None'}</div>
                <div>Type: {type ? RECOVERY_TEMPLATE_LABELS[type] : 'Not selected'}</div>
                <div>Duration: {durationDays} days</div>
                {bodyRegion && <div>Region: {bodyRegion}</div>}
              </div>
            </div>

            {template && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-[var(--module-color-400)]" />
                  <p className="text-xs uppercase tracking-wider text-white/40">Protocol Preview</p>
                </div>
                <ul className="space-y-1 text-xs text-white/60">
                  {template.steps.slice(0, 3).map((stepText) => (
                    <li key={stepText}>• {stepText}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <NeuralButton variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </NeuralButton>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <NeuralButton variant="secondary" size="sm" onClick={() => setStep((s) => Math.max(s - 1, 0))}>
                Back
              </NeuralButton>
            )}
            {step < 3 ? (
              <NeuralButton variant="primary" size="sm" onClick={handleNext} disabled={reasons.length === 0}>
                Next
              </NeuralButton>
            ) : (
              <NeuralButton variant="primary" size="sm" onClick={handleConfirm} disabled={!type}>
                Confirm Recovery Plan
              </NeuralButton>
            )}
          </div>
        </div>
      </div>
    </NeuralModal>
  );
}
