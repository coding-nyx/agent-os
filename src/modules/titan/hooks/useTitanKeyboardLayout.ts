/**
 * useTitanKeyboardLayout
 *
 * Manages QuickLogBar height measurement and virtual-keyboard offset so the
 * sticky bar stays above the software keyboard on mobile devices.
 *
 * Responsibility: keyboard/layout side-effects only — no business logic.
 */

import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { useUIStore } from '@/lib/stores/ui-store';
import type { TitanTab } from './types';

export function useTitanKeyboardLayout(activeTab: TitanTab): {
  quickLogBarRef: React.RefObject<HTMLDivElement | null>;
  quickLogBarHeight: number;
  isQuickLogFocused: boolean;
  setIsQuickLogFocused: (v: boolean) => void;
  keyboardOffset: number;
} {
  const quickLogBarRef = useRef<HTMLDivElement>(null);
  const [quickLogBarHeight, setQuickLogBarHeight] = useState(0);
  const [isQuickLogFocused, setIsQuickLogFocused] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const setModuleBottomBarHeight = useUIStore((s) => s.setModuleBottomBarHeight);
  const setHideGlobalFAB = useUIStore((s) => s.setHideGlobalFAB);

  // Synchronously measure QuickLogBar height and propagate to the UI store
  // BEFORE the browser paints to prevent the chat FAB from overlapping the bar.
  useLayoutEffect(() => {
    if (activeTab !== 'train') {
      setQuickLogBarHeight(0);
      setModuleBottomBarHeight(0);
      setHideGlobalFAB(false);
      return;
    }

    setHideGlobalFAB(true);

    const measure = () => {
      const el = quickLogBarRef.current;
      const h = el ? el.getBoundingClientRect().height : 0;
      setQuickLogBarHeight(h);
      setModuleBottomBarHeight(Math.round(Math.max(0, h + keyboardOffset)));
    };

    measure();

    const el = quickLogBarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => {
      observer.disconnect();
      setModuleBottomBarHeight(0);
      setHideGlobalFAB(false);
    };
  }, [activeTab, keyboardOffset, setModuleBottomBarHeight, setHideGlobalFAB]);

  // Track visual-viewport changes to compute how far the software keyboard
  // has pushed the viewport up. Only active while the QuickLogBar has focus.
  useEffect(() => {
    if (!isQuickLogFocused) {
      setKeyboardOffset(0);
      return;
    }
    if (typeof window === 'undefined' || !window.visualViewport) {
      setKeyboardOffset(0);
      return;
    }

    const viewport = window.visualViewport;
    const updateOffset = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardOffset(offset);
    };

    updateOffset();
    viewport.addEventListener('resize', updateOffset);
    viewport.addEventListener('scroll', updateOffset);
    window.addEventListener('resize', updateOffset);

    return () => {
      viewport.removeEventListener('resize', updateOffset);
      viewport.removeEventListener('scroll', updateOffset);
      window.removeEventListener('resize', updateOffset);
    };
  }, [isQuickLogFocused]);

  return {
    quickLogBarRef,
    quickLogBarHeight,
    isQuickLogFocused,
    setIsQuickLogFocused,
    keyboardOffset,
  };
}
