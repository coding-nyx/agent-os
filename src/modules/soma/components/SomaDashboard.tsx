/**
 * Soma Dashboard - Comprehensive Biometric & Physical Readiness UI
 * Wired to real SomaProfile schema (knownConditions, biomarkers, clearances, etc.)
 * Fix 1: Uses real SomaProfile from ../types (no local schema conflict)
 * Fix 4: Empty state guards on medicalOnboardingComplete, not soul
 * Fix 5: Uses emerald theme, not cyan
 * Fix 6: AI insights from real data only
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Heart,
  TrendingUp,
  BarChart3,
  Stethoscope,
  History,
  AlertCircle,
  CheckCircle2,
  Dumbbell,
  Pill,
  FlaskConical,
  ShieldCheck,
  Scale,
  Wind,
  Plus,
  X,
} from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
// Fix 1: Import the real SomaProfile — no more local conflicting definition
import type { SomaProfile } from '../types';
import { addVitalReading } from '../services/soma-profile-service';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { TimeSeriesChart } from '@/core/components/viz/TimeSeriesChart';
import { ProgressRing } from '@/core/components/viz/ProgressRing';
import { cn } from '@/lib/utils';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { VitalsEntryForm } from './VitalsEntryForm';
import { PhysicalAssessmentForm } from './PhysicalAssessmentForm';
import { BiometricHistory } from './BiometricHistory';
import { CollapsibleAIPanel } from './CollapsibleAIPanel';
import { DiagnosisUploadZone } from './DiagnosisUploadZone';
import { DiagnosisProgressCard } from './DiagnosisProgressCard';
import { DiagnosisResultsScreen } from './DiagnosisResultsScreen';
import { DiagnosisActiveBanner } from './DiagnosisActiveBanner';
import { DiagnosisCloseModal } from './DiagnosisCloseModal';
import {
  startDiagnosisSession,
  triggerParse,
  getActiveDiagnosisSession,
  closeDiagnosis,
} from '../services/diagnosis-session-service';
import type { DocumentAnalysisResult } from '@/lib/services/document-analysis-service';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';

export type SomaView = 'dashboard' | 'vitals' | 'assessments' | 'history' | 'labs';

// VitalReading and PhysicalAssessment are UI-only constructs for in-session tracking.
// They are not part of the stored SomaProfile schema (which uses biomarkers/clearances).
export interface VitalReading {
  timestamp: number;
  heartRate?: number;
  bloodPressure?: string;
  temperature?: number;
  spo2?: number;
  weight?: number;
}

export interface PhysicalAssessment {
  id: string;
  timestamp: number;
  type: 'strength' | 'flexibility' | 'endurance' | 'general';
  score: number;
  notes?: string;
  measurements?: Record<string, number>;
}

interface SomaDashboardProps {
  soul: GlobalProjection | null;
  profile: SomaProfile | null;
  isLocked?: boolean;
  /** Readiness score from useSomaHealth hook — Fix 3 */
  readinessScore?: number | null;
  /** In-session vital readings (local state, not persisted to real schema yet) */
  vitalHistory?: VitalReading[];
  /** In-session assessment records (local state, not persisted to real schema yet) */
  assessmentHistory?: PhysicalAssessment[];
  onUpdateProfile?: (updates: Partial<SomaProfile>) => void;
  onAddVitalReading?: (reading: VitalReading) => void;
  onAddAssessment?: (assessment: PhysicalAssessment) => void;
}

const noop = () => {};

// ── QuickEntry Chips ─────────────────────────────────────────────────────────

type ChipKey = 'heartRate' | 'weight' | 'spo2';

interface ChipConfig {
  key: ChipKey;
  label: string;
  icon: React.ElementType;
  unit: string;
  min: number;
  max: number;
  step: number;
}

const QUICK_ENTRY_CHIPS: ChipConfig[] = [
  { key: 'heartRate', label: 'Heart Rate', icon: Heart,  unit: 'bpm', min: 30,  max: 220, step: 1   },
  { key: 'weight',    label: 'Weight',     icon: Scale,  unit: 'kg',  min: 0,   max: 500, step: 0.1 },
  { key: 'spo2',      label: 'SpO₂',       icon: Wind,   unit: '%',   min: 70,  max: 100, step: 1   },
];

