import type { CurrencyRate } from './ledger-intake-service';

const DEFAULT_RATES: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.53, JPY: 149.5,
  CHF: 0.90, INR: 83.2, MXN: 17.1, BRL: 5.0, KRW: 1335, SGD: 1.34,
  NZD: 1.63, NOK: 10.6, SEK: 10.4, DKK: 6.9, HKD: 7.82, CNY: 7.23,
};

/**
 * Returns the exchange rate from `from` to `to`, using stored rates first
 * (falling back to built-in approximate rates for common pairs).
 */
export function getExchangeRate(from: string, to: string, storedRates: CurrencyRate[]): number {
  if (from === to) return 1;
  // Check stored rates first
  const stored = storedRates.find(r => r.from === from && r.to === to);
  if (stored) return stored.rate;
  const reverse = storedRates.find(r => r.from === to && r.to === from);
  if (reverse) return 1 / reverse.rate;

  // Fallback via USD as pivot
  const fromUSD = DEFAULT_RATES[from];
  const toUSD = DEFAULT_RATES[to];
  if (fromUSD !== undefined && toUSD !== undefined) {
    return toUSD / fromUSD;
  }
  return 1; // unknown pair — no conversion
}

/**
 * Converts an amount from one currency to another.
 */
function convertCurrency(amount: number, from: string, to: string, storedRates: CurrencyRate[]): number {
  return amount * getExchangeRate(from, to, storedRates);
}

/**
 * Formats an amount in the given ISO 4217 currency.
 */
function formatCurrencyAmount(amount: number, currency: string, locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Returns the list of supported currency codes. */
export function getSupportedCurrencies(): string[] {
  return Object.keys(DEFAULT_RATES).sort();
}

/** Upserts a currency rate in the stored rates array. Returns updated array. */
export function upsertCurrencyRate(rates: CurrencyRate[], from: string, to: string, rate: number): CurrencyRate[] {
  const filtered = rates.filter(r => !(r.from === from && r.to === to));
  return [...filtered, { from, to, rate, recordedAt: new Date().toISOString() }];
}
