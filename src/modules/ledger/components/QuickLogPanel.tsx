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

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Minus, RotateCcw, Zap, ChevronDown, Check, Pencil, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Transaction, Account } from '../services/ledger-intake-service';
import { getDefaultAccount } from '../services/aggregation/account-aggregation';

interface QuickLogPanelProps {
  categories: string[];
  currency: string;
  accounts?: Account[];
  onAddTransaction: (transaction: Omit<Transaction, 'id'>) => void;
}

const QUICK_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Health', 'Bills', 'Income', 'Other'];
const INCOME_KEYWORDS = ['salary', 'income', 'freelance', 'dividend', 'refund', 'bonus', 'paycheck', 'revenue'];
const RECEIPT_KEYWORDS = ['receipt', 'invoice', 'bill', 'paid', 'bought', 'spent', 'purchase'];
const AMOUNT_REGEX = /\$?([\d,]+(?:\.\d{1,2})?)/;
const SWIPE_TRIGGER = 96;
const SWIPE_LIMIT = 140;

export function parseNaturalInput(text: string): { description: string; amount: number; type: 'income' | 'expense'; category: string } | null {
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

export function QuickLogPanel({ categories, currency, accounts = [], onAddTransaction }: QuickLogPanelProps) {
  const defaultAccount = getDefaultAccount(accounts);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(defaultAccount?.id);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  // Keep selectedAccountId in sync when accounts or default changes (e.g. user sets a new default).
  useEffect(() => {
    setSelectedAccountId(prev => {
      if (prev && accounts.some(a => a.id === prev)) return prev;
      return getDefaultAccount(accounts)?.id;
    });
  }, [accounts]);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? defaultAccount;

  const [naturalInput, setNaturalInput] = useState('');
  const [parsed, setParsed] = useState<ReturnType<typeof parseNaturalInput>>(null);
  const [showReceiptHint, setShowReceiptHint] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualType, setManualType] = useState<'income' | 'expense'>('expense');
  const [manualCategory, setManualCategory] = useState('Other');
  const [isRecurring, setIsRecurring] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const swipeStartX = useRef<number | null>(null);
  const swipeIntentRef = useRef<'log' | 'edit' | null>(null);
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const [swipeIntent, setSwipeIntent] = useState<'log' | 'edit' | null>(null);

  const TX_PLACEHOLDERS = [
    'coffee shop $4.50',
    'groceries $89.20 category:food',
    'salary +$3200 category:income',
    'netflix $15.99 recurring',
  ];

  useEffect(() => {
    if (isFocused || naturalInput) return;
    const id = setInterval(() => setPlaceholderIdx(i => (i + 1) % TX_PLACEHOLDERS.length), 3500);
    return () => clearInterval(id);
  }, [isFocused, naturalInput]);

  const allCategories = Array.from(new Set([...QUICK_CATEGORIES, ...categories]));

  const resetSwipe = useCallback(() => {
    swipeStartX.current = null;
    swipeIntentRef.current = null;
    setSwipeOffsetX(0);
    setSwipeIntent(null);
  }, []);

  const seedManualFromParsed = useCallback((result: NonNullable<typeof parsed>) => {
    setManualDesc(result.description);
    setManualAmount(result.amount.toFixed(2));
    setManualType(result.type);
    setManualCategory(result.category);
    setManualMode(true);
    setShowCategories(false);
    setSubmitted(false);
    resetSwipe();
  }, [resetSwipe]);

  const handleNaturalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNaturalInput(val);
    setParsed(parseNaturalInput(val));
    setShowReceiptHint(RECEIPT_KEYWORDS.some((k) => val.toLowerCase().includes(k)));
    setSubmitted(false);
    resetSwipe();
  };

  const handleNaturalSubmit = useCallback(() => {
    const result = parsed;
    if (!result) { setIsShaking(true); setTimeout(() => setIsShaking(false), 400); return; }

    const today = new Date().toISOString().split('T')[0];
    onAddTransaction({
      date: today,
      description: result.description,
      amount: result.amount,
      type: result.type,
      category: result.category,
      isRecurring,
      ...(selectedAccount ? { accountId: selectedAccount.id } : {}),
    });

    setNaturalInput('');
    setParsed(null);
    setSubmitted(true);
    resetSwipe();
    setTimeout(() => setSubmitted(false), 1500);
    inputRef.current?.focus();
  }, [parsed, isRecurring, onAddTransaction, resetSwipe]);

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
      ...(selectedAccount ? { accountId: selectedAccount.id } : {}),
    });

    setManualAmount('');
    setManualDesc('');
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 1500);
  }, [manualAmount, manualDesc, manualType, manualCategory, isRecurring, onAddTransaction]);

  const updateSwipe = useCallback((clientX: number) => {
    if (swipeStartX.current === null || !parsed) return;
    const nextOffset = Math.max(-SWIPE_LIMIT, Math.min(SWIPE_LIMIT, clientX - swipeStartX.current));
    setSwipeOffsetX(nextOffset);
    let nextIntent: 'log' | 'edit' | null = null;
    if (nextOffset >= SWIPE_TRIGGER) {
      nextIntent = 'log';
    } else if (nextOffset <= -SWIPE_TRIGGER) {
      nextIntent = 'edit';
    }
    swipeIntentRef.current = nextIntent;
    setSwipeIntent(nextIntent);
  }, [parsed]);

  const completeSwipe = useCallback(() => {
    if (!parsed) {
      resetSwipe();
      return;
    }

    const nextIntent = swipeIntentRef.current;
    resetSwipe();

    if (nextIntent === 'log') {
      handleNaturalSubmit();
    } else if (nextIntent === 'edit') {
      seedManualFromParsed(parsed);
    }
  }, [parsed, resetSwipe, seedManualFromParsed, handleNaturalSubmit]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!parsed) return;
    swipeStartX.current = event.clientX;
  }, [parsed]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    updateSwipe(event.clientX);
  }, [updateSwipe]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    updateSwipe(event.clientX);
    completeSwipe();
  }, [completeSwipe, updateSwipe]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (!manualMode) handleNaturalSubmit();
      else handleManualSubmit();
    }
  };

  return (
    <div className="bg-slate-900/85 border border-white/[0.09] rounded-2xl overflow-visible">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.09]">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-[var(--module-color-400)]" />
          <span className="text-[11px] font-black uppercase tracking-[0.15em] text-white/50">Quick Log</span>
        </div>

        {/* Segmented mode toggle pill */}
        <div className="flex items-center bg-white/[0.045] rounded-lg p-0.5 border border-white/[0.09]">
          <button
            onClick={() => { setManualMode(false); setSubmitted(false); }}
            className={cn(
              'px-3 py-1 rounded-md text-[11px] font-bold transition-all',
              !manualMode ? 'bg-white/[0.12] text-white' : 'text-white/35 hover:text-white/60'
            )}
          >
            Natural
          </button>
          <button
            onClick={() => { setManualMode(true); setSubmitted(false); }}
            className={cn(
              'px-3 py-1 rounded-md text-[11px] font-bold transition-all',
              manualMode ? 'bg-white/[0.12] text-white' : 'text-white/35 hover:text-white/60'
            )}
          >
            Manual
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-2.5">
        {!manualMode ? (

          /* ── Natural language mode ── */
          <div className="space-y-2">
            {/* Input */}
            <div className="relative">
              <input
                ref={inputRef}
                value={naturalInput}
                onChange={handleNaturalChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={`e.g. "${TX_PLACEHOLDERS[placeholderIdx]}"`}
                className={cn(
                  'w-full bg-slate-900/60 border rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25',
                  'focus:outline-none focus:ring-1 transition-all',
                  parsed
                    ? 'border-[var(--module-accent-border)] focus:ring-[var(--module-accent-ring)]'
                    : 'border-white/[0.09] focus:ring-white/10'
                )}
              />
              {submitted && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none">
                  <Check className="w-4 h-4" />
                </span>
              )}
            </div>

            {showReceiptHint && (
              <p className="text-xs text-white/40 mt-1">
                Tip: Include amount, merchant, and category for best results.
              </p>
            )}

            {/* Parsed preview — single row, never stacks */}
            {parsed && (
              <>
                <div
                  role="group"
                  aria-label="Parsed transaction — swipe right to log, left to edit"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={resetSwipe}
                  onPointerLeave={() => { if (swipeStartX.current !== null) completeSwipe(); }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-150 select-none',
                    parsed ? 'cursor-grab active:cursor-grabbing' : '',
                    swipeIntent === 'log'
                      ? 'bg-emerald-500/10 border-emerald-500/25'
                      : swipeIntent === 'edit'
                        ? 'bg-sky-500/10 border-sky-500/25'
                        : 'bg-slate-900/50 border-white/[0.09]'
                  )}
                  style={{ transform: `translateX(${swipeOffsetX}px)`, touchAction: 'pan-y' }}
                >
                  {/* Amount */}
                  <span className={cn(
                    'text-sm font-black tabular-nums shrink-0',
                    parsed.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                  )}>
                    {parsed.type === 'income' ? '+' : '−'}{currency}{parsed.amount.toFixed(2)}
                  </span>

                  {/* Description */}
                  <span className="text-xs text-white/55 truncate flex-1 min-w-0">{parsed.description}</span>

                  {/* Category chip */}
                  <span className="shrink-0 px-2 py-0.5 rounded-md bg-[var(--module-accent-muted)] text-[var(--module-color-400)] text-[11px] font-bold uppercase tracking-wide">
                    {parsed.category}
                  </span>

                  {/* Action buttons — native, no NeuralButton height fights */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => seedManualFromParsed(parsed)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white/45 hover:text-white hover:bg-white/8 transition-colors"
                      aria-label="Edit transaction"
                    >
                      <Pencil className="w-3 h-3 shrink-0" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                    <button
                      onClick={handleNaturalSubmit}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[var(--module-accent)] text-[var(--module-accent-text,#fff)] hover:bg-[var(--module-accent-hover)] transition-colors"
                      aria-label="Log transaction"
                    >
                      Log
                    </button>
                  </div>
                </div>

                {/* Swipe hint — mobile only */}
                <p className="text-[11px] text-white/25 px-0.5 sm:hidden" aria-live="polite">
                  Swipe right to log · left to edit
                </p>
              </>
            )}
          </div>

        ) : (

          /* ── Manual form mode ── */
          <div className="space-y-2.5">

            {/* Description + Amount */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={manualDesc}
                onChange={e => setManualDesc(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Description"
                className="flex-1 bg-slate-900/60 border border-white/[0.09] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[var(--module-accent-border)] focus:ring-1 focus:ring-[var(--module-accent-ring)] transition-all"
              />
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35 text-sm font-medium pointer-events-none select-none">
                  {currency}
                </span>
                <input
                  type="number"
                  value={manualAmount}
                  onChange={e => setManualAmount(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="w-full sm:w-32 bg-slate-900/60 border border-white/[0.09] rounded-xl pl-9 pr-3 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[var(--module-accent-border)] focus:ring-1 focus:ring-[var(--module-accent-ring)] transition-all"
                />
              </div>
            </div>

            {/* Expense / Income segmented control */}
            <div className="flex rounded-xl border border-white/[0.09] overflow-hidden bg-slate-900/50">
              <button
                onClick={() => setManualType('expense')}
                aria-pressed={manualType === 'expense'}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors',
                  manualType === 'expense'
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'text-white/35 hover:text-white/60 hover:bg-white/[0.045]'
                )}
              >
                <Minus className="w-3 h-3" /> Expense
              </button>
              <div className="w-px bg-white/[0.08] shrink-0" />
              <button
                onClick={() => setManualType('income')}
                aria-pressed={manualType === 'income'}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors',
                  manualType === 'income'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-white/35 hover:text-white/60 hover:bg-white/[0.045]'
                )}
              >
                <Plus className="w-3 h-3" /> Income
              </button>
            </div>

            {/* Category picker */}
            <div className="relative">
              <button
                onClick={() => setShowCategories(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/60 border border-white/[0.09] rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-slate-900/80 focus:outline-none focus:ring-1 focus:ring-[var(--module-accent-ring)] transition-colors"
              >
                <span>{manualCategory}</span>
                <ChevronDown className={cn('w-3.5 h-3.5 text-white/30 transition-transform', showCategories && 'rotate-180')} />
              </button>
              {showCategories && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-white/[0.12] rounded-xl shadow-2xl z-20 p-2 flex flex-wrap gap-1 max-h-44 overflow-y-auto">
                  {allCategories.slice(0, 16).map(cat => (
                    <button
                      key={cat}
                      onClick={() => { setManualCategory(cat); setShowCategories(false); }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors',
                        manualCategory === cat
                          ? 'bg-[var(--module-accent)] text-[var(--module-accent-text,#fff)]'
                          : 'bg-white/[0.045] text-white/55 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleManualSubmit}
              disabled={!manualAmount || !manualDesc.trim() || submitted}
              className={cn(
                'w-full py-3 rounded-xl text-sm font-bold transition-all',
                submitted
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 cursor-default'
                  : 'bg-[var(--module-accent)] text-[var(--module-accent-text,#fff)] hover:bg-[var(--module-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              {submitted ? '✓ Logged' : 'Log Transaction'}
            </button>
          </div>
        )}
      </div>

      {/* ── Footer — account selector + recurring toggle ───────────────────── */}
      <div className="px-4 py-2.5 border-t border-white/[0.09] flex items-center justify-between gap-3">
        <button
          onClick={() => setIsRecurring(r => !r)}
          aria-pressed={isRecurring}
          aria-label={isRecurring ? 'Recurring monthly — click to disable' : 'Mark as recurring'}
          className={cn(
            'flex items-center gap-2 text-[11px] font-semibold transition-colors rounded-lg px-2 py-1.5 -mx-2',
            isRecurring ? 'text-violet-400 hover:text-violet-300' : 'text-white/25 hover:text-white/55'
          )}
        >
          <RotateCcw className="w-3 h-3 shrink-0" />
          {isRecurring ? 'Recurring (monthly)' : 'Mark as recurring'}
        </button>

        {/* Account selector — only shown when accounts exist */}
        {accounts.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowAccountPicker(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.045] border border-white/[0.09] text-[11px] font-semibold text-white/50 hover:text-white hover:bg-white/[0.07] transition-colors"
              title="Select account for this transaction"
            >
              <Wallet className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[100px]">
                {selectedAccount ? selectedAccount.name : 'No account'}
              </span>
              {selectedAccount?.isDefault && (
                <span className="text-cyan-400/70 text-[10px] font-black uppercase">·default</span>
              )}
              <ChevronDown className={cn('w-3 h-3 text-white/30 transition-transform', showAccountPicker && 'rotate-180')} />
            </button>
            {showAccountPicker && (
              <div className="absolute bottom-full right-0 mb-1 bg-zinc-900 border border-white/[0.12] rounded-xl shadow-2xl z-20 p-1.5 min-w-[160px]">
                {accounts.map(a => (
                  <button
                    key={a.id}
                    onClick={() => { setSelectedAccountId(a.id); setShowAccountPicker(false); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold text-left transition-colors',
                      selectedAccountId === a.id
                        ? 'bg-[var(--module-accent-muted)] text-[var(--module-color-400)]'
                        : 'text-white/55 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <span className="flex-1 truncate">{a.name}</span>
                    {a.isDefault && <span className="text-cyan-400/70 text-[10px] font-black uppercase shrink-0">default</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