interface QuickEntryChipsProps {
  uid: string | null;
  getModuleKey: (module: string) => Promise<CryptoKey | null>;
  /** All readings (persisted + in-session) used to detect today's logged value */
  allReadings: VitalReading[];
  onAddVitalReading: (reading: VitalReading) => void;
}

/**
 * Horizontal scrollable row of pill-shaped quick-entry chips.
 * Each chip shows today's logged value (if any) or a "+" prompt.
 * Tapping expands an inline micro-form; saving persists via addVitalReading.
 */
function QuickEntryChips({ uid, getModuleKey, allReadings, onAddVitalReading }: QuickEntryChipsProps) {
  const [expandedKey, setExpandedKey]   = useState<ChipKey | null>(null);
  const [inputValue,  setInputValue]    = useState('');
  const [isSaving,    setIsSaving]      = useState(false);
  const [flashKey,    setFlashKey]      = useState<ChipKey | null>(null);
  const [saveError,   setSaveError]     = useState<string | null>(null);

  /** Returns today's most-recent recorded value for a given chip key, if any. */
  const getTodayValue = useCallback((key: ChipKey): number | undefined => {
    const todayStr = new Date().toDateString();
    const todayReadings = allReadings.filter(
      (r) => new Date(r.timestamp).toDateString() === todayStr,
    );
    if (todayReadings.length === 0) return undefined;
    const latest = todayReadings[todayReadings.length - 1];
    return latest[key];
  }, [allReadings]);

  const handleChipTap = useCallback((key: ChipKey) => {
    if (expandedKey === key) {
      setExpandedKey(null);
      setInputValue('');
      setSaveError(null);
      return;
    }
    const todayVal = allReadings
      .filter((r) => new Date(r.timestamp).toDateString() === new Date().toDateString())
      .slice(-1)[0]?.[key];
    setExpandedKey(key);
    setInputValue(todayVal !== undefined ? String(todayVal) : '');
    setSaveError(null);
  }, [expandedKey, allReadings]);

  const handleSave = useCallback(async (chip: ChipConfig) => {
    const numVal = chip.step < 1 ? parseFloat(inputValue) : parseInt(inputValue, 10);
    if (isNaN(numVal) || numVal < chip.min || numVal > chip.max) {
      setSaveError(`Enter a value between ${chip.min} and ${chip.max}`);
      return;
    }
    if (!uid) {
      setSaveError('Not signed in');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const encKey = await getModuleKey('soma');
      if (!encKey) throw new Error('Vault is locked — unlock to save');
      await addVitalReading(uid, { [chip.key]: numVal }, encKey);
      const reading: VitalReading = { timestamp: Date.now(), [chip.key]: numVal };
      onAddVitalReading(reading);
      setFlashKey(chip.key);
      setTimeout(() => setFlashKey(null), 1500);
      setExpandedKey(null);
      setInputValue('');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [uid, getModuleKey, inputValue, onAddVitalReading]);

  const activeChip = QUICK_ENTRY_CHIPS.find((c) => c.key === expandedKey) ?? null;

  return (
    <div className="space-y-2">
      {/* Chip row */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {QUICK_ENTRY_CHIPS.map((chip) => {
          const todayVal  = getTodayValue(chip.key);
          const isExpanded = expandedKey === chip.key;
          const isFlashing = flashKey === chip.key;
          const hasValue   = todayVal !== undefined;

          return (
            <button
              key={chip.key}
              onClick={() => handleChipTap(chip.key)}
              aria-expanded={isExpanded}
              aria-label={`Quick-log ${chip.label}`}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0',
                'min-h-[44px]', // mobile touch target
                isFlashing
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 animate-pulse'
                  : hasValue
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80',
                isExpanded && !isFlashing && 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300',
              )}
            >
              {React.createElement(chip.icon, { className: 'w-3.5 h-3.5 flex-shrink-0', 'aria-hidden': true })}
              <span>{chip.label}</span>
              {hasValue ? (
                <span className="text-xs font-semibold text-emerald-400">
                  {Number.isInteger(todayVal) ? todayVal : (todayVal as number).toFixed(1)}{chip.unit}
                </span>
              ) : (
                <Plus className="w-3 h-3 flex-shrink-0 text-white/40" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/* Inline micro-form — slides down under the chip row */}
      <AnimatePresence>
        {activeChip && (
          <motion.div
            key={activeChip.key}
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {React.createElement(activeChip.icon, { className: 'w-4 h-4 text-emerald-400', 'aria-hidden': true })}
                  <span className="text-sm font-semibold text-white">
                    Log {activeChip.label}
                  </span>
                  <span className="text-xs text-white/40">{activeChip.unit}</span>
                </div>
                <button
                  onClick={() => { setExpandedKey(null); setInputValue(''); setSaveError(null); }}
                  className="text-white/40 hover:text-white/70 transition-colors p-1"
                  aria-label="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={inputValue}
                  onChange={(e) => { setInputValue(e.target.value); setSaveError(null); }}
                  min={activeChip.min}
                  max={activeChip.max}
                  step={activeChip.step}
                  placeholder={`${activeChip.min}–${activeChip.max}`}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(activeChip); }}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  className={cn(
                    'flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2',
                    'text-sm text-white placeholder-white/30',
                    'focus:outline-none focus:border-emerald-500/50 focus:bg-white/[0.07]',
                    'transition-all',
                  )}
                />
                <button
                  onClick={() => handleSave(activeChip)}
                  disabled={isSaving || inputValue === ''}
                  className={cn(
                    'px-4 py-2 bg-emerald-500/20 border border-emerald-500/40',
                    'text-emerald-300 text-sm font-semibold rounded-lg',
                    'hover:bg-emerald-500/30 transition-all',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'min-h-[44px]',
                  )}
                >
                  {isSaving ? '…' : 'Save'}
                </button>
              </div>

              {saveError && (
                <p className="text-xs text-red-400 mt-2" role="alert">{saveError}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}



export const SomaDashboard = React.memo(function SomaDashboard({
  soul: _soul,
  profile,
  isLocked = false,
  readinessScore: externalReadinessScore,
  vitalHistory = [],
  assessmentHistory = [],
  onUpdateProfile: _onUpdateProfile = noop,
  onAddVitalReading = noop,
  onAddAssessment = noop,
}: SomaDashboardProps) {
  const [activeView, setActiveView] = useState<SomaView>('dashboard');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const toggleAIPanel = useCallback(() => setShowAIPanel(prev => !prev), []);

  // ── Auth / Vault ────────────────────────────────────────────────────────────
  const { user } = useAuth();
  const { getModuleKey } = useVault();
  const uid = user?.uid ?? null;

  // ── Diagnosis tab state ─────────────────────────────────────────────────────
  const [diagnosisPhase, setDiagnosisPhase] = useState<'idle' | 'uploading' | 'parsing' | 'reviewed' | 'error'>('idle');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<DocumentAnalysisResult | null>(null);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [isClosingDiagnosis, setIsClosingDiagnosis] = useState(false);

  // On mount: restore any active diagnosis session from Firestore.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const encryptionKey = await getModuleKey('soma');
      if (!encryptionKey || cancelled) return;
      try {
        const session = await getActiveDiagnosisSession(uid, encryptionKey);
        if (!session || cancelled) return;
        setActiveSessionId(session.id);
        if (session.status === 'reviewed' && session.analysisResult) {
          setAnalysisResult(session.analysisResult);
          setSelectedFieldIds(
            session.analysisResult.extractedFields.map((_, i) => String(i)),
          );
          setDiagnosisPhase('reviewed');
        } else if (session.status === 'parsing' || session.status === 'uploading') {
          setDiagnosisPhase('parsing');
        }
      } catch {
        // Silently ignore session-restore errors — they are non-critical.
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // ── Diagnosis handlers ──────────────────────────────────────────────────────

  const handleFileSelected = useCallback(async (file: File) => {
    const encryptionKey = await getModuleKey('soma');
    if (!uid || !encryptionKey) {
      setUploadError('Vault is locked. Please unlock your vault first.');
      return;
    }
    setDiagnosisPhase('uploading');
    setUploadProgress(0);
    setUploadError(null);
    setDiagnosisError(null);
    try {
      const sessionId = await startDiagnosisSession(uid, file, encryptionKey);
      setActiveSessionId(sessionId);
      setDiagnosisPhase('parsing');
      // llmCallback is a stub — DocumentAnalysisService.parseAnalysisResponse
      // handles an empty string gracefully by returning empty extractedFields.
      const result = await triggerParse(uid, sessionId, encryptionKey, async (_prompt: string) => '');
      setAnalysisResult(result);
      setSelectedFieldIds(result.extractedFields.map((_, i) => String(i)));
      setDiagnosisPhase('reviewed');
    } catch (err) {
      setDiagnosisPhase('error');
      setDiagnosisError(err instanceof Error ? err.message : 'Upload failed.');
    }
  }, [uid, getModuleKey]);

  const handleCloseDiagnosis = useCallback(async (merge: boolean) => {
    if (!activeSessionId || !uid) return;
    const encryptionKey = await getModuleKey('soma');
    if (!encryptionKey) return;
    setIsClosingDiagnosis(true);
    try {
      const selectedItems = merge
        ? (analysisResult?.extractedFields ?? []).filter((_, i) => selectedFieldIds.includes(String(i)))
        : [];
      await closeDiagnosis(uid, activeSessionId, selectedItems, encryptionKey, merge);
      setDiagnosisPhase('idle');
      setActiveSessionId(null);
      setAnalysisResult(null);
      setSelectedFieldIds([]);
      setShowCloseModal(false);
    } catch (err) {
      setDiagnosisError(err instanceof Error ? err.message : 'Failed to close diagnosis.');
    } finally {
      setIsClosingDiagnosis(false);
    }
  }, [activeSessionId, uid, getModuleKey, analysisResult, selectedFieldIds]);

  // Fix 3: Use readinessScore from useSomaHealth hook; fall back to 0 when not yet loaded
  const readinessScore = externalReadinessScore ?? 0;

  // Prepare chart data from in-session vital history (separate from stored profile)
  const heartRateHistory = useMemo(() => {
    return vitalHistory
      .filter(v => v.heartRate !== undefined)
      .map(v => ({
        date: new Date(v.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: v.heartRate!,
      }))
      .slice(-14);
  }, [vitalHistory]);

  const weightHistory = useMemo(() => {
    return vitalHistory
      .filter(v => v.weight !== undefined)
      .map(v => ({
        date: new Date(v.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: v.weight!,
      }))
      .slice(-30);
  }, [vitalHistory]);

  // Fix 6: AI insights based on real SomaProfile fields (biomarkers, clearances, labs).
  // Old code used non-existent fields like restingHeartRate, sleepHours, hydrationLevel.
  const aiInsights = useMemo(() => {
    if (!profile) return [];

    const hasData =
      profile.biomarkers.length > 0 ||
      profile.clearances.length > 0 ||
      profile.labSummaries.length > 0;

    if (!hasData) {
      return [
        {
          type: 'info' as const,
          message:
            'Connect your health data to see AI insights. Import lab results or record biomarkers to get started.',
        },
      ];
    }

    const insights: Array<{ type: 'info' | 'warning' | 'success'; message: string }> = [];

    const deniedClearances = profile.clearances.filter(c => c.status === 'denied');
    if (deniedClearances.length > 0) {
      insights.push({
        type: 'warning',
        message: `${deniedClearances.length} activity clearance(s) currently denied. Review with your healthcare provider.`,
      });
    }

    const grantedClearances = profile.clearances.filter(c => c.status === 'granted');
    if (grantedClearances.length > 0) {
      insights.push({
        type: 'success',
        message: `${grantedClearances.length} activity clearance(s) currently active.`,
      });
    }

    const flaggedLabs = profile.labSummaries.filter(l => l.flags.length > 0);
    if (flaggedLabs.length > 0) {
      insights.push({
        type: 'warning',
        message: `${flaggedLabs.length} lab panel(s) have flagged values. Review with your doctor.`,
      });
    }

    if (profile.knownConditions.length > 0 && profile.clearances.length === 0) {
      insights.push({
        type: 'info',
        message: `${profile.knownConditions.length} condition(s) recorded. Consider requesting activity clearances from your provider.`,
      });
    }

    return insights;
  }, [profile]);

  // ---- Early returns for locked / no-data states ----

  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Soma"
        moduleDescription="Baseline biological profile and readiness."
      />
    );
  }

  // Fix 4: Guard on missing/incomplete profile (soul is always present for logged-in users)
  if (!profile || !profile.medicalOnboardingComplete) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Set up Soma to get started"
          description="Complete medical onboarding to unlock your biological dashboard and readiness tracking."
          size="lg"
        />
      </div>
    );
  }

  // ---- Render different views ----

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Quick Entry Chips — convenience shortcut to log today's physical vitals */}
      <QuickEntryChips
        uid={uid}
        getModuleKey={getModuleKey}
        allReadings={[...(profile.vitalReadings ?? []), ...vitalHistory]}
        onAddVitalReading={onAddVitalReading}
      />

      {/* Readiness Score Hero */}
      <SurfaceCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-emerald-400" />
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight font-display">Physical Readiness</h2>
              <p className="text-sm text-white/60">Soma readiness score</p>
            </div>
          </div>
          <button
            onClick={toggleAIPanel}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            {showAIPanel ? 'Hide' : 'Show'} AI Insights
          </button>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex-shrink-0">
            <ProgressRing
              percentage={readinessScore}
              size={140}
              strokeWidth={12}
              label="Readiness"
              color={readinessScore >= 80 ? 'green' : readinessScore >= 60 ? 'amber' : 'orange'}
            />
          </div>

          {/* Real data summary stats */}
          <div className="flex-1 grid grid-cols-2 gap-4">
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Biomarkers</p>
              <p className="text-2xl font-bold text-white">{profile.biomarkers.length}</p>
              <p className="text-xs text-white/40 mt-1">on record</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Clearances</p>
              <p className="text-2xl font-bold text-white">
                {profile.clearances.filter(c => c.status === 'granted').length}
                <span className="text-sm font-normal text-white/40">/{profile.clearances.length}</span>
              </p>
              <p className="text-xs text-white/40 mt-1">granted</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Lab Panels</p>
              <p className="text-2xl font-bold text-white">{profile.labSummaries.length}</p>
              <p className="text-xs text-white/40 mt-1">recorded</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Conditions</p>
              <p className="text-2xl font-bold text-white">{profile.knownConditions.length}</p>
              <p className="text-xs text-white/40 mt-1">tracked</p>
            </div>
          </div>
        </div>
      </SurfaceCard>

      {/* AI Insights Panel — Fix 6: shows real data, not fake conditional logic */}
      {showAIPanel && (
        <CollapsibleAIPanel
          insights={aiInsights}
          onClose={() => setShowAIPanel(false)}
        />
      )}

      {/* Medical Profile — Conditions, Medications, Allergies (real schema fields) */}
      <SurfaceCard className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Pill className="w-6 h-6 text-purple-400" />
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight font-display">Medical Profile</h2>
            <p className="text-sm text-white/60">Conditions, medications &amp; allergies</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1">
              <Stethoscope className="w-3 h-3" /> Conditions
            </p>
            {profile.knownConditions.length === 0 ? (
              <p className="text-sm text-white/30 italic">None recorded</p>
            ) : (
              <ul className="space-y-1">
                {profile.knownConditions.map((c, i) => (
                  <li key={i} className="text-sm text-white/80 bg-white/[0.03] rounded-lg px-3 py-1.5 border border-white/5">{c}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1">
              <Pill className="w-3 h-3" /> Medications
            </p>
            {(profile.medications ?? []).length === 0 ? (
              <p className="text-sm text-white/30 italic">None recorded</p>
            ) : (
              <ul className="space-y-1">
                {(profile.medications ?? []).map((m, i) => (
                  <li key={i} className="text-sm text-white/80 bg-white/[0.03] rounded-lg px-3 py-1.5 border border-white/5">{m}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Allergies
            </p>
            {profile.allergies.length === 0 ? (
              <p className="text-sm text-white/30 italic">None recorded</p>
            ) : (
              <ul className="space-y-1">
                {profile.allergies.map((a, i) => (
                  <li key={i} className="text-sm text-white/80 bg-white/[0.03] rounded-lg px-3 py-1.5 border border-white/5">{a}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SurfaceCard>

      {/* Recent Biomarkers (real schema: profile.biomarkers) */}
      {profile.biomarkers.length > 0 && (
        <SurfaceCard className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <FlaskConical className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight font-display">Recent Biomarkers</h2>
              <p className="text-sm text-white/60">Latest {Math.min(profile.biomarkers.length, 6)} of {profile.biomarkers.length}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {profile.biomarkers.slice(-6).reverse().map(b => (
              <div key={b.id} className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1 truncate">{b.name}</p>
                <p className="text-xl font-bold text-white">
                  {b.value}
                  {b.unit && <span className="text-sm font-normal text-white/40 ml-1">{b.unit}</span>}
                </p>
                <p className="text-xs text-white/30 mt-1">{new Date(b.recordedAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>
      )}

      {/* Medical Clearances — Fix 1: uses real profile.clearances array */}
      <SurfaceCard className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-6 h-6 text-indigo-400" />
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight font-display">Medical Clearances</h2>
            <p className="text-sm text-white/60">{profile.clearances.length} clearance(s) on record</p>
          </div>
        </div>

        {profile.clearances.length === 0 ? (
          <p className="text-sm text-white/30 italic text-center py-4">No clearances recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {profile.clearances.slice(0, 8).map(clearance => (
              <div
                key={clearance.id}
                className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5"
              >
                <div className="flex items-center gap-3">
                  {clearance.status === 'granted' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className={cn('w-5 h-5 flex-shrink-0', clearance.status === 'denied' ? 'text-red-400' : 'text-amber-400')} />
                  )}
                  <div>
                    <span className="text-sm font-medium text-white">{clearance.activity}</span>
                    {clearance.reason && <p className="text-xs text-white/40">{clearance.reason}</p>}
                  </div>
                </div>
                <span className={cn(
                  'text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full flex-shrink-0',
                  clearance.status === 'granted'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : clearance.status === 'denied'
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-amber-500/10 text-amber-400'
                )}>
                  {clearance.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>

      {/* Session Heart Rate Trend (from locally entered vitals) */}
      {heartRateHistory.length > 0 && (
        <SurfaceCard className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Heart className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight font-display">Heart Rate Trend</h2>
              <p className="text-sm text-white/60">From this session's vitals entries</p>
            </div>
          </div>
          <TimeSeriesChart
            data={heartRateHistory}
            metric="Heart Rate (bpm)"
            color="cyan"
            height={200}
            showDots
          />
        </SurfaceCard>
      )}

      {weightHistory.length > 0 && (
        <SurfaceCard className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="w-6 h-6 text-purple-400" />
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight font-display">Weight Trend</h2>
              <p className="text-sm text-white/60">From this session's vitals entries</p>
            </div>
          </div>
          <TimeSeriesChart
            data={weightHistory}
            metric="Weight (kg)"
            color="purple"
            height={200}
            showDots
          />
        </SurfaceCard>
      )}

      {/* Medical Summary */}
      {profile.medicalSummary && (
        <SurfaceCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-tight font-display">Medical Summary</h2>
          </div>
          <p className="text-sm text-white/70 leading-relaxed">{profile.medicalSummary}</p>
        </SurfaceCard>
      )}
    </div>
  );

  const renderVitals = () => (
    <VitalsEntryForm
      onSubmit={(vitals) => {
        onAddVitalReading({
          timestamp: Date.now(),
          ...vitals,
        });
      }}
    />
  );

  const renderAssessments = () => (
    <PhysicalAssessmentForm
      profile={profile}
      onSubmit={(assessment) => {
        onAddAssessment({
          id: `assessment-${Date.now()}`,
          timestamp: Date.now(),
          ...assessment,
        });
      }}
    />
  );

  const renderHistory = () => (
    <BiometricHistory
      vitalHistory={vitalHistory}
      assessmentHistory={assessmentHistory}
    />
  );

  const renderLabs = () => {
    if (diagnosisPhase === 'idle') {
      return (
        <DiagnosisUploadZone
          onFileSelected={handleFileSelected}
          isUploading={false}
          error={uploadError}
        />
      );
    }
    if (diagnosisPhase === 'uploading' || diagnosisPhase === 'parsing') {
      return (
        <DiagnosisProgressCard
          phase={diagnosisPhase === 'uploading' ? 'uploading' : 'analysing'}
          progress={uploadProgress}
          onCancel={() => {
            // Best-effort discard of the in-flight session.
            if (activeSessionId && uid) {
              getModuleKey('soma').then(key => {
                if (key) closeDiagnosis(uid, activeSessionId, [], key, false).catch(() => {});
              }).catch(() => {});
            }
            setDiagnosisPhase('idle');
            setActiveSessionId(null);
          }}
        />
      );
    }
    if (diagnosisPhase === 'reviewed' && analysisResult) {
      return (
        <DiagnosisResultsScreen
          sessionId={activeSessionId!}
          detectedPanels={analysisResult.detectedPanels}
          extractedFields={analysisResult.extractedFields}
          onSelectionChange={setSelectedFieldIds}
          onClose={() => setShowCloseModal(true)}
        />
      );
    }
    if (diagnosisPhase === 'error') {
      return (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Error: {diagnosisError}
        </div>
      );
    }
    return null;
  };

  const tabs: NeuralTabItem<SomaView>[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'vitals', label: 'Vitals', icon: Heart },
    { id: 'assessments', label: 'Assessments', icon: Dumbbell },
    { id: 'history', label: 'History', icon: History },
    { id: 'labs', label: 'Labs', icon: FlaskConical },
  ];

  return (
    <div className="flex flex-col">
      {/* Diagnosis active banner — shown above tab content when a session is live */}
      {activeSessionId && (
        <DiagnosisActiveBanner
          sessionId={activeSessionId}
          phase={
            diagnosisPhase === 'uploading' || diagnosisPhase === 'parsing'
              ? diagnosisPhase
              : diagnosisPhase === 'error'
              ? 'error'
              : 'reviewed'
          }
          itemCount={analysisResult?.extractedFields.length}
          onReview={() => setActiveView('labs')}
          onEnd={() => setShowCloseModal(true)}
        />
      )}

      {/* Header */}
      <div className="px-4 md:px-8 pt-6 pb-2 md:pb-4">
        <h1 className="text-2xl font-bold text-white tracking-tight font-display">
          Soma
        </h1>
        <p className="text-sm text-white/60 mt-1">
          Physical readiness &amp; biometric tracking
        </p>
      </div>

      {/* Tab bar — Fix 5: emerald theme, not cyan */}
      <div className="px-4 md:px-8 pb-3 md:pb-6 border-b border-white/5">
        <NeuralTabGroup<SomaView>
          tabs={tabs}
          activeTab={activeView}
          onTabChange={setActiveView}
          themeColor="emerald"
          variant="pill"
          layoutIdPrefix="soma-tab"
        />
      </div>

      {/* Tab panel */}
      <div
        role="tabpanel"
        id={`tab-panel-${activeView}`}
        aria-labelledby={`tab-${activeView}`}
        className="px-4 md:px-8 pt-4 md:pt-6 pb-8 space-y-6"
      >
        {activeView === 'dashboard' && renderDashboard()}
        {activeView === 'vitals' && renderVitals()}
        {activeView === 'assessments' && renderAssessments()}
        {activeView === 'history' && renderHistory()}
        {activeView === 'labs' && renderLabs()}
      </div>

      {/* Close/merge modal — mounted at component root so it overlays everything */}
      {showCloseModal && (
        <DiagnosisCloseModal
          isOpen={showCloseModal}
          sessionId={activeSessionId!}
          selectedItemCount={selectedFieldIds.length}
          totalItemCount={analysisResult?.extractedFields.length ?? 0}
          onMerge={() => handleCloseDiagnosis(true)}
          onDiscard={() => handleCloseDiagnosis(false)}
          onCancel={() => setShowCloseModal(false)}
          isProcessing={isClosingDiagnosis}
        />
      )}
    </div>
  );
});
