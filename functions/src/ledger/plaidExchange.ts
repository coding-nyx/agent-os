/**
 * Plaid Integration Cloud Function
 *
 * Handles secure Plaid token exchange and transaction sync server-side.
 * The Plaid access_token is NEVER sent to the client — stored in Firestore
 * under a server-side-only collection.
 *
 * To activate this function:
 * 1. Install: npm install plaid (in functions/)
 * 2. Set Firebase config: firebase functions:config:set plaid.client_id="..." plaid.secret="..." plaid.env="sandbox"
 * 3. Uncomment the Plaid SDK imports below
 * 4. Deploy: firebase deploy --only functions:plaidExchangeToken,functions:plaidSyncTransactions
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

// ─── Plaid SDK (uncomment when plaid npm package is installed) ────────────────
// import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
//
// const plaidConfig = new Configuration({
//   basePath: PlaidEnvironments[process.env.PLAID_ENV ?? 'sandbox'],
//   baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': process.env.PLAID_SECRET } },
// });
// const plaidClient = new PlaidApi(plaidConfig);

const PLAID_TOKENS_COLLECTION = 'ledger_plaid_tokens';

// ─── Normalized types returned to client ─────────────────────────────────────

interface NormalizedAccount {
  id: string;
  plaidAccountId: string;
  name: string;
  type: 'checking' | 'savings' | 'investment' | 'credit_card' | 'cash' | 'other';
  balance: number;
  currency: string;
  institutionName: string;
  lastFour: string | null;
}

interface NormalizedTransaction {
  id: string;
  plaidTransactionId: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  accountId: string; // our Account.id
  pending: boolean;
}

function normalizePlaidAccountType(plaidType: string, plaidSubtype: string | null): NormalizedAccount['type'] {
  if (plaidSubtype === 'checking') return 'checking';
  if (plaidSubtype === 'savings') return 'savings';
  if (plaidType === 'credit') return 'credit_card';
  if (plaidType === 'investment') return 'investment';
  if (plaidSubtype === 'cash management') return 'cash';
  return 'other';
}

function normalizePlaidCategory(plaidCategories: string[] | null): string {
  if (!plaidCategories || plaidCategories.length === 0) return 'Other';
  const top = plaidCategories[0];
  const sub = plaidCategories[1] ?? '';
  if (top === 'Food and Drink') return 'Food';
  if (top === 'Travel') return sub.includes('Taxi') || sub.includes('Ride') ? 'Transport' : 'Travel';
  if (top === 'Shops') return 'Shopping';
  if (top === 'Recreation') return 'Entertainment';
  if (top === 'Healthcare') return 'Health';
  if (top === 'Service' && sub.includes('Utilities')) return 'Bills';
  if (top === 'Payment') return 'Bills';
  if (top === 'Transfer') return 'Transfer';
  return top;
}

// ─── plaidExchangeToken ───────────────────────────────────────────────────────

/**
 * Exchange a Plaid public_token for an access_token.
 * Returns normalized accounts and initial transactions.
 * Stores access_token server-side only.
 */
