import { Router } from 'express';
import { z } from 'zod';
import { sum } from '@pbms/shared';
import { COL } from '../firebase';
import { requirePerm } from '../middleware/auth';
import { can } from '../lib/context';
import { forbidden, notFound } from '../lib/errors';
import { fetchAll, fetchDoc, listResponse } from '../lib/list';
import { listQuery, zRequiredText } from '../lib/validation';
import {
  assertViewOrder,
  canViewOrder,
  createOrder,
  createOrderInput,
  paymentInput,
  recordPayment,
  restoreOrder,
  softDeleteOrder,
  updateOrder,
  updateOrderInput,
  voidPayment,
} from '../services/orders';
import { generateInvoice } from '../services/invoices';

// ---------------------------------------------------------------- orders ---

export const ordersRouter = Router();

const orderFilters = z.object({
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  employeeId: z.string().optional(),
  category: z.string().optional(),
  priority: z.string().optional(),
  customerId: z.string().optional(),
  collegeId: z.string().optional(),
  open: z.string().optional(),
});

ordersRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const f = orderFilters.parse(req.query);
  const all = await fetchAll(COL.orders, { dateField: 'orderDate', from: q.from, to: q.to });
  const items = all.filter(
    (o) =>
      ((q.includeDeleted && can(req.ctx, 'records.restore')) || !o.deleted) &&
      canViewOrder(req.ctx, o as any) &&
      (!f.status || o.status === f.status) &&
      (!f.paymentStatus || o.paymentStatus === f.paymentStatus) &&
      (!f.employeeId || o.employeeId === f.employeeId) &&
      (!f.category || o.category === f.category) &&
      (!f.priority || o.priority === f.priority) &&
      (!f.customerId || o.customerId === f.customerId) &&
      (!f.collegeId || o.collegeId === f.collegeId) &&
      (f.open !== 'true' || !['Completed', 'Delivered', 'Cancelled'].includes(o.status)),
  );
  const live = items.filter((o) => !o.deleted);
  res.json(
    listResponse(items, q, ['orderNo', 'customerName', 'customerMobile', 'serviceSummary', 'moduleRecordNo', 'employeeName', 'collegeName'], 'createdAt', {
      totals: { total: sum(live, (o) => o.billedAmount), paid: sum(live, (o) => o.paidAmount), balance: sum(live, (o) => o.balance) },
    }),
  );
});

ordersRouter.post('/', requirePerm('orders.create'), async (req, res) => {
  const input = createOrderInput.parse(req.body);
  const result = await createOrder(req.ctx, input);
  res.status(201).json(result);
});

ordersRouter.get('/:id', async (req, res) => {
  const order = await fetchDoc(COL.orders, String(req.params.id));
  if (!order || (order.deleted && !can(req.ctx, 'records.restore'))) throw notFound('Order');
  assertViewOrder(req.ctx, order as any);
  const [payments, transactions, invoice] = await Promise.all([
    fetchAll(COL.payments, { where: ['orderId', '==', order.id] }),
    fetchAll(COL.transactions, { where: ['orderId', '==', order.id] }),
    order.invoiceId ? fetchDoc(COL.invoices, order.invoiceId) : Promise.resolve(null),
  ]);
  res.json({
    order,
    payments: payments.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    transactions: transactions.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    invoice,
  });
});

ordersRouter.put('/:id', requirePerm('orders.edit'), async (req, res) => {
  const input = updateOrderInput.parse(req.body);
  res.json(await updateOrder(req.ctx, String(req.params.id), input));
});

ordersRouter.delete('/:id', requirePerm('orders.delete'), async (req, res) => {
  const { reason } = z.object({ reason: zRequiredText('Reason', 500) }).parse(req.body ?? {});
  res.json(await softDeleteOrder(req.ctx, String(req.params.id), reason));
});

