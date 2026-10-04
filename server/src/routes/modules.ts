import { Router } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { getModule, PRIORITIES, formatINR, sum, type FieldDef, type ModuleDef } from '@pbms/shared';
import { db, COL } from '../firebase';
import { requirePerm } from '../middleware/auth';
import { can, type Ctx } from '../lib/context';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { writeAudit, diff, describeChanges } from '../lib/audit';
import { fetchAll, fetchDoc, listResponse, nowIso, type Doc } from '../lib/list';
import { isOpenForRegistration } from './conferenceEvents';
import {
  listQuery,
  zCount,
  zDate,
  zMoney,
  zOptionalDate,
  zOptionalEmail,
  zOptionalMobile,
  zOptionalText,
  zRequiredText,
  zTxnNumber,
} from '../lib/validation';
import {
  createOrder,
  moduleMirror,
  moduleStatusToOrder,
  newCustomerInput,
  prepareOrderUpdate,
  restoreOrder,
  softDeleteOrder,
  type ItemInput,
  type OrderDoc,
} from '../services/orders';

export const modulesRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Schema generation from module definitions
// ---------------------------------------------------------------------------

function fieldSchema(f: FieldDef): ZodTypeAny {
  switch (f.type) {
    case 'money':
      return zMoney.optional().default(0);
    case 'number': {
      let s: ZodTypeAny = zCount;
      if (f.min !== undefined) s = s.refine((n) => n === 0 || n >= f.min!, `${f.label} must be at least ${f.min}.`);
      if (f.max !== undefined) s = s.refine((n) => n <= f.max!, `${f.label} must be at most ${f.max}.`);
      return s.optional().default(f.required ? (f.min ?? 1) : 0);
    }
    case 'select':
      return f.required
        ? z.enum(f.options as [string, ...string[]], { errorMap: () => ({ message: `Select ${f.label.toLowerCase()}.` }) })
        : z.union([z.enum(f.options as [string, ...string[]]), z.literal('')]).optional().default('');
    case 'checkbox':
      return z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true').optional().default(false);
    case 'date':
      return f.required ? zDate : zOptionalDate;
    case 'email':
      return zOptionalEmail;
    case 'tel':
      return zOptionalMobile;
    case 'textarea':
      return f.required ? zRequiredText(f.label, 4000) : zOptionalText(4000);
    case 'conference':
      return z.string({ required_error: 'Select a conference.' }).trim().min(1, 'Select a conference.').max(128);
    case 'authors':
      return z
        .array(z.object({ name: zRequiredText('Author name', 120), mobile: zOptionalMobile, email: zOptionalEmail }))
        .max(25, 'At most 25 authors.')
        .optional()
        .default([]);
    default:
      return f.required ? zRequiredText(f.label, 300) : zOptionalText(300);
  }
}

function specificSchema(def: ModuleDef) {
  const shape: Record<string, ZodTypeAny> = {};
  // Derived fields are filled from the linked master record, never trusted from input.
  for (const f of def.fields) shape[f.name] = f.derived ? zOptionalText(300) : fieldSchema(f);
  return z.object(shape);
}

/**
 * Links a record to its master data. Conference registrations must point at a
 * conference from the Conference master; its name, code and organiser are
 * copied from there. New links are only allowed while registrations are open.
 */
async function linkMasterRecords(def: ModuleDef, data: Record<string, unknown>, previous?: Doc) {
  if (def.key !== 'conferences') return;
  const eventId = String(data.conferenceEventId ?? '');
  const event = await fetchDoc(COL.conferenceEvents, eventId);
  if (!event || event.deleted) throw badRequest('Selected conference does not exist. Ask a manager to add it under Conferences.');
  const changedLink = !previous || previous.conferenceEventId !== eventId;
  if (changedLink && !isOpenForRegistration(event)) {
    throw badRequest(`Registrations for ${event.name} are closed (status: ${event.status}).`);
  }
  data.conferenceName = event.name;
  data.conferenceNumber = event.code;
  data.collegeName = event.organizerName ?? '';
}

function commonCreateSchema(def: ModuleDef) {
  return z.object({
    customerId: z.string().trim().max(128).optional().default(''),
    newCustomer: newCustomerInput.optional(),
    employeeId: z.string().trim().max(128).optional().default(''),
    serviceId: z.string().trim().max(128).optional().default(''),
    date: zDate,
    expectedDate: zOptionalDate,
    priority: z.enum(PRIORITIES).optional().default('Normal'),
    status: z.enum(def.statuses as [string, ...string[]]).optional().default(def.defaultStatus),
    advance: zMoney.optional().default(0),
    paymentMode: zOptionalText(40),
    txnNumber: zTxnNumber,
    remarks: zOptionalText(2000),
  });
}

