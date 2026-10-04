import { Router } from 'express';
import { z } from 'zod';
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, sum } from '@pbms/shared';
import { db, COL } from '../firebase';
import { requirePerm } from '../middleware/auth';
import { can, type Ctx } from '../lib/context';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { allocIds } from '../lib/ids';
import { writeAudit, diff, describeChanges } from '../lib/audit';
import { getUser } from '../lib/directory';
import { fetchAll, fetchDoc, listResponse, nowIso, type Doc } from '../lib/list';
import {
  listQuery,
  zDate,
  zMobile,
  zOptionalEmail,
  zOptionalMobile,
  zOptionalText,
  zRequiredText,
} from '../lib/validation';
import { canViewOrder } from '../services/orders';

export const customersRouter = Router();

const customerInput = z.object({
  name: zRequiredText('Full name', 120),
  mobile: zMobile,
  altMobile: zOptionalMobile,
  email: zOptionalEmail,
  address: zOptionalText(300),
  city: zOptionalText(80),
  state: zOptionalText(80),
  collegeId: z.string().trim().max(128).optional().default(''),
  collegeName: zOptionalText(200),
  department: zOptionalText(120),
  designation: zOptionalText(120),
  customerType: z.enum(CUSTOMER_TYPES).default('Author'),
  assignedEmployeeId: z.string().trim().max(128).optional().default(''),
  dateAdded: zDate.optional(),
  notes: zOptionalText(2000),
  status: z.enum(CUSTOMER_STATUSES).default('Active'),
});

export function canViewCustomer(ctx: Ctx, c: Doc): boolean {
  return can(ctx, 'customers.view_all') || c.assignedEmployeeId === ctx.user.uid || c.createdBy === ctx.user.uid;
}

async function resolveCollege(collegeId: string, collegeName: string) {
  if (!collegeId) return { collegeId: '', collegeName };
  const col = await fetchDoc(COL.colleges, collegeId);
  if (!col || col.deleted) throw badRequest('Selected college does not exist.');
  return { collegeId: col.id, collegeName: col.name };
}

async function resolveAssignee(ctx: Ctx, id: string) {
  const target = id || ctx.user.uid;
  if (target !== ctx.user.uid && !can(ctx, 'customers.view_all')) throw forbidden('You can only assign customers to yourself.');
  const u = await getUser(target);
  if (!u) throw badRequest('Selected employee does not exist.');
  return { assignedEmployeeId: u.id, assignedEmployeeName: u.name };
}

customersRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const f = z
    .object({
      customerType: z.string().optional(),
      status: z.string().optional(),
      employeeId: z.string().optional(),
      collegeId: z.string().optional(),
      withBalance: z.string().optional(),
    })
    .parse(req.query);
  let items = await fetchAll(COL.customers, { dateField: 'dateAdded', from: q.from, to: q.to });
  items = items.filter(
    (c) =>
      (q.includeDeleted && can(req.ctx, 'records.restore') ? true : !c.deleted) &&
      canViewCustomer(req.ctx, c) &&
      (!f.customerType || c.customerType === f.customerType) &&
      (!f.status || c.status === f.status) &&
      (!f.employeeId || c.assignedEmployeeId === f.employeeId) &&
      (!f.collegeId || c.collegeId === f.collegeId) &&
      (f.withBalance !== 'true' || (c.balance ?? 0) > 0.009),
  );
  res.json(
    listResponse(items, q, ['customerNo', 'name', 'mobile', 'altMobile', 'email', 'collegeName', 'city'], 'createdAt', {
      totals: { balance: sum(items, (c) => c.balance), billed: sum(items, (c) => c.totalBilled), paid: sum(items, (c) => c.totalPaid) },
    }),
  );
});

customersRouter.post('/', requirePerm('customers.create'), async (req, res) => {
  const input = customerInput.parse(req.body);
  const ctx = req.ctx;
  const college = await resolveCollege(input.collegeId, input.collegeName);
  const assignee = await resolveAssignee(ctx, input.assignedEmployeeId);
  const ref = db.collection(COL.customers).doc();
  const now = nowIso();

  const customer = await db.runTransaction(async (tx) => {
    const dup = await tx.get(db.collection(COL.customers).where('mobile', '==', input.mobile).limit(1));
    if (!dup.empty) {
      const d = dup.docs[0].data();
      throw conflict(`A customer with this mobile number already exists: ${d.name} (${d.customerNo}).`);
    }
    const ids = await allocIds(tx, { customer: 1 });
    const c = {
      id: ref.id,
      customerNo: ids.next('customer'),
      ...input,
      ...college,
      ...assignee,
      dateAdded: input.dateAdded || now.slice(0, 10),
      totalBilled: 0,
      totalPaid: 0,
      balance: 0,
      orderCount: 0,
      lastOrderDate: '',
      createdAt: now,
      createdBy: ctx.user.uid,
      createdByName: ctx.user.name,
      updatedAt: now,
      deleted: false,
    };
    ids.commit();
    tx.set(ref, c);
    writeAudit(tx, ctx, {
      action: 'create',
      module: 'customers',
      recordId: c.id,
      recordLabel: c.customerNo,
      message: `${ctx.user.name} added customer ${c.name} (${c.customerNo}).`,
      newValue: c,
    });
    return c;
  });
  res.status(201).json(customer);
});

