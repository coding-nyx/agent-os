import React, { useMemo, useState } from 'react';
import {
  Wallet,
  PiggyBank,
  TrendingUp,
  CreditCard as CreditCardIcon,
  Banknote,
  CircleDollarSign,
  Plus,
  Edit2,
  Trash2,
  ArrowLeftRight,
  Check,
} from 'lucide-react';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { useCRUDModal } from './shared/useCRUDModal';
import type { Account, AccountType, AccountTransfer } from '../services/ledger-intake-service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

const ACCOUNT_COLORS = [
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#3b82f6', // blue
  '#ec4899', // pink
  '#f97316', // orange
];

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  investment: 'Investment',
  credit_card: 'Credit Card',
  cash: 'Cash',
  other: 'Other',
};

const ACCOUNT_TYPE_ICONS: Record<AccountType, React.ComponentType<{ className?: string }>> = {
  checking: Wallet,
  savings: PiggyBank,
  investment: TrendingUp,
  credit_card: CreditCardIcon,
  cash: Banknote,
  other: CircleDollarSign,
};

const ACCOUNT_TYPE_OPTIONS = (
  Object.entries(ACCOUNT_TYPE_LABELS) as [AccountType, string][]
).map(([value, label]) => ({ value, label }));

// ─── Transfer Form ────────────────────────────────────────────────────────────

interface TransferFormState {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  date: string;
  notes: string;
}

function makeTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