function commonUpdateSchema(def: ModuleDef) {
  return z.object({
    employeeId: z.string().trim().max(128).optional(),
    expectedDate: zOptionalDate.optional(),
    priority: z.enum(PRIORITIES).optional(),
    status: z.enum(def.statuses as [string, ...string[]]).optional(),
    remarks: zOptionalText(2000).optional(),
    reason: zOptionalText(500),
  });
}

function moduleKeyOf(req: { params: unknown }): string {
  return String((req.params as Record<string, unknown>).moduleKey ?? '');
}

function resolveModule(key: string): ModuleDef {
  const def = getModule(key);
  if (!def) throw notFound('Module');
  return def;
}

function canViewRecord(ctx: Ctx, r: Doc) {
  return can(ctx, 'orders.view_all') || r.employeeId === ctx.user.uid || r.createdBy === ctx.user.uid;
}

async function assertUnique(def: ModuleDef, data: Record<string, unknown>, selfId?: string) {
  for (const f of def.fields.filter((x) => x.unique)) {
    const v = String(data[f.name] ?? '').trim();
    if (!v) continue;
    const dups = await fetchAll(def.collection, { where: [f.name, '==', v] });
    const clash = dups.find((d) => d.id !== selfId && !d.deleted);
    if (clash) throw conflict(`${f.label} ${v} already exists on ${clash.recordNo}.`);
  }
}

