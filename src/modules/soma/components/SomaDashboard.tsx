/**
 * Soma Dashboard - Comprehensive Biometric & Physical Readiness UI
 * Wired to real SomaProfile schema (knownConditions, biomarkers, clearances, etc.)
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
  MessageSquare,
  List,
  FileText,
} from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import type { SomaProfile } from '../types';
import type { PhysicalAssessment as StoredPhysicalAssessment } from '@/lib/types';
import { addVitalReading } from '../services/soma-profile-service';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { TimeSeriesChart } from '@/core/components/viz/TimeSeriesChart';
import { ProgressRing } from '@/core/components/viz/ProgressRing';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { UniversalUploadZone } from '@/core/components/forms/UniversalUploadZone';
import { VitalsEntryForm } from './VitalsEntryForm';
import { PhysicalAssessmentForm } from './PhysicalAssessmentForm';
import { BiometricHistory } from './BiometricHistory';
import { CollapsibleAIPanel } from './CollapsibleAIPanel';
import { DiagnosisProgressCard } from './DiagnosisProgressCard';
import { DiagnosisResultsScreen } from './DiagnosisResultsScreen';
import { DiagnosisActiveBanner } from './DiagnosisActiveBanner';
import { DiagnosisCloseModal } from './DiagnosisCloseModal';
import { DiagnosisChatPanel } from './DiagnosisChatPanel';
import { DiagnosisDocumentPreview } from './DiagnosisDocumentPreview';
import { MobileDiagnosisTabs, type MobileDiagnosisTab } from './MobileDiagnosisTabs';
import { MobileExtractedDataSheet } from './MobileExtractedDataSheet';
import { useDiagnosis } from '@/core/diagnosis/use-diagnosis';
import type { SomaDiagnosisSummary } from '../types';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';

export type SomaView = 'dashboard' | 'vitals' | 'assessments' | 'history' | 'labs';

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
  readinessScore?: number | null;
  onUpdateProfile?: (updates: Partial<SomaProfile>) => void;
  onAddVitalReading?: (reading: VitalReading) => void;
  onAddAssessment?: (assessment: PhysicalAssessment) => void;
  queuedUpload?: File | null;
  onQueuedUploadHandled?: () => void;
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

function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

interface QuickEntryChipsProps {
  uid: string | null;
  getMasterKey: () => Promise<CryptoKey | null>;
  allReadings: VitalReading[];
  onAddVitalReading: (reading: VitalReading) => void;
}

function QuickEntryChips({ uid, getMasterKey, allReadings, onAddVitalReading }: QuickEntryChipsProps) {
  const [expandedKey, setExpandedKey]   = useState<ChipKey | null>(null);
  const [inputValue,  setInputValue]    = useState('');
  const [isSaving,    setIsSaving]      = useState(false);
  const [flashKey,    setFlashKey]      = useState<ChipKey | null>(null);
  const [saveError,   setSaveError]     = useState<string | null>(null);

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
      const encKey = await getMasterKey();
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
  }, [uid, getMasterKey, inputValue, onAddVitalReading]);

  const activeChip = QUICK_ENTRY_CHIPS.find((c) => c.key === expandedKey) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {QUICK_ENTRY_CHIPS.map((chip) => {
          const todayVal  = getTodayValue(chip.key);
          const isExpanded = expandedKey === chip.key;
          const isFlashing = flashKey === chip.key;
          const hasValue   = todayVal !== undefined;

          return (
            <NeuralButton
              key={chip.key}
              onClick={() => handleChipTap(chip.key)}
              aria-expanded={isExpanded}
              aria-label={`Quick-log ${chip.label}`}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0',
                'min-h-[44px]', 
                isFlashing
                  ? 'border-[var(--module-color-400)] bg-[var(--module-accent-glow)] text-[var(--module-color-300)] animate-pulse'
                  : hasValue
                  ? 'border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] text-[var(--module-color-300)] hover:bg-[var(--module-accent-glow)]'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80',
                isExpanded && !isFlashing && 'border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] text-[var(--module-color-300)]',
              )}
            >
              {React.createElement(chip.icon, { className: 'w-3.5 h-3.5 flex-shrink-0', 'aria-hidden': true })}
              <span>{chip.label}</span>
              {hasValue ? (
                <span className="text-xs font-semibold text-[var(--module-color-400)]">
                  {Number.isInteger(todayVal) ? todayVal : (todayVal as number).toFixed(1)}{chip.unit}
                </span>
              ) : (
                <Plus className="w-3 h-3 flex-shrink-0 text-white/40" aria-hidden />
              )}
            </NeuralButton>
          );
        })}
      </div>

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
                  {React.createElement(activeChip.icon, { className: 'w-4 h-4 text-[var(--module-color-400)]', 'aria-hidden': true })}
                  <span className="text-sm font-semibold text-white">
                    Log {activeChip.label}
                  </span>
                  <span className="text-xs text-white/40">{activeChip.unit}</span>
                </div>
                <NeuralButton
                  variant="ghost"
                  onClick={() => { setExpandedKey(null); setInputValue(''); setSaveError(null); }}
                  className="text-white/40 hover:text-white/70 transition-colors p-1 h-auto min-h-0"
                  aria-label="Cancel"
                >
                  <X className="w-4 h-4" />
                </NeuralButton>
              </div>

              <div className="flex items-center gap-2">
                <NeuralInput
                  type="number"
                  value={inputValue}
                  onChange={(e) => { setInputValue(e.target.value); setSaveError(null); }}
                  min={activeChip.min}
                  max={activeChip.max}
                  step={activeChip.step}
                  placeholder={`${activeChip.min}–${activeChip.max}`}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(activeChip); }}
                  autoFocus
                  className="flex-1"
                />
                <NeuralButton
                  onClick={() => handleSave(activeChip)}
                  disabled={isSaving || inputValue === ''}
                  themeColor="module"
                  className="min-h-[44px]"
                >
                  {isSaving ? '…' : 'Save'}
                </NeuralButton>
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
  onUpdateProfile: _onUpdateProfile = noop,
  onAddVitalReading = noop,
  onAddAssessment = noop,
  queuedUpload = null,
  onQueuedUploadHandled = noop,
}: SomaDashboardProps) {
  const [activeView, setActiveView] = useState<SomaView>('dashboard');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const toggleAIPanel = useCallback(() => setShowAIPanel(prev => !prev), []);

  // ── Auth / Vault / Diagnosis ────────────────────────────────────────────────
  const { user } = useAuth();
  const { getMasterKey, isUnlocked } = useVault();
  const uid = user?.uid ?? null;
  const isMobile = useIsMobile();
  
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  useEffect(() => {
    if (isUnlocked) {
      getMasterKey().then(setEncryptionKey);
    } else {
      setEncryptionKey(null);
    }
  }, [isUnlocked, getMasterKey]);

  const diagnosis = useDiagnosis({
    moduleId: 'soma',
    encryptionKey,
    profile
  });

  const [diagnosisActiveTab, setDiagnosisActiveTab] = useState<MobileDiagnosisTab>('results');
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [isMerging, setIsMerging] = useState(false);

  // Sync selected IDs from diagnosis.extractedData
  useEffect(() => {
    if (diagnosis.phase === 'active' || diagnosis.phase === 'reviewing') {
      setSelectedFieldIds(diagnosis.extractedData.items.map(i => i.id));
    }
  }, [diagnosis.extractedData.items, diagnosis.phase]);

  useEffect(() => {
    if (diagnosis.phase === 'reviewing') {
      setDiagnosisActiveTab('results');
    }
  }, [diagnosis.phase]);

  useEffect(() => {
    if (queuedUpload) {
      void diagnosis.uploadDocument(queuedUpload).finally(() => onQueuedUploadHandled?.());
    }
  }, [queuedUpload, diagnosis.uploadDocument, onQueuedUploadHandled]);

  const diagnosisSummary = diagnosis.extractedData.metadata.somaSummary as SomaDiagnosisSummary | undefined;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      await diagnosis.mergeSelected(selectedFieldIds);
    } finally {
      setIsMerging(false);
    }
  };

  const handleDiscard = async () => {
    setIsMerging(true);
    try {
      await diagnosis.discardAll();
    } finally {
      setIsMerging(false);
    }
  };

  // Readiness Score
  const readinessScore = externalReadinessScore ?? 0;

  const hasReadinessData = useMemo(() => {
    if (!profile) return false;
    const names = new Set(['resting heart rate', 'restingheartrate', 'sleep quality', 'sleepquality', 'energy level', 'energylevel', 'physical stress', 'stressphysical']);
    return profile.biomarkers.some((b) => {
      const key = typeof b.name === 'string' ? b.name.toLowerCase().replace(/\s+/g, '') : '';
      return names.has(key) && typeof b.value === 'number';
    });
  }, [profile]);

  const heartRateHistory = useMemo(() => {
    return (profile?.vitalReadings ?? [])
      .filter(v => v.heartRate !== undefined)
      .map(v => ({
        date: new Date(v.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: v.heartRate!,
      }))
      .slice(-14);
  }, [profile?.vitalReadings]);

  const weightHistory = useMemo(() => {
    return (profile?.vitalReadings ?? [])
      .filter(v => v.weight !== undefined)
      .map(v => ({
        date: new Date(v.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: v.weight!,
      }))
      .slice(-30);
  }, [profile?.vitalReadings]);

  const aiInsights = useMemo(() => {
    if (!profile) return [];
    const hasData = profile.biomarkers.length > 0 || profile.clearances.length > 0 || profile.labSummaries.length > 0;
    if (!hasData) {
      return [{ type: 'info' as const, message: 'Connect your health data to see AI insights. Import lab results or record biomarkers to get started.' }];
    }
    const insights: Array<{ type: 'info' | 'warning' | 'success'; message: string }> = [];
    const deniedClearances = profile.clearances.filter(c => c.status === 'denied');
    if (deniedClearances.length > 0) insights.push({ type: 'warning', message: `${deniedClearances.length} activity clearance(s) currently denied.` });
    const grantedClearances = profile.clearances.filter(c => c.status === 'granted');
    if (grantedClearances.length > 0) insights.push({ type: 'success', message: `${grantedClearances.length} activity clearance(s) currently active.` });
    const flaggedLabs = profile.labSummaries.filter(l => l.flags.length > 0);
    if (flaggedLabs.length > 0) insights.push({ type: 'warning', message: `${flaggedLabs.length} lab panel(s) have flagged values.` });
    return insights;
  }, [profile]);

  if (isLocked) {
    return <VaultLockedShell moduleName="Soma" moduleDescription="Baseline biological profile and readiness." />;
  }

  if (!profile) {
    return (
      <div className="px-4 md:px-8 pt-6 space-y-4">
        {[...Array(4)].map((_, i) => <div key={i} className="animate-pulse bg-white/5 rounded-lg h-24" />)}
      </div>
    );
  }

  if (!profile.medicalOnboardingComplete) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState title="Set up Soma to get started" description="Complete medical onboarding to unlock your biological dashboard." size="lg" />
      </div>
    );
  }

  const renderDashboard = () => (
    <div className="space-y-6">
      <QuickEntryChips uid={uid} getMasterKey={getMasterKey} allReadings={profile.vitalReadings ?? []} onAddVitalReading={onAddVitalReading} />
      <SurfaceCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-[var(--module-color-400)]" />
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight font-display">Physical Readiness</h2>
              <p className="text-sm text-white/60">Soma readiness score</p>
            </div>
          </div>
          <NeuralButton variant="ghost" themeColor="module" onClick={toggleAIPanel} className="text-xs font-semibold h-auto min-h-0 py-1">{showAIPanel ? 'Hide' : 'Show'} AI Insights</NeuralButton>
        </div>
        <div className="flex items-center gap-8">
          <div className="flex-shrink-0">
            {hasReadinessData ? (
              <ProgressRing percentage={readinessScore} size={140} strokeWidth={12} label="Readiness" color={readinessScore >= 80 ? 'green' : readinessScore >= 60 ? 'amber' : 'orange'} />
            ) : (
              <div className="w-[140px] h-[140px] rounded-full border border-white/10 bg-white/[0.02] flex items-center justify-center text-xs text-white/40 text-center px-4">No readiness data yet</div>
            )}
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5"><p className="text-xs text-white/40 uppercase tracking-wider mb-1">Biomarkers</p><p className="text-2xl font-bold text-white">{profile.biomarkers.length}</p></div>
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5"><p className="text-xs text-white/40 uppercase tracking-wider mb-1">Clearances</p><p className="text-2xl font-bold text-white">{profile.clearances.filter(c => c.status === 'granted').length}</p></div>
          </div>
        </div>
      </SurfaceCard>
      {showAIPanel && <CollapsibleAIPanel insights={aiInsights} onClose={() => setShowAIPanel(false)} />}
      {/* ... (rest of medical profile and trends as before) */}
    </div>
  );

  const renderLabs = () => {
    if (diagnosis.phase === 'idle') {
      return (
        <UniversalUploadZone
          onFileSelected={diagnosis.uploadDocument}
          phase="idle"
          error={diagnosis.parseError}
          themeColor="emerald"
          label="Medical Document"
          description="Upload labs, reports, or images"
          maxSizeMb={15}
        />
      );
    }
    
    if (diagnosis.isParsing) {
      return (
        <DiagnosisProgressCard
          phase={
            diagnosis.parseProgress?.phase === 'ocr' ? 'extracting' :
            diagnosis.parseProgress?.phase === 'extracting' ? 'extracting' :
            diagnosis.parseProgress?.phase === 'complete' ? 'analysing' :
            'uploading' // default fallback if no progress yet
          }
          progress={diagnosis.parseProgress ? (diagnosis.parseProgress.current / diagnosis.parseProgress.total) * 100 : 0}
          onCancel={diagnosis.resetDiagnosis}
        />
      );
    }

    if (diagnosis.phase === 'active' || diagnosis.phase === 'reviewing') {
      const itemsCount = diagnosis.extractedData.items.length;
      return (
        <div className="flex flex-col gap-3">
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[var(--module-accent-faint)] border border-[var(--module-accent-border)] backdrop-blur-sm"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[var(--module-accent-glow)] border border-[var(--module-accent-border)] flex items-center justify-center flex-shrink-0">
                <FileText className="w-3.5 h-3.5 text-[var(--module-color-400)]" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest text-[var(--module-color-400)]">Active Analysis</p>
                <p className="text-[11px] text-white/40 mt-0.5">{itemsCount} items extracted</p>
              </div>
            </div>
            <div className="flex gap-2">
              <NeuralButton variant="ghost" onClick={diagnosis.resetDiagnosis} className="px-3 py-1.5 text-[11px] text-white/40">Reset</NeuralButton>
              <NeuralButton variant="secondary" themeColor="module" onClick={diagnosis.endDiagnosis} className="px-3 py-1.5 text-[11px] font-bold">Review & Merge</NeuralButton>
            </div>
          </motion.div>

          <div className="lg:hidden flex flex-col gap-3">
            {/* Document preview */}
            {diagnosis.parsedDocInfo && (
              <DiagnosisDocumentPreview
                docInfo={diagnosis.parsedDocInfo}
                previewUrl={diagnosis.documentPreviewUrl}
              />
            )}
            
            {/* Mobile extracted data sheet trigger */}
            <MobileExtractedDataSheet
              items={diagnosis.extractedData.items}
              isProcessing={diagnosis.isProcessing}
            />
            
            {/* Mobile tab switcher */}
            <MobileDiagnosisTabs
              activeTab={diagnosisActiveTab}
              onTabChange={setDiagnosisActiveTab}
              resultCount={diagnosis.extractedData.items.length}
            />
            
            {/* Tab content */}
            {diagnosisActiveTab === 'results' ? (
              <DiagnosisResultsScreen
                sessionId="diagnosis"
                detectedPanels={[]}
                items={diagnosis.extractedData.items}
                onSelectionChange={setSelectedFieldIds}
                onClose={diagnosis.endDiagnosis}
                isProcessing={diagnosis.isProcessing}
              />
            ) : (
              <DiagnosisChatPanel summary={diagnosisSummary ?? null} sessionId="diagnosis" ai={diagnosis} />
            )}
          </div>

          <div className="hidden lg:flex gap-4 items-start h-[calc(100vh-200px)]">
            <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col gap-3">
              {/* Document preview - desktop */}
              {diagnosis.parsedDocInfo && (
                <DiagnosisDocumentPreview
                  docInfo={diagnosis.parsedDocInfo}
                  previewUrl={diagnosis.documentPreviewUrl}
                  className="flex-shrink-0"
                />
              )}
              <div className="flex-1 min-h-0 overflow-hidden">
                <DiagnosisResultsScreen
                  sessionId="diagnosis"
                  detectedPanels={[]}
                  items={diagnosis.extractedData.items}
                  onSelectionChange={setSelectedFieldIds}
                  onClose={diagnosis.endDiagnosis}
                  isProcessing={diagnosis.isProcessing}
                />
              </div>
            </div>
            <div className="w-[400px] xl:w-[460px] flex-shrink-0 h-full">
              <DiagnosisChatPanel summary={diagnosisSummary ?? null} sessionId="diagnosis" ai={diagnosis} />
            </div>
          </div>
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
      {diagnosis.phase !== 'idle' && activeView !== 'labs' && (
        <DiagnosisActiveBanner
          sessionId="diagnosis"
          phase={diagnosis.isParsing ? 'parsing' : diagnosis.phase === 'reviewing' ? 'reviewed' : 'parsing'}
          itemCount={diagnosis.extractedData.items.length}
          onReview={() => setActiveView('labs')}
          onEnd={diagnosis.endDiagnosis}
        />
      )}

      <div className="px-4 md:px-8 pt-6 pb-2 md:pb-4">
        <h1 className="text-2xl font-bold text-white tracking-tight font-display">Soma</h1>
        <p className="text-sm text-white/60 mt-1">Physical readiness & biometric tracking</p>
      </div>

      <div className="px-4 md:px-8 pb-3 md:pb-6 border-b border-white/5">
        <NeuralTabGroup<SomaView> tabs={tabs} activeTab={activeView} onTabChange={setActiveView} themeColor="module" variant="pill" layoutIdPrefix="soma-tab" />
      </div>

      <div className="px-4 md:px-8 pt-4 md:pt-6 pb-8 space-y-6">
        {activeView === 'dashboard' && renderDashboard()}
        {activeView === 'vitals' && <VitalsEntryForm onSubmit={(v) => onAddVitalReading({ timestamp: Date.now(), ...v })} />}
        {activeView === 'assessments' && <PhysicalAssessmentForm profile={profile} onSubmit={(a) => onAddAssessment({ id: `pa-${Date.now()}`, timestamp: Date.now(), ...a })} />}
        {activeView === 'history' && <BiometricHistory vitalHistory={profile.vitalReadings ?? []} assessmentHistory={[]} />}
        {activeView === 'labs' && renderLabs()}
      </div>

      {diagnosis._showMergeReview && (
        <DiagnosisCloseModal
          isOpen={diagnosis._showMergeReview}
          sessionId="diagnosis"
          selectedItemCount={selectedFieldIds.length}
          totalItemCount={diagnosis.extractedData.items.length}
          suggestedMedicationCount={diagnosisSummary?.suggestedMedications?.length ?? 0}
          onMerge={handleMerge}
          onDiscard={handleDiscard}
          onCancel={() => diagnosis._setShowMergeReview(false)}
          isProcessing={isMerging}
        />
      )}
    </div>
  );
});
