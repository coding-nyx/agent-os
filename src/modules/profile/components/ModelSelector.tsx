import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, ChevronDown, Search, RefreshCw, Check, Loader2 } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type ProviderId = 'openrouter' | 'google' | 'grok';

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'google', label: 'Google' },
  { id: 'grok', label: 'Grok' },
];

const PROVIDER_KEY = 'nexus_debug_provider';
const MODEL_KEY = 'preferred_model';

const DEFAULT_PROVIDER_MODELS: Record<string, string> = {
  google: 'google/gemini-2.0-flash:free',
  grok: 'x-ai/grok-2',
};

interface ORModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

interface GoogleModel {
  name: string;
  displayName?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readProvider(): ProviderId {
  try {
    const v = localStorage.getItem(PROVIDER_KEY);
    if (v === 'openrouter' || v === 'google' || v === 'grok') return v;
  } catch { /* noop */ }
  return 'openrouter';
}

function readModel(): string {
  try { return localStorage.getItem(MODEL_KEY) || ''; }
  catch { return ''; }
}

function formatCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelSelector() {
  const [provider, setProviderState] = useState<ProviderId>(readProvider);
  const [selectedModel, setSelectedModelState] = useState<string>(readModel);
  const [models, setModels] = useState<ORModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const fetchOpenRouterModels = useCallback(async () => {
    const apiKey =
      localStorage.getItem('VITE_OPENROUTER_API_KEY') ||
      (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined);
    if (!apiKey) return;
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
  }, []);

  const fetchGoogleModels = useCallback(async () => {
    const apiKey =
      localStorage.getItem('VITE_GOOGLE_API_KEY') ||
      (import.meta.env.VITE_GOOGLE_API_KEY as string | undefined);
    if (!apiKey) return;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const raw: GoogleModel[] = json.models ?? [];
    const filtered = raw.filter((m) =>
      (m.supportedGenerationMethods ?? []).includes('generateContent'),
    );
    const data: ORModel[] = filtered.map((m) => {
      const id = m.name?.replace(/^models\//, '') ?? '';
      return {
        id,
        name: m.displayName || id,
        context_length: m.inputTokenLimit ?? 0,
        pricing: { prompt: '0', completion: '0' },
      };
    });
    setModels(data);
  }, []);

  const fetchGrokModels = useCallback(async () => {
    const apiKey =
      localStorage.getItem('VITE_GROK_API_KEY') ||
      (import.meta.env.VITE_GROK_API_KEY as string | undefined);
    if (!apiKey) return;
    const res = await fetch('https://api.x.ai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const raw = json.data ?? [];
    const data: ORModel[] = raw.map((m: any) => ({
      id: m.id,
      name: m.id,
      context_length: m.context_length ?? 0,
      pricing: { prompt: '0', completion: '0' },
    }));
    setModels(data);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (provider === 'openrouter') {
          await fetchOpenRouterModels();
        } else if (provider === 'google') {
          await fetchGoogleModels();
        } else if (provider === 'grok') {
          await fetchGrokModels();
        }
      } catch (e) {
        console.warn('ModelSelector: fetch failed', e);
        if (provider === 'google') {
          setModels([
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', context_length: 0, pricing: { prompt: '0', completion: '0' } },
          ]);
        } else if (provider === 'grok') {
          setModels([
            { id: 'grok-2', name: 'Grok 2', context_length: 0, pricing: { prompt: '0', completion: '0' } },
          ]);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [provider, fetchOpenRouterModels, fetchGoogleModels, fetchGrokModels]);

  // ── Provider change ──
  const setProvider = useCallback((p: ProviderId) => {
    setProviderState(p);
    try { localStorage.setItem(PROVIDER_KEY, p); } catch { /* noop */ }
    if (p !== 'openrouter') {
      const m = DEFAULT_PROVIDER_MODELS[p] ?? '';
      setSelectedModelState(m);
      try { localStorage.setItem(MODEL_KEY, m); } catch { /* noop */ }
    }
  }, []);

  // ── Model change ──
  const selectModel = useCallback((id: string) => {
    setSelectedModelState(id);
    try { localStorage.setItem(MODEL_KEY, id); } catch { /* noop */ }
    setIsOpen(false);
    setSearch('');
  }, []);

  // ── Filtered list (cap at 80 for perf) ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const src = q
      ? models.filter(m => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      : models;
    return src.slice(0, 80);
  }, [models, search]);

  const displayName = useMemo(() => {
    if (!selectedModel) return 'None selected';
    return models.find(m => m.id === selectedModel)?.name ?? selectedModel;
  }, [selectedModel, models]);

  return (
    <div className="space-y-4">
      {/* ── Provider selector ── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 mb-2">
          Provider
        </p>
        <div className="flex gap-2">
          {PROVIDERS.map(p => (
            <NeuralButton
              key={p.id}
              onClick={() => setProvider(p.id)}
              variant={provider === p.id ? 'primary' : 'secondary'}
              className={`flex-1 text-xs font-bold h-auto py-2 ${
                provider === p.id
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-white/10 bg-black/20 text-white/50 hover:border-white/20 hover:text-white/70'
              }`}
            >
              {p.label}
            </NeuralButton>
          ))}
        </div>
      </div>

      {/* ── Model selector ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
            Model
          </p>
          <NeuralButton
            variant="ghost"
            onClick={() => {
              if (provider === 'openrouter') return fetchOpenRouterModels();
              if (provider === 'google') return fetchGoogleModels();
              return fetchGrokModels();
            }}
            disabled={loading}
            className="text-[9px] text-amber-400/60 hover:text-amber-400 transition-colors flex items-center gap-1 h-auto p-0 min-w-0"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </NeuralButton>
        </div>

        {/* Trigger */}
        <NeuralButton
          variant="secondary"
          onClick={() => setIsOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-white/10 bg-black/30 hover:border-amber-500/30 transition-colors text-left h-auto min-h-[44px]"
        >
          <span className="text-xs text-white/70 truncate">{displayName}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-white/30 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </NeuralButton>

        {/* Dropdown */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="model-list"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-2 rounded-xl border border-white/10 bg-black/40 overflow-hidden">
                {/* Search */}
                <div className="p-2 border-b border-white/5">
                  <NeuralInput
                    icon={<Search className="w-3 h-3" />}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search models…"
                    className="h-9 min-h-0 text-xs py-0"
                    autoFocus
                  />
                </div>

                {/* List */}
                <div className="max-h-64 overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-4 h-4 text-amber-400/60 animate-spin" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="py-6 text-center text-[10px] text-white/30">
                      No models found
                    </div>
                  ) : (
                    filtered.map(m => (
                      <NeuralButton
                        key={m.id}
                        variant="ghost"
                        onClick={() => selectModel(m.id)}
                        className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors h-auto rounded-none justify-start ${
                          selectedModel === m.id ? 'bg-amber-500/10' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/75 truncate">{m.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-white/25 font-mono truncate">
                              {m.id}
                            </span>
                            <span className="text-[9px] text-white/20 shrink-0">
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
      </div>

      {/* Current selection summary */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/5">
        <Cpu className="w-3 h-3 text-amber-400/50 shrink-0" />
        <p className="text-[9px] text-white/40 truncate">
          Active:{' '}
          <span className="text-amber-400/70 font-mono">{selectedModel || 'default'}</span>
        </p>
      </div>

      <p className="text-[9px] text-amber-400/40 px-1">
        ⚡ Reload page to apply model changes
      </p>
    </div>
  );
}
