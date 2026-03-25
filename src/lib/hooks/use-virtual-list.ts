/**
 * useVirtualList — lightweight virtualization without external dependencies.
 * Uses a simple load-more pattern to only render items near the viewport.
 * For lists that may grow to 500+ items.
 */
import { useState, useRef, useCallback } from 'react';

export interface VirtualListOptions {
  /** Total number of items */
  itemCount: number;
  /** Estimated item height in px (used to compute scroll container height) */
  estimatedItemHeight: number;
  /** Number of items to render beyond the visible window (overscan) */
  overscan?: number;
  /** Initial number of items to render (default: 30) */
  initialRenderCount?: number;
}

export interface VirtualListResult {
  /** Slice of indices to render */
  visibleRange: { start: number; end: number };
  /** Ref to attach to the scroll container */
  containerRef: React.RefCallback<HTMLDivElement>;
  /** Total estimated height of the list (for scroll container) */
  totalHeight: number;
  /** Whether there are more items beyond the initial render */
  hasMore: boolean;
  /** Load more items (expands visibleRange.end) */
  loadMore: () => void;
}

export function useVirtualList({
  itemCount,
  estimatedItemHeight,
  overscan = 5,
  initialRenderCount = 30,
}: VirtualListOptions): VirtualListResult {
  const [renderCount, setRenderCount] = useState(Math.min(initialRenderCount, itemCount));
  const containerRef = useRef<HTMLDivElement | null>(null);

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
  }, []);

  const loadMore = useCallback(() => {
    setRenderCount(prev => Math.min(prev + 20, itemCount));
  }, [itemCount]);

  const visibleRange = { start: 0, end: Math.min(renderCount + overscan, itemCount) };
  const totalHeight = itemCount * estimatedItemHeight;
  const hasMore = renderCount < itemCount;

  return {
    visibleRange,
    containerRef: setContainerRef,
    totalHeight,
    hasMore,
    loadMore,
  };
}
