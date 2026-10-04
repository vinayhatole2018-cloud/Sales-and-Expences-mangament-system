import { Router } from 'express';
import { addDays, monthRange, sum, todayYMD, CLOSED_ORDER_STATUSES, type OrderStatus } from '@pbms/shared';
import { COL } from '../firebase';
import { requirePerm } from '../middleware/auth';
import { can } from '../lib/context';
import { fetchAll } from '../lib/list';
import {
  analyticsQuery,
  employeePerformance,
  groupSum,
  isCompanyWide,
  loadDataset,
  loadOutstanding,
  resolveRange,
  serviceBreakdown,
  timeSeries,
  totals,
  approved,
} from '../services/analytics';

export const dashboardRouter = Router();

/**
 * The owner's "30 second" view: today, this month, the selected period,
 * money outstanding, work due and who is performing.
 */
dashboardRouter.get('/', requirePerm('dashboard.view'), async (req, res) => {
  const ctx = req.ctx;
  const q = analyticsQuery.parse(req.query);
  const today = todayYMD();
  const [y, m] = today.split('-').map(Number);
  const month = { from: monthRange(y, m).from, to: today };
  const range = resolveRange(q.from || q.to ? q : month);
  const filters = { employeeId: q.employeeId, category: q.category, paymentMode: q.paymentMode, status: q.status };

  // One load spanning everything we need, then slice in memory.
  const spanFrom = [range.from, month.from, today].sort()[0];
  const spanTo = [range.to, today].sort().reverse()[0];
  const [all, outstanding, pendingExpenseDocs] = await Promise.all([
    loadDataset({ ctx, range: { from: spanFrom, to: spanTo }, filters }),
    loadOutstanding(ctx, filters),
    can(ctx, 'expenses.approve') ? fetchAll(COL.expenses, { where: ['approvalStatus', '==', 'Pending'] }) : Promise.resolve([]),
  ]);
  const slice = (r: { from: string; to: string }) => ({
    range: r,
    orders: all.orders.filter((o) => o.orderDate >= r.from && o.orderDate <= r.to),
    payments: all.payments.filter((p) => p.date >= r.from && p.date <= r.to),
    expenses: all.expenses.filter((e) => e.date >= r.from && e.date <= r.to),
    customers: all.customers.filter((c) => c.dateAdded >= r.from && c.dateAdded <= r.to),
  });
  const period = slice(range);
  const monthData = slice(month);
  const todayData = slice({ from: today, to: today });

  const p = totals(period);
  const mt = totals(monthData);
  const td = totals(todayData);
  const perf = await employeePerformance(ctx, period);

  const openOutstanding = outstanding.filter((o) => o.status !== 'Cancelled');
  const dueLimit = addDays(today, 3);
  const dueSoon = (await fetchAll(COL.orders, { dateField: 'expectedDate', from: '2000-01-01', to: dueLimit }))
    .filter(
      (o) =>
        !o.deleted &&
        o.expectedDate &&
        !CLOSED_ORDER_STATUSES.includes(o.status as OrderStatus) &&
        (isCompanyWide(ctx) ? !q.employeeId || o.employeeId === q.employeeId : o.employeeId === ctx.user.uid),
    )
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))
    .slice(0, 8);

  res.json({
    scope: isCompanyWide(ctx) ? 'company' : 'own',
    range,
    overview: {
      totalSales: p.sales,
      totalCollection: p.collection,
      totalExpenses: p.expenses,
      netRevenue: p.netRevenue,
      profitMargin: p.profitMargin,
      advanceReceived: p.advance,
      pendingAmount: sum(openOutstanding, (o) => o.balance),
      periodPending: p.pending,
      totalCustomers: p.customers,
      totalOrders: p.orders,
      completedOrders: p.completedOrders,
      pendingOrders: p.openOrders,
      cancelledOrders: p.cancelledOrders,
      averageOrderValue: p.averageOrderValue,
    },
    today: { date: today, sales: td.sales, expenses: td.expenses, payments: td.collection, newCustomers: td.customers, orders: td.orders },
    month: { ...month, revenue: mt.sales, collection: mt.collection, expenses: mt.expenses, profit: mt.netRevenue, orders: mt.orders, pending: mt.pending },
    serviceSales: serviceBreakdown(period),
    employeePerformance: perf,
    series: timeSeries(range, period),
    paymentModes: groupSum(period.payments.filter((x) => x.type !== 'Refund'), (x) => x.mode, (x) => x.amount),
    expenseCategories: groupSum(approved(period.expenses), (x) => x.category, (x) => x.amount),
    pendingByEmployee: groupSum(openOutstanding, (o) => o.employeeName, (o) => o.balance),
    pendingByService: groupSum(openOutstanding, (o) => o.category, (o) => o.balance),
    topOutstanding: [...openOutstanding].sort((a, b) => b.balance - a.balance).slice(0, 8),
    dueSoon,
    pendingExpenses: { count: pendingExpenseDocs.filter((e) => !e.deleted).length, amount: sum(pendingExpenseDocs.filter((e) => !e.deleted), (e) => e.amount) },
    orderStatus: groupSum(period.orders, (o) => o.status, () => 1),
  });
});

/** Financial analytics: revenue vs expense, profit, margins. */
dashboardRouter.get('/analytics', requirePerm('analytics.view'), async (req, res) => {
  const ctx = req.ctx;
  const q = analyticsQuery.parse(req.query);
  const range = resolveRange(q, 365);
  const filters = { employeeId: q.employeeId, category: q.category, paymentMode: q.paymentMode, status: q.status };
  const [d, outstanding] = await Promise.all([loadDataset({ ctx, range, filters }), loadOutstanding(ctx, filters)]);
  const t = totals(d);
  const series = timeSeries(range, d);
  res.json({
    range,
    totals: { ...t, outstanding: sum(outstanding.filter((o) => o.status !== 'Cancelled'), (o) => o.balance) },
    series,
    serviceRevenue: serviceBreakdown(d),
    employeeRevenue: (await employeePerformance(ctx, d)).map((e) => ({ name: e.name, sales: e.sales, collection: e.collection, pending: e.pendingAmount })),
    expenseCategories: groupSum(approved(d.expenses), (x) => x.category, (x) => x.amount),
    paymentModes: groupSum(d.payments.filter((x) => x.type !== 'Refund'), (x) => x.mode, (x) => x.amount),
    collegeRevenue: groupSum(d.orders.filter((o) => o.collegeName), (o) => o.collegeName, (o) => o.billedAmount).slice(0, 10),
  });
});

/** Employee performance comparison. Employees only ever see themselves. */
dashboardRouter.get('/performance', async (req, res) => {
  const ctx = req.ctx;
  const q = analyticsQuery.parse(req.query);
  const range = resolveRange(q, 30);
  const d = await loadDataset({ ctx, range, filters: { category: q.category, employeeId: can(ctx, 'performance.view_all') ? q.employeeId : '' } });
  const rows = await employeePerformance(ctx, d);
  res.json({ range, rows, totals: totals(d), series: timeSeries(range, d) });
});
