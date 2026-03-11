/**
 * ModelBadge — live pill displaying the active LLM model.
 *
 * Zero render cost when debugMode is off.
 * Reads active model from localStorage (same source used by the LLM engine)
 * and alternates between model name and link status every 3 seconds.
 */
import { useState, useEffect } from 'react';

const DEFAULT_MODEL = 'deepseek/deepseek-chat';
const STORAGE_KEY_MODEL = 'preferred_model';
const TOGGLE_INTERVAL_MS = 3000;

interface ModelBadgeProps {
  debugMode: boolean;
}

export function ModelBadge({ debugMode }: ModelBadgeProps) {
  if (!debugMode) return null;

  return <ModelBadgeInner />;
}

/** Inner component — only mounted when debugMode is true. */
function ModelBadgeInner() {
  const [showModel, setShowModel] = useState(true);
  const [modelName, setModelName] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_MODEL) ?? DEFAULT_MODEL;
    } catch {
      return DEFAULT_MODEL;
    }
  });

  // Sync model name if it changes in localStorage
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_MODEL) {
        setModelName(e.newValue ?? DEFAULT_MODEL);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Alternate between model name and "linked" state
  useEffect(() => {
    const id = setInterval(() => {
      setShowModel((prev) => !prev);
    }, TOGGLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const label = showModel ? `⚡ ${modelName}` : '↔ linked';

  return (
    <span
      className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full font-mono shrink-0 hidden sm:inline-flex items-center"
      aria-label={`Active model: ${modelName}`}
    >
      {label}
    </span>
  );
}
