/**
 * HandwritingPanel — Inline canvas for pencil/stylus handwriting recognition.
 *
 * User writes characters on the canvas, taps "→ Text" to run Tesseract OCR,
 * then the recognized text is passed back via onRecognize.
 *
 * Canvas uses white strokes on dark background (matching the app theme).
 * Before OCR the image is inverted to black-on-white for better Tesseract accuracy.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import getStroke from 'perfect-freehand';
import { Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { recognizeImageWithWorker } from '@/lib/services/tesseract-worker';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Point { x: number; y: number; pressure: number }
interface Stroke { points: Point[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSvgPath(stroke: number[][]): string {
  if (!stroke.length) return '';
  const d: string[] = [];
  const [first, ...rest] = stroke;
  d.push(`M ${first[0].toFixed(1)} ${first[1].toFixed(1)}`);
  for (let i = 0; i < rest.length - 1; i++) {
    const [x0, y0] = rest[i];
    const [x1, y1] = rest[i + 1];
    d.push(`Q ${x0.toFixed(1)} ${y0.toFixed(1)}, ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`);
  }
  if (rest.length) {
    const last = rest[rest.length - 1];
    d.push(`L ${last[0].toFixed(1)} ${last[1].toFixed(1)}`);
  }
  return d.join(' ');
}

function renderStrokes(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  live: Stroke | null,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const all = live ? [...strokes, live] : strokes;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.globalCompositeOperation = 'source-over';
  for (const s of all) {
    const pts = s.points.map((p) => [p.x, p.y, p.pressure] as [number, number, number]);
    const outline = getStroke(pts, { size: 4, smoothing: 0.5, thinning: 0.5, streamline: 0.5, simulatePressure: false, last: true });
    const path = getSvgPath(outline);
    if (path) ctx.fill(new Path2D(path));
  }
}

/** Return a new canvas with white/black inverted (for Tesseract black-on-white input). */
function invertedDataUrl(src: HTMLCanvasElement): string {
  const dst = document.createElement('canvas');
  dst.width = src.width;
  dst.height = src.height;
  const ctx = dst.getContext('2d')!;
  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dst.width, dst.height);
  // Draw original over it using 'difference' to invert strokes
  ctx.globalCompositeOperation = 'difference';
  ctx.drawImage(src, 0, 0);
  return dst.toDataURL('image/png');
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface HandwritingPanelProps {
  onRecognize: (text: string) => void;
  className?: string;
}

export function HandwritingPanel({ onRecognize, className }: HandwritingPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redraw on strokes change
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    renderStrokes(ctx, canvas, strokes, null);
  }, [strokes]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    // Scale to canvas internal resolution
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setError(null);
    const pt = getPos(e);
    const s: Stroke = { points: [pt] };
    setCurrentStroke(s);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) renderStrokes(ctx, canvas, strokes, s);
  }, [strokes]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentStroke) return;
    const pt = getPos(e);
    const updated = { points: [...currentStroke.points, pt] };
    setCurrentStroke(updated);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) renderStrokes(ctx, canvas, strokes, updated);
  }, [currentStroke, strokes]);

  const onPointerUp = useCallback(() => {
    if (!currentStroke) return;
    setStrokes((prev) => [...prev, currentStroke]);
    setCurrentStroke(null);
  }, [currentStroke]);

  const clear = useCallback(() => {
    setStrokes([]);
    setCurrentStroke(null);
    setError(null);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const recognize = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    setIsRecognizing(true);
    setError(null);
    try {
      const dataUrl = invertedDataUrl(canvas);
      const text = await recognizeImageWithWorker(dataUrl);
      const cleaned = text.trim();
      if (cleaned) {
        onRecognize(cleaned);
        clear();
      } else {
        setError('Could not recognize text — try writing more clearly.');
      }
    } catch {
      setError('Recognition failed. Please try again.');
    } finally {
      setIsRecognizing(false);
    }
  }, [strokes, onRecognize, clear]);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={900}
        height={160}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="w-full rounded-lg border border-white/10 bg-black/50 touch-none"
        style={{ height: 120, cursor: 'crosshair' }}
        aria-label="Handwriting input canvas"
      />

      {/* Controls row */}
      <div className="flex items-center gap-2">
        {error && (
          <span className="text-[10px] text-rose-400/80 flex-1">{error}</span>
        )}
        {!error && (
          <span className="text-[10px] text-white/25 flex-1">Write with your stylus, then convert →</span>
        )}

        <button
          type="button"
          onClick={clear}
          disabled={strokes.length === 0 || isRecognizing}
          aria-label="Clear handwriting"
          className="w-7 h-7 flex items-center justify-center rounded-md border border-white/10 bg-black/30 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>

        <button
          type="button"
          onClick={recognize}
          disabled={strokes.length === 0 || isRecognizing}
          aria-label="Convert handwriting to text"
          className="flex items-center gap-1.5 px-3 h-7 rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-semibold transition-colors"
        >
          {isRecognizing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <ArrowRight className="w-3 h-3" />
          )}
          {isRecognizing ? 'Reading…' : '→ Text'}
        </button>
      </div>
    </div>
  );
}
