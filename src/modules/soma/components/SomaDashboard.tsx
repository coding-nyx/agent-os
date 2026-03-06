import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, HeartPulse, ShieldCheck, TestTube2, TrendingDown, TrendingUp, FileText, Lock } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { VitalsGrid } from '@/core/components/VitalsGrid';
import { SomaProfile } from '../services/soma-profile-service';
import { parseLabFile } from '../services/lab-import-service';
import { SectionHeader } from '@/core/components/SectionHeader';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { NSV_DERIVED_METRICS, isMetricStale } from '@/lib/services/nsv-ownership';

type BiomarkerTrend = {
  name: string;
  delta: number;
  unit?: string;
  direction: 'up' | 'down' | 'flat';
};

function parseNumeric(value: number | string): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toneAbove(
  value: number | null | undefined,
  threshold: number,
  highClass: string,
  lowClass: string,
  neutralClass = 'text-white/40'
): string {
  if (typeof value !== 'number') return neutralClass;
  return value > threshold ? highClass : lowClass;
}

function toneBelow(
  value: number | null | undefined,
  threshold: number,
  lowClass: string,
  highClass: string,
  neutralClass = 'text-white/40'
): string {
  if (typeof value !== 'number') return neutralClass;
  return value < threshold ? lowClass : highClass;
}

