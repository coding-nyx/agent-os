/**
 * QuickLogPanel.tsx
 *
 * Fast transaction entry widget shown at the top of the Ledger overview.
 * Supports:
 *  - Natural-language parsing: "coffee $4.50" → expense, "salary $3000 income" → income
 *  - One-click amount + category form
 *  - Recurring toggle
 *  - Category quick-select chips
 */

import React, { useState, useRef, useCallback } from 'react';
import { Plus, Minus, RotateCcw, Zap, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Transaction } from '../services/ledger-intake-service';

interface QuickLogPanelProps {
  categories: string[];
  currency: string;
  onAddTransaction: (transaction: Omit<Transaction, 'id'>) => void;
}

const QUICK_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Health', 'Bills', 'Income', 'Other'];
const INCOME_KEYWORDS = ['salary', 'income', 'freelance', 'dividend', 'refund', 'bonus', 'paycheck', 'revenue'];
const AMOUNT_REGEX = /\$?([\d,]+(?:\.\d{1,2})?)/;

function parseNaturalInput(text: string): { description: string; amount: number; type: 'income' | 'expense'; category: string } | null {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;

  const amountMatch = lower.match(AMOUNT_REGEX);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;
  if (!amount) return null;

  const isIncome = INCOME_KEYWORDS.some(kw => lower.includes(kw));
  const type: 'income' | 'expense' = isIncome ? 'income' : 'expense';

  const description = text.replace(AMOUNT_REGEX, '').replace(/income|expense|debit|credit/gi, '').trim() || (isIncome ? 'Income' : 'Expense');

  let category = isIncome ? 'Income' : 'Other';
  if (/coffee|cafe|restaurant|food|lunch|dinner|breakfast|eat|meal/i.test(lower)) category = 'Food';
  else if (/uber|lyft|taxi|gas|fuel|bus|train|transit|transport/i.test(lower)) category = 'Transport';
  else if (/amazon|shop|buy|purchase|store|market/i.test(lower)) category = 'Shopping';
  else if (/doctor|pharmacy|gym|health|medical|dental/i.test(lower)) category = 'Health';
  else if (/rent|electric|water|internet|phone|bill|utility/i.test(lower)) category = 'Bills';

  return { description: description.charAt(0).toUpperCase() + description.slice(1), amount, type, category };
}

