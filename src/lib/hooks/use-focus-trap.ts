/**
 * useFocusTrap — Lightweight keyboard focus trap for modal/dialog components.
 *
 * When `active` is `true`:
 * 1. Moves focus into the container on mount.
 * 2. Traps Tab / Shift+Tab within focusable descendants.
 * 3. Calls `onEscape` (if provided) when Escape is pressed.
 * 4. Restores focus to the previously-focused element on deactivation.
 *
 * Does NOT touch `aria-*` attributes — callers should set `role`, `aria-modal`,
 * etc. on the container element themselves.
 */

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface UseFocusTrapOptions {
  /** Whether the trap is active. */
  active: boolean;
  /** Called when Escape is pressed while trap is active. */
  onEscape?: () => void;
}

/**
 * Returns a ref that should be attached to the container element.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  options: UseFocusTrapOptions,
): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!options.active) return;

    // Capture the element that held focus before the trap activated.
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Move focus into the container on activation.
    const container = containerRef.current;
    if (!container) return;

    // Small delay to let animation frames settle before focusing.
    const focusTimer = setTimeout(() => {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (first) {
        first.focus();
      } else {
        // Fallback: make the container itself focusable.
        container.setAttribute('tabindex', '-1');
        container.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        options.onEscape?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      container.removeEventListener('keydown', handleKeyDown);

      // Restore focus to the element that was focused before the trap.
      previousFocusRef.current?.focus();
    };
  }, [options.active, options.onEscape]);

  return containerRef;
}