async function buildItems(def: ModuleDef, data: Record<string, unknown>, serviceId: string, title: string): Promise<ItemInput[]> {
  let service: Doc | null = null;
  if (serviceId) {
    service = await fetchDoc(COL.services, serviceId);
    if (!service || service.category !== def.category) throw badRequest(`Select a valid ${def.category} service.`);
  } else {
    const candidates = await fetchAll(COL.services, { where: ['category', '==', def.category] });
    service = candidates.find((s) => s.status === 'Active') ?? null;
  }
  const total = def.computeTotal(data);
  const isQty = def.key === 'certificates';
  const quantity = isQty ? Math.max(1, Number(data.quantity) || 1) : 1;
  return [
    {
      serviceId: service?.id ?? '',
      serviceName: service?.name ?? def.singular,
      category: def.category as ItemInput['category'],
      description: title.slice(0, 300),
      quantity,
      unitPrice: isQty ? Number(data.price) || 0 : total,
      discount: 0,
      taxPercent: 0,
    },
  ];
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

modulesRouter.get('/', async (req, res) => {
  const def = resolveModule(moduleKeyOf(req));
  const q = listQuery.parse(req.query);
  const f = z
    .object({ status: z.string().optional(), employeeId: z.string().optional(), paymentStatus: z.string().optional(), paperType: z.string().optional() })
    .parse(req.query);
  const all = await fetchAll(def.collection, { dateField: 'date', from: q.from, to: q.to });
  const items = all.filter(
    (r) =>
      ((q.includeDeleted && can(req.ctx, 'records.restore')) || !r.deleted) &&
      canViewRecord(req.ctx, r) &&
      (!f.status || r.status === f.status) &&
      (!f.employeeId || r.employeeId === f.employeeId) &&
      (!f.paymentStatus || r.paymentStatus === f.paymentStatus) &&
      (!f.paperType || r.paperType === f.paperType),
  );
  const live = items.filter((r) => !r.deleted);
  const statusCounts: Record<string, number> = {};
  for (const r of live) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  res.json(
    listResponse(items, q, ['recordNo', 'orderNo', 'customerName', 'mobile', 'email', 'txnNumber', ...def.searchFields], 'createdAt', {
      totals: { total: sum(live, (r) => (r.orderStatus === 'Cancelled' ? 0 : r.totalAmount)), paid: sum(live, (r) => r.paidAmount), balance: sum(live, (r) => r.balance) },
      statusCounts,
    }),
  );
});

modulesRouter.post('/', requirePerm('orders.create'), async (req, res) => {
  const def = resolveModule(moduleKeyOf(req));
  const common = commonCreateSchema(def).parse(req.body);
  const data = specificSchema(def).parse(req.body) as Record<string, unknown>;
  await assertUnique(def, data);
  await linkMasterRecords(def, data);
  const title = String(data[def.titleField] ?? def.singular);
  const items = await buildItems(def, data, common.serviceId, title);

  const result = await createOrder(
    req.ctx,
    {
      customerId: common.customerId,
      newCustomer: common.newCustomer,
      items,
      employeeId: common.employeeId,
      orderDate: common.date,
      expectedDate: common.expectedDate,
      priority: common.priority,
      notes: common.remarks,
      advance: common.advance > 0 ? { amount: common.advance, mode: common.paymentMode, txnNumber: common.txnNumber, date: common.date } : undefined,
    },
    { def, data, status: common.status, remarks: common.remarks },
  );
  res.status(201).json(result);
});

modulesRouter.get('/:id', async (req, res) => {
  const def = resolveModule(moduleKeyOf(req));
  const record = await fetchDoc(def.collection, String(req.params.id));
  if (!record || (record.deleted && !can(req.ctx, 'records.restore'))) throw notFound(def.singular);
  if (!canViewRecord(req.ctx, record)) throw forbidden();
  const [order, payments] = await Promise.all([
    record.orderId ? fetchDoc(COL.orders, record.orderId) : Promise.resolve(null),
    record.orderId ? fetchAll(COL.payments, { where: ['orderId', '==', record.orderId] }) : Promise.resolve([]),
  ]);
  res.json({ record, order, payments: payments.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
});

modulesRouter.put('/:id', requirePerm('orders.edit'), async (req, res) => {
  const def = resolveModule(moduleKeyOf(req));
  const common = commonUpdateSchema(def).parse(req.body);
  const data = specificSchema(def).parse(req.body) as Record<string, unknown>;
  await assertUnique(def, data, String(req.params.id));
  const ctx = req.ctx;

  // Items are rebuilt only if the money fields change.
  const pre = await fetchDoc(def.collection, String(req.params.id));
  if (!pre) throw notFound(def.singular);
  await linkMasterRecords(def, data, pre);
  const moneyFields = [...def.amountFields, ...(def.key === 'certificates' ? ['quantity'] : [])];
  const moneyChanged = moneyFields.some((k) => Number(pre[k] ?? 0) !== Number(data[k] ?? 0));
  const newItems = moneyChanged ? await buildItems(def, data, '', String(data[def.titleField] ?? def.singular)) : undefined;

  const result = await db.runTransaction(async (tx) => {
    const ref = db.collection(def.collection).doc(String(req.params.id));
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound(def.singular);
    const before: Doc = { ...(snap.data() as Doc), id: snap.id };
    if (before.deleted) throw badRequest(`This ${def.singular.toLowerCase()} has been deleted.`);
    if (!canViewRecord(ctx, before)) throw forbidden();
    const oSnap = await tx.get(db.collection(COL.orders).doc(before.orderId));
    if (!oSnap.exists) throw notFound('Linked order');
    const order = oSnap.data() as OrderDoc;

    if (newItems && order.items[0]) {
      // Preserve the originally chosen catalogue service.
      newItems[0].serviceId = order.items[0].serviceId;
      newItems[0].serviceName = order.items[0].serviceName;
    }
    const statusChanged = common.status !== undefined && common.status !== before.status;
    const { after: orderAfter, commit } = await prepareOrderUpdate(ctx, order, {
      status: statusChanged ? moduleStatusToOrder(def, common.status!) : undefined,
      employeeId: common.employeeId,
      expectedDate: common.expectedDate,
      priority: common.priority,
      items: newItems,
      reason: common.reason,
    });

    const updatedFields: Record<string, unknown> = { ...data };
    if (common.status !== undefined) updatedFields.status = common.status;
    if (common.remarks !== undefined) updatedFields.remarks = common.remarks;
    if (common.expectedDate !== undefined) updatedFields.expectedDate = common.expectedDate;
    const after = { ...before, ...updatedFields, ...moduleMirror(orderAfter), updatedAt: nowIso(), updatedBy: ctx.user.uid };
    const d = diff(before, after, [...def.fields.map((f) => f.name), 'status', 'remarks', 'expectedDate', 'employeeName', 'totalAmount']);

    commit(tx, { moduleExtra: { ...updatedFields, updatedBy: ctx.user.uid } });
    if (d.changed.length) {
      writeAudit(tx, ctx, {
        action: moneyChanged ? 'amount_change' : statusChanged ? 'status_change' : 'update',
        module: def.key,
        recordId: before.id,
        recordLabel: before.recordNo,
        message: moneyChanged
          ? `${ctx.user.name} changed ${def.singular.toLowerCase()} ${before.recordNo} amount from ${formatINR(before.totalAmount)} to ${formatINR(orderAfter.totalAmount)}.`
          : `${ctx.user.name} updated ${def.singular.toLowerCase()} ${before.recordNo}: ${describeChanges(d.changed, d.oldValue, d.newValue)}.`,
        oldValue: d.oldValue,
        newValue: d.newValue,
        reason: common.reason,
      });
    }
    return after;
  });
  res.json(result);
});

/** Soft delete / restore goes through the linked order so money stays consistent. */
modulesRouter.delete('/:id', requirePerm('orders.delete'), async (req, res) => {
  const def = resolveModule(moduleKeyOf(req));
  const { reason } = z.object({ reason: zRequiredText('Reason', 500) }).parse(req.body ?? {});
  const record = await fetchDoc(def.collection, String(req.params.id));
  if (!record) throw notFound(def.singular);
  await softDeleteOrder(req.ctx, record.orderId, reason);
  res.json({ ok: true });
});

modulesRouter.post('/:id/restore', requirePerm('records.restore'), async (req, res) => {
  const def = resolveModule(moduleKeyOf(req));
  const record = await fetchDoc(def.collection, String(req.params.id));
  if (!record) throw notFound(def.singular);
  await restoreOrder(req.ctx, record.orderId);
  res.json({ ok: true });
});
