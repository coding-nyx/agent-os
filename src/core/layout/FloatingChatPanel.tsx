import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GripHorizontal, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingPanelGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FloatingChatPanelProps {
  moduleId: string;
  agentName: string;
  isOpen: boolean;
  onClose: () => void;
  onClearHistory?: () => void;
  themeClasses: {
    sidebarBorder: string;
    indicatorBg: string;
    btnText: string;
  };
  children: React.ReactNode;
}

const MIN_WIDTH = 320;
const MIN_HEIGHT = 400;
const DEFAULT_WIDTH = 380;
const DEFAULT_HEIGHT = 560;
const EDGE_MARGIN = 24;

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | null;

function getStorageKey(moduleId: string) {
  return `floating-chat-panel-${moduleId}`;
}

function loadGeometry(moduleId: string): FloatingPanelGeometry | null {
  try {
    const raw = localStorage.getItem(getStorageKey(moduleId));
    if (!raw) return null;
    return JSON.parse(raw) as FloatingPanelGeometry;
  } catch {
    return null;
  }
}

function saveGeometry(moduleId: string, geo: FloatingPanelGeometry) {
  try {
    localStorage.setItem(getStorageKey(moduleId), JSON.stringify(geo));
  } catch {
    // ignore quota errors
  }
}

function getNavbarBottom(): number {
  // Measure the sticky site header so the panel can never be dragged behind it
  const header = document.querySelector('header');
  if (header) {
    const rect = header.getBoundingClientRect();
    // getBoundingClientRect().bottom gives the bottom edge of the header relative to viewport
    if (rect.bottom > 0) return Math.ceil(rect.bottom) + 4; // 4px breathing room
  }
  return 60; // fallback for no header or SSR
}

function clampToViewport(geo: FloatingPanelGeometry, navBottom?: number): FloatingPanelGeometry {
  const minY = navBottom ?? getNavbarBottom();
  const maxWidth = Math.min(geo.width, Math.round(window.innerWidth * 0.9));
  const maxHeight = Math.min(geo.height, Math.round(window.innerHeight * 0.9));
  const w = Math.max(MIN_WIDTH, maxWidth);
  const h = Math.max(MIN_HEIGHT, maxHeight);
  const x = Math.max(0, Math.min(geo.x, window.innerWidth - w));
  const y = Math.max(minY, Math.min(geo.y, window.innerHeight - h));
  return { x, y, width: w, height: h };
}

function defaultGeometry(): FloatingPanelGeometry {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
  return {
    x: window.innerWidth - DEFAULT_WIDTH - EDGE_MARGIN,
    y: window.innerHeight - DEFAULT_HEIGHT - EDGE_MARGIN,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };
}

