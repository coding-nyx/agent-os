/**
 * BankConnectionManager.tsx
 *
 * Manages Plaid bank connections for the Ledger module. Handles the full
 * connect → sync → review → accept/reject transaction import lifecycle.
 *
 * Architecture notes:
 *  - Business logic (token exchange, sync) is isolated in bank-sync-service.
 *  - The Plaid Link step is mocked via a modal bank-picker until the backend
 *    Plaid integration is complete and react-plaid-link is installed.
 *  - All service calls are wrapped in try/catch so a missing/broken service
 *    module never crashes the UI.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Building2,
  RefreshCw,
  Trash2,
  CheckSquare,
  Square,
  X,
  Lock,
  ChevronRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';

import type {
  PlaidConnection,
  Account,
  Transaction,
} from '../services/ledger-intake-service';

// TODO: Replace with usePlaidLink from react-plaid-link when backend Plaid
// integration is complete. For now we simulate the Link flow with a modal.
import {
  createPlaidLinkToken,
  exchangePublicToken,
  syncBankTransactions,
} from '../services/bank-sync-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BankConnectionManagerProps {
  connections: PlaidConnection[];
  accounts: Account[];
  currency?: string;
  disabled?: boolean;
  /**
   * The authenticated user's ID, forwarded to the bank-sync Cloud Functions.
   * Optional — if absent, service calls gracefully fall back to the mock flow.
   */
  userId?: string;
  onConnectionAdded: (connection: PlaidConnection, newAccounts: Account[]) => void;
  onConnectionRemoved: (connectionId: string) => void;
  onTransactionsSynced: (transactions: Transaction[]) => void;
  onSyncStatusUpdate: (
    connectionId: string,
    status: PlaidConnection['status'],
    cursor?: string,
  ) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Demo banks presented in the mock Plaid Link modal. */
const DEMO_BANKS = [
  { id: 'chase',   name: 'Chase',            color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
  { id: 'bofa',    name: 'Bank of America',  color: 'text-red-400',    bg: 'bg-red-500/10'    },
  { id: 'wells',   name: 'Wells Fargo',      color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { id: 'citi',    name: 'Citibank',         color: 'text-cyan-400',   bg: 'bg-cyan-500/10'   },
] as const;

type DemoBank = (typeof DEMO_BANKS)[number];

/** Default categories surfaced in the transaction review dropdown. */
const TRANSACTION_CATEGORIES = [
  'Food & Dining',
  'Shopping',
  'Transportation',
  'Entertainment',
  'Bills & Utilities',
  'Health & Fitness',
  'Travel',
  'Income',
  'Transfers',
  'Other',
] as const;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// ── Status badge ─────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: PlaidConnection['status'];
}

function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<PlaidConnection['status'], string> = {
    active:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    disconnected: 'bg-amber-500/15  text-amber-400  border-amber-500/20',
    error:        'bg-rose-500/15   text-rose-400   border-rose-500/20',
  };
  const labels: Record<PlaidConnection['status'], string> = {
    active:       'Active',
    disconnected: 'Disconnected',
    error:        'Error',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-widest uppercase border',
        styles[status],
      )}
    >
      <span
        className={cn('w-1.5 h-1.5 rounded-full', {
          'bg-emerald-400': status === 'active',
          'bg-amber-400':   status === 'disconnected',
          'bg-rose-400':    status === 'error',
        })}
      />
      {labels[status]}
    </span>
  );
}

// ── Relative time formatter ───────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins   = Math.floor(diffMs / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

// ── Connection card ───────────────────────────────────────────────────────────

interface ConnectionCardProps {
  connection: PlaidConnection;
  linkedAccounts: Account[];
  currency: string;
  onSyncNow: (connectionId: string) => Promise<void>;
  onDisconnect: (connectionId: string) => void;
  isSyncing: boolean;
}

