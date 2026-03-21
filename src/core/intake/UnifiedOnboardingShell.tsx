import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Zap, MessageSquare, ChevronLeft } from 'lucide-react';
import type { ModuleOnboardingSpec } from './onboarding-types';
import { useOnboardingSchema } from './use-onboarding-schema';
import { useKeyboardAware } from './use-keyboard-aware';
import { OnboardingFieldSet } from './OnboardingFieldSet';

const THEME_ACCENT: Record<string, { text: string; cardHover: string }> = {
  indigo: { text: 'text-indigo-400', cardHover: 'hover:border-indigo-500/40 hover:bg-indigo-500/5' },
  orange: { text: 'text-orange-400', cardHover: 'hover:border-orange-500/40 hover:bg-orange-500/5' },
  cyan: { text: 'text-cyan-400', cardHover: 'hover:border-cyan-500/40 hover:bg-cyan-500/5' },
  emerald: { text: 'text-emerald-400', cardHover: 'hover:border-emerald-500/40 hover:bg-emerald-500/5' },
  sky: { text: 'text-sky-400', cardHover: 'hover:border-sky-500/40 hover:bg-sky-500/5' },
  lime: { text: 'text-lime-400', cardHover: 'hover:border-lime-500/40 hover:bg-lime-500/5' },
  rose: { text: 'text-rose-400', cardHover: 'hover:border-rose-500/40 hover:bg-rose-500/5' },
  fuchsia: { text: 'text-fuchsia-400', cardHover: 'hover:border-fuchsia-500/40 hover:bg-fuchsia-500/5' },
  violet: { text: 'text-violet-400', cardHover: 'hover:border-violet-500/40 hover:bg-violet-500/5' },
  slate: { text: 'text-slate-400', cardHover: 'hover:border-slate-500/40 hover:bg-slate-500/5' },
};

export interface UnifiedOnboardingShellProps {
  spec: ModuleOnboardingSpec;
  /** Callback for Express mode completion. Receives field values keyed by canonical ID. */
  onExpressComplete: (values: Record<string, unknown>) => Promise<void>;
  /**
   * Guided-mode content — render the existing GuidedIntakeFrame / NexusChat here.
   * When not provided the mode selector will hide the "Guided" card.
   */
  guidedContent?: React.ReactNode;
  /** Override the initial mode. Defaults to 'select' if fastTrackEnabled, otherwise 'guided'. */
  defaultMode?: 'select' | 'express' | 'guided';
  /** Pre-populate express form fields. Keys are canonical dataPoint IDs. */
  initialValues?: Record<string, unknown>;
}

// ---- Progress ring SVG ---------------------------------------------------

// stroke color tokens indexed by IntakeThemeColor
const RING_STROKE: Record<string, string> = {
  indigo: '#818cf8', orange: '#fb923c', cyan: '#22d3ee', emerald: '#34d399',
  sky: '#38bdf8', lime: '#a3e635', rose: '#fb7185', fuchsia: '#e879f9',
  violet: '#a78bfa', slate: '#94a3b8',
};

interface ProgressRingProps {
  percent: number; // 0–1
  themeColor: string;
  size?: number;
}

function ProgressRing({ percent, themeColor, size = 36 }: ProgressRingProps) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, Math.max(0, percent)));
  const stroke = RING_STROKE[themeColor] ?? '#818cf8';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={3}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ stroke, transition: 'stroke-dashoffset 0.5s ease-out' }}
      />
      <text
        x={size / 2}
        y={size / 2 + 3}
        textAnchor="middle"
        fontSize={9}
        fontWeight="bold"
        fill="rgba(255,255,255,0.6)"
      >
        {Math.round(percent * 100)}%
      </text>
    </svg>
  );
}

// ---- Mode selector cards -------------------------------------------------

interface ModeCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  themeClass: string;
  cardHover: string;
  onClick: () => void;
}

function ModeCard({ icon, title, description, badge, themeClass, cardHover, onClick }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 text-left p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02]',
        'transition-all duration-200 active:scale-[0.98]',
        cardHover,
      )}
    >
      <div className={cn('mb-2', themeClass)}>{icon}</div>
      <p className="text-sm font-bold text-white/90 leading-tight">{title}</p>
      {badge && (
        <span className={cn('inline-block text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full mt-1 mb-1', themeClass, 'bg-white/5 border border-current/20')}>
          {badge}
        </span>
      )}
      <p className="text-xs text-white/50 leading-relaxed mt-1">{description}</p>
    </button>
  );
}

// ---- Main component ------------------------------------------------------

