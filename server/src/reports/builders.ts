import {
  daysBetween,
  formatDateDisplay,

  REPORT_TYPES,
  round2,
  sum,
  todayYMD,
  type ReportKey,
} from '@pbms/shared';
import { COL } from '../firebase';
import type { Ctx } from '../lib/context';
import { badRequest } from '../lib/errors';
import { fetchAll, type Doc } from '../lib/list';
import { collegeStats } from '../routes/colleges';
import {
  approved,
  employeePerformance,
  groupSum,
  isCompanyWide,
  loadDataset,
  loadOutstanding,
  serviceBreakdown,
  timeSeries,
  totals,
  type AnalyticsQuery,
  type Range,
} from '../services/analytics';
import type { ReportColumn, ReportData, SummaryItem } from './types';

type Params = Partial<AnalyticsQuery> & Range & { type?: string };

const money = (label: string, value: number): SummaryItem => ({ label, value, kind: 'money' });
const count = (label: string, value: number): SummaryItem => ({ label, value, kind: 'number' });

function periodLabel(r: Range) {
  if (r.from === r.to) return formatDateDisplay(r.from);
  if (r.from < '2001-01-01') return `Up to ${formatDateDisplay(r.to)}`;
  return `${formatDateDisplay(r.from)} → ${formatDateDisplay(r.to)}`;
}

function totalsRowFor(columns: ReportColumn[], rows: Record<string, unknown>[], labelKey: string) {
  const t: Record<string, unknown> = { [labelKey]: 'TOTAL' };
  for (const c of columns) if (c.kind === 'money') t[c.key] = sum(rows, (r) => Number(r[c.key]) || 0);
  return t;
}

const ORDER_COLUMNS: ReportColumn[] = [
  { key: 'orderDate', label: 'Date', kind: 'date' },
  { key: 'orderNo', label: 'Order ID' },
  { key: 'customerName', label: 'Customer' },
  { key: 'customerMobile', label: 'Mobile' },
  { key: 'serviceSummary', label: 'Service' },
  { key: 'employeeName', label: 'Employee' },
  { key: 'status', label: 'Status' },
  { key: 'billedAmount', label: 'Total', kind: 'money' },
  { key: 'advanceAmount', label: 'Advance', kind: 'money' },
  { key: 'paidAmount', label: 'Paid', kind: 'money' },
  { key: 'balance', label: 'Balance', kind: 'money' },
];

const PAYMENT_COLUMNS: ReportColumn[] = [
  { key: 'date', label: 'Date', kind: 'date' },
  { key: 'paymentNo', label: 'Payment ID' },
  { key: 'orderNo', label: 'Order ID' },
  { key: 'customerName', label: 'Customer' },
  { key: 'serviceName', label: 'Service' },
  { key: 'type', label: 'Type' },
  { key: 'mode', label: 'Mode' },
  { key: 'txnNumber', label: 'Txn No.' },
  { key: 'employeeName', label: 'Received By' },
  { key: 'amount', label: 'Amount', kind: 'money' },
];

const EXPENSE_COLUMNS: ReportColumn[] = [
  { key: 'date', label: 'Date', kind: 'date' },
  { key: 'expenseNo', label: 'Expense ID' },
  { key: 'employeeName', label: 'Employee' },
  { key: 'category', label: 'Category' },
  { key: 'description', label: 'Description' },
  { key: 'mode', label: 'Mode' },
  { key: 'approvalStatus', label: 'Status' },
  { key: 'approvedByName', label: 'Reviewed By' },
  { key: 'amount', label: 'Amount', kind: 'money' },
];

type Builder = (ctx: Ctx, p: Params) => Promise<Omit<ReportData, 'key' | 'title' | 'generatedAt' | 'generatedBy' | 'period' | 'subtitle'> & { subtitle?: string }>;

