/**
 * useDebugMode — reactive debug-mode toggle backed by localStorage.
 *
 * Key:   localStorage['nexus_debug_mode']  ('true' | 'false')
 * Sync:  'storage' event (cross-tab) + 'nexus_debug_mode_changed' CustomEvent (same-tab)
 *
 * Also exposes granular DebugFlags (per-feature visibility controls) stored
 * under FLAGS_STORAGE_KEY and synced via 'nexus_debug_flags_changed'.
 */
import { useState, useEffect, useCallback } from 'react';
import { NexusLogger } from '@/lib/nexus-logger';

const STORAGE_KEY = 'nexus_debug_mode';
const CUSTOM_EVENT = 'nexus_debug_mode_changed';

const FLAGS_STORAGE_KEY = 'nexus_debug_flags';
const FLAGS_CUSTOM_EVENT = 'nexus_debug_flags_changed';

// ---------------------------------------------------------------------------
// DebugFlags — granular per-feature visibility controls
// ---------------------------------------------------------------------------

export interface DebugFlags {
  /** Show AI reasoning/thinking section in chat */
  thinking: boolean;
  /** Show extracted action tags per message */
  actionTags: boolean;
  /** Show what actions were requested by the model */
  actionAsked: boolean;
  /** Show soul/profile data write events */
  dataUpdates: boolean;
  /** Show action dispatch confirmations */
  actionUpdates: boolean;
  /** Show spine events triggered per message */
  spineEvents: boolean;
}

const DEFAULT_FLAGS: DebugFlags = {
  thinking: true,
  actionTags: true,
  actionAsked: true,
  dataUpdates: true,
  actionUpdates: true,
  spineEvents: true,
};

// ---------------------------------------------------------------------------
// Helpers — debug mode
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers — debug flags
// ---------------------------------------------------------------------------

function readDebugFlags(): DebugFlags {
  try {
    const raw = localStorage.getItem(FLAGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FLAGS };
    const parsed = JSON.parse(raw) as Partial<DebugFlags>;
    // Merge with defaults so newly-added flags always have a value
    return { ...DEFAULT_FLAGS, ...parsed };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

function writeDebugFlags(flags: DebugFlags): void {
  try {
    localStorage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(flags));
  } catch {
    // Ignore storage write errors (e.g., private-browsing quota)
  }
}

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

export interface DebugModeControls {
  debugMode: boolean;
  toggleDebugMode: () => void;
  debugFlags: DebugFlags;
  setDebugFlag: (key: keyof DebugFlags, value: boolean) => void;
}

export function useDebugMode(): DebugModeControls {
  const [debugMode, setDebugMode] = useState<boolean>(readDebugMode);
  const [debugFlags, setDebugFlagsState] = useState<DebugFlags>(readDebugFlags);

  useEffect(() => {
    // --- debug mode sync ---
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setDebugMode(event.newValue === 'true');
      }
      if (event.key === FLAGS_STORAGE_KEY) {
        setDebugFlagsState(readDebugFlags());
      }
    };

    const handleModeCustomEvent = () => {
      setDebugMode(readDebugMode());
    };

    const handleFlagsCustomEvent = () => {
      setDebugFlagsState(readDebugFlags());
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(CUSTOM_EVENT, handleModeCustomEvent);
    window.addEventListener(FLAGS_CUSTOM_EVENT, handleFlagsCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(CUSTOM_EVENT, handleModeCustomEvent);
      window.removeEventListener(FLAGS_CUSTOM_EVENT, handleFlagsCustomEvent);
    };
  }, []);

  const toggleDebugMode = useCallback(() => {
    const next = !readDebugMode();
    writeDebugMode(next);
    NexusLogger.setDebugMode(next);
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENT));
  }, []);

  const setDebugFlag = useCallback((key: keyof DebugFlags, value: boolean) => {
    const current = readDebugFlags();
    const updated: DebugFlags = { ...current, [key]: value };
    writeDebugFlags(updated);
    setDebugFlagsState(updated);
    window.dispatchEvent(new CustomEvent(FLAGS_CUSTOM_EVENT));
  }, []);

  return { debugMode, toggleDebugMode, debugFlags, setDebugFlag };
}
