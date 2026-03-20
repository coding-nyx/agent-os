import React, { useMemo, useCallback } from 'react';
import { AlertTriangle, Camera, FileText, Lock, TestTube2, Plus, TrendingUp, TrendingDown, Minus, Activity, Heart, Droplet, Shield, Sun, BarChart3 } from 'lucide-react';
import type { TitanProfile, GlobalProjection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { PanelLabel } from '@/core/components/PanelLabel';
import { EmptyState } from '@/core/components/EmptyState';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { NeuralButton, type NeuralButtonThemeColor } from '@/core/components/NeuralButton';
import { BiomarkerCharts, VitalsDashboard } from './BiomarkerCharts';
import { SchemaRegistry } from '@/lib/schema-registry';
import type { FieldDefinition } from '@/lib/field-system/types';
import {
  SOMA_FIELD_CATEGORIES,
  evaluateBiomarkerStatus,
  getSomaFieldSuggestions,
  SOMA_FIELD_LIMITS,
} from '@/modules/soma/field-templates';

// ---------------------------------------------------------------------------
// BiomarkerDashboard — Biomarkers tab for the merged Titan dashboard
// Ported from SomaDashboard, adapted for TitanProfile medical fields.
// ---------------------------------------------------------------------------

interface BiomarkerDashboardProps {
  profile: TitanProfile | null;
  soul: GlobalProjection | null;
  isLocked?: boolean;
  themeColor?: NeuralButtonThemeColor;
  onImportLab?: () => void;
  onAnalyzeImage?: () => void;
  onAddBiomarker?: () => void;
  onSelectBiomarker?: (fieldId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 0) return 'just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(months / 12)}y ago`;
}

/** Normalize a flag entry that may be a plain string or { flag, severity } object. */
function normalizeFlag(f: unknown): { flag: string; severity: string } {
  if (typeof f === 'string') return { flag: f, severity: 'info' };
  if (f && typeof f === 'object' && 'flag' in f) {
    const obj = f as { flag: string; severity?: string };
    return { flag: obj.flag, severity: obj.severity ?? 'info' };
  }
  return { flag: String(f), severity: 'info' };
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-rose-500/20 border-rose-500/30 text-rose-300',
  high: 'bg-rose-500/20 border-rose-500/30 text-rose-300',
  warning: 'bg-amber-500/20 border-amber-500/30 text-amber-300',
  moderate: 'bg-amber-500/20 border-amber-500/30 text-amber-300',
  info: 'bg-white/5 border-white/10 text-white/60',
  low: 'bg-white/5 border-white/10 text-white/60',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BiomarkerDashboard({
  profile,
  soul,
  isLocked = false,
  themeColor = 'orange',
  onImportLab,
  onAnalyzeImage,
  onAddBiomarker,
  onSelectBiomarker,
}: BiomarkerDashboardProps) {
  const biomarkers = profile?.biomarkers ?? [];
  const labSummaries = profile?.labSummaries ?? [];

  // ── Extension fields from SchemaRegistry ────────────────────────────
  const extensionFields = useMemo(() => {
    const schema = SchemaRegistry.getSchema('soma');
    return schema?.extensionFields ?? [];
  }, []);

  const extensionFieldIds = useMemo(
    () => extensionFields.map((f) => f.id),
    [extensionFields]
  );

  const availableSuggestions = useMemo(
    () => getSomaFieldSuggestions(extensionFieldIds),
    [extensionFieldIds]
  );

  const canAddMore = extensionFields.length < SOMA_FIELD_LIMITS.maxExtensions;

  const sortedBiomarkers = useMemo(
    () =>
      [...biomarkers]
        .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
        .slice(0, 10),
    [biomarkers]
  );

  const sortedLabs = useMemo(
    () =>
      [...labSummaries]
        .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
        .slice(0, 5),
    [labSummaries]
  );

  // Aggregate clinical flags from lab summaries + medical image analyses
  const aggregatedFlags = useMemo(() => {
    const flags: { flag: string; severity: string; source: string }[] = [];
    for (const lab of labSummaries) {
      for (const f of lab.flags ?? []) {
        const norm = normalizeFlag(f);
        flags.push({ ...norm, source: lab.panel });
      }
    }
    for (const img of profile?.medicalImageAnalyses ?? []) {
      for (const f of img.clinicalFlags ?? []) {
        flags.push({ flag: f.flag, severity: f.severity, source: 'Image analysis' });
      }
    }
    return flags;
  }, [labSummaries, profile?.medicalImageAnalyses]);

  const clinicalFlagCount = aggregatedFlags.length;

  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Soma Labs"
        moduleDescription="Clinical biomarkers and physiological readiness."
      />
    );
  }

  return (
    <div
      className="p-6 md:p-8 space-y-8"
      role="tabpanel"
      id="titan-panel-biomarkers"
      aria-labelledby="titan-tab-biomarkers"
    >
      {/* Medical Disclaimer */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200/80">
        <p className="font-semibold text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          Medical Disclaimer
        </p>
        <p className="mt-1">
          Titan provides informational guidance only. It does not provide medical diagnoses,
          treatment plans, or replace professional medical advice. Always consult a qualified
          healthcare provider for medical decisions.
        </p>
      </div>

      {/* Biomarker Stats Row */}
      <SectionHeader
        label="Biological Telemetry"
        title="Biomarker Overview"
        subtitle="Tracked biomarkers, lab panels, and clinical flags."
        accentClassName="text-orange-400"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Biomarkers"
          value={biomarkers.length}
          accentClassName="text-orange-400"
          isEmpty={biomarkers.length === 0}
        />
        <StatCard
          label="Lab Reports"
          value={labSummaries.length}
          accentClassName="text-orange-400"
          isEmpty={labSummaries.length === 0}
        />
        <StatCard
          label="Clinical Flags"
          value={clinicalFlagCount}
          accentClassName={clinicalFlagCount > 0 ? 'text-amber-400' : 'text-orange-400'}
          isEmpty={clinicalFlagCount === 0}
        />
      </div>

      {/* Vitals Dashboard */}
      {biomarkers.length > 0 && (
        <section className="space-y-3" aria-label="Vital signs">
          <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider">
            Current Vitals
          </h4>
          <VitalsDashboard
            heartRate={biomarkers.find(b => b.name.toLowerCase().includes('heart rate'))?.value as number}
            bloodPressureSystolic={biomarkers.find(b => b.name.toLowerCase().includes('systolic'))?.value as number}
            bloodPressureDiastolic={biomarkers.find(b => b.name.toLowerCase().includes('diastolic'))?.value as number}
            spo2={biomarkers.find(b => b.name.toLowerCase().includes('spo2') || b.name.toLowerCase().includes('oxygen'))?.value as number}
          />
        </section>
      )}

      {/* Biomarker Trends */}
      {biomarkers.length > 0 && (
        <section className="space-y-3" aria-label="Biomarker trends">
          <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider">
            Biomarker Trends
          </h4>
          <BiomarkerCharts biomarkers={biomarkers} />
        </section>
      )}

      {/* Biomarker List */}
      <section className="space-y-4" aria-label="Latest biomarkers">
        <PanelLabel label="Latest Biomarkers" metadata={`${sortedBiomarkers.length} entries`} />
        {sortedBiomarkers.length === 0 ? (
          <EmptyState
            size="sm"
            icon={TestTube2}
            title="No biomarker entries yet"
            description="Import lab results or add biomarkers via the Titan chat."
            className="bg-transparent border-white/10"
            action={
              <div className="flex gap-2">
                <NeuralButton size="sm" themeColor={themeColor} onClick={onImportLab}>
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Import
                </NeuralButton>
              </div>
            }
          />
        ) : (
          sortedBiomarkers.map((entry) => (
            <SurfaceCard key={entry.id} className="p-3">
              <div 
                className="flex items-center justify-between text-xs px-1"
                style={{ paddingTop: 'var(--list-item-py)', paddingBottom: 'var(--list-item-py)' }}
              >
                <div className="space-y-1 min-w-0">
                  <span className="font-bold text-white/90 truncate block text-sm">{entry.name}</span>
                  <span className="text-white/40 text-xs">
                    {entry.source && `${entry.source} · `}
                    {formatRelativeTime(entry.recordedAt)}
                  </span>
                </div>
                <span className="font-bold text-orange-300 tabular-nums shrink-0 ml-3 text-sm">
                  {entry.value}
                  {entry.unit ? ` ${entry.unit}` : ''}
                </span>
              </div>
            </SurfaceCard>
          ))
        )}
      </section>

      {/* Custom Biomarkers (Extension Fields) */}
      <CustomBiomarkersSection
        extensionFields={extensionFields}
        canAddMore={canAddMore}
        onAddBiomarker={onAddBiomarker}
        onSelectBiomarker={onSelectBiomarker}
        extensionCount={extensionFields.length}
        maxExtensions={SOMA_FIELD_LIMITS.maxExtensions}
        themeColor={themeColor}
      />

      {/* Lab Summaries */}
      <section className="space-y-4" aria-label="Lab summaries">
        <PanelLabel label="Lab Summaries" metadata={`${sortedLabs.length} reports`} />
        {sortedLabs.length === 0 ? (
          <EmptyState
            size="sm"
            icon={FileText}
            title="No lab reports yet"
            description="Import a lab report to populate this section."
            className="bg-transparent border-white/10"
          />
        ) : (
          sortedLabs.map((lab) => {
            const labFlags = (lab.flags ?? []).map(normalizeFlag);
            return (
              <SurfaceCard key={lab.id} className="p-4">
                <div 
                  className="flex items-center justify-between"
                  style={{ paddingBottom: 'var(--list-item-py)' }}
                >
                  <span className="text-sm font-bold text-white/90">{lab.panel}</span>
                  <span className="text-xs text-white/40">
                    {formatRelativeTime(lab.recordedAt)}
                  </span>
                </div>

                {/* Findings */}
                {lab.findings.length > 0 && (
                  <ul className="space-y-1">
                    {lab.findings.map((finding, idx) => (
                      <li key={idx} className="text-[11px] text-white/60 leading-relaxed pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-white/30">
                        {finding}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Flags with severity badges */}
                {labFlags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {labFlags.map((f, idx) => (
                      <span
                        key={idx}
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold',
                          SEVERITY_COLORS[f.severity] ?? SEVERITY_COLORS.info
                        )}
                      >
                        {f.flag}
                      </span>
                    ))}
                  </div>
                )}
              </SurfaceCard>
            );
          })
        )}
      </section>

      {/* Action Buttons */}
      <section className="space-y-3" aria-label="Lab actions">
        <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider">
          Import &amp; Analysis
        </h4>
        <SurfaceCard className="p-4">
          <p className="text-xs text-white/50 mb-3">
            Capture with your camera or upload CSV/text exports for best results. PDFs are accepted
            but may require cleaning.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <NeuralButton
              onClick={onImportLab}
              themeColor={themeColor}
              size="sm"
            >
              <FileText className="w-4 h-4" aria-hidden="true" />
              Import Lab
            </NeuralButton>
            <NeuralButton
              onClick={onAnalyzeImage}
              themeColor={themeColor}
              size="sm"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              Analyze Image
            </NeuralButton>
          </div>
        </SurfaceCard>
      </section>

      {/* Clinical Flags — aggregated from all sources */}
      <section className="space-y-3" aria-label="Clinical flags">
        <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider">
          Clinical Flags
        </h4>
        {aggregatedFlags.length === 0 ? (
          <div className="rounded-2xl border border-[var(--module-accent-border)] bg-[var(--module-accent-faint)] p-4 text-xs text-[var(--module-color-300)]">
            No clinical flags detected across lab reports and image analyses.
          </div>
        ) : (
          aggregatedFlags.map((f, idx) => (
            <div
              key={idx}
              role="alert"
              className={cn(
                'rounded-2xl border p-4 flex items-start gap-3',
                f.severity === 'critical' || f.severity === 'high'
                  ? 'border-rose-500/20 bg-rose-500/5'
                  : f.severity === 'warning' || f.severity === 'moderate'
                    ? 'border-amber-500/20 bg-amber-500/5'
                    : 'border-white/10 bg-white/[0.03]'
              )}
            >
              <AlertTriangle
                className={cn(
                  'w-4 h-4 mt-0.5 shrink-0',
                  f.severity === 'critical' || f.severity === 'high'
                    ? 'text-rose-400'
                    : f.severity === 'warning' || f.severity === 'moderate'
                      ? 'text-amber-400'
                      : 'text-white/40'
                )}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs text-white/80 leading-relaxed">{f.flag}</p>
                <p className="text-[10px] text-white/30 mt-0.5">Source: {f.source}</p>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Biomarkers Section — renders extension fields from SchemaRegistry
// ---------------------------------------------------------------------------

/** Map category keys to Lucide icon components */
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  vitals: Heart,
  hormones: Activity,
  metabolic: Droplet,
  general: Shield,
};

/** Color class mapping for biomarker status */
const STATUS_STYLE: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  normal: {
    border: 'border-[var(--module-accent-border)]',
    bg: 'bg-[var(--module-accent-faint)]',
    text: 'text-[var(--module-color-400)]',
    dot: 'bg-[var(--module-color-400)]',
  },
  warning: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
  },
  critical: {
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/5',
    text: 'text-rose-400',
    dot: 'bg-rose-400',
  },
  unknown: {
    border: 'border-white/10',
    bg: 'bg-white/[0.03]',
    text: 'text-white/60',
    dot: 'bg-white/30',
  },
};

/** Color class mapping for category accents */
const CATEGORY_ACCENT: Record<string, string> = {
  emerald: 'text-emerald-400 border-emerald-500/30',
  purple: 'text-purple-400 border-purple-500/30',
  amber: 'text-amber-400 border-amber-500/30',
  cyan: 'text-cyan-400 border-cyan-500/30',
};

interface CustomBiomarkersSectionProps {
  extensionFields: FieldDefinition[];
  canAddMore: boolean;
  onAddBiomarker?: () => void;
  onSelectBiomarker?: (fieldId: string) => void;
  extensionCount: number;
  maxExtensions: number;
  themeColor?: NeuralButtonThemeColor;
}

function CustomBiomarkersSection({
  extensionFields,
  canAddMore,
  onAddBiomarker,
  onSelectBiomarker,
  extensionCount,
  maxExtensions,
  themeColor = 'orange',
}: CustomBiomarkersSectionProps) {
  return (
    <section className="space-y-3" aria-label="Custom biomarkers">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider">
          Custom Biomarkers
          {extensionCount > 0 && (
            <span className="ml-2 text-white/30 font-normal">
              {extensionCount}/{maxExtensions}
            </span>
          )}
        </h4>
        {onAddBiomarker && (
          <NeuralButton
            size="sm"
            themeColor={themeColor}
            onClick={onAddBiomarker}
            disabled={!canAddMore}
          >
            <Plus className="w-3 h-3 mr-1" aria-hidden="true" />
            Add Biomarker
          </NeuralButton>
        )}
      </div>

      {extensionFields.length === 0 ? (
        <EmptyState
          size="sm"
          icon={TestTube2}
          title="No custom biomarkers"
          description="Add custom biomarkers to track lab values, hormones, and health metrics beyond core vitals."
          className="bg-transparent border-white/10"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {extensionFields.map((field) => (
            <CustomBiomarkerCard
              key={field.id}
              field={field}
              onSelect={onSelectBiomarker}
            />
          ))}
        </div>
      )}

      {!canAddMore && extensionFields.length > 0 && (
        <p className="text-[10px] text-amber-300/60 italic">
          Maximum custom biomarkers reached ({maxExtensions}/{maxExtensions}).
          Remove a field to add a new one.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Individual Custom Biomarker Card
// ---------------------------------------------------------------------------

interface CustomBiomarkerCardProps {
  field: FieldDefinition;
  onSelect?: (fieldId: string) => void;
}

function CustomBiomarkerCard({ field, onSelect }: CustomBiomarkerCardProps) {
  const category = field.metadata?.category || 'general';
  const categoryInfo =
    SOMA_FIELD_CATEGORIES[category as keyof typeof SOMA_FIELD_CATEGORIES];
  const categoryColor = categoryInfo?.color || 'emerald';
  const categoryLabel = categoryInfo?.label || 'General Health';
  const unit = field.metadata?.unit || '';

  const CategoryIcon =
    CATEGORY_ICONS[category] || Shield;

  // Determine status based on current value (if numeric)
  const status =
    field.defaultValue != null && typeof field.defaultValue === 'number'
      ? evaluateBiomarkerStatus(field.id, field.defaultValue)
      : 'unknown';
  const statusStyle = STATUS_STYLE[status] || STATUS_STYLE.unknown;

  const handleClick = useCallback(() => {
    onSelect?.(field.id);
  }, [onSelect, field.id]);

  return (
    <SurfaceCard
      className={cn(
        'p-3.5 cursor-pointer transition-all hover:ring-1 hover:ring-white/10',
        statusStyle.bg,
        statusStyle.border
      )}
    >
      <button
        onClick={handleClick}
        className="w-full text-left min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]"
        aria-label={`View details for ${field.name}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                `bg-${categoryColor}-500/10 border border-${categoryColor}-500/20`
              )}
              style={{
                backgroundColor: `color-mix(in srgb, var(--color-${categoryColor}-500, #10b981) 10%, transparent)`,
                borderColor: `color-mix(in srgb, var(--color-${categoryColor}-500, #10b981) 20%, transparent)`,
              }}
            >
              <CategoryIcon
                className={cn('w-3.5 h-3.5', CATEGORY_ACCENT[categoryColor]?.split(' ')[0] || 'text-[var(--module-color-400)]')}
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white/90 block truncate">
                {field.name}
              </span>
              <span className="text-[9px] text-white/40 uppercase tracking-wider">
                {categoryLabel}
              </span>
            </div>
          </div>

          {/* Status Indicator */}
          <div className="flex items-center gap-1 shrink-0">
            <div
              className={cn('w-1.5 h-1.5 rounded-full', statusStyle.dot)}
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Value display */}
        <div className="mt-2 flex items-end justify-between">
          <span className={cn('text-lg font-bold tabular-nums', statusStyle.text)}>
            {field.defaultValue != null ? String(field.defaultValue) : '—'}
          </span>
          {unit && (
            <span className="text-[10px] text-white/30 mb-0.5 ml-1">
              {unit}
            </span>
          )}
        </div>

        {/* Description (truncated) */}
        {field.description && (
          <p className="text-[10px] text-white/30 mt-1.5 line-clamp-2 leading-relaxed">
            {field.description}
          </p>
        )}
      </button>
    </SurfaceCard>
  );
}
