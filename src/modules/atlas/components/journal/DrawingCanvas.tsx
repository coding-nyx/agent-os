/**
 * DrawingCanvas — Pressure-sensitive sketch canvas for journal entries.
 *
 * - Uses the Pointer Events API (pen, mouse, touch)
 * - Stroke smoothing via `perfect-freehand`
 * - Pen pressure maps to stroke width
 * - Toolbar: pen size, eraser, stroke colour (white tones), clear, undo
 * - Exports as base64 PNG on every stroke change via `onChange`
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import getStroke from 'perfect-freehand';
import { Eraser, Pen, Trash2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
  pressure: number;
}

interface Stroke {
  points: Point[];
  color: string;
  size: number;
  isEraser: boolean;
}

export interface DrawingCanvasProps {
  value: string | null;       // existing base64 PNG (to restore on mount)
  onChange: (png: string | null) => void;
  height?: number;
  className?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = [
  { label: 'White', value: 'rgba(255,255,255,0.90)' },
  { label: 'Soft', value: 'rgba(200,190,255,0.80)' },  // violet tint
  { label: 'Dim', value: 'rgba(255,255,255,0.40)' },
];

const SIZES = [
  { label: 'S', value: 2 },
  { label: 'M', value: 4 },
  { label: 'L', value: 8 },
];

// perfect-freehand options factory
function strokeOpts(size: number, isEraser: boolean) {
  return {
    size: isEraser ? size * 6 : size,
    smoothing: 0.5,
    thinning: isEraser ? 0 : 0.6,
    streamline: 0.5,
    easing: (t: number) => t,
    simulatePressure: false,
    last: true,
  };
}

// Convert perfect-freehand output to an SVG path d-string
function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return '';
  const d: string[] = [];
  const [first, ...rest] = stroke;
  d.push(`M ${first[0].toFixed(2)} ${first[1].toFixed(2)}`);
  for (let i = 0; i < rest.length - 1; i++) {
    const [x0, y0] = rest[i];
    const [x1, y1] = rest[i + 1];
    d.push(`Q ${x0.toFixed(2)} ${y0.toFixed(2)}, ${((x0 + x1) / 2).toFixed(2)} ${((y0 + y1) / 2).toFixed(2)}`);
  }
  if (rest.length) {
    const last = rest[rest.length - 1];
    d.push(`L ${last[0].toFixed(2)} ${last[1].toFixed(2)}`);
  }
  return d.join(' ');
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DrawingCanvas({ value, onChange, height = 260, className }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(SIZES[1].value);
  const exportTimerRef = useRef<number | null>(null);

  // ── Restore saved image on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!value || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = value;
  // Only run on mount — intentionally not re-running on value changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Redraw all strokes onto canvas ────────────────────────────────────────
  const redraw = useCallback((allStrokes: Stroke[], live: Stroke | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderStroke = (s: Stroke) => {
      const pts = s.points.map((p) => [p.x, p.y, p.pressure] as [number, number, number]);
      const outline = getStroke(pts, strokeOpts(s.size, s.isEraser));
      const path = getSvgPathFromStroke(outline);
      if (!path) return;
      ctx.save();
      if (s.isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = s.color;
      }
      ctx.fill(new Path2D(path));
      ctx.restore();
    };

    allStrokes.forEach(renderStroke);
    if (live) renderStroke(live);
  }, []);

  // ── Export canvas as PNG (debounced) ─────────────────────────────────────
  const scheduleExport = useCallback((finalStrokes: Stroke[]) => {
    if (exportTimerRef.current) clearTimeout(exportTimerRef.current);
    exportTimerRef.current = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (finalStrokes.length === 0) {
        onChange(null);
        return;
      }
      onChange(canvas.toDataURL('image/png'));
    }, 300);
  }, [onChange]);

  // ── Pointer handlers ──────────────────────────────────────────────────────
  const getPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getPos(e);
    const newStroke: Stroke = {
      points: [pt],
      color,
      size,
      isEraser: tool === 'eraser',
    };
    setCurrentStroke(newStroke);
    redraw(strokes, newStroke);
  }, [color, size, tool, strokes, redraw]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentStroke) return;
    const pt = getPos(e);
    const updated = { ...currentStroke, points: [...currentStroke.points, pt] };
    setCurrentStroke(updated);
    redraw(strokes, updated);
  }, [currentStroke, strokes, redraw]);

  const onPointerUp = useCallback(() => {
    if (!currentStroke) return;
    const finalStrokes = [...strokes, currentStroke];
    setStrokes(finalStrokes);
    setCurrentStroke(null);
    redraw(finalStrokes, null);
    scheduleExport(finalStrokes);
  }, [currentStroke, strokes, redraw, scheduleExport]);

  // ── Undo ──────────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    setStrokes((prev) => {
      const next = prev.slice(0, -1);
      redraw(next, null);
      scheduleExport(next);
      return next;
    });
  }, [redraw, scheduleExport]);

  // ── Clear ─────────────────────────────────────────────────────────────────
  const clear = useCallback(() => {
    setStrokes([]);
    setCurrentStroke(null);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    onChange(null);
  }, [onChange]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Pen / Eraser toggle */}
        <div className="flex items-center gap-1 bg-black/30 rounded-lg border border-white/10 p-1">
          <button
            type="button"
            onClick={() => setTool('pen')}
            aria-label="Pen"
            aria-pressed={tool === 'pen'}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded-md transition-colors',
              tool === 'pen' ? 'bg-violet-500/30 text-violet-300' : 'text-white/40 hover:text-white/70 hover:bg-white/5',
            )}
          >
            <Pen className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTool('eraser')}
            aria-label="Eraser"
            aria-pressed={tool === 'eraser'}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded-md transition-colors',
              tool === 'eraser' ? 'bg-amber-500/30 text-amber-300' : 'text-white/40 hover:text-white/70 hover:bg-white/5',
            )}
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Size */}
        <div className="flex items-center gap-1 bg-black/30 rounded-lg border border-white/10 p-1">
          {SIZES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setSize(s.value)}
              aria-label={`Pen size ${s.label}`}
              aria-pressed={size === s.value}
              className={cn(
                'w-7 h-7 flex items-center justify-center rounded-md text-[11px] font-bold transition-colors',
                size === s.value ? 'bg-violet-500/30 text-violet-300' : 'text-white/40 hover:text-white/70 hover:bg-white/5',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Colour */}
        {tool === 'pen' && (
          <div className="flex items-center gap-1.5 bg-black/30 rounded-lg border border-white/10 p-1">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                aria-label={c.label}
                aria-pressed={color === c.value}
                className={cn(
                  'w-5 h-5 rounded-full border-2 transition-all',
                  color === c.value ? 'border-violet-400 scale-110' : 'border-white/20 hover:border-white/50',
                )}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Undo */}
        <button
          type="button"
          onClick={undo}
          disabled={strokes.length === 0}
          aria-label="Undo last stroke"
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/10 bg-black/30 text-white/40 hover:text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>

        {/* Clear */}
        <button
          type="button"
          onClick={clear}
          disabled={strokes.length === 0}
          aria-label="Clear canvas"
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/10 bg-black/30 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={800}
        height={height}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="w-full rounded-xl border border-white/10 bg-black/40 touch-none"
        style={{ height, cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
        aria-label="Drawing canvas"
      />
    </div>
  );
}