customersRouter.get('/:id', async (req, res) => {
  const c = await fetchDoc(COL.customers, String(req.params.id));
  if (!c || (c.deleted && !can(req.ctx, 'records.restore'))) throw notFound('Customer');
  if (!canViewCustomer(req.ctx, c)) throw forbidden();
  const [orders, payments] = await Promise.all([
    fetchAll(COL.orders, { where: ['customerId', '==', c.id] }),
    fetchAll(COL.payments, { where: ['customerId', '==', c.id] }),
  ]);
  const visibleOrders = orders.filter((o) => !o.deleted && canViewOrder(req.ctx, o as any)).sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const visibleOrderIds = new Set(visibleOrders.map((o) => o.id));
  const visiblePayments = payments.filter((p) => visibleOrderIds.has(p.orderId)).sort((a, b) => b.date.localeCompare(a.date));
  const services: Record<string, { name: string; count: number; amount: number }> = {};
  for (const o of visibleOrders) {
    for (const it of o.items ?? []) {
      const s = (services[it.serviceName] ??= { name: it.serviceName, count: 0, amount: 0 });
      s.count += it.quantity;
      s.amount += o.status === 'Cancelled' ? 0 : it.amount;
    }
  }
  res.json({
    customer: c,
    orders: visibleOrders,
    payments: visiblePayments,
    services: Object.values(services),
    summary: {
      totalBilled: sum(visibleOrders, (o) => o.billedAmount),
      totalPaid: sum(visibleOrders, (o) => o.paidAmount),
      balance: sum(visibleOrders, (o) => o.balance),
      orderCount: visibleOrders.length,
    },
  });
});

customersRouter.put('/:id', requirePerm('customers.edit'), async (req, res) => {
  const input = customerInput.parse(req.body);
  const ctx = req.ctx;
  const college = await resolveCollege(input.collegeId, input.collegeName);
  const result = await db.runTransaction(async (tx) => {
    const ref = db.collection(COL.customers).doc(String(req.params.id));
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Customer');
    const before: Doc = { ...(snap.data() as Doc), id: snap.id };
    if (before.deleted) throw badRequest('This customer has been deleted.');
    if (!canViewCustomer(ctx, before)) throw forbidden();
    if (input.mobile !== before.mobile) {
      const dup = await tx.get(db.collection(COL.customers).where('mobile', '==', input.mobile).limit(1));
      if (!dup.empty && dup.docs[0].id !== before.id) throw conflict('Another customer already uses this mobile number.');
    }
    let assignee = { assignedEmployeeId: before.assignedEmployeeId, assignedEmployeeName: before.assignedEmployeeName };
    if (input.assignedEmployeeId && input.assignedEmployeeId !== before.assignedEmployeeId) {
      if (!can(ctx, 'customers.view_all')) throw forbidden('Only managers can reassign customers.');
      assignee = await resolveAssignee(ctx, input.assignedEmployeeId);
    }
    const after = { ...before, ...input, ...college, ...assignee, dateAdded: input.dateAdded || before.dateAdded, updatedAt: nowIso(), updatedBy: ctx.user.uid };
    const d = diff(before, after, [...Object.keys(customerInput.shape), 'assignedEmployeeName']);
    if (!d.changed.length) return before;
    tx.set(ref, after);
    writeAudit(tx, ctx, {
      action: 'update',
      module: 'customers',
      recordId: before.id,
      recordLabel: before.customerNo,
      message: `${ctx.user.name} updated customer ${before.name}: ${describeChanges(d.changed, d.oldValue, d.newValue)}.`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
    return after;
  });
  res.json(result);
});

customersRouter.delete('/:id', requirePerm('customers.delete'), async (req, res) => {
  const { reason } = z.object({ reason: zRequiredText('Reason', 500) }).parse(req.body ?? {});
  const ctx = req.ctx;
  await db.runTransaction(async (tx) => {
    const ref = db.collection(COL.customers).doc(String(req.params.id));
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Customer');
    const c = snap.data() as Doc;
    if (c.deleted) throw badRequest('This customer is already deleted.');
    if ((c.balance ?? 0) > 0.009) throw badRequest('This customer has an outstanding balance. Settle or cancel their orders first.');
    tx.update(ref, { deleted: true, deletedAt: nowIso(), deletedBy: ctx.user.uid, deleteReason: reason });
    writeAudit(tx, ctx, {
      action: 'delete',
      module: 'customers',
      recordId: ref.id,
      recordLabel: c.customerNo,
      message: `${ctx.user.name} deleted customer ${c.name} (${c.customerNo}).`,
      oldValue: { deleted: false },
      newValue: { deleted: true },
      reason,
    });
  });
  res.json({ ok: true });
});

customersRouter.post('/:id/restore', requirePerm('records.restore'), async (req, res) => {
  const ctx = req.ctx;
  await db.runTransaction(async (tx) => {
    const ref = db.collection(COL.customers).doc(String(req.params.id));
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Customer');
    const c = snap.data() as Doc;
    if (!c.deleted) throw badRequest('This customer is not deleted.');
    tx.update(ref, { deleted: false, deletedAt: '', deletedBy: '', deleteReason: '' });
    writeAudit(tx, ctx, {
      action: 'restore',
      module: 'customers',
      recordId: ref.id,
      recordLabel: c.customerNo,
      message: `${ctx.user.name} restored customer ${c.name} (${c.customerNo}).`,
      oldValue: { deleted: true },
      newValue: { deleted: false },
    });
  });
  res.json({ ok: true });
});
