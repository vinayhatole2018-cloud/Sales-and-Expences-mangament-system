import { Router } from 'express';
import { z } from 'zod';
import { SERVICE_CATEGORIES, formatINR, round2 } from '@pbms/shared';
import { db, COL } from '../firebase';
import { requirePerm } from '../middleware/auth';
import { can } from '../lib/context';
import { conflict, notFound } from '../lib/errors';
import { allocIds } from '../lib/ids';
import { writeAudit, diff, describeChanges } from '../lib/audit';
import { fetchAll, listResponse, nowIso, type Doc } from '../lib/list';
import { listQuery, zMoney, zOptionalText, zRequiredText } from '../lib/validation';

export const servicesRouter = Router();

const serviceInput = z.object({
  name: zRequiredText('Service name', 150),
  category: z.enum(SERVICE_CATEGORIES, { errorMap: () => ({ message: 'Select a valid category.' }) }),
  description: zOptionalText(1000),
  basePrice: zMoney,
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  status: z.enum(['Active', 'Inactive']).default('Active'),
});

servicesRouter.get('/', async (req, res) => {
  const q = listQuery.parse({ pageSize: 500, ...req.query });
  const { category, status } = z.object({ category: z.string().optional(), status: z.string().optional() }).parse(req.query);
  let services = await fetchAll(COL.services);
  services = services.filter((s) => (!category || s.category === category) && (!status || s.status === status));

  if (can(req.ctx, 'finance.view_all')) {
    const orders = await fetchAll(COL.orders, { dateField: 'orderDate', from: q.from, to: q.to });
    const perf = new Map<string, { orders: number; quantity: number; revenue: number; collected: number }>();
    for (const o of orders) {
      if (o.deleted || o.status === 'Cancelled') continue;
      for (const it of o.items ?? []) {
        if (!it.serviceId) continue;
        const p = perf.get(it.serviceId) ?? { orders: 0, quantity: 0, revenue: 0, collected: 0 };
        p.orders += 1;
        p.quantity += it.quantity;
        p.revenue = round2(p.revenue + it.amount);
        p.collected = round2(p.collected + (o.totalAmount > 0 ? (it.amount / o.totalAmount) * o.paidAmount : 0));
        perf.set(it.serviceId, p);
      }
    }
    services = services.map((s) => ({ ...s, performance: perf.get(s.id) ?? { orders: 0, quantity: 0, revenue: 0, collected: 0 } }));
  }
  res.json(listResponse(services, q, ['serviceNo', 'name', 'category', 'description'], 'category', {}));
});

servicesRouter.post('/', requirePerm('services.manage'), async (req, res) => {
  const input = serviceInput.parse(req.body);
  const ctx = req.ctx;
  const ref = db.collection(COL.services).doc();
  const service = await db.runTransaction(async (tx) => {
    const dup = await tx.get(db.collection(COL.services).where('nameLower', '==', input.name.toLowerCase()).limit(1));
    if (!dup.empty) throw conflict('A service with this name already exists.');
    const ids = await allocIds(tx, { service: 1 });
    const now = nowIso();
    const s = { id: ref.id, serviceNo: ids.next('service'), ...input, nameLower: input.name.toLowerCase(), createdAt: now, createdBy: ctx.user.uid, updatedAt: now };
    ids.commit();
    tx.set(ref, s);
    writeAudit(tx, ctx, {
      action: 'create',
      module: 'services',
      recordId: s.id,
      recordLabel: s.serviceNo,
      message: `${ctx.user.name} created service ${s.name} (${s.category}) at ${formatINR(s.basePrice)}.`,
      newValue: s,
    });
    return s;
  });
  res.status(201).json(service);
});

servicesRouter.put('/:id', requirePerm('services.manage'), async (req, res) => {
  const input = serviceInput.parse(req.body);
  const ctx = req.ctx;
  const result = await db.runTransaction(async (tx) => {
    const ref = db.collection(COL.services).doc(String(req.params.id));
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Service');
    const before = snap.data() as Doc;
    if (input.name.toLowerCase() !== before.nameLower) {
      const dup = await tx.get(db.collection(COL.services).where('nameLower', '==', input.name.toLowerCase()).limit(1));
      if (!dup.empty) throw conflict('A service with this name already exists.');
    }
    const after = { ...before, ...input, nameLower: input.name.toLowerCase(), updatedAt: nowIso(), updatedBy: ctx.user.uid };
    const d = diff(before, after, Object.keys(serviceInput.shape));
    if (!d.changed.length) return before;
    tx.set(ref, after);
    writeAudit(tx, ctx, {
      action: d.changed.includes('basePrice') ? 'price_change' : 'update',
      module: 'services',
      recordId: ref.id,
      recordLabel: before.serviceNo,
      message: `${ctx.user.name} updated service ${before.name}: ${describeChanges(d.changed, d.oldValue, d.newValue)}.`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
    return after;
  });
  res.json(result);
});
