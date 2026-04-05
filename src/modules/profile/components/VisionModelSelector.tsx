import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, ChevronDown, Search, RefreshCw, Check, Loader2 } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { resolveOpenRouterKey } from '@/lib/services/openrouter-key';

type ProviderId = 'openrouter' | 'google' | 'grok';

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'google', label: 'Google' },
  { id: 'grok', label: 'Grok' },
];

const PROVIDER_KEY = 'nexus_debug_provider';
const VISION_MODEL_KEY = 'preferred_vision_model';
const DEFAULT_VISION_MODEL = 'openai/gpt-4o-mini';

interface ORModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
  modalities?: string[];
  input_modalities?: string[];
  architecture?: { input_modalities?: string[] };
}

function readProvider(): ProviderId {
  try {
    const v = localStorage.getItem(PROVIDER_KEY);
    if (v === 'openrouter' || v === 'google' || v === 'grok') return v;
  } catch { /* noop */ }
  return 'openrouter';
}

function readVisionModel(): string {
  try { return localStorage.getItem(VISION_MODEL_KEY) || ''; }
  catch { return ''; }
}

function formatCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function isVisionCapable(model: ORModel): boolean {
  const modalities = [
    ...(model.modalities ?? []),
    ...(model.input_modalities ?? []),
    ...(model.architecture?.input_modalities ?? []),
  ].map((m) => m.toLowerCase());
  if (modalities.some((m) => m.includes('image') || m.includes('vision') || m.includes('multimodal'))) {
    return true;
  }
  const hay = `${model.id} ${model.name}`.toLowerCase();
  return (
    hay.includes('vision') ||
    hay.includes('multimodal') ||
    hay.includes('gpt-4o') ||
    hay.includes('gpt-4.1') ||
    hay.includes('gemini')
  );
}

export function VisionModelSelector() {
  const [provider] = useState<ProviderId>(readProvider);
  const [selectedModel, setSelectedModelState] = useState<string>(readVisionModel);
  const [models, setModels] = useState<ORModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const fetchModels = useCallback(async () => {
    const apiKey = resolveOpenRouterKey();
    if (!apiKey) return;
    setLoading(true);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data: ORModel[] = (json.data ?? []).sort((a: ORModel, b: ORModel) =>
        a.name.localeCompare(b.name),
      );
      setModels(data);
    } catch (e) {
      console.warn('VisionModelSelector: fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (provider === 'openrouter') void fetchModels();
  }, [provider, fetchModels]);

  const selectModel = useCallback((id: string) => {
    setSelectedModelState(id);
    try { localStorage.setItem(VISION_MODEL_KEY, id); } catch { /* noop */ }
    setIsOpen(false);
    setSearch('');
  }, []);

  const filtered = useMemo(() => {
    const visionOnly = models.filter(isVisionCapable);
    const q = search.trim().toLowerCase();
    const src = q
      ? visionOnly.filter(m => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      : visionOnly;
    return src.slice(0, 80);
  }, [models, search]);

  const displayName = useMemo(() => {
    if (!selectedModel) return DEFAULT_VISION_MODEL;
    return models.find(m => m.id === selectedModel)?.name ?? selectedModel;
  }, [selectedModel, models]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">
          Vision Model
        </p>
        <NeuralButton
          variant="ghost"
          onClick={() => void fetchModels()}
          disabled={loading}
          className="text-[11px] text-amber-400/60 hover:text-amber-400 transition-colors flex items-center gap-1 h-auto p-0 min-w-0"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </NeuralButton>
      </div>

      {provider !== 'openrouter' && (
        <div className="text-[11px] text-white/40 border border-white/[0.12] rounded-lg p-2">
          Vision model selection is available for OpenRouter only.
        </div>
      )}

      {/* Trigger */}
      <NeuralButton
        variant="secondary"
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-white/[0.12] bg-slate-900/60 hover:border-amber-500/30 transition-colors text-left h-auto min-h-[44px]"
      >
        <span className="text-xs text-white/70 truncate">{displayName}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-white/30 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </NeuralButton>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="vision-model-list"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-white/[0.12] bg-slate-900/70 overflow-hidden">
              <div className="p-2 border-b border-white/[0.09]">
                <NeuralInput
                  icon={<Search className="w-3 h-3" />}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search vision models…"
                  className="h-9 min-h-0 text-xs py-0"
                  autoFocus
                />
              </div>

              <div className="max-h-64 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-4 h-4 text-amber-400/60 animate-spin" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-white/30">
                    No vision-capable models found
                  </div>
                ) : (
                  filtered.map(m => (
                    <NeuralButton
                      key={m.id}
                      variant="ghost"
                      onClick={() => selectModel(m.id)}
                      className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/[0.045] transition-colors h-auto rounded-none justify-start ${
                        selectedModel === m.id ? 'bg-amber-500/10' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/75 truncate">{m.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-white/25 font-mono truncate">
                            {m.id}
                          </span>
                          <span className="text-[11px] text-white/20 shrink-0">
                            {formatCtx(m.context_length)} ctx
                          </span>
                        </div>
                      </div>
                      {selectedModel === m.id && (
                        <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      )}
                    </NeuralButton>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/50 border border-white/[0.09]">
        <Cpu className="w-3 h-3 text-amber-400/50 shrink-0" />
        <p className="text-[11px] text-white/40 truncate">
          Active:{' '}
          <span className="text-amber-400/70 font-mono">{selectedModel || DEFAULT_VISION_MODEL}</span>
        </p>
      </div>
    </div>
  );
}
