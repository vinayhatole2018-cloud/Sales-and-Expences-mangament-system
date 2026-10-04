import { Router } from 'express';
import { z } from 'zod';
import { sum } from '@pbms/shared';
import { db, COL } from '../firebase';
import { requirePerm } from '../middleware/auth';
import { can } from '../lib/context';
import { badRequest, conflict, notFound } from '../lib/errors';
import { allocIds } from '../lib/ids';
import { writeAudit, diff, describeChanges } from '../lib/audit';
import { getUser } from '../lib/directory';
import { fetchAll, fetchDoc, listResponse, nowIso, type Doc } from '../lib/list';
import { listQuery, zOptionalEmail, zOptionalMobile, zOptionalText, zRequiredText } from '../lib/validation';

export const collegesRouter = Router();

const collegeInput = z.object({
  name: zRequiredText('College name', 200),
  city: zOptionalText(80),
  state: zOptionalText(80),
  contactPerson: zOptionalText(120),
  mobile: zOptionalMobile,
  email: zOptionalEmail,
  address: zOptionalText(300),
  assignedEmployeeId: z.string().trim().max(128).optional().default(''),
  notes: zOptionalText(1000),
});

/** Totals per college, computed from live order data. */
export function collegeStats(orders: Doc[], customers: Doc[]) {
  const stats = new Map<string, { orders: number; sales: number; paid: number; pending: number; customers: number; services: Record<string, number> }>();
  const get = (id: string) => {
    let s = stats.get(id);
    if (!s) stats.set(id, (s = { orders: 0, sales: 0, paid: 0, pending: 0, customers: 0, services: {} }));
    return s;
  };
  for (const c of customers) if (c.collegeId && !c.deleted) get(c.collegeId).customers += 1;
  for (const o of orders) {
    if (!o.collegeId || o.deleted) continue;
    const s = get(o.collegeId);
    s.orders += 1;
    s.sales += o.billedAmount;
    s.paid += o.paidAmount;
    s.pending += o.balance;
    s.services[o.category] = (s.services[o.category] ?? 0) + o.billedAmount;
  }
  return stats;
}

collegesRouter.get('/', requirePerm('colleges.view', 'colleges.manage'), async (req, res) => {
  const q = listQuery.parse(req.query);
  const [colleges, orders, customers] = await Promise.all([fetchAll(COL.colleges), fetchAll(COL.orders), fetchAll(COL.customers)]);
  const stats = collegeStats(orders, customers);
  const showMoney = can(req.ctx, 'finance.view_all');
  const items = colleges
    .filter((c) => (q.includeDeleted && can(req.ctx, 'records.restore')) || !c.deleted)
    .map((c) => {
      const s = stats.get(c.id);
      return {
        ...c,
        totalOrders: s?.orders ?? 0,
        totalCustomers: s?.customers ?? 0,
        totalSales: showMoney ? s?.sales ?? 0 : null,
        totalPaid: showMoney ? s?.paid ?? 0 : null,
        pendingAmount: showMoney ? s?.pending ?? 0 : null,
      };
    });
  res.json(listResponse(items, q, ['collegeNo', 'name', 'city', 'state', 'contactPerson', 'mobile', 'email'], 'name'));
});

collegesRouter.get('/:id', requirePerm('colleges.view', 'colleges.manage'), async (req, res) => {
  const college = await fetchDoc(COL.colleges, String(req.params.id));
  if (!college) throw notFound('College');
  const [orders, customers] = await Promise.all([
    fetchAll(COL.orders, { where: ['collegeId', '==', college.id] }),
    fetchAll(COL.customers, { where: ['collegeId', '==', college.id] }),
  ]);
  const showMoney = can(req.ctx, 'finance.view_all');
  const live = orders.filter((o) => !o.deleted && (showMoney || o.employeeId === req.ctx.user.uid));
  const byService: Record<string, { category: string; orders: number; amount: number; pending: number }> = {};
  for (const o of live) {
    const s = (byService[o.category] ??= { category: o.category, orders: 0, amount: 0, pending: 0 });
    s.orders += 1;
    s.amount += o.billedAmount;
    s.pending += o.balance;
  }
  res.json({
    college,
    customers: customers.filter((c) => !c.deleted),
    orders: live.sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    services: Object.values(byService),
    summary: {
      totalOrders: live.length,
      totalSales: sum(live, (o) => o.billedAmount),
      totalPaid: sum(live, (o) => o.paidAmount),
      pendingAmount: sum(live, (o) => o.balance),
    },
  });
});

