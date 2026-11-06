import { ledgerFieldOf } from '../card-alert/toRow';

export type Transaction = { date: string; description: string; amount: number; payment: string; note: string };
export type AccountSummary = { name: string; total: number; budget: number | null; difference: number | null; transactions: Transaction[] };
export function numberValue(value: unknown): number | null {
 const text = String(value ?? '').trim();
 if (!text) return null;
 const parsed = Number(text.replace(/[^\d.-]/g, ''));
 return Number.isFinite(parsed) ? parsed : null;
}
export function summarizeMonth(headers: string[], rows: string[][], budgetRows: string[][], accountNames: string[]) {
 const index = (kind: string) => headers.findIndex(h => ledgerFieldOf(h) === kind);
 const accountIndex = index('account'), amountIndex = index('amount');
 const budgets = new Map<string, number>();
 for (const row of budgetRows) {
  const name = row.slice(0, -1).map(x => String(x ?? '').trim()).find(x => accountNames.includes(x));
  const value = numberValue(row[row.length - 1]);
  if (name && value !== null) budgets.set(name, (budgets.get(name) ?? 0) + value);
 }
 const groups = new Map<string, Transaction[]>();
 for (const row of rows) {
  const amount = numberValue(row[amountIndex]);
  if (amount === null || amount <= 0) continue;
  const name = row[accountIndex]?.trim() || '미분류';
  const items = groups.get(name) ?? [];
  items.push({ date: row[index('date')] || '', description: row[index('merchant')] || '내용 없음', payment: row[index('payment')] || '', note: row[index('note')]?.trim() || '', amount });
  groups.set(name, items);
 }
 const accounts: AccountSummary[] = [...groups].map(([name, transactions]) => {
  transactions.sort ( (a,b) => b.amount - a.amount );
  const total = transactions.reduce((sum, item) => sum + item.amount, 0);
  const budget = budgets.get(name) ?? null;
  return { name, total, budget, difference: budget === null ? null : total - budget, transactions };
 }).sort((a,b) => b.total - a.total);
 return { total: accounts.reduce((sum, account) => sum + account.total, 0), accounts };
}
