import { Router } from 'express';
import { z } from 'zod';
import { daysBetween, monthRange, sum, todayYMD, MONTH_NAMES } from '@pbms/shared';
import { COL } from '../firebase';
import { requirePerm } from '../middleware/auth';
import { can } from '../lib/context';
import { audit } from '../lib/audit';
import { fetchAll, listResponse, type Doc } from '../lib/list';
import { getSettings } from '../lib/settings';
import { listQuery, zDate } from '../lib/validation';
import {
  analyticsQuery,
  approved,
  employeePerformance,
  groupSum,
  isCompanyWide,
  loadDataset,
  loadOutstanding,
  resolveRange,
  serviceBreakdown,
  timeSeries,
  totals,
} from '../services/analytics';
import { buildReport } from '../reports/builders';
import { reportFileName, toCsv, toPdf, toXlsx } from '../reports/exporters';
import { loadImage } from './attachments';
import { getInvoiceForViewer, invoicePdf } from '../services/invoices';

export const reportsRouter = Router();

const reportParams = analyticsQuery.extend({ type: z.string().trim().max(30).optional().default('') });

/** Daily transaction page: ledger rows for one day plus consistent totals. */
reportsRouter.get('/daily', requirePerm('reports.view'), async (req, res) => {
  const ctx = req.ctx;
  const q = reportParams.extend({ date: zDate.optional() }).parse(req.query);
  const date = q.date || todayYMD();
  const range = { from: date, to: date };
  const [d, ledger] = await Promise.all([
    loadDataset({ ctx, range, filters: q }),
    fetchAll(COL.transactions, { dateField: 'date', from: date, to: date }),
  ]);
  const companyWide = isCompanyWide(ctx);
  const rows = ledger
    .filter(
      (t) =>
        (companyWide ? !q.employeeId || t.employeeId === q.employeeId : t.employeeId === ctx.user.uid) &&
        (!q.category || t.category === q.category) &&
        (!q.paymentMode || t.paymentMode === q.paymentMode) &&
        (!q.type || t.type === q.type),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const t = totals(d);
  res.json({
    date,
    summary: {
      transactions: rows.length,
      totalSales: t.sales,
      totalCollection: t.collection,
      totalExpenses: t.expenses,
      netAmount: Math.round((t.collection - t.expenses) * 100) / 100,
      orders: t.orders,
      pending: t.pending,
    },
    rows,
    paymentModes: groupSum(d.payments.filter((p) => p.type !== 'Refund'), (p) => p.mode, (p) => p.amount),
  });
});

/** Monthly report: summary, breakdowns and a day-by-day chart. */
reportsRouter.get('/monthly', requirePerm('reports.view'), async (req, res) => {
  const ctx = req.ctx;
  const today = todayYMD();
  const q = analyticsQuery
    .extend({
      year: z.coerce.number().int().min(2000).max(2100).default(Number(today.slice(0, 4))),
      month: z.coerce.number().int().min(1).max(12).default(Number(today.slice(5, 7))),
    })
    .parse(req.query);
  const range = monthRange(q.year, q.month);
  const d = await loadDataset({ ctx, range, filters: q });
  const t = totals(d);
  const perf = await employeePerformance(ctx, d);
  res.json({
    title: `${MONTH_NAMES[q.month - 1]} ${q.year}`,
    range,
    summary: {
      totalSales: t.sales,
      totalCollection: t.collection,
      totalExpenses: t.expenses,
      netRevenue: t.netRevenue,
      pendingAmount: t.pending,
      orders: t.orders,
      customers: t.uniqueCustomers,
      newCustomers: t.customers,
      profitMargin: t.profitMargin,
    },
    daily: timeSeries(range, d).points,
    services: serviceBreakdown(d),
    employees: perf.map((e) => ({ name: e.name, sales: e.sales, collection: e.collection, orders: e.orders, pending: e.pendingAmount })),
    colleges: groupSum(d.orders.filter((o) => o.collegeName), (o) => o.collegeName, (o) => o.billedAmount),
    paymentModes: groupSum(d.payments.filter((p) => p.type !== 'Refund'), (p) => p.mode, (p) => p.amount),
    expenseCategories: groupSum(approved(d.expenses), (e) => e.category, (e) => e.amount),
  });
});

/** Date-wise report for any custom range. */
reportsRouter.get('/range', requirePerm('reports.view'), async (req, res) => {
  const ctx = req.ctx;
  const q = analyticsQuery.parse(req.query);
  const range = resolveRange(q, 30);
  const d = await loadDataset({ ctx, range, filters: q });
  const t = totals(d);
  res.json({
    range,
    days: daysBetween(range.from, range.to) + 1,
    summary: {
      sales: t.sales,
      expenses: t.expenses,
      payments: t.collection,
      orders: t.orders,
      customers: t.customers,
      uniqueCustomers: t.uniqueCustomers,
      pendingAmount: t.pending,
      netRevenue: t.netRevenue,
    },
    series: timeSeries(range, d),
    orders: d.orders.sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    payments: d.payments.sort((a, b) => b.date.localeCompare(a.date)),
    expenses: d.expenses.sort((a, b) => b.date.localeCompare(a.date)),
    customers: d.customers.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)),
  });
});

