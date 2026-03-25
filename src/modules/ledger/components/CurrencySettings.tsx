import React, { useState, useMemo } from 'react';
import { Globe, Plus, Trash2, RefreshCw } from 'lucide-react';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import type { CurrencyRate } from '../services/ledger-intake-service';
import { getSupportedCurrencies, getExchangeRate, upsertCurrencyRate } from '../services/currency-service';

export interface CurrencySettingsProps {
  isOpen: boolean;
  onClose: () => void;
  baseCurrency: string;
  storedRates: CurrencyRate[];
  onUpdateBaseCurrency: (currency: string) => void;
  onUpsertRate: (from: string, to: string, rate: number) => void;
  onDeleteRate: (from: string, to: string) => void;
}

const CURRENCIES = getSupportedCurrencies();
const CURRENCY_OPTIONS = CURRENCIES.map(c => ({ label: c, value: c }));

interface RateFormState {
  from: string;
  to: string;
  rate: string;
}

const EMPTY_FORM: RateFormState = { from: 'USD', to: 'EUR', rate: '' };

export default function CurrencySettings({
  isOpen,
  onClose,
  baseCurrency,
  storedRates,
  onUpdateBaseCurrency,
  onUpsertRate,
  onDeleteRate,
}: CurrencySettingsProps) {
  const [form, setForm] = useState<RateFormState>(EMPTY_FORM);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState('');

  // Live preview of the rate using service (stored + built-in fallback)
  const preview = useMemo(() => {
    if (!form.from || !form.to || form.from === form.to) return null;
    const rate = getExchangeRate(form.from, form.to, storedRates);
    return `1 ${form.from} ≈ ${rate.toFixed(4)} ${form.to}`;
  }, [form.from, form.to, storedRates]);

  function handleSave() {
    const rate = parseFloat(form.rate);
    if (!form.from || !form.to) { setError('Select both currencies.'); return; }
    if (form.from === form.to) { setError('From and To must differ.'); return; }
    if (isNaN(rate) || rate <= 0) { setError('Enter a valid positive rate.'); return; }
    onUpsertRate(form.from, form.to, rate);
    setForm(EMPTY_FORM);
    setShowAddForm(false);
    setError('');
  }

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title="Currency Settings"
      subtitle="Set your base currency and manage custom exchange rates"
      icon={Globe}
      themeColor="cyan"
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* Base currency */}
        <div>
          <label className="block text-xs text-white/50 font-medium uppercase tracking-wide mb-2">Base Currency</label>
          <NeuralSelectMenu
            value={baseCurrency}
            options={CURRENCY_OPTIONS}
            onChange={onUpdateBaseCurrency}
            ariaLabel="Base currency"
          />
          <p className="text-xs text-white/40 mt-1">All balances and net worth are displayed in this currency.</p>
        </div>

        {/* Stored custom rates */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-white/50 font-medium uppercase tracking-wide">Custom Exchange Rates</label>
            <NeuralButton
              variant="ghost"
              size="sm"
              themeColor="cyan"
              onClick={() => { setShowAddForm(v => !v); setError(''); }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Rate
            </NeuralButton>
          </div>

          {storedRates.length === 0 && !showAddForm && (
            <p className="text-xs text-white/30 py-3 text-center">
              No custom rates — built-in approximate rates are used as fallback.
            </p>
          )}

          {storedRates.length > 0 && (
            <div className="divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
              {storedRates.map(r => (
                <div key={`${r.from}-${r.to}`} className="flex items-center justify-between px-4 py-2.5 bg-white/5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-white/80">{r.from} → {r.to}</span>
                    <span className="text-sm text-cyan-400 font-medium">{r.rate.toFixed(4)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/30">{r.recordedAt ? new Date(r.recordedAt).toLocaleDateString() : ''}</span>
                    <button
                      onClick={() => onDeleteRate(r.from, r.to)}
                      className="text-white/30 hover:text-red-400 transition-colors"
                      aria-label="Delete rate"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add rate form */}
          {showAddForm && (
            <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1">From</label>
                  <NeuralSelectMenu
                    value={form.from}
                    options={CURRENCY_OPTIONS}
                    onChange={(v: string) => setForm(f => ({ ...f, from: v }))}
                    ariaLabel="From currency"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">To</label>
                  <NeuralSelectMenu
                    value={form.to}
                    options={CURRENCY_OPTIONS}
                    onChange={(v: string) => setForm(f => ({ ...f, to: v }))}
                    ariaLabel="To currency"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Rate (1 {form.from} = ? {form.to})</label>
                <NeuralInput
                  value={form.rate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, rate: e.target.value }))}
                  placeholder={preview ?? 'e.g. 0.92'}
                  type="number"
                  step="0.0001"
                  min="0"
                />
                {preview && !form.rate && (
                  <p className="text-xs text-white/30 mt-1 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Built-in: {preview}
                  </p>
                )}
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-2 justify-end">
                <NeuralButton variant="ghost" size="sm" onClick={() => { setShowAddForm(false); setError(''); }}>
                  Cancel
                </NeuralButton>
                <NeuralButton variant="primary" size="sm" themeColor="cyan" onClick={handleSave}>
                  Save Rate
                </NeuralButton>
              </div>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-white/10">
          <NeuralButton variant="ghost" size="sm" onClick={onClose} className="w-full">
            Done
          </NeuralButton>
        </div>
      </div>
    </NeuralModal>
  );
}
