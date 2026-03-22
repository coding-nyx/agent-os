import { useCallback, useEffect, useRef, useState } from 'react';

export interface KeyboardAwareState {
  isKeyboardOpen: boolean;
  keyboardHeight: number;
  /** Smoothly scroll an element into view, re-checking after keyboard settles */
  scrollInputIntoView: (el: HTMLElement | null) => void;
}

/**
 * Detects virtual keyboard visibility via the VisualViewport API.
 * Sets a CSS variable `--keyboard-clearance` on the root element
 * so components can offset their layout without prop-drilling.
 */
export function useKeyboardAware(): KeyboardAwareState {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const stabilizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // keyboardHeight = space below the visible viewport
      const kh = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardHeight(kh);
      setIsKeyboardOpen(kh > 80);
      document.documentElement.style.setProperty('--keyboard-clearance', `${kh + 16}px`);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.documentElement.style.removeProperty('--keyboard-clearance');
    };
  }, []);

  const scrollInputIntoView = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Re-check after keyboard animation settles (~300ms)
    if (stabilizeTimer.current) clearTimeout(stabilizeTimer.current);
    stabilizeTimer.current = setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
  }, []);

  return { isKeyboardOpen, keyboardHeight, scrollInputIntoView };
}
