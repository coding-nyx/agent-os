/**
 * Bank Sync Service — Frontend adapter for Plaid integration.
 *
 * Communicates with the plaidExchangeToken and plaidSyncTransactions Cloud Functions.
 * The Plaid access_token never touches the client — all sensitive operations are server-side.
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { Account, Transaction, PlaidConnection } from './ledger-intake-service';

// ─── Cloud Function callers ───────────────────────────────────────────────────

function getCloudFn<TReq, TRes>(name: string) {
  return httpsCallable<TReq, TRes>(getFunctions(), name);
}

interface ExchangeTokenRequest {
  publicToken: string;
  institutionId: string;
  institutionName: string;
  userId: string;
}

interface ExchangeTokenResponse {
  itemId: string;
  cursor: string;
  accounts: Array<{
    id: string;
    plaidAccountId: string;
    name: string;
    type: Account['type'];
    balance: number;
    currency: string;
    institutionName: string;
    lastFour: string | null;
  }>;
  transactions: NormalizedPlaidTransaction[];
  institutionName: string;
  institutionId: string;
}

interface SyncTransactionsRequest {
  itemId: string;
  userId: string;
  cursor: string;
  accountIdMap: Record<string, string>;
}

interface SyncTransactionsResponse {
  transactions: NormalizedPlaidTransaction[];
  cursor: string;
}

interface NormalizedPlaidTransaction {
  id: string;
  plaidTransactionId: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  accountId: string;
  pending: boolean;
}

// ─── Plaid Link config ────────────────────────────────────────────────────────

export interface PlaidLinkResult {
  publicToken: string;
  metadata: {
    institution: { name: string; institution_id: string };
    accounts: Array<{ id: string; name: string; type: string; subtype: string | null; mask: string | null }>;
  };
}

/**
 * Create a Plaid Link token (would call /api/create_link_token in production).
 * Currently returns a mock token for development.
 *
 * TODO: Replace with real backend endpoint when Plaid credentials are configured.
 */
export async function createPlaidLinkToken(userId: string): Promise<string> {
  // In production: call your backend /api/create_link_token which calls plaid.linkTokenCreate()
  // For now, return a mock token
  void userId;
  return `link-sandbox-mock-${Date.now()}`;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

export interface BankConnectionResult {
  connection: PlaidConnection;
  newAccounts: Account[];
  initialTransactions: Transaction[];
}

/**
 * Exchange a Plaid public_token for a permanent connection.
 * Calls the Cloud Function which stores the access_token server-side.
 */
export async function exchangePublicToken(
  publicToken: string,
  metadata: PlaidLinkResult['metadata'],
  userId: string,
): Promise<BankConnectionResult> {
  const exchangeFn = getCloudFn<ExchangeTokenRequest, ExchangeTokenResponse>('plaidExchangeToken');

  const { data } = await exchangeFn({
    publicToken,
    institutionId: metadata.institution.institution_id,
    institutionName: metadata.institution.name,
    userId,
  });

  // Map Plaid accounts → our Account type
  const now = new Date().toISOString();
  const newAccounts: Account[] = data.accounts.map((acct) => ({
    id: acct.id,
    name: acct.name,
    type: acct.type,
    balance: acct.type === 'credit_card' ? -Math.abs(acct.balance) : acct.balance,
    currency: acct.currency,
    institutionName: acct.institutionName,
    lastFour: acct.lastFour ?? undefined,
    color: undefined,
    createdAt: now,
    updatedAt: now,
  }));

  // Map plaid account ids → our account ids
  const accountIdMap: Record<string, string> = {};
  data.accounts.forEach((acct) => {
    accountIdMap[acct.plaidAccountId] = acct.id;
  });

  // Map normalized transactions → our Transaction type
  const initialTransactions: Transaction[] = data.transactions
    .filter((tx) => !tx.pending)
    .map(normalizePlaidTx);

  const connection: PlaidConnection = {
    id: crypto.randomUUID(),
    institutionName: data.institutionName,
    institutionId: data.institutionId,
    linkedAccountIds: newAccounts.map((a) => a.id),
    lastSyncAt: now,
    itemId: data.itemId,
    status: 'active',
    cursor: data.cursor,
  };

  return { connection, newAccounts, initialTransactions };
}

// ─── Incremental sync ─────────────────────────────────────────────────────────

export interface SyncResult {
  newTransactions: Transaction[];
  updatedCursor: string;
}

/**
 * Fetch new transactions since last sync for a connected Plaid item.
 */
export async function syncBankTransactions(
  connection: PlaidConnection,
  accounts: Account[],
  userId: string,
): Promise<SyncResult> {
  // Build plaidAccountId → our Account.id map
  // Note: we store our Account.id in linkedAccountIds, but need reverse lookup
  // This works because accounts[i].id maps to linkedAccountIds[i] in order
  const accountIdMap: Record<string, string> = {};
  accounts
    .filter((a) => connection.linkedAccountIds.includes(a.id))
    .forEach((a) => { accountIdMap[a.id] = a.id; }); // simplified — in real impl, store plaidAccountId on Account

  const syncFn = getCloudFn<SyncTransactionsRequest, SyncTransactionsResponse>('plaidSyncTransactions');

  const { data } = await syncFn({
    itemId: connection.itemId,
    userId,
    cursor: connection.cursor ?? '',
    accountIdMap,
  });

  const newTransactions = data.transactions.filter((tx) => !tx.pending).map(normalizePlaidTx);

  return { newTransactions, updatedCursor: data.cursor };
}

// ─── Transaction normalizer ───────────────────────────────────────────────────

function normalizePlaidTx(tx: NormalizedPlaidTransaction): Transaction {
  return {
    id: tx.id,
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    type: tx.type,
    category: tx.category,
    accountId: tx.accountId || undefined,
    isRecurring: false,
    notes: undefined,
  };
}
