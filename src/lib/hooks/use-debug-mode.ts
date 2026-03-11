/**
 * useDebugMode — reactive debug-mode toggle backed by localStorage.
 *
 * Key:   localStorage['nexus_debug_mode']  ('true' | 'false')
 * Sync:  'storage' event (cross-tab) + 'nexus_debug_mode_changed' CustomEvent (same-tab)
 */
import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'nexus_debug_mode';
const CUSTOM_EVENT = 'nexus_debug_mode_changed';

function readDebugMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeDebugMode(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // Ignore storage write errors (e.g., private-browsing quota)
  }
}

export interface DebugModeControls {
  debugMode: boolean;
  toggleDebugMode: () => void;
}

export function useDebugMode(): DebugModeControls {
  const [debugMode, setDebugMode] = useState<boolean>(readDebugMode);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setDebugMode(event.newValue === 'true');
      }
    };

    const handleCustomEvent = () => {
      setDebugMode(readDebugMode());
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(CUSTOM_EVENT, handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(CUSTOM_EVENT, handleCustomEvent);
    };
  }, []);

  const toggleDebugMode = useCallback(() => {
    const next = !readDebugMode();
    writeDebugMode(next);
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENT));
  }, []);

  return { debugMode, toggleDebugMode };
}
