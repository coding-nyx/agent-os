/**
 * DataBackupPanel — S10-006
 *
 * "Data & Backup" settings panel for the Profile page.
 *
 * Responsibilities (Single Responsibility — one panel, one concern):
 *  - Export: calls exportAllData → triggers browser file-save via downloadAraExport
 *  - Import: reads a user-selected .json file → calls importData → shows inline feedback
 *
 * No Cloud Functions. All reads/writes are client-side Firestore via the data layer.
 * The vault key is not passed to exportAllData so encrypted fields remain encrypted.
 */

import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Upload, DatabaseZap, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { GlassCard } from '@/core/components/GlassCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { exportAllData, downloadAraExport } from '@/lib/services/data-export-service';
import { importData } from '@/lib/services/data-import-service';

// ─── Local types ───────────────────────────────────────────────────────────────

type FeedbackState =
  | { kind: 'idle' }
  | { kind: 'loading'; label: string }
  | { kind: 'success'; title: string; detail: string }
  | { kind: 'error'; title: string; detail: string };

// ─── Animation variants (matches SystemPanel patterns) ─────────────────────────

const panelVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const feedbackVariants = {
  hidden: { opacity: 0, y: -6, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function DataBackupPanel() {
  const { user } = useAuth();
  const dataLayer = useDataLayer();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exportFeedback, setExportFeedback] = useState<FeedbackState>({ kind: 'idle' });
  const [importFeedback, setImportFeedback] = useState<FeedbackState>({ kind: 'idle' });

  // ── Export handler ──────────────────────────────────────────────────────────
  const handleExport = async (): Promise<void> => {
    if (!user) {
      setExportFeedback({ kind: 'error', title: 'Not signed in', detail: 'Please sign in to export data.' });
      return;
    }

    setExportFeedback({ kind: 'loading', label: 'Assembling export…' });

    try {
      const bundle = await exportAllData(user.uid, dataLayer);
      const isoDate = new Date().toISOString().slice(0, 10);
      downloadAraExport(bundle, `ara-export-${isoDate}.json`);

      const moduleCount = Object.keys(bundle.modules).length;
      setExportFeedback({
        kind: 'success',
        title: 'Export complete',
        detail: `${moduleCount} module${moduleCount !== 1 ? 's' : ''} exported. Check your downloads folder.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error during export.';
      setExportFeedback({ kind: 'error', title: 'Export failed', detail: message });
    }
  };

  // ── Import handler ──────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-selected after an error
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    if (!user) {
      setImportFeedback({ kind: 'error', title: 'Not signed in', detail: 'Please sign in to restore a backup.' });
      return;
    }

    setImportFeedback({ kind: 'loading', label: 'Reading backup file…' });

    let jsonString: string;
    try {
      jsonString = await file.text();
    } catch {
      setImportFeedback({ kind: 'error', title: 'File read error', detail: 'Could not read the selected file.' });
      return;
    }

    setImportFeedback({ kind: 'loading', label: 'Restoring data…' });

    try {
      const result = await importData(jsonString, user.uid, dataLayer);

      if (!result.success) {
        setImportFeedback({
          kind: 'error',
          title: 'Restore failed',
          detail: result.errors[0] ?? 'The backup file could not be processed.',
        });
        return;
      }

      const restored = result.modulesRestored.length;
      const skipped = result.errors.filter((e) => e.startsWith('Skipped')).length;
      const failed = result.errors.filter((e) => e.startsWith('Failed')).length;

      let detail = `${restored} item${restored !== 1 ? 's' : ''} restored.`;
      if (skipped > 0) detail += ` ${skipped} skipped (live data was newer).`;
      if (failed > 0) detail += ` ${failed} failed — check console.`;

      setImportFeedback({ kind: 'success', title: 'Restore complete', detail });

      // Log non-fatal issues to aid debugging without alarming the user
      if (result.errors.length > 0) {
        console.warn('[DataBackupPanel] import warnings:', result.errors);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error during restore.';
      setImportFeedback({ kind: 'error', title: 'Restore failed', detail: message });
    }
  };

  return (
    <motion.div variants={panelVariants} initial="hidden" animate="visible" className="space-y-6">

      {/* ── Section header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
          <DatabaseZap className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-violet-400/60 font-black">
            Data Portability
          </p>
          <p className="text-xs text-white/40 leading-tight mt-0.5">
            Export a full snapshot of your data or restore from a previous backup.
          </p>
        </div>
      </div>

      {/* ── Export card ─────────────────────────────────────────────────────── */}
      <GlassCard className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
            <Download className="w-4.5 h-4.5 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white/90">Export All Data</h3>
            <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
              Downloads a{' '}
              <span className="font-semibold text-white/60">.json</span> snapshot of every module
              profile, your Global Soul, and any vault-encrypted fields (kept encrypted). Use this
              as an offline backup or to migrate to another account.
            </p>

            {/* Export feedback */}
            <FeedbackBanner state={exportFeedback} className="mt-3" />

            <div className="mt-4">
              <NeuralButton
                variant="secondary"
                size="sm"
                themeColor="indigo"
                disabled={exportFeedback.kind === 'loading' || !user}
                onClick={() => { void handleExport(); }}
              >
                {exportFeedback.kind === 'loading' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {exportFeedback.kind === 'loading' ? exportFeedback.label : 'Export All Data'}
              </NeuralButton>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── Import card ─────────────────────────────────────────────────────── */}
      <GlassCard className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Upload className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white/90">Restore from Backup</h3>
            <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
              Select a <span className="font-semibold text-white/60">ara-export-*.json</span>{' '}
              file. Only modules where the backup is newer than your current data will be
              overwritten — existing newer data is never replaced.
            </p>

            {/* Restore feedback */}
            <FeedbackBanner state={importFeedback} className="mt-3" />

            <div className="mt-4">
              {/* Hidden file input — triggered by the button below */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                aria-label="Select backup file"
                className="sr-only"
                onChange={(e) => { void handleFileChange(e); }}
              />
              <NeuralButton
                variant="secondary"
                size="sm"
                themeColor="amber"
                disabled={importFeedback.kind === 'loading' || !user}
                onClick={() => fileInputRef.current?.click()}
              >
                {importFeedback.kind === 'loading' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                {importFeedback.kind === 'loading' ? importFeedback.label : 'Choose Backup File'}
              </NeuralButton>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── Informational note ───────────────────────────────────────────────── */}
      <div className="px-1">
        <p className="text-[11px] text-white/20 leading-relaxed">
          <span className="font-bold text-white/30">Privacy note:</span> Exports are stored only on
          your device. Vault-encrypted fields remain encrypted in the file — they are readable only
          with your vault key.
        </p>
      </div>
    </motion.div>
  );
}

// ─── Feedback banner sub-component ────────────────────────────────────────────

interface FeedbackBannerProps {
  state: FeedbackState;
  className?: string;
}

function FeedbackBanner({ state, className = '' }: FeedbackBannerProps) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'loading') return null; // Loading shown inline on button

  const isSuccess = state.kind === 'success';

  return (
    <motion.div
      variants={feedbackVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 border ${
        isSuccess
          ? 'bg-emerald-500/8 border-emerald-500/20'
          : 'bg-rose-500/8 border-rose-500/20'
      } ${className}`}
    >
      {isSuccess ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
      )}
      <div>
        <p className={`text-xs font-bold ${isSuccess ? 'text-emerald-300' : 'text-rose-300'}`}>
          {state.title}
        </p>
        <p className="text-[11px] text-white/45 mt-0.5 leading-relaxed">{state.detail}</p>
      </div>
    </motion.div>
  );
}