const EMPTY_TRANSFER: TransferFormState = {
  fromAccountId: '',
  toAccountId: '',
  amount: '',
  date: makeTodayISO(),
  notes: '',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface AccountManagerProps {
  accounts: Account[];
  currency?: string;
  disabled?: boolean;
  onAddAccount: (
    account: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>
  ) => void;
  onUpdateAccount: (id: string, updates: Partial<Account>) => void;
  onDeleteAccount: (id: string) => void;
  onTransfer: (transfer: Omit<AccountTransfer, 'id'>) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountManager({
  accounts,
  currency = 'USD',
  disabled = false,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onTransfer,
}: AccountManagerProps) {
  // ── Delete confirmation (one at a time, inline overlay) ──
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ── Transfer modal ──
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<TransferFormState>(EMPTY_TRANSFER);

  // ── Account CRUD modal ──
  const {
    isOpen: isAccountModalOpen,
    editingItem: editingAccount,
    formData,
    setField,
    openCreate,
    openEdit,
    handleClose,
    handleSave,
  } = useCRUDModal<Account>({
    initialForm: {
      name: '',
      type: 'checking' as AccountType,
      balance: 0,
      currency,
      institutionName: '',
      lastFour: '',
      color: ACCOUNT_COLORS[0],
      notes: '',
    },
    validate: (form) => !!form.name?.trim() && !!form.type,
    onCreate: (form) => {
      onAddAccount({
        name: form.name!.trim(),
        type: form.type!,
        balance: form.balance ?? 0,
        currency: form.currency || currency,
        institutionName: form.institutionName?.trim() || undefined,
        lastFour: form.lastFour?.trim() || undefined,
        color: form.color || ACCOUNT_COLORS[0],
        notes: form.notes?.trim() || undefined,
      });
    },
    onUpdate: (id, form) => {
      onUpdateAccount(id, {
        name: form.name?.trim(),
        type: form.type,
        balance: form.balance,
        currency: form.currency,
        institutionName: form.institutionName?.trim() || undefined,
        lastFour: form.lastFour?.trim() || undefined,
        color: form.color,
        notes: form.notes?.trim() || undefined,
      });
    },
  });

  // ── Summary stats ──
  const stats = useMemo(() => {
    const assetTypes: AccountType[] = ['checking', 'savings', 'investment', 'cash'];
    const liquidTypes: AccountType[] = ['checking', 'savings', 'cash'];

    const totalAssets = accounts
      .filter((a) => assetTypes.includes(a.type) && a.balance > 0)
      .reduce((sum, a) => sum + a.balance, 0);

    // Credit card liabilities: treat balance as absolute debt amount
    const totalLiabilities = accounts
      .filter((a) => a.type === 'credit_card')
      .reduce((sum, a) => sum + Math.abs(a.balance), 0);

    const netLiquid = accounts
      .filter((a) => liquidTypes.includes(a.type))
      .reduce((sum, a) => sum + a.balance, 0);

    return { totalAssets, totalLiabilities, netLiquid, count: accounts.length };
  }, [accounts]);

  // ── Transfer helpers ──
  const openTransfer = (fromAccountId = '') => {
    setTransferForm({ ...EMPTY_TRANSFER, fromAccountId });
    setIsTransferOpen(true);
  };

  const setTransferField = <K extends keyof TransferFormState>(
    key: K,
    value: TransferFormState[K]
  ) => setTransferForm((prev) => ({ ...prev, [key]: value }));

  // When fromAccountId changes, clear toAccountId if it collides
  const handleFromChange = (value: string) => {
    setTransferForm((prev) => ({
      ...prev,
      fromAccountId: value,
      toAccountId: prev.toAccountId === value ? '' : prev.toAccountId,
    }));
  };

  const isTransferValid =
    !!transferForm.fromAccountId &&
    !!transferForm.toAccountId &&
    transferForm.fromAccountId !== transferForm.toAccountId &&
    parseFloat(transferForm.amount) > 0 &&
    !!transferForm.date;

  const handleTransferSubmit = () => {
    if (!isTransferValid) return;
    onTransfer({
      date: transferForm.date,
      fromAccountId: transferForm.fromAccountId,
      toAccountId: transferForm.toAccountId,
      amount: parseFloat(transferForm.amount),
      notes: transferForm.notes.trim() || undefined,
    });
    setIsTransferOpen(false);
    setTransferForm(EMPTY_TRANSFER);
  };

  const accountSelectOptions = accounts.map((a) => ({
    value: a.id,
    label: a.lastFour ? `${a.name} ···· ${a.lastFour}` : a.name,
  }));

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Summary Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">
            Total Assets
          </div>
          <div className="mt-2 text-xl font-black text-emerald-400">
            {formatCurrency(stats.totalAssets, currency)}
          </div>
          <div className="text-[10px] text-white/30 mt-0.5">checking, savings, investments</div>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">
            Total Liabilities
          </div>
          <div className="mt-2 text-xl font-black text-rose-400">
            {formatCurrency(stats.totalLiabilities, currency)}
          </div>
          <div className="text-[10px] text-white/30 mt-0.5">credit cards</div>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">
            Net Liquid
          </div>
          <div
            className={`mt-2 text-xl font-black ${
              stats.netLiquid >= 0 ? 'text-cyan-400' : 'text-amber-400'
            }`}
          >
            {formatCurrency(stats.netLiquid, currency)}
          </div>
          <div className="text-[10px] text-white/30 mt-0.5">checking + savings + cash</div>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">
            Accounts
          </div>
          <div className="mt-2 text-2xl font-black text-white">{stats.count}</div>
          <div className="text-[10px] text-white/30 mt-0.5">linked</div>
        </SurfaceCard>
      </div>

      {/* ── Section Header ── */}
      <div className="flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">
          Your Accounts
        </div>
        <NeuralButton
          onClick={() => openCreate()}
          variant="primary"
          size="sm"
          disabled={disabled}
          themeColor="cyan"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Add Account
        </NeuralButton>
      </div>

      {/* ── Accounts Grid ── */}
      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add your first account to start tracking balances"
          action={
            !disabled ? (
              <NeuralButton
                onClick={() => openCreate()}
                variant="primary"
                size="sm"
                themeColor="cyan"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Account
              </NeuralButton>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => {
            const TypeIcon = ACCOUNT_TYPE_ICONS[account.type];
            const isConfirmingDelete = deleteConfirmId === account.id;
            const isLiability = account.type === 'credit_card';

            // Credit cards: always rose, show absolute value as "owed"
            // Others: emerald when positive, rose when negative
            const balanceColor = isLiability
              ? 'text-rose-400'
              : account.balance >= 0
              ? 'text-emerald-400'
              : 'text-rose-400';

            const displayBalance = isLiability
              ? Math.abs(account.balance)
              : account.balance;

            return (
              <div
                key={account.id}
                className="group relative bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3 transition-all hover:bg-white/[0.07] hover:border-white/20"
              >
                {/* ── Top Row: color dot + name + action buttons ── */}
                <div className="flex items-start gap-3">
                  {/* Color dot */}
                  <div
                    className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: account.color ?? ACCOUNT_COLORS[0] }}
                  />

                  {/* Name + institution */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TypeIcon className="w-4 h-4 text-white/50 shrink-0" />
                      <span className="text-sm font-bold text-white truncate">
                        {account.name}
                      </span>
                      {account.isDefault && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-[0.2em] font-black bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                          Default
                        </span>
                      )}
                    </div>
                    {account.institutionName && (
                      <div className="text-[10px] text-white/40 mt-0.5 truncate">
                        {account.institutionName}
                      </div>
                    )}
                  </div>

                  {/* Action buttons — reveal on hover */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {/* Transfer */}
                    <button
                      onClick={() => openTransfer(account.id)}
                      disabled={disabled || accounts.length < 2}
                      title="Transfer funds"
                      className="p-1.5 rounded-lg text-white/40 hover:text-cyan-400 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                    </button>
                    {/* Edit */}
                    <button
                      onClick={() => {
                        setDeleteConfirmId(null);
                        openEdit(account);
                      }}
                      disabled={disabled}
                      title="Edit account"
                      className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => setDeleteConfirmId(account.id)}
                      disabled={disabled}
                      title="Delete account"
                      className="p-1.5 rounded-lg text-white/40 hover:text-rose-400 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* ── Type + last four ── */}
                <div className="flex items-center gap-2 text-[10px] text-white/40">
                  <span>{ACCOUNT_TYPE_LABELS[account.type]}</span>
                  {account.lastFour && (
                    <>
                      <span>·</span>
                      <span className="font-mono">···· {account.lastFour}</span>
                    </>
                  )}
                </div>

                {/* ── Balance ── */}
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl font-black ${balanceColor}`}>
                    {formatCurrency(displayBalance, account.currency ?? currency)}
                  </span>
                  {isLiability && account.balance !== 0 && (
                    <span className="text-[10px] text-white/30">owed</span>
                  )}
                </div>

                {/* ── Delete confirmation overlay ── */}
                {isConfirmingDelete && (
                  <div className="absolute inset-0 rounded-xl bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 z-10">
                    <p className="text-sm text-white/80 text-center leading-snug">
                      Delete{' '}
                      <span className="font-bold text-white">{account.name}</span>?
                      <br />
                      <span className="text-[10px] text-white/40">This cannot be undone.</span>
                    </p>
                    <div className="flex gap-2">
                      <NeuralButton
                        onClick={() => {
                          onDeleteAccount(account.id);
                          setDeleteConfirmId(null);
                        }}
                        variant="danger"
                        size="sm"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Delete
                      </NeuralButton>
                      <NeuralButton
                        onClick={() => setDeleteConfirmId(null)}
                        variant="secondary"
                        size="sm"
                      >
                        Cancel
                      </NeuralButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          Add / Edit Account Modal
      ════════════════════════════════════════════════════════════════════ */}
      <NeuralModal
        isOpen={isAccountModalOpen}
        onClose={handleClose}
        title={editingAccount ? 'Edit Account' : 'Add Account'}
        icon={Wallet}
        themeColor="cyan"
        maxWidth="md"
      >
        <div className="space-y-4">

          {/* Name */}
          <div>
            <label className="block text-[9px] uppercase tracking-[0.3em] text-white/40 font-black mb-2">
              Account Name
            </label>
            <NeuralInput
              type="text"
              value={formData.name ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setField('name', e.target.value)
              }
              placeholder="e.g., Chase Checking"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-[9px] uppercase tracking-[0.3em] text-white/40 font-black mb-2">
              Account Type
            </label>
            <NeuralSelectMenu
              value={formData.type ?? 'checking'}
              options={ACCOUNT_TYPE_OPTIONS}
              onChange={(value) => setField('type', value as AccountType)}
              ariaLabel="Account type"
            />
          </div>

          {/* Balance */}
          <div>
            <label className="block text-[9px] uppercase tracking-[0.3em] text-white/40 font-black mb-2">
              Current Balance
            </label>
            <NeuralInput
              type="number"
              value={formData.balance ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setField('balance', parseFloat(e.target.value) || 0)
              }
              placeholder="0.00"
              step="0.01"
            />
            {formData.type === 'credit_card' && (
              <p className="text-[10px] text-white/40 mt-1">
                Enter a positive number for amount owed, or 0 if paid in full.
              </p>
            )}
          </div>

          {/* Institution Name */}
          <div>
            <label className="block text-[9px] uppercase tracking-[0.3em] text-white/40 font-black mb-2">
              Institution{' '}
              <span className="text-white/20 normal-case tracking-normal">(optional)</span>
            </label>
            <NeuralInput
              type="text"
              value={formData.institutionName ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setField('institutionName', e.target.value)
              }
              placeholder="e.g., Chase Bank"
            />
          </div>

          {/* Last Four */}
          <div>
            <label className="block text-[9px] uppercase tracking-[0.3em] text-white/40 font-black mb-2">
              Last 4 Digits{' '}
              <span className="text-white/20 normal-case tracking-normal">(optional)</span>
            </label>
            <NeuralInput
              type="text"
              value={formData.lastFour ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setField('lastFour', e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              placeholder="1234"
              maxLength={4}
              inputMode="numeric"
            />
          </div>

          {/* Color Swatches */}
          <div>
            <label className="block text-[9px] uppercase tracking-[0.3em] text-white/40 font-black mb-2">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {ACCOUNT_COLORS.map((color) => {
                const isSelected = formData.color === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setField('color', color)}
                    aria-label={`Select color ${color}`}
                    className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110 flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: color,
                      borderColor: isSelected ? 'rgba(255,255,255,0.9)' : 'transparent',
                      boxShadow: isSelected
                        ? `0 0 0 2px rgba(0,0,0,0.5), 0 0 8px ${color}60`
                        : 'none',
                    }}
                  >
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-white drop-shadow-md" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[9px] uppercase tracking-[0.3em] text-white/40 font-black mb-2">
              Notes{' '}
              <span className="text-white/20 normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              value={formData.notes ?? ''}
              onChange={(e) => setField('notes', e.target.value)}
              placeholder="Any additional notes…"
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <NeuralButton
              onClick={handleSave}
              variant="primary"
              themeColor="cyan"
              disabled={!formData.name?.trim() || disabled}
              className="flex-1"
            >
              {editingAccount ? 'Save Changes' : 'Add Account'}
            </NeuralButton>
            <NeuralButton
              onClick={handleClose}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>

      {/* ════════════════════════════════════════════════════════════════════
          Transfer Modal
      ════════════════════════════════════════════════════════════════════ */}
      <NeuralModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        title="Transfer Funds"
        icon={ArrowLeftRight}
        themeColor="cyan"
        maxWidth="sm"
      >
        <div className="space-y-4">

          {/* From Account */}
          <div>
            <label className="block text-[9px] uppercase tracking-[0.3em] text-white/40 font-black mb-2">
              From Account
            </label>
            <NeuralSelectMenu
              value={transferForm.fromAccountId}
              options={accountSelectOptions}
              onChange={handleFromChange}
              placeholder="Select source account"
              ariaLabel="Transfer from account"
            />
          </div>

          {/* To Account — excludes the currently-selected "from" account */}
          <div>
            <label className="block text-[9px] uppercase tracking-[0.3em] text-white/40 font-black mb-2">
              To Account
            </label>
            <NeuralSelectMenu
              value={transferForm.toAccountId}
              options={accountSelectOptions.filter(
                (o) => o.value !== transferForm.fromAccountId
              )}
              onChange={(value) => setTransferField('toAccountId', value)}
              placeholder="Select destination account"
              ariaLabel="Transfer to account"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[9px] uppercase tracking-[0.3em] text-white/40 font-black mb-2">
              Amount
            </label>
            <NeuralInput
              type="number"
              value={transferForm.amount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setTransferField('amount', e.target.value)
              }
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-[9px] uppercase tracking-[0.3em] text-white/40 font-black mb-2">
              Date
            </label>
            <NeuralInput
              type="date"
              value={transferForm.date}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setTransferField('date', e.target.value)
              }
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[9px] uppercase tracking-[0.3em] text-white/40 font-black mb-2">
              Notes{' '}
              <span className="text-white/20 normal-case tracking-normal">(optional)</span>
            </label>
            <NeuralInput
              type="text"
              value={transferForm.notes}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setTransferField('notes', e.target.value)
              }
              placeholder="e.g., Monthly savings transfer"
            />
          </div>

          {/* Validation hint */}
          {transferForm.fromAccountId &&
            transferForm.toAccountId &&
            transferForm.fromAccountId === transferForm.toAccountId && (
              <p className="text-[10px] text-amber-400">
                Source and destination must be different accounts.
              </p>
            )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <NeuralButton
              onClick={handleTransferSubmit}
              variant="primary"
              themeColor="cyan"
              disabled={!isTransferValid || disabled}
              className="flex-1"
            >
              Confirm Transfer
            </NeuralButton>
            <NeuralButton
              onClick={() => setIsTransferOpen(false)}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>
    </div>
  );
}
