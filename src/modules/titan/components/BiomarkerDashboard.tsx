import React, { useMemo } from 'react';
import { AlertTriangle, Camera, FileText, Lock, TestTube2 } from 'lucide-react';
import type { TitanProfile, GlobalProjection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';

// ---------------------------------------------------------------------------
// BiomarkerDashboard — Biomarkers tab for the merged Titan dashboard
// Ported from SomaDashboard, adapted for TitanProfile medical fields.
// ---------------------------------------------------------------------------

interface BiomarkerDashboardProps {
  profile: TitanProfile | null;
  soul: GlobalProjection | null;
  isLocked?: boolean;
  onImportLab?: () => void;
  onAnalyzeImage?: () => void;
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
  onImportLab,
  onAnalyzeImage,
}: BiomarkerDashboardProps) {
  if (isLocked) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Vault locked"
          description="Unlock Titan to view biomarkers and lab telemetry."
          size="lg"
          icon={Lock}
        />
      </div>
    );
  }

  const biomarkers = profile?.biomarkers ?? [];
  const labSummaries = profile?.labSummaries ?? [];

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

      {/* Biomarker List */}
      <section className="space-y-3" aria-label="Latest biomarkers">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
          Latest Biomarkers
        </h4>
        {sortedBiomarkers.length === 0 ? (
          <EmptyState
            size="sm"
            icon={TestTube2}
            title="No biomarker entries yet"
            description="Import lab results or add biomarkers via the Titan chat."
            className="bg-transparent border-white/10"
          />
        ) : (
          sortedBiomarkers.map((entry) => (
            <SurfaceCard key={entry.id} className="p-3">
              <div className="flex items-center justify-between text-xs">
                <div className="space-y-0.5 min-w-0">
                  <span className="font-bold text-white/90 truncate block">{entry.name}</span>
                  <span className="text-white/40 text-[10px]">
                    {entry.source && `${entry.source} · `}
                    {formatRelativeTime(entry.recordedAt)}
                  </span>
                </div>
                <span className="font-bold text-orange-300 tabular-nums shrink-0 ml-3">
                  {entry.value}
                  {entry.unit ? ` ${entry.unit}` : ''}
                </span>
              </div>
            </SurfaceCard>
          ))
        )}
      </section>

      {/* Lab Summaries */}
      <section className="space-y-3" aria-label="Lab summaries">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
          Lab Summaries
        </h4>
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
              <SurfaceCard key={lab.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white/90">{lab.panel}</span>
                  <span className="text-[10px] text-white/40">
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
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
          Import &amp; Analysis
        </h4>
        <SurfaceCard className="p-4">
          <p className="text-xs text-white/50 mb-3">
            Capture with your camera or upload CSV/text exports for best results. PDFs are accepted
            but may require cleaning.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onImportLab}
              className="flex items-center justify-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs text-orange-300 cursor-pointer hover:bg-orange-500/15 transition-colors font-semibold"
            >
              <FileText className="w-4 h-4" aria-hidden="true" />
              Import Lab Report
            </button>
            <button
              onClick={onAnalyzeImage}
              className="flex items-center justify-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs text-orange-300 cursor-pointer hover:bg-orange-500/15 transition-colors font-semibold"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              Analyze Medical Image
            </button>
          </div>
        </SurfaceCard>
      </section>

      {/* Clinical Flags — aggregated from all sources */}
      <section className="space-y-3" aria-label="Clinical flags">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
          Clinical Flags
        </h4>
        {aggregatedFlags.length === 0 ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-300">
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
