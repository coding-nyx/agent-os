/**
 * ModelBadge — live pill displaying the active LLM model.
 *
 * Zero render cost when debugMode is off.
 * Reads active model from localStorage (same source used by the LLM engine)
 * and alternates between model name and link status every 3 seconds.
 */
import { useState, useEffect } from 'react';
import { useAI } from '@/cortex-bridge/ai-context';

const DEFAULT_MODEL = 'deepseek/deepseek-chat';
const STORAGE_KEY_MODEL = 'preferred_model';

interface ModelBadgeProps {
  debugMode: boolean;
}

export function ModelBadge({ debugMode }: ModelBadgeProps) {
  if (!debugMode) return null;

  return <ModelBadgeInner />;
}

/** Inner component — only mounted when debugMode is true. */
function ModelBadgeInner() {
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

  let activeModelId: string | null = null;
  let activeProvider: string | null = null;
  try {
    const aiContext = useAI();
    activeModelId = aiContext.activeModelId;
    activeProvider = aiContext.activeProvider;
  } catch {
    activeModelId = null;
    activeProvider = null;
  }

  const preferredProvider = (() => {
    try {
      return localStorage.getItem('ara_debug_provider');
    } catch {
      return null;
    }
  })();

  const resolvedModel = activeModelId ?? modelName;
  const resolvedProvider = activeProvider ?? preferredProvider;
  const displayModel = resolvedProvider && resolvedModel && !resolvedModel.includes('/')
    ? `${resolvedProvider}/${resolvedModel}`
    : resolvedModel;

  const label = displayModel ?? DEFAULT_MODEL;

  return (
    <span
      className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full font-mono shrink-0 hidden sm:inline-flex items-center"
      aria-label={`Active model: ${displayModel ?? DEFAULT_MODEL}`}
    >
      {label}
    </span>
  );
}
