import { useState, useCallback } from 'react';
import { Check, Eye, EyeOff, Key, Loader2 } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { saveApiKey } from '@/cortex-bridge/credential-store-bridge';
import { resolveOpenRouterKey } from '@/lib/services/openrouter-key';
import { ARA_EVENTS } from '@/cortex-bridge/ara-events';

type ProviderId = 'openrouter' | 'gemini' | 'grok';

const PROVIDERS: Array<{ id: ProviderId; label: string; placeholder: string; storageKey: string }> = [
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-v1-...', storageKey: 'openrouter_api_key' },
  { id: 'gemini', label: 'Google Gemini', placeholder: 'AIza...', storageKey: 'VITE_GOOGLE_API_KEY' },
  { id: 'grok', label: 'xAI Grok', placeholder: 'xai-...', storageKey: 'VITE_GROK_API_KEY' },
];

function isKeyConfigured(providerId: ProviderId): boolean {
  if (providerId === 'openrouter') return !!resolveOpenRouterKey();
  const storageKey = PROVIDERS.find(p => p.id === providerId)?.storageKey ?? '';
  return !!(localStorage.getItem(storageKey) || (import.meta.env as Record<string, string>)[`VITE_${storageKey.toUpperCase()}`]);
}

export function ApiKeyPanel() {
  const [values, setValues] = useState<Record<ProviderId, string>>({ openrouter: '', gemini: '', grok: '' });
  const [visible, setVisible] = useState<Record<ProviderId, boolean>>({ openrouter: false, gemini: false, grok: false });
  const [saving, setSaving] = useState<Record<ProviderId, boolean>>({ openrouter: false, gemini: false, grok: false });
  const [saved, setSaved] = useState<Record<ProviderId, boolean>>({ openrouter: false, gemini: false, grok: false });
  const [errors, setErrors] = useState<Record<ProviderId, string | null>>({ openrouter: null, gemini: null, grok: null });

  const handleSave = useCallback(async (providerId: ProviderId) => {
    const value = values[providerId].trim();
    if (!value) return;
    setSaving(s => ({ ...s, [providerId]: true }));
    setErrors(e => ({ ...e, [providerId]: null }));
    try {
      await saveApiKey(providerId, value);
      window.dispatchEvent(new CustomEvent(ARA_EVENTS.CREDENTIALS_CHANGED));
      setValues(v => ({ ...v, [providerId]: '' }));
      setSaved(s => ({ ...s, [providerId]: true }));
      setTimeout(() => setSaved(s => ({ ...s, [providerId]: false })), 2000);
    } catch (err) {
      setErrors(e => ({ ...e, [providerId]: err instanceof Error ? err.message : 'Save failed' }));
    } finally {
      setSaving(s => ({ ...s, [providerId]: false }));
    }
  }, [values]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40 mb-1">
          API Keys
        </p>
        <p className="text-[11px] text-white/30 leading-relaxed">
          Keys are stored encrypted in your vault. Without a key the AI runs in simulation mode.
        </p>
      </div>

      {PROVIDERS.map(provider => {
        const configured = isKeyConfigured(provider.id);
        return (
          <div key={provider.id} className="rounded-xl border border-white/[0.09] bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-white/30" />
                <span className="text-xs font-bold text-white/70">{provider.label}</span>
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${configured ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-white/30 border-white/[0.09] bg-white/[0.03]'}`}>
                {configured ? 'Configured' : 'Not set'}
              </span>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <NeuralInput
                  value={values[provider.id]}
                  onChange={e => setValues(v => ({ ...v, [provider.id]: e.target.value }))}
                  placeholder={provider.placeholder}
                  type={visible[provider.id] ? 'text' : 'password'}
                  onKeyDown={e => { if (e.key === 'Enter') void handleSave(provider.id); }}
                  className="pr-8 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setVisible(v => ({ ...v, [provider.id]: !v[provider.id] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {visible[provider.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <NeuralButton
                variant="primary"
                onClick={() => void handleSave(provider.id)}
                disabled={!values[provider.id].trim() || saving[provider.id]}
                className="shrink-0 text-xs px-3 h-auto py-2 min-w-[60px]"
              >
                {saving[provider.id] ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : saved[provider.id] ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : 'Save'}
              </NeuralButton>
            </div>

            {errors[provider.id] && (
              <p className="text-[11px] text-red-400">{errors[provider.id]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