function ConnectionCard({
  connection,
  linkedAccounts,
  currency,
  onSyncNow,
  onDisconnect,
  isSyncing,
}: ConnectionCardProps) {
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  return (
    <SurfaceCard className="p-4 sm:p-5 border border-white/10 rounded-xl">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white/60" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{connection.institutionName}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <StatusBadge status={connection.status} />
              <span className="text-[11px] text-white/40">
                Last synced: {relativeTime(connection.lastSyncAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <NeuralButton
            variant="secondary"
            size="sm"
            disabled={isSyncing || connection.status === 'disconnected'}
            onClick={() => onSyncNow(connection.id)}
            title="Sync transactions"
          >
            {isSyncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{isSyncing ? 'Syncing…' : 'Sync Now'}</span>
          </NeuralButton>

          {confirmDisconnect ? (
            <div className="flex items-center gap-1">
              <NeuralButton
                variant="rose"
                size="sm"
                onClick={() => {
                  setConfirmDisconnect(false);
                  onDisconnect(connection.id);
                }}
              >
                Confirm
              </NeuralButton>
              <NeuralButton
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDisconnect(false)}
              >
                Cancel
              </NeuralButton>
            </div>
          ) : (
            <NeuralButton
              variant="ghost"
              size="sm"
              themeColor="rose"
              onClick={() => setConfirmDisconnect(true)}
              title="Disconnect bank"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            </NeuralButton>
          )}
        </div>
      </div>

      {/* Linked accounts */}
      {linkedAccounts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <p className="text-[10px] uppercase font-semibold tracking-widest text-white/30 mb-2">
            Linked Accounts
          </p>
          <ul className="space-y-1">
            {linkedAccounts.map((acct) => (
              <li key={acct.id} className="flex items-center justify-between text-xs text-white/60">
                <span className="flex items-center gap-1.5">
                  <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
                  {acct.name}
                  {acct.lastFour && (
                    <span className="text-white/30">···{acct.lastFour}</span>
                  )}
                </span>
                <span className="font-mono text-white/40">
                  {currency}{acct.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SurfaceCard>
  );
}

// ── Mock bank picker modal ────────────────────────────────────────────────────

interface BankPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (bank: DemoBank) => Promise<void>;
  isConnecting: boolean;
  connectingBankId: string | null;
}

function BankPickerModal({
  isOpen,
  onClose,
  onSelect,
  isConnecting,
  connectingBankId,
}: BankPickerModalProps) {
  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title="Connect Bank Account"
      subtitle="Select your bank to continue"
      icon={Building2}
      themeColor="cyan"
      maxWidth="md"
    >
      <div className="space-y-3">
        <p className="text-sm text-white/50 mb-4">
          Choose your financial institution to securely link your accounts via Plaid.
        </p>

        {DEMO_BANKS.map((bank) => {
          const isThisConnecting = isConnecting && connectingBankId === bank.id;
          return (
            <button
              key={bank.id}
              className={cn(
                'w-full flex items-center gap-3 p-4 rounded-xl border border-white/10',
                'bg-white/[0.03] hover:bg-white/[0.07] transition-colors text-left',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
              disabled={isConnecting}
              onClick={() => onSelect(bank)}
            >
              <div
                className={cn(
                  'w-10 h-10 shrink-0 rounded-xl border border-white/10 flex items-center justify-center',
                  bank.bg,
                )}
              >
                {isThisConnecting ? (
                  <Loader2 className={cn('w-5 h-5 animate-spin', bank.color)} />
                ) : (
                  <Building2 className={cn('w-5 h-5', bank.color)} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{bank.name}</p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {isThisConnecting ? 'Connecting…' : 'Click to connect securely'}
                </p>
              </div>
              {!isThisConnecting && (
                <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
              )}
            </button>
          );
        })}

        {/* Compliance notice inside picker */}
        <div className="flex items-center gap-2 mt-2 pt-3 border-t border-white/[0.06]">
          <Lock className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <p className="text-[11px] text-white/30 leading-relaxed">
            Bank connections are powered by Plaid. Your credentials are never stored by Nexus.
          </p>
        </div>
      </div>
    </NeuralModal>
  );
}

// ── Transaction review row ────────────────────────────────────────────────────

interface PendingTransaction extends Transaction {
  selected: boolean;
  category: string;
}

interface TransactionReviewRowProps {
  txn: PendingTransaction;
  currency: string;
  onToggleSelect: (id: string) => void;
  onCategoryChange: (id: string, category: string) => void;
  onReject: (id: string) => void;
}

function TransactionReviewRow({
  txn,
  currency,
  onToggleSelect,
  onCategoryChange,
  onReject,
}: TransactionReviewRowProps) {
  return (
    <tr className="border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors">
      {/* Checkbox */}
      <td className="py-2.5 pl-1 pr-2 w-8">
        <button
          className="text-white/50 hover:text-white/80 transition-colors"
          onClick={() => onToggleSelect(txn.id)}
          aria-label={txn.selected ? 'Deselect transaction' : 'Select transaction'}
        >
          {txn.selected ? (
            <CheckSquare className="w-4 h-4 text-cyan-400" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      </td>

      {/* Date */}
      <td className="py-2.5 pr-3 text-[11px] text-white/40 whitespace-nowrap">
        {new Date(txn.date).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}
      </td>

      {/* Description */}
      <td className="py-2.5 pr-3 text-xs text-white/80 max-w-[160px] truncate">{txn.description}</td>

      {/* Amount */}
      <td
        className={cn(
          'py-2.5 pr-3 text-xs font-mono whitespace-nowrap text-right',
          txn.type === 'income' ? 'text-emerald-400' : 'text-white/70',
        )}
      >
        {txn.type === 'income' ? '+' : '-'}
        {currency}
        {Math.abs(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </td>

      {/* Category quick-edit */}
      <td className="py-2.5 pr-3">
        <select
          value={txn.category}
          onChange={(e) => onCategoryChange(txn.id, e.target.value)}
          className={cn(
            'text-[11px] bg-white/5 border border-white/10 rounded-lg px-2 py-1',
            'text-white/70 focus:outline-none focus:border-cyan-500/50',
            'appearance-none cursor-pointer',
          )}
          aria-label="Transaction category"
        >
          {TRANSACTION_CATEGORIES.map((cat) => (
            <option key={cat} value={cat} className="bg-[#0a0a14]">
              {cat}
            </option>
          ))}
        </select>
      </td>

      {/* Type badge */}
      <td className="py-2.5 pr-2">
        <span
          className={cn(
            'text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-md',
            txn.type === 'income'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-white/5 text-white/40',
          )}
        >
          {txn.type}
        </span>
      </td>

      {/* Reject */}
      <td className="py-2.5 w-8">
        <button
          className="text-white/20 hover:text-rose-400 transition-colors"
          onClick={() => onReject(txn.id)}
          aria-label="Reject transaction"
        >
          <X className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

// ── Import review modal ───────────────────────────────────────────────────────

interface ImportReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingTransactions: PendingTransaction[];
  currency: string;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onCategoryChange: (id: string, category: string) => void;
  onReject: (id: string) => void;
  onAcceptAll: () => void;
  onAcceptSelected: () => void;
}

function ImportReviewModal({
  isOpen,
  onClose,
  pendingTransactions,
  currency,
  onToggleSelect,
  onSelectAll,
  onCategoryChange,
  onReject,
  onAcceptAll,
  onAcceptSelected,
}: ImportReviewModalProps) {
  const selectedCount = pendingTransactions.filter((t) => t.selected).length;
  const allSelected   = selectedCount === pendingTransactions.length && pendingTransactions.length > 0;

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title="Review Imported Transactions"
      subtitle={`${pendingTransactions.length} transaction${pendingTransactions.length !== 1 ? 's' : ''} pending review`}
      icon={RefreshCw}
      themeColor="cyan"
      maxWidth="2xl"
    >
      <div className="space-y-4">
        {/* Bulk actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 transition-colors"
            onClick={onSelectAll}
            aria-label={allSelected ? 'Deselect all' : 'Select all'}
          >
            {allSelected ? (
              <CheckSquare className="w-4 h-4 text-cyan-400" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            Select all ({pendingTransactions.length})
          </button>

          <div className="flex items-center gap-2">
            <NeuralButton
              variant="secondary"
              size="sm"
              disabled={selectedCount === 0}
              onClick={onAcceptSelected}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Accept Selected ({selectedCount})
            </NeuralButton>
            <NeuralButton
              variant="cyan"
              size="sm"
              disabled={pendingTransactions.length === 0}
              onClick={onAcceptAll}
            >
              Accept All
            </NeuralButton>
          </div>
        </div>

        {/* Transaction table */}
        {pendingTransactions.length === 0 ? (
          <div className="py-8 text-center text-sm text-white/40">
            No transactions to review.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-left min-w-[560px]">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  <th className="py-2.5 pl-1 pr-2 w-8" />
                  <th className="py-2.5 pr-3 text-[10px] uppercase tracking-widest font-semibold text-white/30">
                    Date
                  </th>
                  <th className="py-2.5 pr-3 text-[10px] uppercase tracking-widest font-semibold text-white/30">
                    Description
                  </th>
                  <th className="py-2.5 pr-3 text-[10px] uppercase tracking-widest font-semibold text-white/30 text-right">
                    Amount
                  </th>
                  <th className="py-2.5 pr-3 text-[10px] uppercase tracking-widest font-semibold text-white/30">
                    Category
                  </th>
                  <th className="py-2.5 pr-2 text-[10px] uppercase tracking-widest font-semibold text-white/30">
                    Type
                  </th>
                  <th className="py-2.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {pendingTransactions.map((txn) => (
                  <TransactionReviewRow
                    key={txn.id}
                    txn={txn}
                    currency={currency}
                    onToggleSelect={onToggleSelect}
                    onCategoryChange={onCategoryChange}
                    onReject={onReject}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Compliance footer */}
        <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
          <Lock className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <p className="text-[11px] text-white/30">
            Transactions are fetched read-only via Plaid. Nexus never stores your banking credentials.
          </p>
        </div>
      </div>
    </NeuralModal>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * BankConnectionManager
 *
 * Renders connected Plaid bank accounts, drives the connect → sync →
 * review flow, and delegates state changes back to the parent via callbacks.
 *
 * Complexity notes:
 *  - Rendering: O(C × A) where C = connection count, A = accounts per
 *    connection. Both are bounded (<100 in practice) so this is effectively O(1).
 *  - Pending transaction review: O(T) for select/deselect operations.
 */
export function BankConnectionManager({
  connections,
  accounts,
  currency = '$',
  disabled = false,
  userId = '',
  onConnectionAdded,
  onConnectionRemoved,
  onTransactionsSynced,
  onSyncStatusUpdate,
}: BankConnectionManagerProps) {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [showBankPicker,   setShowBankPicker]   = useState(false);
  const [isConnecting,     setIsConnecting]     = useState(false);
  const [connectingBankId, setConnectingBankId] = useState<string | null>(null);
  const [syncingIds,       setSyncingIds]       = useState<Set<string>>(new Set());
  const [errorMessage,     setErrorMessage]     = useState<string | null>(null);

  // ── Transaction review state ──────────────────────────────────────────────
  const [showReview,           setShowReview]           = useState(false);
  const [pendingTransactions,  setPendingTransactions]  = useState<PendingTransaction[]>([]);

  // ── Derived data ──────────────────────────────────────────────────────────

  /** Map accountId → Account for O(1) lookup during rendering. */
  const accountMap = useMemo<Map<string, Account>>(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const linkedAccountsFor = useCallback(
    (connection: PlaidConnection): Account[] =>
      connection.linkedAccountIds.flatMap((id) => {
        const acct = accountMap.get(id);
        return acct ? [acct] : [];
      }),
    [accountMap],
  );

  // ── Connect flow ──────────────────────────────────────────────────────────

  const handleOpenBankPicker = useCallback(async () => {
    if (disabled) return;
    setErrorMessage(null);

    // Attempt to obtain a real link token; silently fall back to the mock
    // picker if the service is unavailable (backend not yet wired up).
    try {
      await createPlaidLinkToken(userId);
      // TODO: When react-plaid-link is installed, open usePlaidLink here
      // using the returned link_token instead of showing the mock picker.
    } catch {
      // Backend not ready — fall through to mock picker below.
    }

    setShowBankPicker(true);
  }, [disabled]);

  const handleBankSelected = useCallback(
    async (bank: DemoBank) => {
      setConnectingBankId(bank.id);
      setIsConnecting(true);

      try {
        // Simulate the Plaid Link public_token callback.
        const result = await exchangePublicToken(
          `mock_token_${bank.id}`,
          { institution: { name: bank.name, institution_id: bank.id }, accounts: [] },
          userId,
        );

        // The service returns the new PlaidConnection and any new Account records.
        const newConnection: PlaidConnection = result.connection;
        const newAccounts: Account[]         = result.newAccounts;

        // Surface any initial transactions for review.
        if (result.initialTransactions.length > 0) {
          const pending: PendingTransaction[] = result.initialTransactions.map((txn) => ({
            ...txn,
            selected: true,
            category: txn.category ?? 'Other',
          }));
          setPendingTransactions(pending);
          setShowReview(true);
        }

        onConnectionAdded(newConnection, newAccounts);
        setShowBankPicker(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setErrorMessage(`Failed to connect ${bank.name}: ${message}`);
      } finally {
        setIsConnecting(false);
        setConnectingBankId(null);
      }
    },
    [onConnectionAdded],
  );

  // ── Sync flow ─────────────────────────────────────────────────────────────

  const handleSyncNow = useCallback(
    async (connectionId: string) => {
      if (syncingIds.has(connectionId)) return;

      setSyncingIds((prev) => new Set([...prev, connectionId]));
      onSyncStatusUpdate(connectionId, 'active');

      try {
        const connection = connections.find((c) => c.id === connectionId);
        if (!connection) throw new Error('Connection not found');

        const result = await syncBankTransactions(connection, linkedAccountsFor(connection), userId);

        const newTransactions: Transaction[] = result.newTransactions;
        const nextCursor: string | undefined  = result.updatedCursor || undefined;

        onSyncStatusUpdate(connectionId, 'active', nextCursor);

        if (newTransactions.length > 0) {
          // Populate review panel with the incoming transactions.
          const pending: PendingTransaction[] = newTransactions.map((txn) => ({
            ...txn,
            selected: true,
            category: txn.category ?? 'Other',
          }));
          setPendingTransactions(pending);
          setShowReview(true);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        setErrorMessage(message);
        onSyncStatusUpdate(connectionId, 'error');
      } finally {
        setSyncingIds((prev) => {
          const next = new Set(prev);
          next.delete(connectionId);
          return next;
        });
      }
    },
    [connections, syncingIds, onSyncStatusUpdate],
  );

  // ── Review panel handlers ─────────────────────────────────────────────────

  const handleToggleSelectTxn = useCallback((id: string) => {
    setPendingTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t)),
    );
  }, []);

  const handleSelectAllTxns = useCallback(() => {
    setPendingTransactions((prev) => {
      const allSelected = prev.every((t) => t.selected);
      return prev.map((t) => ({ ...t, selected: !allSelected }));
    });
  }, []);

  const handleCategoryChange = useCallback((id: string, category: string) => {
    setPendingTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, category } : t)),
    );
  }, []);

  const handleRejectTxn = useCallback((id: string) => {
    setPendingTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleAcceptSelected = useCallback(() => {
    const accepted = pendingTransactions
      .filter((t) => t.selected)
      .map(({ selected, ...txn }) => txn as Transaction);

    onTransactionsSynced(accepted);
    setPendingTransactions((prev) => prev.filter((t) => !t.selected));

    if (pendingTransactions.every((t) => t.selected)) {
      setShowReview(false);
    }
  }, [pendingTransactions, onTransactionsSynced]);

  const handleAcceptAll = useCallback(() => {
    const accepted = pendingTransactions.map(({ selected, ...txn }) => txn as Transaction);
    onTransactionsSynced(accepted);
    setPendingTransactions([]);
    setShowReview(false);
  }, [pendingTransactions, onTransactionsSynced]);

  const handleCloseReview = useCallback(() => {
    setPendingTransactions([]);
    setShowReview(false);
  }, []);

  // ── Disconnect ────────────────────────────────────────────────────────────

  const handleDisconnect = useCallback(
    (connectionId: string) => {
      onConnectionRemoved(connectionId);
    },
    [onConnectionRemoved],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const hasConnections = connections.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Global error banner ─────────────────────────────────────────── */}
      {errorMessage && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold">Connection error</p>
            <p className="text-[11px] text-rose-400/70 mt-0.5">{errorMessage}</p>
          </div>
          <button
            className="shrink-0 text-rose-400/50 hover:text-rose-400 transition-colors"
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Connect CTA ─────────────────────────────────────────────────── */}
      <NeuralButton
        variant="cyan"
        size="lg"
        className="w-full"
        disabled={disabled || isConnecting}
        loading={isConnecting}
        onClick={handleOpenBankPicker}
      >
        <Building2 className="w-5 h-5" />
        {isConnecting ? 'Connecting…' : 'Connect Bank Account'}
      </NeuralButton>

      {/* ── Connection list ──────────────────────────────────────────────── */}
      {hasConnections ? (
        <div className="flex flex-col gap-3">
          {connections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              linkedAccounts={linkedAccountsFor(conn)}
              currency={currency}
              onSyncNow={handleSyncNow}
              onDisconnect={handleDisconnect}
              isSyncing={syncingIds.has(conn.id)}
            />
          ))}
        </div>
      ) : (
        /* ── Empty state ──────────────────────────────────────────────── */
        <EmptyState
          title="No bank accounts connected"
          description="Connect your bank to automatically import transactions and keep your finances in sync."
          icon={() => (
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-cyan-400" />
            </div>
          )}
          action={
            <NeuralButton
              variant="outline"
              themeColor="cyan"
              size="sm"
              disabled={disabled || isConnecting}
              onClick={handleOpenBankPicker}
            >
              <Building2 className="w-4 h-4" />
              Connect Bank
            </NeuralButton>
          }
          size="lg"
        />
      )}

      {/* ── Plaid compliance disclaimer ──────────────────────────────────── */}
      <div className="flex items-center gap-2 mt-1">
        <Lock className="w-3 h-3 text-white/20 shrink-0" />
        <p className="text-[10px] text-white/25 leading-relaxed">
          Bank connections are powered by Plaid. Your credentials are never stored by Nexus.
        </p>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <BankPickerModal
        isOpen={showBankPicker}
        onClose={() => !isConnecting && setShowBankPicker(false)}
        onSelect={handleBankSelected}
        isConnecting={isConnecting}
        connectingBankId={connectingBankId}
      />

      <ImportReviewModal
        isOpen={showReview}
        onClose={handleCloseReview}
        pendingTransactions={pendingTransactions}
        currency={currency}
        onToggleSelect={handleToggleSelectTxn}
        onSelectAll={handleSelectAllTxns}
        onCategoryChange={handleCategoryChange}
        onReject={handleRejectTxn}
        onAcceptAll={handleAcceptAll}
        onAcceptSelected={handleAcceptSelected}
      />
    </div>
  );
}