export function UnifiedOnboardingShell({
  spec,
  onExpressComplete,
  guidedContent,
  defaultMode,
  initialValues,
}: UnifiedOnboardingShellProps) {
  const theme = THEME_ACCENT[spec.themeColor] ?? THEME_ACCENT.indigo;
  const keyboard = useKeyboardAware();
  const { fields, sections, isLoading: schemaLoading } = useOnboardingSchema(spec);

  const initialMode = defaultMode ?? (spec.fastTrackEnabled ? 'select' : 'guided');
  const [mode, setMode] = useState<'select' | 'express' | 'guided'>(initialMode);

  const [values, setValues] = useState<Record<string, unknown>>(initialValues ?? {});
  const [currentSection, setCurrentSection] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const Icon = spec.icon;

  // Progress: ratio of required fields with a non-empty value
  const progress = useMemo(() => {
    const required = fields.filter((f) => f.required);
    if (required.length === 0) return 1;
    const filled = required.filter((f) => {
      const v = values[f.id];
      if (v === undefined || v === null || v === '') return false;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    });
    return filled.length / required.length;
  }, [fields, values]);

  const handleChange = useCallback((fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }, []);

  const handleExpressSubmit = useCallback(async () => {
    // Validate required fields for this express submit
    const requiredIds = spec.fastTrackRequiredIds.length > 0
      ? spec.fastTrackRequiredIds
      : fields.filter((f) => f.required).map((f) => f.id);

    const newErrors: Record<string, string> = {};
    for (const id of requiredIds) {
      const v = values[id];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
        newErrors[id] = 'Required';
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Jump to the section with the first error
      const firstErrorField = fields.find((f) => newErrors[f.id]);
      if (firstErrorField) {
        const errorSection = (firstErrorField.metadata?.section as string) || 'General';
        const idx = sections.indexOf(errorSection);
        if (idx >= 0) setCurrentSection(idx);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const safeValues = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== '')
      );
      await onExpressComplete(safeValues);
    } finally {
      setIsSubmitting(false);
    }
  }, [fields, sections, spec.fastTrackRequiredIds, values, onExpressComplete]);

  const isKeyboardOpen = keyboard.isKeyboardOpen;
  const headerCollapsed = isKeyboardOpen && mode !== 'select';

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-0 sm:p-4">
      <div className="relative w-full h-full sm:h-[84vh] flex flex-col bg-black/40 backdrop-blur-xl rounded-none sm:rounded-panel border-x-0 border-y sm:border border-white/10 overflow-hidden shadow-2xl">

        {/* Header — collapses when keyboard is open */}
        <div
          className={cn(
            'shrink-0 overflow-hidden transition-all duration-300',
            headerCollapsed ? 'max-h-12' : 'max-h-40',
          )}
        >
          <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 sm:py-5 border-b border-white/5 bg-gradient-to-r from-white/[0.03] to-transparent">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn('shrink-0', theme.text)}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                {!headerCollapsed && (
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-0.5">
                    Intake
                  </p>
                )}
                <h2 className={cn('font-black italic uppercase tracking-widest truncate', headerCollapsed ? 'text-sm' : 'text-base sm:text-lg', theme.text)}>
                  {spec.displayName}
                </h2>
                {!headerCollapsed && (
                  <p className="text-[10px] text-white/40 leading-relaxed max-w-sm hidden sm:block mt-0.5">
                    {spec.goal}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {mode === 'express' && (
                <ProgressRing percent={progress} themeColor={spec.themeColor} />
              )}
              {schemaLoading && mode !== 'guided' && (
                <span className="text-[10px] uppercase tracking-widest text-white/30 animate-pulse">
                  Calibrating…
                </span>
              )}
            </div>
          </div>

          {/* Mode indicator strip */}
          {mode !== 'select' && (
            <div className="flex items-center gap-2 px-4 sm:px-6 py-1.5 border-b border-white/5 bg-white/[0.01]">
              <button
                type="button"
                onClick={() => { setMode('select'); setCurrentSection(0); }}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
              >
                <ChevronLeft className="w-3 h-3" />
                Modes
              </button>
              <span className="text-white/15 text-xs">·</span>
              <span className={cn('text-[10px] uppercase tracking-widest font-bold', theme.text)}>
                {mode === 'express' ? 'Express' : 'Guided'}
              </span>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Mode selector */}
          {mode === 'select' && (
            <div className="flex-1 flex flex-col items-center justify-center p-5 sm:p-8">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40 mb-6">
                Choose onboarding style
              </p>
              <div className="flex gap-3 w-full max-w-md flex-col sm:flex-row">
                <ModeCard
                  icon={<Zap className="w-5 h-5" />}
                  title="Express"
                  badge="Fast Track"
                  description="Fill in a quick form. Best for users who know what they want."
                  themeClass={theme.text}
                  cardHover={theme.cardHover}
                  onClick={() => setMode('express')}
                />
                {guidedContent && (
                  <ModeCard
                    icon={<MessageSquare className="w-5 h-5" />}
                    title="Guided"
                    description="Conversational intake. Best for nuanced or complex answers."
                    themeClass={theme.text}
                    cardHover={theme.cardHover}
                    onClick={() => setMode('guided')}
                  />
                )}
              </div>
            </div>
          )}

          {/* Express form */}
          {mode === 'express' && (
            <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
              <OnboardingFieldSet
                fields={fields}
                sections={sections}
                values={values}
                onChange={handleChange}
                onSubmit={handleExpressSubmit}
                onBack={() => spec.fastTrackEnabled ? setMode('select') : undefined}
                isSubmitting={isSubmitting}
                currentSection={currentSection}
                onSectionChange={setCurrentSection}
                themeColor={spec.themeColor}
                keyboard={keyboard}
                errors={errors}
                disabled={isSubmitting}
              />
            </div>
          )}

          {/* Guided chat */}
          {mode === 'guided' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {guidedContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