ordersRouter.post('/:id/restore', requirePerm('records.restore'), async (req, res) => {
  res.json(await restoreOrder(req.ctx, String(req.params.id)));
});

ordersRouter.post('/:id/invoice', async (req, res) => {
  res.json(await generateInvoice(req.ctx, String(req.params.id)));
});

// ----------------------------------------------------------------- sales ---

export const salesRouter = Router();

salesRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const f = z
    .object({ employeeId: z.string().optional(), category: z.string().optional(), paymentStatus: z.string().optional(), paymentMode: z.string().optional() })
    .parse(req.query);
  const all = await fetchAll(COL.sales, { dateField: 'date', from: q.from, to: q.to });
  const items = all.filter(
    (s) =>
      !s.deleted &&
      (can(req.ctx, 'orders.view_all') || s.employeeId === req.ctx.user.uid || s.createdBy === req.ctx.user.uid) &&
      (!f.employeeId || s.employeeId === f.employeeId) &&
      (!f.category || s.category === f.category) &&
      (!f.paymentStatus || s.paymentStatus === f.paymentStatus) &&
      (!f.paymentMode || s.paymentMode === f.paymentMode),
  );
  res.json(
    listResponse(items, q, ['saleNo', 'orderNo', 'customerName', 'customerMobile', 'serviceName', 'employeeName', 'txnNumber'], 'createdAt', {
      totals: {
        total: sum(items, (s) => s.billedAmount),
        discount: sum(items, (s) => s.discount),
        paid: sum(items, (s) => s.paidAmount),
        balance: sum(items, (s) => s.balance),
      },
    }),
  );
});

// -------------------------------------------------------------- payments ---

export const paymentsRouter = Router();

paymentsRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const f = z
    .object({ employeeId: z.string().optional(), mode: z.string().optional(), type: z.string().optional(), category: z.string().optional(), orderId: z.string().optional(), showVoided: z.string().optional() })
    .parse(req.query);
  const all = await fetchAll(COL.payments, { dateField: 'date', from: q.from, to: q.to });
  const viewAll = can(req.ctx, 'payments.view_all');
  const items = all.filter(
    (p) =>
      (viewAll || p.employeeId === req.ctx.user.uid || p.orderEmployeeId === req.ctx.user.uid) &&
      (f.showVoided === 'true' || !p.voided) &&
      (!f.employeeId || p.employeeId === f.employeeId) &&
      (!f.mode || p.mode === f.mode) &&
      (!f.type || p.type === f.type) &&
      (!f.category || p.category === f.category) &&
      (!f.orderId || p.orderId === f.orderId),
  );
  const valid = items.filter((p) => !p.voided);
  res.json(
    listResponse(items, q, ['paymentNo', 'orderNo', 'customerName', 'customerMobile', 'txnNumber', 'employeeName', 'serviceName'], 'createdAt', {
      totals: {
        received: sum(valid.filter((p) => p.type !== 'Refund'), (p) => p.amount),
        refunded: sum(valid.filter((p) => p.type === 'Refund'), (p) => p.amount),
      },
    }),
  );
});

paymentsRouter.post('/', requirePerm('payments.create'), async (req, res) => {
  const input = paymentInput.parse(req.body);
  res.status(201).json(await recordPayment(req.ctx, input));
});

paymentsRouter.get('/:id', async (req, res) => {
  const p = await fetchDoc(COL.payments, String(req.params.id));
  if (!p) throw notFound('Payment');
  if (!can(req.ctx, 'payments.view_all') && p.employeeId !== req.ctx.user.uid && p.orderEmployeeId !== req.ctx.user.uid) throw forbidden();
  res.json(p);
});

paymentsRouter.post('/:id/void', requirePerm('payments.void'), async (req, res) => {
  const { reason } = z.object({ reason: zRequiredText('Reason', 500) }).parse(req.body ?? {});
  res.json(await voidPayment(req.ctx, String(req.params.id), reason));
});