export function SomaDashboard({
  soul,
  profile,
  onImportLab,
  isLocked = false,
  onCalibrate
}: {
  soul: GlobalProjection | null;
  profile: SomaProfile | null;
  onImportLab?: (payload: { text: string; filename: string; mime?: string; notes?: string[] }) => Promise<void> | void;
  isLocked?: boolean;
  onCalibrate?: (metricKey: string) => void;
}) {
  if (isLocked) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Vault locked"
          description="Unlock Soma to view biometrics and lab telemetry."
          size="lg"
          icon={Lock}
        />
      </div>
    );
  }

  if (!soul) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Biological link pending"
          description="Connect your biomarkers or upload labs to activate the medical dashboard."
          size="lg"
        />
      </div>
    );
  }

  const state = soul.crossFunctionalState;
  const bio = state.biological;
  const lastUpdated = state.lastUpdated || {};

  const metrics = [
    {
      label: 'CNS Fatigue',
      value: typeof bio.cnsFatigue === 'number' ? bio.cnsFatigue : null,
      max: 10,
      icon: Activity,
      colorClass: toneAbove(bio.cnsFatigue, 7, 'text-red-400', 'text-emerald-300'),
      metricKey: 'biological.cnsFatigue',
      lastUpdated: lastUpdated['biological.cnsFatigue'],
      isDerived: NSV_DERIVED_METRICS.includes('biological.cnsFatigue') || isMetricStale(lastUpdated['biological.cnsFatigue'], 7)
    },
    {
      label: 'Sleep Quality',
      value: typeof bio.sleepQuality === 'number' ? bio.sleepQuality : null,
      max: 10,
      icon: HeartPulse,
      colorClass: toneBelow(bio.sleepQuality, 4, 'text-red-400', 'text-cyan-300'),
      metricKey: 'biological.sleepQuality',
      lastUpdated: lastUpdated['biological.sleepQuality'],
      isDerived: NSV_DERIVED_METRICS.includes('biological.sleepQuality') || isMetricStale(lastUpdated['biological.sleepQuality'], 7)
    },
    {
      label: 'Recovery Score',
      value: typeof bio.recoveryScore === 'number' ? bio.recoveryScore : null,
      max: 10,
      icon: ShieldCheck,
      colorClass: toneBelow(bio.recoveryScore, 4, 'text-orange-300', 'text-emerald-300'),
      metricKey: 'biological.recoveryScore',
      lastUpdated: lastUpdated['biological.recoveryScore'],
      isDerived: NSV_DERIVED_METRICS.includes('biological.recoveryScore') || isMetricStale(lastUpdated['biological.recoveryScore'], 7)
    },
    {
      label: 'Biomarkers',
      value: profile?.biomarkers.length ?? null,
      max: Math.max(profile?.biomarkers.length || 1, 1),
      icon: TestTube2,
      colorClass: 'text-emerald-300'
    }
  ];

  const flags: string[] = [];
  if (typeof bio.cnsFatigue === 'number' && bio.cnsFatigue > 7) {
    flags.push('CNS fatigue elevated. Decrease high-intensity load until recovery normalizes.');
  }
  if (typeof bio.sleepQuality === 'number' && bio.sleepQuality < 4) {
    flags.push('Sleep quality low. Prioritize sleep protection before load progression.');
  }
  if (typeof bio.recoveryScore === 'number' && bio.recoveryScore < 4) {
    flags.push('Recovery score indicates limited readiness for aggressive training.');
  }

  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const trends = useMemo<BiomarkerTrend[]>(() => {
    if (!profile?.biomarkers.length) return [];
    const grouped = profile.biomarkers.reduce<Record<string, typeof profile.biomarkers>>((acc, entry) => {
      const key = entry.name || 'biomarker';
      acc[key] = acc[key] ? [...acc[key], entry] : [entry];
      return acc;
    }, {});

    const mapped = Object.entries(grouped).map(([name, entries]) => {
      const sorted = [...entries].sort(
        (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
      );
      const recent = sorted.slice(0, 3).map((entry) => parseNumeric(entry.value)).filter((v): v is number => v !== null);
      const prior = sorted.slice(3, 6).map((entry) => parseNumeric(entry.value)).filter((v): v is number => v !== null);
      if (recent.length === 0 || prior.length === 0) return null;

      const avgRecent = recent.reduce((sum, v) => sum + v, 0) / recent.length;
      const avgPrior = prior.reduce((sum, v) => sum + v, 0) / prior.length;
      const delta = avgRecent - avgPrior;
      const direction: BiomarkerTrend['direction'] =
        Math.abs(delta) < 0.01 ? 'flat' : delta > 0 ? 'up' : 'down';

      const trend: BiomarkerTrend = {
        name,
        delta,
        unit: sorted[0]?.unit,
        direction
      };
      return trend;
    });

    return mapped.filter((entry): entry is BiomarkerTrend => entry !== null).slice(0, 5);
  }, [profile?.biomarkers]);

  return (
    <div className="p-8 space-y-8">
      <SectionHeader
        label="Biological SoT"
        title="Medical Dashboard"
        subtitle="Complete health telemetry and AI physician assistance."
        accentClassName="text-emerald-400"
      />

      <VitalsGrid metrics={metrics} columns={2} isLocked={isLocked} onCalibrate={onCalibrate} />

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200/80">
        <p className="font-semibold text-amber-300">Medical Disclaimer</p>
        <p className="mt-1">Soma provides informational guidance only. It does not provide medical diagnoses, treatment plans, or replace professional medical advice. Always consult a qualified healthcare provider for medical decisions.</p>
      </div>

      <section className="space-y-3" aria-label="Clinical flags">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">Clinical Flags</h4>
        {flags.length === 0 ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-300">
            No elevated biological risk flags detected.
          </div>
        ) : (
          flags.map((flag, index) => (
            <div key={index} role="alert" className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-amber-100/80 leading-relaxed">{flag}</p>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3" aria-label="Latest biomarkers">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">Latest Biomarkers</h4>
        {(profile?.biomarkers || []).slice(0, 5).map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70 flex justify-between">
            <span>{entry.name}</span>
            <span className="font-bold text-emerald-300">
              {entry.value}
              {entry.unit ? ` ${entry.unit}` : ''}
            </span>
          </div>
        ))}
        {!profile?.biomarkers.length && (
          <EmptyState
            size="sm"
            title="No biomarker entries yet"
            description="Add data via chat using Soma actions."
            className="bg-transparent border-white/10"
          />
        )}
      </section>

      <section className="space-y-3" aria-label="Biomarker trends">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">Biomarker Trends</h4>
        {trends.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-xs text-white/70">
            Not enough history yet to calculate trends.
          </div>
        ) : (
          trends.map((trend) => {
            const Icon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : TestTube2;
            const color =
              trend.direction === 'up' ? 'text-emerald-300' : trend.direction === 'down' ? 'text-amber-300' : 'text-white/70';
            return (
              <div key={trend.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-white/70">
                  <Icon className={`w-4 h-4 ${color}`} aria-hidden="true" />
                  <span>{trend.name}</span>
                </div>
                <span className={`text-xs font-bold ${color}`}>
                  {trend.delta > 0 ? '+' : ''}
                  {trend.delta.toFixed(2)}
                  {trend.unit ? ` ${trend.unit}` : ''}
                </span>
              </div>
            );
          })
        )}
      </section>

      <section className="space-y-3" aria-label="Lab import">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">Lab Import</h4>
        <SurfaceCard className="p-4 space-y-3">
          <p className="text-xs text-white/70">
            Upload CSV or text exports for best results. PDFs are accepted but may require cleaning.
          </p>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/70 cursor-pointer hover:bg-black/40 transition-colors">
            <span>{isImporting ? 'Importing...' : 'Select lab file'}</span>
            <FileText className="w-4 h-4 text-emerald-300" aria-hidden="true" />
            <input
              type="file"
              accept=".csv,.txt,.pdf"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setImportError(null);
                setIsImporting(true);
                try {
                  const result = await parseLabFile(file);
                  if (!result.text.trim()) {
                    setImportError('Unable to read file contents.');
                  } else if (onImportLab) {
                    await onImportLab({ text: result.text, filename: file.name, mime: file.type, notes: result.notes });
                  }
                } catch (error) {
                  console.error('Lab import failed:', error);
                  setImportError('Lab import failed. Try CSV or text.');
                } finally {
                  setIsImporting(false);
                  event.currentTarget.value = '';
                }
              }}
              disabled={isImporting}
            />
          </label>
          {importError && <div className="text-xs text-amber-300" role="alert">{importError}</div>}
        </SurfaceCard>
      </section>
    </div>
  );
}