async function assignee(id: string) {
  if (!id) return { assignedEmployeeId: '', assignedEmployeeName: '' };
  const u = await getUser(id);
  if (!u) throw badRequest('Selected employee does not exist.');
  return { assignedEmployeeId: u.id, assignedEmployeeName: u.name };
}

collegesRouter.post('/', requirePerm('colleges.manage'), async (req, res) => {
  const input = collegeInput.parse(req.body);
  const ctx = req.ctx;
  const emp = await assignee(input.assignedEmployeeId);
  const ref = db.collection(COL.colleges).doc();
  const college = await db.runTransaction(async (tx) => {
    const dup = await tx.get(db.collection(COL.colleges).where('nameLower', '==', input.name.toLowerCase()).limit(1));
    if (!dup.empty && !dup.docs[0].get('deleted')) throw conflict('A college with this name already exists.');
    const ids = await allocIds(tx, { college: 1 });
    const now = nowIso();
    const c = {
      id: ref.id,
      collegeNo: ids.next('college'),
      ...input,
      ...emp,
      nameLower: input.name.toLowerCase(),
      createdAt: now,
      createdBy: ctx.user.uid,
      createdByName: ctx.user.name,
      updatedAt: now,
      deleted: false,
    };
    ids.commit();
    tx.set(ref, c);
    writeAudit(tx, ctx, { action: 'create', module: 'colleges', recordId: c.id, recordLabel: c.collegeNo, message: `${ctx.user.name} added college ${c.name}.`, newValue: c });
    return c;
  });
  res.status(201).json(college);
});

collegesRouter.put('/:id', requirePerm('colleges.manage'), async (req, res) => {
  const input = collegeInput.parse(req.body);
  const ctx = req.ctx;
  const emp = await assignee(input.assignedEmployeeId);
  const result = await db.runTransaction(async (tx) => {
    const ref = db.collection(COL.colleges).doc(String(req.params.id));
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('College');
    const before = snap.data() as Doc;
    const after = { ...before, ...input, ...emp, nameLower: input.name.toLowerCase(), updatedAt: nowIso(), updatedBy: ctx.user.uid };
    const d = diff(before, after, [...Object.keys(collegeInput.shape), 'assignedEmployeeName']);
    if (!d.changed.length) return before;
    tx.set(ref, after);
    writeAudit(tx, ctx, {
      action: 'update',
      module: 'colleges',
      recordId: ref.id,
      recordLabel: before.collegeNo,
      message: `${ctx.user.name} updated college ${before.name}: ${describeChanges(d.changed, d.oldValue, d.newValue)}.`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
    return after;
  });
  // Keep the denormalised college name on customers in step.
  if (result.name) {
    const customers = await fetchAll(COL.customers, { where: ['collegeId', '==', result.id] });
    const batch = db.batch();
    for (const c of customers) if (c.collegeName !== result.name) batch.update(db.collection(COL.customers).doc(c.id), { collegeName: result.name });
    await batch.commit();
  }
  res.json(result);
});

collegesRouter.delete('/:id', requirePerm('settings.manage'), async (req, res) => {
  const ctx = req.ctx;
  const c = await fetchDoc(COL.colleges, String(req.params.id));
  if (!c) throw notFound('College');
  const batch = db.batch();
  batch.update(db.collection(COL.colleges).doc(c.id), { deleted: !c.deleted, updatedAt: nowIso() });
  writeAudit(batch, ctx, {
    action: c.deleted ? 'restore' : 'delete',
    module: 'colleges',
    recordId: c.id,
    recordLabel: c.collegeNo,
    message: `${ctx.user.name} ${c.deleted ? 'restored' : 'deleted'} college ${c.name}.`,
  });
  await batch.commit();
  res.json({ ok: true });
});
