/**
 * ShareCard — Downloadable PR / Workout Summary card.
 *
 * Renders a visually polished card inside a NeuralModal.
 * Supports two modes:
 *   - 'pr'             → Personal Record achievement card
 *   - 'workout_summary'→ Post-session summary card
 *
 * Download strategy: Canvas API (no external dependencies).
 *   drawShareCard() renders a 800×450 canvas and triggers a PNG download.
 *
 * Architecture:
 *   - ShareCardPreview → the styled <div> preview inside the modal
 *   - drawShareCard    → pure Canvas renderer (no DOM references needed)
 *   - ShareCard        → root modal component
 *
 * Complexity: O(1) — fixed-size canvas, bounded exercise list.
 */

import React, { useRef } from 'react';
import { Share2, Download, Copy, Trophy, Dumbbell } from 'lucide-react';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────

export type ShareCardType = 'pr' | 'workout_summary';

export interface ShareCardProps {
  type: ShareCardType;
  // PR card fields
  prExercise?: string;
  prWeight?: number;
  prReps?: number;
  prDate?: string;
  // Workout summary fields
  sessionDate?: string;
  sessionExercises?: string[];
  totalSets?: number;
  totalVolume?: number;
  durationMinutes?: number;
  isOpen: boolean;
  onClose: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── Canvas renderer ────────────────────────────────────────────────────────

interface CanvasCardData {
  type: ShareCardType;
  prExercise?: string;
  prWeight?: number;
  prReps?: number;
  prDate?: string;
  sessionDate?: string;
  sessionExercises?: string[];
  totalSets?: number;
  totalVolume?: number;
  durationMinutes?: number;
}

/**
 * Draws a 800×450 share card onto an offscreen canvas and triggers download.
 * Uses Canvas 2D API — no external libraries required.
 * Complexity: O(E) where E = sessionExercises.length (≤ ~10 visible items).
 */
function drawShareCard(data: CanvasCardData): void {
  const W = 800;
  const H = 450;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // ── Background ─────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0a0f');
  bg.addColorStop(1, '#0f0f1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Accent border glow ─────────────────────────────────────────────────
  const accentColor = data.type === 'pr' ? '#a78bfa' : '#6ee7b7';
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5;
  // Rounded rect border
  const r = 24;
  ctx.beginPath();
  ctx.moveTo(r, 1);
  ctx.lineTo(W - r, 1);
  ctx.arcTo(W - 1, 1, W - 1, r, r);
  ctx.lineTo(W - 1, H - r);
  ctx.arcTo(W - 1, H - 1, W - r, H - 1, r);
  ctx.lineTo(r, H - 1);
  ctx.arcTo(1, H - 1, 1, H - r, r);
  ctx.lineTo(1, r);
  ctx.arcTo(1, 1, r, 1, r);
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ── Subtle top gradient strip ──────────────────────────────────────────
  const topGlow = ctx.createLinearGradient(0, 0, 0, 120);
  topGlow.addColorStop(0, `${accentColor}22`);
  topGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, 120);

  // ── TITAN logo (top-left) ─────────────────────────────────────────────
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = accentColor;
  ctx.letterSpacing = '0.2em';
  ctx.fillText('TITAN', 40, 52);

  // ── Top-right: small module indicator dot ─────────────────────────────
  ctx.beginPath();
  ctx.arc(W - 48, 44, 5, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.globalAlpha = 1;

  if (data.type === 'pr') {
    // ── PR Achievement card ──────────────────────────────────────────────

    // Trophy emoji area
    ctx.font = '52px system-ui';
    ctx.fillText('🏆', 40, 155);

    // "NEW PR" headline
    ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.95;
    ctx.fillText('NEW PR', 110, 155);
    ctx.globalAlpha = 1;

    // Exercise name
    const exercise = data.prExercise ?? 'Exercise';
    ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = accentColor;
    ctx.fillText(exercise, 40, 220);

    // Weight × reps
    if (data.prWeight !== undefined && data.prReps !== undefined) {
      ctx.font = 'bold 56px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${data.prWeight} kg × ${data.prReps}`, 40, 300);
    }

    // Divider line
    ctx.strokeStyle = `${accentColor}44`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 340);
    ctx.lineTo(W - 40, 340);
    ctx.stroke();

    // Date
    if (data.prDate) {
      ctx.font = '18px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff88';
      ctx.fillText(formatDate(data.prDate), 40, 375);
    }

  } else {
    // ── Workout Summary card ─────────────────────────────────────────────

    // "WORKOUT COMPLETE" headline
    ctx.font = 'bold 40px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.95;
    ctx.fillText('WORKOUT COMPLETE 💪', 40, 150);
    ctx.globalAlpha = 1;

    // Stats row
    const stats: Array<[string, string]> = [];
    if (data.totalSets !== undefined) stats.push(['Sets', String(data.totalSets)]);
    if (data.totalVolume !== undefined) stats.push(['Volume', `${data.totalVolume} kg`]);
    if (data.durationMinutes !== undefined) stats.push(['Duration', `${data.durationMinutes} min`]);

    let sx = 40;
    for (const [label, val] of stats) {
      // Value
      ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = accentColor;
      ctx.fillText(val, sx, 210);
      // Label
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff55';
      ctx.fillText(label, sx, 232);
      sx += 200;
    }

    // Exercises list
    const exercises = data.sessionExercises ?? [];
    const visible = exercises.slice(0, 5);
    let ey = 280;
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff66';
    ctx.fillText('Exercises', 40, ey);
    ey += 6;

    ctx.strokeStyle = `${accentColor}33`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, ey);
    ctx.lineTo(W - 40, ey);
    ctx.stroke();
    ey += 22;

    for (const ex of visible) {
      ctx.font = '18px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffffbb';
      ctx.fillText(`• ${ex}`, 40, ey);
      ey += 28;
    }
    if (exercises.length > 5) {
      ctx.font = 'italic 16px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff44';
      ctx.fillText(`+${exercises.length - 5} more`, 40, ey);
    }

    // Date
    if (data.sessionDate) {
      ctx.font = '18px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff66';
      ctx.fillText(formatDate(data.sessionDate), 40, 415);
    }
  }