const builders: Record<ReportKey, Builder> = {
  'daily-sales': async (ctx, p) => {
    const d = await loadDataset({ ctx, range: p, filters: p });
    const t = totals(d);
    const rows = [...d.orders].sort((a, b) => (a.orderDate + a.createdAt).localeCompare(b.orderDate + b.createdAt));
    return {
      subtitle: `Sales for ${periodLabel(p)}`,
      summary: [count('Orders', t.orders), money('Total Sales', t.sales), money('Collection', t.collection), money('Expenses', t.expenses), money('Net', round2(t.collection - t.expenses)), money('Pending (these orders)', t.pending)],
      columns: ORDER_COLUMNS,
      rows,
      totalsRow: totalsRowFor(ORDER_COLUMNS, rows, 'orderDate'),
      charts: { services: serviceBreakdown(d).map((s) => ({ name: s.category, value: s.sales })) },
    };
  },

  'monthly-sales': async (ctx, p) => {
    const d = await loadDataset({ ctx, range: p, filters: p });
    const t = totals(d);
    const series = timeSeries(p, d);
    const columns: ReportColumn[] = [
      { key: 'label', label: series.unit === 'day' ? 'Day' : 'Month' },
      { key: 'orders', label: 'Orders', kind: 'number' },
      { key: 'sales', label: 'Sales', kind: 'money' },
      { key: 'collection', label: 'Collection', kind: 'money' },
      { key: 'expenses', label: 'Expenses', kind: 'money' },
      { key: 'profit', label: 'Net (Sales − Expenses)', kind: 'money' },
    ];
    const rows = series.points;
    return {
      summary: [money('Total Sales', t.sales), money('Total Collection', t.collection), money('Total Expenses', t.expenses), money('Outstanding', t.pending), money('Net Revenue', t.netRevenue), count('Orders', t.orders), count('Customers', t.uniqueCustomers)],
      columns,
      rows,
      totalsRow: { ...totalsRowFor(columns, rows, 'label'), orders: t.orders },
      charts: {
        services: serviceBreakdown(d).map((s) => ({ name: s.category, value: s.sales })),
        paymentModes: groupSum(d.payments.filter((x) => x.type !== 'Refund'), (x) => x.mode, (x) => x.amount),
      },
    };
  },

  expenses: async (ctx, p) => {
    const d = await loadDataset({ ctx, range: p, filters: p });
    const rows = d.expenses.filter((e) => !p.status || e.approvalStatus === p.status).sort((a, b) => a.date.localeCompare(b.date));
    const byStatus = (s: string) => sum(rows.filter((e) => e.approvalStatus === s), (e) => e.amount);
    return {
      summary: [money('Approved', byStatus('Approved')), money('Pending Approval', byStatus('Pending')), money('Rejected', byStatus('Rejected')), count('Expenses', rows.length)],
      columns: EXPENSE_COLUMNS,
      rows,
      totalsRow: totalsRowFor(EXPENSE_COLUMNS, rows, 'date'),
      charts: { categories: groupSum(approved(rows), (e) => e.category, (e) => e.amount) },
    };
  },

  collections: async (ctx, p) => {
    const d = await loadDataset({ ctx, range: p, filters: p });
    const rows = [...d.payments].sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt)).map((r) => ({ ...r, amount: r.type === 'Refund' ? -r.amount : r.amount }));
    const t = totals(d);
    return {
      summary: [money('Received', t.received), money('Refunded', t.refunded), money('Net Collection', t.collection), money('Advances', t.advance), count('Payments', rows.length)],
      columns: PAYMENT_COLUMNS,
      rows,
      totalsRow: totalsRowFor(PAYMENT_COLUMNS, rows, 'date'),
      charts: { paymentModes: groupSum(d.payments.filter((x) => x.type !== 'Refund'), (x) => x.mode, (x) => x.amount) },
    };
  },

  outstanding: async (ctx, p) => {
    const orders = (await loadOutstanding(ctx, p)).filter((o) => o.status !== 'Cancelled' && o.orderDate <= p.to && o.orderDate >= p.from);
    const today = todayYMD();
    const rows = orders
      .map((o): Doc => ({ ...o, daysPending: daysBetween(o.orderDate, today) }))
      .sort((a, b) => b.balance - a.balance);
    const columns: ReportColumn[] = [
      { key: 'customerName', label: 'Customer' },
      { key: 'customerMobile', label: 'Mobile' },
      { key: 'orderNo', label: 'Order ID' },
      { key: 'serviceSummary', label: 'Service' },
      { key: 'orderDate', label: 'Order Date', kind: 'date' },
      { key: 'totalAmount', label: 'Total', kind: 'money' },
      { key: 'paidAmount', label: 'Paid', kind: 'money' },
      { key: 'balance', label: 'Balance', kind: 'money' },
      { key: 'lastPaymentDate', label: 'Last Payment', kind: 'date' },
      { key: 'daysPending', label: 'Days', kind: 'number' },
      { key: 'employeeName', label: 'Employee' },
    ];
    return {
      subtitle: `Open balances as of ${formatDateDisplay(today)}`,
      summary: [money('Total Outstanding', sum(rows, (r) => r.balance)), count('Orders', rows.length), count('Customers', new Set(rows.map((r) => r.customerId)).size), count('Older than 30 days', rows.filter((r) => r.daysPending > 30).length)],
      columns,
      rows,
      totalsRow: totalsRowFor(columns, rows, 'customerName'),
      charts: { employees: groupSum(rows, (r) => r.employeeName, (r) => r.balance) },
    };
  },

  'employee-performance': async (ctx, p) => {
    const d = await loadDataset({ ctx, range: p, filters: { category: p.category } });
    const rows = await employeePerformance(ctx, d);
    const columns: ReportColumn[] = [
      { key: 'employeeCode', label: 'Emp ID' },
      { key: 'name', label: 'Employee' },
      { key: 'customersAdded', label: 'Customers', kind: 'number' },
      { key: 'orders', label: 'Orders', kind: 'number' },
      { key: 'completedOrders', label: 'Completed', kind: 'number' },
      { key: 'openOrders', label: 'Pending', kind: 'number' },
      { key: 'sales', label: 'Sales', kind: 'money' },
      { key: 'collection', label: 'Collection', kind: 'money' },
      { key: 'pendingAmount', label: 'Pending Amt', kind: 'money' },
      { key: 'expensesSubmitted', label: 'Expenses', kind: 'number' },
      { key: 'averageOrderValue', label: 'Avg Order', kind: 'money' },
    ];
    return {
      summary: [money('Total Sales', sum(rows, (r) => r.sales)), money('Total Collection', sum(rows, (r) => r.collection)), count('Orders', sum(rows, (r) => r.orders)), count('Employees', rows.length)],
      columns,
      rows: rows as unknown as Record<string, unknown>[],
      totalsRow: { ...totalsRowFor(columns, rows as any, 'employeeCode'), averageOrderValue: '' },
      charts: { employees: rows.map((r) => ({ name: r.name, value: r.sales })) },
    };
  },

  customers: async (ctx, p) => {
    const all = await fetchAll(COL.customers);
    const orders = await fetchAll(COL.orders, { dateField: 'orderDate', from: p.from, to: p.to });
    const companyWide = isCompanyWide(ctx);
    const inRange = new Map<string, { orders: number; billed: number; paid: number; balance: number }>();
    for (const o of orders) {
      if (o.deleted || (!companyWide && o.employeeId !== ctx.user.uid)) continue;
      const r = inRange.get(o.customerId) ?? { orders: 0, billed: 0, paid: 0, balance: 0 };
      r.orders += 1;
      r.billed = round2(r.billed + o.billedAmount);
      r.paid = round2(r.paid + o.paidAmount);
      r.balance = round2(r.balance + o.balance);
      inRange.set(o.customerId, r);
    }
    const rows = all
      .filter((c) => !c.deleted && (companyWide || c.assignedEmployeeId === ctx.user.uid) && (!p.employeeId || c.assignedEmployeeId === p.employeeId))
      .filter((c) => inRange.has(c.id) || (c.dateAdded >= p.from && c.dateAdded <= p.to))
      .map((c): Doc => ({ ...c, periodOrders: inRange.get(c.id)?.orders ?? 0, periodBilled: inRange.get(c.id)?.billed ?? 0, periodPaid: inRange.get(c.id)?.paid ?? 0, periodBalance: inRange.get(c.id)?.balance ?? 0 }))
      .sort((a, b) => b.periodBilled - a.periodBilled);
    const columns: ReportColumn[] = [
      { key: 'customerNo', label: 'Customer ID' },
      { key: 'name', label: 'Name' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'customerType', label: 'Type' },
      { key: 'collegeName', label: 'College' },
      { key: 'assignedEmployeeName', label: 'Employee' },
      { key: 'periodOrders', label: 'Orders', kind: 'number' },
      { key: 'periodBilled', label: 'Billed', kind: 'money' },
      { key: 'periodPaid', label: 'Paid', kind: 'money' },
      { key: 'balance', label: 'Total Balance', kind: 'money' },
    ];
    return {
      summary: [count('Customers', rows.length), count('New in period', rows.filter((r) => r.dateAdded >= p.from && r.dateAdded <= p.to).length), money('Billed in period', sum(rows, (r) => r.periodBilled)), money('Total outstanding', sum(rows, (r) => r.balance))],
      columns,
      rows,
      totalsRow: totalsRowFor(columns, rows, 'customerNo'),
      charts: { types: groupSum(rows, (r) => r.customerType, () => 1) },
    };
  },

  colleges: async (ctx, p) => {
    const [colleges, orders, customers] = await Promise.all([
      fetchAll(COL.colleges),
      fetchAll(COL.orders, { dateField: 'orderDate', from: p.from, to: p.to }),
      fetchAll(COL.customers),
    ]);
    const companyWide = isCompanyWide(ctx);
    const scoped = orders.filter((o) => companyWide || o.employeeId === ctx.user.uid);
    const stats = collegeStats(scoped, customers);
    const rows = colleges
      .filter((c) => !c.deleted)
      .map((c): Doc => {
        const s = stats.get(c.id);
        const topService = s ? Object.entries(s.services).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '' : '';
        return { ...c, orders: s?.orders ?? 0, customers: s?.customers ?? 0, sales: round2(s?.sales ?? 0), paid: round2(s?.paid ?? 0), pending: round2(s?.pending ?? 0), topService };
      })
      .sort((a, b) => b.sales - a.sales);
    const columns: ReportColumn[] = [
      { key: 'collegeNo', label: 'College ID' },
      { key: 'name', label: 'College' },
      { key: 'city', label: 'City' },
      { key: 'contactPerson', label: 'Contact' },
      { key: 'customers', label: 'Customers', kind: 'number' },
      { key: 'orders', label: 'Orders', kind: 'number' },
      { key: 'topService', label: 'Top Service' },
      { key: 'sales', label: 'Sales', kind: 'money' },
      { key: 'paid', label: 'Payments', kind: 'money' },
      { key: 'pending', label: 'Pending', kind: 'money' },
    ];
    return {
      summary: [count('Colleges', rows.length), count('Active in period', rows.filter((r) => r.orders > 0).length), money('Sales', sum(rows, (r) => r.sales)), money('Pending', sum(rows, (r) => r.pending))],
      columns,
      rows,
      totalsRow: totalsRowFor(columns, rows, 'collegeNo'),
      charts: { colleges: rows.slice(0, 10).map((r) => ({ name: r.name, value: r.sales })) },
    };
  },

  'service-revenue': async (ctx, p) => {
    const d = await loadDataset({ ctx, range: p, filters: p });
    const m = new Map<string, { category: string; service: string; orders: number; quantity: number; revenue: number; discount: number; collected: number }>();
    for (const o of d.orders) {
      if (o.status === 'Cancelled') continue;
      for (const it of o.items ?? []) {
        const k = `${it.category}|${it.serviceName}`;
        const r = m.get(k) ?? { category: it.category, service: it.serviceName, orders: 0, quantity: 0, revenue: 0, discount: 0, collected: 0 };
        r.orders += 1;
        r.quantity += it.quantity;
        r.revenue = round2(r.revenue + it.amount);
        r.discount = round2(r.discount + it.discount);
        r.collected = round2(r.collected + (o.totalAmount > 0 ? (it.amount / o.totalAmount) * o.paidAmount : 0));
        m.set(k, r);
      }
    }
    const rows = Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
    const columns: ReportColumn[] = [
      { key: 'category', label: 'Category' },
      { key: 'service', label: 'Service' },
      { key: 'orders', label: 'Orders', kind: 'number' },
      { key: 'quantity', label: 'Qty', kind: 'number' },
      { key: 'discount', label: 'Discount', kind: 'money' },
      { key: 'revenue', label: 'Revenue', kind: 'money' },
      { key: 'collected', label: 'Collected', kind: 'money' },
    ];
    const t = totals(d);
    return {
      summary: [money('Revenue', t.sales), money('Collected', t.collection), money('Discounts', t.discount), count('Services sold', rows.length)],
      columns,
      rows,
      totalsRow: totalsRowFor(columns, rows, 'category'),
      charts: { services: serviceBreakdown(d).map((s) => ({ name: s.category, value: s.sales })) },
    };
  },

  'profit-loss': async (ctx, p) => {
    const d = await loadDataset({ ctx, range: p, filters: p });
    const t = totals(d);
    const income = serviceBreakdown(d).map((s) => ({ section: 'Income', head: s.category, amount: s.sales }));
    const expense = groupSum(approved(d.expenses), (e) => e.category, (e) => e.amount).map((e) => ({ section: 'Expense', head: e.name, amount: -e.value }));
    const rows = [
      ...income,
      { section: 'Income', head: 'Total Income (Sales)', amount: t.sales, bold: true },
      ...expense,
      { section: 'Expense', head: 'Total Expenses', amount: -t.expenses, bold: true },
      { section: 'Result', head: t.netRevenue >= 0 ? 'Net Profit' : 'Net Loss', amount: t.netRevenue, bold: true },
      { section: 'Cash', head: 'Cash collected', amount: t.collection },
      { section: 'Cash', head: 'Cash profit (Collection − Expenses)', amount: t.cashProfit },
      { section: 'Cash', head: 'Outstanding from period sales', amount: t.pending },
    ];
    return {
      summary: [money('Revenue', t.sales), money('Expenses', t.expenses), money('Net Profit', t.netRevenue), { label: 'Profit Margin', value: t.profitMargin, kind: 'percent' }, money('Outstanding', t.pending)],
      columns: [
        { key: 'section', label: 'Section' },
        { key: 'head', label: 'Head' },
        { key: 'amount', label: 'Amount', kind: 'money' },
      ],
      rows,
      charts: { monthly: timeSeries(p, d).points },
    };
  },

  orders: async (ctx, p) => {
    const d = await loadDataset({ ctx, range: p, filters: p });
    const t = totals(d);
    const rows = [...d.orders].sort((a, b) => a.orderDate.localeCompare(b.orderDate));
    const columns = [...ORDER_COLUMNS.slice(0, 7), { key: 'paymentStatus', label: 'Payment' }, ...ORDER_COLUMNS.slice(7)];
    return {
      summary: [count('Orders', t.orders), count('Completed', t.completedOrders), count('Open', t.openOrders), count('Cancelled', t.cancelledOrders), money('Total', t.sales), money('Balance', t.pending)],
      columns,
      rows,
      totalsRow: totalsRowFor(columns, rows, 'orderDate'),
      charts: { status: groupSum(rows, (o) => o.status, () => 1) },
    };
  },

  transactions: async (ctx, p) => {
    const all = await fetchAll(COL.transactions, { dateField: 'date', from: p.from, to: p.to });
    const companyWide = isCompanyWide(ctx);
    const rows = all
      .filter(
        (t) =>
          (companyWide ? !p.employeeId || t.employeeId === p.employeeId : t.employeeId === ctx.user.uid) &&
          (!p.category || t.category === p.category) &&
          (!p.paymentMode || t.paymentMode === p.paymentMode) &&
          (!p.type || t.type === p.type),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const columns: ReportColumn[] = [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'txnNo', label: 'Transaction ID' },
      { key: 'type', label: 'Type' },
      { key: 'customerName', label: 'Customer' },
      { key: 'serviceName', label: 'Service / Head' },
      { key: 'employeeName', label: 'Employee' },
      { key: 'paymentMode', label: 'Mode' },
      { key: 'txnNumber', label: 'Ref No.' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount', kind: 'money' },
    ];
    const by = (type: string) => sum(rows.filter((r) => r.type === type), (r) => r.amount);
    return {
      summary: [count('Transactions', rows.length), money('Sales', by('Sale')), money('Payments', by('Payment')), money('Refunds', by('Refund')), money('Expenses', by('Expense')), money('Adjustments', by('Adjustment'))],
      columns,
      rows,
    };
  },
};

export async function buildReport(ctx: Ctx, key: string, p: Params): Promise<ReportData> {
  const def = REPORT_TYPES.find((r) => r.key === key);
  const builder = builders[key as ReportKey];
  if (!def || !builder) throw badRequest('Unknown report.');
  const body = await builder(ctx, p);
  const scopeNote = isCompanyWide(ctx) ? '' : ` — ${ctx.user.name} only`;
  return {
    key,
    title: def.label,
    period: { from: p.from, to: p.to },
    generatedAt: new Date().toISOString(),
    generatedBy: ctx.user.name,
    ...body,
    subtitle: (body.subtitle ?? periodLabel(p)) + scopeNote,
  };
}