/** Outstanding payments page (point in time). Employees see their own. */
reportsRouter.get('/pending-payments', async (req, res) => {
  const ctx = req.ctx;
  const q = listQuery.parse(req.query);
  const f = z
    .object({
      employeeId: z.string().optional().default(''),
      category: z.string().optional().default(''),
      minAmount: z.coerce.number().min(0).optional(),
      maxAmount: z.coerce.number().min(0).optional(),
    })
    .parse(req.query);
  const scopeCtx = ctx;
  let items = (await loadOutstanding(scopeCtx, { employeeId: can(ctx, 'orders.view_all') ? f.employeeId : '', category: f.category }))
    .filter((o) => o.status !== 'Cancelled')
    .filter((o) => (!q.from || o.orderDate >= q.from) && (!q.to || o.orderDate <= q.to))
    .filter((o) => (f.minAmount === undefined || o.balance >= f.minAmount) && (f.maxAmount === undefined || o.balance <= f.maxAmount));
  // Employees without company-wide finance still see outstanding on their own orders.
  if (!can(ctx, 'orders.view_all')) items = items.filter((o) => o.employeeId === ctx.user.uid || o.createdBy === ctx.user.uid);
  const today = todayYMD();
  const withAge = items.map((o): Doc => ({ ...o, daysPending: daysBetween(o.lastPaymentDate || o.orderDate, today), age: daysBetween(o.orderDate, today) }));
  res.json(
    listResponse(withAge, q, ['customerName', 'customerMobile', 'orderNo', 'serviceSummary', 'employeeName', 'collegeName'], 'balance', {
      totals: { balance: sum(withAge, (o) => o.balance), orders: withAge.length, customers: new Set(withAge.map((o) => o.customerId)).size },
    }),
  );
});

/** Any of the 12 standard reports as JSON (for on-screen view). */
reportsRouter.get('/:key', requirePerm('reports.view'), async (req, res) => {
  const q = reportParams.parse(req.query);
  const range = resolveRange(q, String(req.params.key) === 'daily-sales' ? 1 : 30);
  res.json(await buildReport(req.ctx, String(req.params.key), { ...q, ...range }));
});

/** Export a report as pdf, xlsx or csv. */
reportsRouter.get('/:key/export', requirePerm('reports.export'), async (req, res) => {
  const q = reportParams.extend({ format: z.enum(['pdf', 'xlsx', 'csv']).default('pdf') }).parse(req.query);
  const range = resolveRange(q, String(req.params.key) === 'daily-sales' ? 1 : 30);
  const report = await buildReport(req.ctx, String(req.params.key), { ...q, ...range });
  const settings = await getSettings();
  let body: Buffer;
  let type: string;
  if (q.format === 'csv') {
    body = toCsv(report);
    type = 'text/csv; charset=utf-8';
  } else if (q.format === 'xlsx') {
    body = await toXlsx(report, settings);
    type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else {
    body = await toPdf(report, settings, await loadImage(settings.logoAttachmentId));
    type = 'application/pdf';
  }
  await audit(req.ctx, {
    action: 'export',
    module: 'reports',
    recordId: report.key,
    recordLabel: report.title,
    message: `${req.ctx.user.name} exported ${report.title} (${report.subtitle}) as ${q.format.toUpperCase()}.`,
  });
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${reportFileName(report, q.format)}"`);
  res.send(body);
});

// --------------------------------------------------------------- invoices ---

export const invoicesRouter = Router();

invoicesRouter.get('/:id', async (req, res) => {
  res.json(await getInvoiceForViewer(req.ctx, String(req.params.id)));
});

invoicesRouter.get('/:id/pdf', async (req, res) => {
  const inv = await getInvoiceForViewer(req.ctx, String(req.params.id));
  const pdf = await invoicePdf(inv);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${inv.invoiceNo}.pdf"`);
  res.send(pdf);
});