export const plaidExchangeToken = onCall(
  { region: 'us-central1', enforceAppCheck: false },
  async (request) => {
    const { publicToken, institutionId, institutionName, userId } = request.data as {
      publicToken: string;
      institutionId: string;
      institutionName: string;
      userId: string;
    };

    if (!publicToken || !userId) {
      throw new HttpsError('invalid-argument', 'publicToken and userId are required');
    }

    // Auth check: user can only exchange tokens for their own profile
    if (request.auth?.uid !== userId) {
      throw new HttpsError('permission-denied', 'User mismatch');
    }

    logger.info('[Plaid] Exchanging public token', { institutionName, userId });

    try {
      // ── PRODUCTION: Uncomment when plaid SDK is installed ──────────────────
      // const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
      // const accessToken = exchangeResponse.data.access_token;
      // const itemId = exchangeResponse.data.item_id;
      //
      // const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
      // const plaidAccounts = accountsResponse.data.accounts;
      //
      // const txResponse = await plaidClient.transactionsSync({ access_token: accessToken });
      // const plaidTransactions = txResponse.data.added;
      // const cursor = txResponse.data.next_cursor;
      //
      // ── MOCK (sandbox/demo mode) ────────────────────────────────────────────
      const itemId = `item_${crypto.randomUUID().slice(0, 8)}`;
      const accessToken = `mock_access_${itemId}`; // never real in mock mode
      const plaidAccounts: unknown[] = [];
      const plaidTransactions: unknown[] = [];
      const cursor = '';
      // ── END MOCK ────────────────────────────────────────────────────────────

      // Store access token server-side only — never returned to client
      const db = getFirestore();
      await db
        .collection(PLAID_TOKENS_COLLECTION)
        .doc(userId)
        .collection('items')
        .doc(itemId)
        .set({
          accessToken,
          itemId,
          institutionId,
          institutionName,
          createdAt: FieldValue.serverTimestamp(),
          lastSyncAt: FieldValue.serverTimestamp(),
          cursor,
        });

      // Normalize accounts
      const normalizedAccounts: NormalizedAccount[] = (plaidAccounts as Array<Record<string, unknown>>).map((acct) => ({
        id: crypto.randomUUID(), // our internal ID
        plaidAccountId: acct.account_id as string,
        name: (acct.name as string) || (acct.official_name as string) || 'Account',
        type: normalizePlaidAccountType(acct.type as string, acct.subtype as string | null),
        balance: typeof acct.balances === 'object' && acct.balances !== null
          ? ((acct.balances as Record<string, unknown>).current as number ?? 0)
          : 0,
        currency: typeof acct.balances === 'object' && acct.balances !== null
          ? (((acct.balances as Record<string, unknown>).iso_currency_code as string) ?? 'USD')
          : 'USD',
        institutionName,
        lastFour: (acct.mask as string | null) ?? null,
      }));

      // Build accountId map for transaction normalization
      const accountIdMap = new Map<string, string>();
      (plaidAccounts as Array<Record<string, unknown>>).forEach((acct, i) => {
        accountIdMap.set(acct.account_id as string, normalizedAccounts[i]?.id ?? '');
      });

      // Normalize transactions
      const normalizedTransactions: NormalizedTransaction[] = (plaidTransactions as Array<Record<string, unknown>>).map((tx) => ({
        id: crypto.randomUUID(),
        plaidTransactionId: tx.transaction_id as string,
        date: tx.date as string,
        description: (tx.merchant_name as string) || (tx.name as string) || 'Transaction',
        amount: Math.abs(tx.amount as number),
        type: (tx.amount as number) > 0 ? 'expense' : 'income', // Plaid: positive = debit
        category: normalizePlaidCategory(tx.category as string[] | null),
        accountId: accountIdMap.get(tx.account_id as string) ?? '',
        pending: (tx.pending as boolean) ?? false,
      }));

      logger.info('[Plaid] Token exchange complete', {
        itemId, accountCount: normalizedAccounts.length, transactionCount: normalizedTransactions.length,
      });

      return {
        itemId,
        cursor,
        accounts: normalizedAccounts,
        transactions: normalizedTransactions,
        institutionName,
        institutionId,
      };
    } catch (error) {
      logger.error('[Plaid] Token exchange failed', error);
      throw new HttpsError('internal', 'Failed to connect bank account');
    }
  },
);

// ─── plaidSyncTransactions ────────────────────────────────────────────────────

/**
 * Incrementally sync new transactions for a connected Plaid item.
 */
export const plaidSyncTransactions = onCall(
  { region: 'us-central1', enforceAppCheck: false },
  async (request) => {
    const { itemId, userId, cursor, accountIdMap } = request.data as {
      itemId: string;
      userId: string;
      cursor: string;
      accountIdMap: Record<string, string>; // plaidAccountId → our Account.id
    };

    if (!itemId || !userId) {
      throw new HttpsError('invalid-argument', 'itemId and userId are required');
    }

    if (request.auth?.uid !== userId) {
      throw new HttpsError('permission-denied', 'User mismatch');
    }

    try {
      const db = getFirestore();
      const tokenDoc = await db
        .collection(PLAID_TOKENS_COLLECTION)
        .doc(userId)
        .collection('items')
        .doc(itemId)
        .get();

      if (!tokenDoc.exists) {
        throw new HttpsError('not-found', 'Plaid connection not found');
      }

      const { accessToken } = tokenDoc.data() as { accessToken: string };

      // ── PRODUCTION: Uncomment ─────────────────────────────────────────────
      // const txResponse = await plaidClient.transactionsSync({
      //   access_token: accessToken, cursor: cursor || undefined,
      // });
      // const added = txResponse.data.added;
      // const nextCursor = txResponse.data.next_cursor;
      //
      // ── MOCK ──────────────────────────────────────────────────────────────
      void accessToken; // suppress unused var in mock mode
      const added: unknown[] = [];
      const nextCursor = cursor;
      // ── END MOCK ──────────────────────────────────────────────────────────

      const transactions: NormalizedTransaction[] = (added as Array<Record<string, unknown>>).map((tx) => ({
        id: crypto.randomUUID(),
        plaidTransactionId: tx.transaction_id as string,
        date: tx.date as string,
        description: (tx.merchant_name as string) || (tx.name as string) || 'Transaction',
        amount: Math.abs(tx.amount as number),
        type: (tx.amount as number) > 0 ? 'expense' : 'income',
        category: normalizePlaidCategory(tx.category as string[] | null),
        accountId: accountIdMap[tx.account_id as string] ?? '',
        pending: (tx.pending as boolean) ?? false,
      }));

      // Update cursor in Firestore
      await tokenDoc.ref.update({ cursor: nextCursor, lastSyncAt: FieldValue.serverTimestamp() });

      logger.info('[Plaid] Sync complete', { itemId, transactionCount: transactions.length });

      return { transactions, cursor: nextCursor };
    } catch (error) {
      logger.error('[Plaid] Sync failed', error);
      throw new HttpsError('internal', 'Failed to sync transactions');
    }
  },
);
