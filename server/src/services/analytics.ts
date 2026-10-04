import {
  addDays,
  daysBetween,
  DONE_ORDER_STATUSES,
  CLOSED_ORDER_STATUSES,
  MONTH_NAMES,
  round2,
  sum,
  todayYMD,
  type OrderStatus,
} from '@pbms/shared';
import { z } from 'zod';
import { COL } from '../firebase';
import { can, type Ctx } from '../lib/context';
import { getUsers } from '../lib/directory';
import { fetchAll, type Doc } from '../lib/list';
import { zDate } from '../lib/validation';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const analyticsQuery = z.object({
  from: zDate.optional(),
  to: zDate.optional(),
  employeeId: z.string().trim().max(128).optional().default(''),
  category: z.string().trim().max(60).optional().default(''),
  paymentMode: z.string().trim().max(40).optional().default(''),
  status: z.string().trim().max(40).optional().default(''),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuery>;

export interface Range {
  from: string;
  to: string;
}

export function resolveRange(q: { from?: string; to?: string }, fallbackDays = 30): Range {
  const to = q.to || todayYMD();
  const from = q.from || addDays(to, -(fallbackDays - 1));
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Whether the viewer sees company-wide figures or only their own work. */
export function isCompanyWide(ctx: Ctx): boolean {
  return can(ctx, 'finance.view_all');
}

// ---------------------------------------------------------------------------
// Data loading with scope and filters applied
// ---------------------------------------------------------------------------

export interface Dataset {
  range: Range;
  orders: Doc[];
  payments: Doc[];
  expenses: Doc[];
  customers: Doc[];
}

export interface LoadOptions {
  ctx: Ctx;
  range: Range;
  filters?: Partial<AnalyticsQuery>;
}

function applyScope(ctx: Ctx, d: Omit<Dataset, 'range'>, f: Partial<AnalyticsQuery>): Omit<Dataset, 'range'> {
  const uid = ctx.user.uid;
  const all = isCompanyWide(ctx);
  const emp = all ? f.employeeId : uid;
  return {
    orders: d.orders.filter(
      (o) =>
        !o.deleted &&
        (!emp || o.employeeId === emp) &&
        (!f.category || o.category === f.category) &&
        (!f.status || o.status === f.status),
    ),
    payments: d.payments.filter(
      (p) =>
        !p.voided &&
        (!emp || p.orderEmployeeId === emp || (!all && p.employeeId === uid)) &&
        (!f.category || p.category === f.category) &&
        (!f.paymentMode || p.mode === f.paymentMode),
    ),
    expenses: d.expenses.filter((e) => !e.deleted && (!emp || e.employeeId === emp) && (!f.paymentMode || e.mode === f.paymentMode)),
    customers: d.customers.filter((c) => !c.deleted && (!emp || c.assignedEmployeeId === emp || (!all && c.createdBy === uid))),
  };
}

export async function loadDataset({ ctx, range, filters = {} }: LoadOptions): Promise<Dataset> {
  const [orders, payments, expenses, customers] = await Promise.all([
    fetchAll(COL.orders, { dateField: 'orderDate', from: range.from, to: range.to }),
    fetchAll(COL.payments, { dateField: 'date', from: range.from, to: range.to }),
    fetchAll(COL.expenses, { dateField: 'date', from: range.from, to: range.to }),
    fetchAll(COL.customers, { dateField: 'dateAdded', from: range.from, to: range.to }),
  ]);
  return { range, ...applyScope(ctx, { orders, payments, expenses, customers }, filters) };
}

/** Every open order with money outstanding (point in time, not range bound). */
export async function loadOutstanding(ctx: Ctx, filters: Partial<AnalyticsQuery> = {}): Promise<Doc[]> {
  const orders = await fetchAll(COL.orders);
  return applyScope(ctx, { orders, payments: [], expenses: [], customers: [] }, filters).orders.filter((o) => o.balance > 0.009);
}

// ---------------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------------

export const approved = (expenses: Doc[]) => expenses.filter((e) => e.approvalStatus === 'Approved');
export const receipts = (payments: Doc[]) => payments.filter((p) => p.type !== 'Refund');
export const refunds = (payments: Doc[]) => payments.filter((p) => p.type === 'Refund');

export function totals(d: Pick<Dataset, 'orders' | 'payments' | 'expenses' | 'customers'>) {
  const sales = sum(d.orders, (o) => o.billedAmount);
  const received = sum(receipts(d.payments), (p) => p.amount);
  const refunded = sum(refunds(d.payments), (p) => p.amount);
  const collection = round2(received - refunded);
  const expenses = sum(approved(d.expenses), (e) => e.amount);
  const netRevenue = round2(sales - expenses);
  const live = d.orders.filter((o) => o.status !== 'Cancelled');
  return {
    sales,
    discount: sum(live, (o) => o.discountTotal ?? 0),
    tax: sum(live, (o) => o.taxTotal ?? 0),
    collection,
    received,
    refunded,
    advance: sum(d.payments.filter((p) => p.type === 'Advance'), (p) => p.amount),
    expenses,
    pendingExpenses: sum(d.expenses.filter((e) => e.approvalStatus === 'Pending'), (e) => e.amount),
    netRevenue,
    cashProfit: round2(collection - expenses),
    profitMargin: sales > 0 ? round2((netRevenue / sales) * 100) : 0,
    pending: sum(d.orders, (o) => o.balance),
    orders: d.orders.length,
    completedOrders: d.orders.filter((o) => DONE_ORDER_STATUSES.includes(o.status as OrderStatus)).length,
    openOrders: d.orders.filter((o) => !CLOSED_ORDER_STATUSES.includes(o.status as OrderStatus)).length,
    cancelledOrders: d.orders.filter((o) => o.status === 'Cancelled').length,
    customers: d.customers.length,
    uniqueCustomers: new Set(d.orders.map((o) => o.customerId)).size,
    payments: d.payments.length,
    expenseCount: approved(d.expenses).length,
    averageOrderValue: live.length ? round2(sales / live.length) : 0,
  };
}

type Bucket = { key: string; label: string };

/** Day buckets for ranges up to ~2 months, otherwise month buckets. */
export function buckets(range: Range, data: Pick<Dataset, 'orders' | 'payments' | 'expenses'>): { unit: 'day' | 'month'; list: Bucket[] } {
  let from = range.from;
  if (from < '2001-01-01') {
    const dates = [...data.orders.map((o) => o.orderDate), ...data.payments.map((p) => p.date), ...data.expenses.map((e) => e.date)].sort();
    from = dates[0] ?? range.to;
  }
  const span = daysBetween(from, range.to);
  if (span <= 62) {
    const list: Bucket[] = [];
    for (let d = from; d <= range.to; d = addDays(d, 1)) list.push({ key: d, label: `${d.slice(8, 10)}/${d.slice(5, 7)}` });
    return { unit: 'day', list };
  }
  const list: Bucket[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = range.to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    list.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${MONTH_NAMES[m - 1].slice(0, 3)} ${String(y).slice(2)}` });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return { unit: 'month', list };
}

export function timeSeries(range: Range, d: Pick<Dataset, 'orders' | 'payments' | 'expenses'>) {
  const { unit, list } = buckets(range, d);
  const keyOf = (date: string) => (unit === 'day' ? date : date.slice(0, 7));
  const rows = new Map(list.map((b) => [b.key, { key: b.key, label: b.label, sales: 0, collection: 0, expenses: 0, profit: 0, orders: 0 }]));
  for (const o of d.orders) {
    const r = rows.get(keyOf(o.orderDate));
    if (r) {
      r.sales += o.billedAmount;
      r.orders += 1;
    }
  }
  for (const p of d.payments) {
    const r = rows.get(keyOf(p.date));
    if (r) r.collection += p.type === 'Refund' ? -p.amount : p.amount;
  }
  for (const e of approved(d.expenses)) {
    const r = rows.get(keyOf(e.date));
    if (r) r.expenses += e.amount;
  }
  return {
    unit,
    points: Array.from(rows.values()).map((r) => ({
      ...r,
      sales: round2(r.sales),
      collection: round2(r.collection),
      expenses: round2(r.expenses),
      profit: round2(r.sales - r.expenses),
    })),
  };
}

export function groupSum<T extends Doc>(items: T[], keyFn: (i: T) => string, valueFn: (i: T) => number) {
  const m = new Map<string, number>();
  for (const i of items) m.set(keyFn(i) || '—', round2((m.get(keyFn(i) || '—') ?? 0) + valueFn(i)));
  return Array.from(m.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function serviceBreakdown(d: Pick<Dataset, 'orders' | 'payments'>) {
  const m = new Map<string, { category: string; orders: number; sales: number; collected: number; pending: number }>();
  const get = (c: string) => {
    let r = m.get(c);
    if (!r) m.set(c, (r = { category: c, orders: 0, sales: 0, collected: 0, pending: 0 }));
    return r;
  };
  for (const o of d.orders) {
    const r = get(o.category || 'Other');
    r.orders += 1;
    r.sales = round2(r.sales + o.billedAmount);
    r.pending = round2(r.pending + o.balance);
  }
  for (const p of d.payments) {
    const r = get(p.category || 'Other');
    r.collected = round2(r.collected + (p.type === 'Refund' ? -p.amount : p.amount));
  }
  return Array.from(m.values()).sort((a, b) => b.sales - a.sales);
}

export interface EmployeePerf {
  employeeId: string;
  employeeCode: string;
  name: string;
  status: string;
  customersAdded: number;
  orders: number;
  completedOrders: number;
  openOrders: number;
  cancelledOrders: number;
  sales: number;
  collection: number;
  pendingAmount: number;
  expensesSubmitted: number;
  expenseAmount: number;
  averageOrderValue: number;
  completionRate: number;
}

export async function employeePerformance(ctx: Ctx, d: Dataset): Promise<EmployeePerf[]> {
  const users = (await getUsers()).filter((u) => !u.deleted || d.orders.some((o) => o.employeeId === u.id));
  const visible = can(ctx, 'performance.view_all') ? users : users.filter((u) => u.id === ctx.user.uid);
  return visible
    .map((u) => {
      const orders = d.orders.filter((o) => o.employeeId === u.id);
      const live = orders.filter((o) => o.status !== 'Cancelled');
      const done = orders.filter((o) => DONE_ORDER_STATUSES.includes(o.status as OrderStatus)).length;
      const sales = sum(orders, (o) => o.billedAmount);
      const pays = d.payments.filter((p) => p.orderEmployeeId === u.id);
      const exps = d.expenses.filter((e) => e.employeeId === u.id);
      return {
        employeeId: u.id,
        employeeCode: u.employeeId,
        name: u.name,
        status: u.status,
        customersAdded: d.customers.filter((c) => c.assignedEmployeeId === u.id || c.createdBy === u.id).length,
        orders: orders.length,
        completedOrders: done,
        openOrders: orders.filter((o) => !CLOSED_ORDER_STATUSES.includes(o.status as OrderStatus)).length,
        cancelledOrders: orders.length - live.length,
        sales,
        collection: round2(sum(receipts(pays), (p) => p.amount) - sum(refunds(pays), (p) => p.amount)),
        pendingAmount: sum(orders, (o) => o.balance),
        expensesSubmitted: exps.length,
        expenseAmount: sum(exps, (e) => e.amount),
        averageOrderValue: live.length ? round2(sales / live.length) : 0,
        completionRate: live.length ? round2((done / live.length) * 100) : 0,
      };
    })
    .sort((a, b) => b.sales - a.sales);
}
