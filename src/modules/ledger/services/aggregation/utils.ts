export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  isRecurring?: boolean;
  goalId?: string;
  budgetCategoryId?: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  allocated: number;
  spent: number;
  color: string;
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function monthsAgo(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

export function getMonthBounds(month: string): { start: string; end: string } {
  const [year, mo] = month.split('-').map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(year, mo, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export function filterByPeriod(
  transactions: Transaction[],
  start: string,
  end: string,
): Transaction[] {
  return transactions.filter((t) => t.date >= start && t.date <= end);
}

export function toYearMonth(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