  // ── Branding (bottom-right) ────────────────────────────────────────────
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff22';
  ctx.textAlign = 'right';
  ctx.fillText('ara.app', W - 40, H - 24);
  ctx.textAlign = 'left';

  // ── Trigger download ───────────────────────────────────────────────────
  const link = document.createElement('a');
  link.download = `titan-${data.type}-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ─── Build plain-text summary ────────────────────────────────────────────────

function buildTextSummary(data: CanvasCardData): string {
  if (data.type === 'pr') {
    const lines = [
      '🏆 NEW PR — TITAN',
      `Exercise: ${data.prExercise ?? '—'}`,
    ];
    if (data.prWeight !== undefined && data.prReps !== undefined) {
      lines.push(`Weight: ${data.prWeight} kg × ${data.prReps} reps`);
    }
    if (data.prDate) lines.push(`Date: ${formatDate(data.prDate)}`);
    lines.push('', 'Logged with ara.app/titan');
    return lines.join('\n');
  } else {
    const lines = ['💪 WORKOUT COMPLETE — TITAN'];
    if (data.sessionDate) lines.push(`Date: ${formatDate(data.sessionDate)}`);
    if (data.totalSets !== undefined) lines.push(`Sets: ${data.totalSets}`);
    if (data.totalVolume !== undefined) lines.push(`Volume: ${data.totalVolume} kg`);
    if (data.durationMinutes !== undefined) lines.push(`Duration: ${data.durationMinutes} min`);
    if (data.sessionExercises && data.sessionExercises.length > 0) {
      lines.push('', 'Exercises:');
      data.sessionExercises.forEach(e => lines.push(`  • ${e}`));
    }
    lines.push('', 'Logged with ara.app/titan');
    return lines.join('\n');
  }
}

// ─── ShareCardPreview (the visual card shown inside the modal) ────────────────

function ShareCardPreview({
  cardRef,
  type,
  prExercise,
  prWeight,
  prReps,
  prDate,
  sessionDate,
  sessionExercises,
  totalSets,
  totalVolume,
  durationMinutes,
}: Omit<ShareCardProps, 'isOpen' | 'onClose'> & { cardRef: React.RefObject<HTMLDivElement | null> }) {
  const accentClass = type === 'pr' ? 'border-violet-500/40' : 'border-emerald-500/40';
  const accentTextClass = type === 'pr' ? 'text-violet-300' : 'text-emerald-300';
  const accentBgClass = type === 'pr' ? 'from-violet-500/10' : 'from-emerald-500/10';

  return (
    <div
      ref={cardRef}
      className={cn(
        'relative rounded-2xl border overflow-hidden select-none',
        'bg-[#0a0a0f]',
        accentClass,
      )}
      style={{ minHeight: '14rem' }}
    >
      {/* Top glow */}
      <div className={cn('absolute inset-x-0 top-0 h-28 bg-gradient-to-b to-transparent opacity-60', accentBgClass)} />

      <div className="relative z-10 p-6">
        {/* TITAN logo */}
        <div className="flex items-center justify-between mb-5">
          <span className={cn('text-sm font-black tracking-[0.25em] uppercase', accentTextClass)}>
            TITAN
          </span>
          <div className={cn('w-2 h-2 rounded-full opacity-70', type === 'pr' ? 'bg-violet-400' : 'bg-emerald-400')} />
        </div>

        {type === 'pr' ? (
          <>
            {/* PR card body */}
            <div className="flex items-center gap-3 mb-3">
              <Trophy className={cn('w-8 h-8', accentTextClass)} />
              <span className="text-2xl font-black text-white/95 tracking-tight">NEW PR</span>
            </div>
            {prExercise && (
              <p className={cn('text-lg font-bold mb-2', accentTextClass)}>{prExercise}</p>
            )}
            {prWeight !== undefined && prReps !== undefined && (
              <p className="text-3xl font-black text-white/95 mb-4">
                {prWeight} kg&thinsp;×&thinsp;{prReps}
              </p>
            )}
            <div className="border-t border-white/[0.09] pt-3">
              {prDate && <p className="text-xs text-white/40">{formatDate(prDate)}</p>}
            </div>
          </>
        ) : (
          <>
            {/* Workout summary card body */}
            <div className="flex items-center gap-3 mb-3">
              <Dumbbell className={cn('w-7 h-7', accentTextClass)} />
              <span className="text-xl font-black text-white/95 tracking-tight">WORKOUT COMPLETE 💪</span>
            </div>

            {/* Stats */}
            <div className="flex gap-6 mb-4">
              {totalSets !== undefined && (
                <div>
                  <p className={cn('text-lg font-black', accentTextClass)}>{totalSets}</p>
                  <p className="text-[11px] text-white/40 uppercase tracking-wider">Sets</p>
                </div>
              )}
              {totalVolume !== undefined && (
                <div>
                  <p className={cn('text-lg font-black', accentTextClass)}>{totalVolume} kg</p>
                  <p className="text-[11px] text-white/40 uppercase tracking-wider">Volume</p>
                </div>
              )}
              {durationMinutes !== undefined && (
                <div>
                  <p className={cn('text-lg font-black', accentTextClass)}>{durationMinutes} min</p>
                  <p className="text-[11px] text-white/40 uppercase tracking-wider">Duration</p>
                </div>
              )}
            </div>

            {/* Exercises */}
            {sessionExercises && sessionExercises.length > 0 && (
              <div className="border-t border-white/[0.09] pt-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-white/30 mb-2">Exercises</p>
                <div className="flex flex-wrap gap-1.5">
                  {sessionExercises.slice(0, 6).map(ex => (
                    <span
                      key={ex}
                      className={cn('text-[11px] px-2 py-0.5 rounded-full border', accentClass, 'text-white/60')}
                    >
                      {ex}
                    </span>
                  ))}
                  {sessionExercises.length > 6 && (
                    <span className="text-[11px] text-white/30">+{sessionExercises.length - 6}</span>
                  )}
                </div>
              </div>
            )}

            {sessionDate && (
              <p className="text-[11px] text-white/30 mt-3">{formatDate(sessionDate)}</p>
            )}
          </>
        )}

        {/* Branding */}
        <p className="absolute bottom-4 right-5 text-[11px] text-white/15 tracking-widest">ara.app</p>
      </div>
    </div>
  );
}

// ─── Root component ─────────────────────────────────────────────────────────

export function ShareCard({
  type,
  prExercise,
  prWeight,
  prReps,
  prDate,
  sessionDate,
  sessionExercises,
  totalSets,
  totalVolume,
  durationMinutes,
  isOpen,
  onClose,
}: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const cardData: CanvasCardData = {
    type,
    prExercise,
    prWeight,
    prReps,
    prDate,
    sessionDate,
    sessionExercises,
    totalSets,
    totalVolume,
    durationMinutes,
  };

  const handleDownload = () => {
    drawShareCard(cardData);
  };

  const handleCopyText = async () => {
    const text = buildTextSummary(cardData);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const Icon = type === 'pr' ? Trophy : Share2;
  const title = type === 'pr' ? 'Share PR' : 'Share Workout';

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle="Download or copy your achievement"
      icon={Icon}
      themeColor="module"
      maxWidth="md"
    >
      <div className="flex flex-col gap-4">
        {/* Card preview */}
        <ShareCardPreview
          cardRef={cardRef}
          type={type}
          prExercise={prExercise}
          prWeight={prWeight}
          prReps={prReps}
          prDate={prDate}
          sessionDate={sessionDate}
          sessionExercises={sessionExercises}
          totalSets={totalSets}
          totalVolume={totalVolume}
          durationMinutes={durationMinutes}
        />

        {/* Actions */}
        <div className="flex gap-3">
          <NeuralButton size="xl" className="flex-1" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            Download PNG
          </NeuralButton>
          <NeuralButton size="xl" variant="secondary" className="flex-1" onClick={handleCopyText}>
            <Copy className="w-4 h-4 mr-2" />
            Copy Text
          </NeuralButton>
          <NeuralButton size="xl" variant="ghost" onClick={onClose}>
            <span className="sr-only">Close</span>
            ✕
          </NeuralButton>
        </div>
      </div>
    </NeuralModal>
  );
}
