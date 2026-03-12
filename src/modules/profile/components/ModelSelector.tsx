import React, { useEffect, useState } from 'react';
import { ModelRegistry } from '@/llm-engine/engine/ModelRegistry';
import { ModelMetadata } from '@/llm-engine/engine/types';

interface ModelSelectorProps {
  currentModel: string | null;
  onSelect: (modelId: string) => void;
  onReset: () => void;
}

export function ModelSelector({ currentModel, onSelect, onReset }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey =
      localStorage.getItem('VITE_OPENROUTER_API_KEY') ||
      (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined);

    if (!apiKey) {
      setError('No API key — set VITE_OPENROUTER_API_KEY to browse models');
      return;
    }

    setIsLoading(true);
    ModelRegistry.fetchModels(apiKey)
      .then((fetched) => {
        setModels(fetched);
        setIsLoading(false);
      })
      .catch(() => {
        setError('Failed to load models');
        setIsLoading(false);
      });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value) onSelect(value);
  };

  if (isLoading) {
    return (
      <div className="h-9 w-full rounded-xl bg-white/5 border border-white/10 animate-pulse" />
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-[10px] font-medium text-amber-400/80 uppercase tracking-wider">
          ⚠ {error}
        </p>
      )}

      <select
        value={currentModel ?? ''}
        onChange={handleChange}
        className="w-full rounded-xl bg-black/30 border border-white/10 text-xs text-white/80 font-medium px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/40 transition-colors hover:border-white/20 disabled:opacity-40"
        disabled={models.length === 0 && !error}
        aria-label="Select language model"
      >
        <option value="" className="bg-neutral-900 text-white/60">
          Default (deepseek/deepseek-chat)
        </option>
        {models.map((m) => (
          <option key={m.id} value={m.id} className="bg-neutral-900 text-white/90">
            {m.name}
          </option>
        ))}
      </select>

      {currentModel && (
        <button
          type="button"
          onClick={onReset}
          className="text-[10px] font-bold uppercase tracking-wider text-rose-400/70 hover:text-rose-400 transition-colors px-1"
        >
          Reset to default
        </button>
      )}
    </div>
  );
}