export function FloatingChatPanel({
  moduleId,
  agentName,
  isOpen,
  onClose,
  onClearHistory,
  themeClasses,
  children,
}: FloatingChatPanelProps) {
  const [navBottom, setNavBottom] = useState(() =>
    typeof window !== 'undefined' ? getNavbarBottom() : 60
  );

  // Re-measure navbar height on mount and window resize
  useEffect(() => {
    const measure = () => setNavBottom(getNavbarBottom());
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const [geo, setGeo] = useState<FloatingPanelGeometry>(() => {
    const stored = loadGeometry(moduleId);
    return clampToViewport(stored ?? defaultGeometry(), getNavbarBottom());
  });

  // Persist whenever geometry changes
  useEffect(() => {
    saveGeometry(moduleId, geo);
  }, [moduleId, geo]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const resetGeometry = useCallback(() => {
    const fresh = defaultGeometry();
    setGeo(fresh);
    try { localStorage.removeItem(getStorageKey(moduleId)); } catch { /* ignore */ }
  }, [moduleId]);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const dragStartRef = useRef<{ px: number; py: number; gx: number; gy: number } | null>(null);

  const stopDrag = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  const onDragHandlePointerDown = useCallback((e: React.PointerEvent) => {
    // Don't start drag if clicking on a button inside the header
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { px: e.clientX, py: e.clientY, gx: geo.x, gy: geo.y };
  }, [geo.x, geo.y]);

  // Pointer move + up/cancel are on the drag handle (where capture is set)
  const onDragHandlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.px;
    const dy = e.clientY - dragStartRef.current.py;
    const newX = dragStartRef.current.gx + dx;
    const newY = dragStartRef.current.gy + dy;
    setGeo(prev => clampToViewport({ ...prev, x: newX, y: newY }, navBottom));
  }, [navBottom]);

  // ── Resize ─────────────────────────────────────────────────────────────────
  const resizeRef = useRef<{
    edge: ResizeEdge;
    startX: number; startY: number;
    startGeo: FloatingPanelGeometry;
  } | null>(null);

  const onResizePointerDown = useCallback((e: React.PointerEvent, edge: ResizeEdge) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = {
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startGeo: { ...geo },
    };
  }, [geo]);

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const { edge, startX, startY, startGeo } = resizeRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const maxW = Math.round(window.innerWidth * 0.9);
    const maxH = Math.round(window.innerHeight * 0.9);

    let { x, y, width, height } = startGeo;

    if (edge?.includes('e')) width = Math.min(maxW, Math.max(MIN_WIDTH, startGeo.width + dx));
    if (edge?.includes('s')) height = Math.min(maxH, Math.max(MIN_HEIGHT, startGeo.height + dy));
    if (edge?.includes('w')) {
      const newW = Math.min(maxW, Math.max(MIN_WIDTH, startGeo.width - dx));
      x = startGeo.x + (startGeo.width - newW);
      width = newW;
    }
    if (edge?.includes('n')) {
      const newH = Math.min(maxH, Math.max(MIN_HEIGHT, startGeo.height - dy));
      y = startGeo.y + (startGeo.height - newH);
      height = newH;
    }

    setGeo(clampToViewport({ x, y, width, height }, navBottom));
  }, [navBottom]);

  const onResizePointerUp = useCallback(() => {
    resizeRef.current = null;
  }, []);

  // Outer panel handles resize pointer events (resize handles bubble up here)
  const handleOuterPointerMove = useCallback((e: React.PointerEvent) => {
    onResizePointerMove(e);
  }, [onResizePointerMove]);

  const handleOuterPointerUp = useCallback(() => {
    onResizePointerUp();
  }, [onResizePointerUp]);

  const resizeHandleClasses = 'absolute z-10 select-none touch-none';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="floating-chat-panel"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className={cn(
            'fixed flex flex-col overflow-hidden rounded-2xl border bg-[#09090b]/95 backdrop-blur-xl shadow-[0_16px_60px_rgba(0,0,0,0.7)]',
            themeClasses.sidebarBorder
          )}
          style={{
            left: geo.x,
            top: geo.y,
            width: geo.width,
            height: geo.height,
            zIndex: 'var(--z-modal)' as React.CSSProperties['zIndex'],
            willChange: 'transform',
          }}
          onPointerMove={handleOuterPointerMove}
          onPointerUp={handleOuterPointerUp}
          onPointerCancel={handleOuterPointerUp}
        >
          {/* ── Resize Handles ── */}
          {/* Corners */}
          <div className={cn(resizeHandleClasses, 'top-0 left-0 w-3 h-3 cursor-nw-resize')}
            onPointerDown={e => onResizePointerDown(e, 'nw')} />
          <div className={cn(resizeHandleClasses, 'top-0 right-0 w-3 h-3 cursor-ne-resize')}
            onPointerDown={e => onResizePointerDown(e, 'ne')} />
          <div className={cn(resizeHandleClasses, 'bottom-0 left-0 w-3 h-3 cursor-sw-resize')}
            onPointerDown={e => onResizePointerDown(e, 'sw')} />
          <div className={cn(resizeHandleClasses, 'bottom-0 right-0 w-3 h-3 cursor-se-resize')}
            onPointerDown={e => onResizePointerDown(e, 'se')} />
          {/* Edges */}
          <div className={cn(resizeHandleClasses, 'top-0 left-3 right-3 h-1 cursor-n-resize')}
            onPointerDown={e => onResizePointerDown(e, 'n')} />
          <div className={cn(resizeHandleClasses, 'bottom-0 left-3 right-3 h-1 cursor-s-resize')}
            onPointerDown={e => onResizePointerDown(e, 's')} />
          <div className={cn(resizeHandleClasses, 'left-0 top-3 bottom-3 w-1 cursor-w-resize')}
            onPointerDown={e => onResizePointerDown(e, 'w')} />
          <div className={cn(resizeHandleClasses, 'right-0 top-3 bottom-3 w-1 cursor-e-resize')}
            onPointerDown={e => onResizePointerDown(e, 'e')} />

          {/* ── Drag Header ── */}
          <div
            className={cn(
              'flex shrink-0 items-center justify-between border-b px-3 py-2.5 bg-black/20 select-none touch-none cursor-grab active:cursor-grabbing',
              themeClasses.sidebarBorder
            )}
            onPointerDown={onDragHandlePointerDown}
            onPointerMove={onDragHandlePointerMove}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          >
            <div className="flex items-center gap-2 pointer-events-none">
              <div className={cn('w-1.5 h-1.5 rounded-full animate-pulse', themeClasses.indicatorBg)} />
              <GripHorizontal className="w-3.5 h-3.5 text-white/30" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                {agentName} Terminal
              </span>
            </div>
            <div className="flex items-center gap-1">
              {onClearHistory && (
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={onClearHistory}
                  className="p-1.5 rounded-md hover:bg-rose-500/10 hover:text-rose-400 text-white/40 transition-colors"
                  aria-label="Clear chat history"
                  title="Clear chat history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={resetGeometry}
                className="p-1.5 rounded-md hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors"
                aria-label="Reset panel position"
                title="Reset position"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                aria-label="Close chat panel"
                title="Close (Esc)"
              >
                <X className="w-3.5 h-3.5 text-white/50" />
              </button>
            </div>
          </div>

          {/* ── Chat Content ── */}
          <div className="flex-1 min-h-0 flex flex-col relative">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