export function QuickLogPanel({ categories, currency, onAddTransaction }: QuickLogPanelProps) {
  const [naturalInput, setNaturalInput] = useState('');
  const [parsed, setParsed] = useState<ReturnType<typeof parseNaturalInput>>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualType, setManualType] = useState<'income' | 'expense'>('expense');
  const [manualCategory, setManualCategory] = useState('Other');
  const [isRecurring, setIsRecurring] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allCategories = Array.from(new Set([...QUICK_CATEGORIES, ...categories]));

  const handleNaturalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNaturalInput(val);
    setParsed(parseNaturalInput(val));
    setSubmitted(false);
  };

  const handleNaturalSubmit = useCallback(() => {
    const result = parsed;
    if (!result) return;

    const today = new Date().toISOString().split('T')[0];
    onAddTransaction({
      date: today,
      description: result.description,
      amount: result.amount,
      type: result.type,
      category: result.category,
      isRecurring,
    });

    setNaturalInput('');
    setParsed(null);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 1500);
    inputRef.current?.focus();
  }, [parsed, isRecurring, onAddTransaction]);

  const handleManualSubmit = useCallback(() => {
    const amount = parseFloat(manualAmount);
    if (!amount || amount <= 0 || !manualDesc.trim()) return;

    const today = new Date().toISOString().split('T')[0];
    onAddTransaction({
      date: today,
      description: manualDesc.trim(),
      amount,
      type: manualType,
      category: manualCategory,
      isRecurring,
    });

    setManualAmount('');
    setManualDesc('');
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 1500);
  }, [manualAmount, manualDesc, manualType, manualCategory, isRecurring, onAddTransaction]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (!manualMode) handleNaturalSubmit();
      else handleManualSubmit();
    }
  };

  return (
    <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/60">Quick Log</span>
        </div>
        <button
          onClick={() => { setManualMode(m => !m); setSubmitted(false); }}
          className="text-[10px] font-semibold text-white/40 hover:text-white/70 transition-colors"
        >
          {manualMode ? 'Natural Input' : 'Manual Form'}
        </button>
      </div>

      <div className="p-4 space-y-3">
        {!manualMode ? (
          /* Natural language mode */
          <div className="space-y-2">
            <div className="relative">
              <input
                ref={inputRef}
                value={naturalInput}
                onChange={handleNaturalChange}
                onKeyDown={handleKeyDown}
                placeholder='Type naturally: "coffee $4.50" or "salary $3000 income"'
                className={cn(
                  'w-full bg-black/30 border rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30',
                  'focus:outline-none focus:ring-1 transition-all',
                  parsed ? 'border-cyan-500/40 focus:ring-cyan-500/30' : 'border-white/10 focus:ring-white/10'
                )}
              />
              {submitted && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">
                  <Check className="w-4 h-4" />
                </span>
              )}
            </div>

            {parsed && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-black/20 border border-white/[0.06]">
                <div className="flex items-center gap-3 text-xs">
                  <span className={cn(
                    'font-bold tabular-nums',
                    parsed.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                  )}>
                    {parsed.type === 'income' ? '+' : '−'}{currency} {parsed.amount.toFixed(2)}
                  </span>
                  <span className="text-white/60 truncate max-w-[120px]">{parsed.description}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 text-[10px] font-bold uppercase tracking-wide">
                    {parsed.category}
                  </span>
                </div>
                <button
                  onClick={handleNaturalSubmit}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors shrink-0"
                >
                  Log
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Manual form mode */
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={manualDesc}
                onChange={e => setManualDesc(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Description"
                className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all"
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">{currency}</span>
                <input
                  type="number"
                  value={manualAmount}
                  onChange={e => setManualAmount(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                />
              </div>
            </div>

            {/* Type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setManualType('expense')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border',
                  manualType === 'expense'
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                    : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                )}
              >
                <Minus className="w-3 h-3" /> Expense
              </button>
              <button
                onClick={() => setManualType('income')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border',
                  manualType === 'income'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                )}
              >
                <Plus className="w-3 h-3" /> Income
              </button>
            </div>

            {/* Category select */}
            <div className="relative">
              <button
                onClick={() => setShowCategories(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-black/30 border border-white/10 rounded-xl text-sm text-white/70 hover:border-white/20 transition-all"
              >
                <span>{manualCategory}</span>
                <ChevronDown className={cn('w-3.5 h-3.5 text-white/40 transition-transform', showCategories && 'rotate-180')} />
              </button>
              {showCategories && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-20 p-2 flex flex-wrap gap-1">
                  {allCategories.slice(0, 16).map(cat => (
                    <button
                      key={cat}
                      onClick={() => { setManualCategory(cat); setShowCategories(false); }}
                      className={cn(
                        'px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all',
                        manualCategory === cat
                          ? 'bg-cyan-600 text-white'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleManualSubmit}
              disabled={!manualAmount || !manualDesc.trim() || submitted}
              className={cn(
                'w-full py-2.5 rounded-xl text-sm font-bold transition-all',
                submitted
                  ? 'bg-emerald-600 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white'
              )}
            >
              {submitted ? '✓ Logged' : 'Log Transaction'}
            </button>
          </div>
        )}

        {/* Recurring toggle */}
        <button
          onClick={() => setIsRecurring(r => !r)}
          className={cn(
            'flex items-center gap-2 text-[11px] font-semibold transition-colors',
            isRecurring ? 'text-violet-400' : 'text-white/30 hover:text-white/60'
          )}
        >
          <RotateCcw className="w-3 h-3" />
          {isRecurring ? 'Recurring (monthly)' : 'Mark as recurring'}
        </button>
      </div>
    </div>
  );
}
