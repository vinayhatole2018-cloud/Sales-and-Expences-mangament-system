import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { DEFAULT_SETTINGS, getSettings, saveSettings, type BusinessSettings } from '../lib/settings';
import { NOTIFICATION_TYPES, formatINR, MODULE_LIST } from '@pbms/shared';
import { db, COL } from '../firebase';
import { requirePerm } from '../middleware/auth';
import { can } from '../lib/context';
import { badRequest } from '../lib/errors';
import { audit, diff, describeChanges } from '../lib/audit';
import { fetchAll, listResponse, matchesSearch, nowIso, type Doc } from '../lib/list';
import { listQuery, zOptionalEmail, zOptionalText, zRequiredText } from '../lib/validation';
import { canViewOrder } from '../services/orders';
import { canViewCustomer } from './customers';
import { createBackup, listBackups, readBackup, restoreBackup } from '../services/backups';

// --------------------------------------------------------------- settings ---

export const settingsRouter = Router();

const settingsInput = z.object({
  businessName: zRequiredText('Business name', 120),
  tagline: zOptionalText(200),
  logoAttachmentId: z.string().trim().max(128).optional().default(''),
  address: zOptionalText(400),
  phone: zOptionalText(40),
  email: zOptionalEmail,
  website: zOptionalText(120),
  gstEnabled: z.boolean().default(false),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), 'Enter a valid 15 character GSTIN.')
    .optional()
    .default(''),
  defaultTaxPercent: z.coerce.number().min(0).max(100).default(0),
  invoicePrefix: z.string().trim().min(1, 'Invoice prefix is required.').max(8).regex(/^[A-Z0-9]+$/i, 'Prefix may only contain letters and digits.').transform((v) => v.toUpperCase()),
  orderPrefix: z.string().trim().min(1, 'Order prefix is required.').max(8).regex(/^[A-Z0-9]+$/i, 'Prefix may only contain letters and digits.').transform((v) => v.toUpperCase()),
  paymentModes: z.array(z.string().trim().min(1).max(40)).min(1, 'Keep at least one payment mode.').max(20),
  expenseCategories: z.array(z.string().trim().min(1).max(60)).min(1, 'Keep at least one expense category.').max(50),
  allowOverpayment: z.boolean().default(false),
  maxEmployeeDiscountPercent: z.coerce.number().min(0).max(100).default(20),
  invoiceTerms: zOptionalText(3000),
  authorizedSignatory: zOptionalText(120),
  notifications: z.record(z.enum(Object.values(NOTIFICATION_TYPES) as [string, ...string[]]), z.boolean()).default({}),
  deadlineReminderDays: z.coerce.number().int().min(0).max(30).default(2),
  pendingPaymentReminderDays: z.coerce.number().int().min(1).max(90).default(7),
  backup: z.object({ enabled: z.boolean(), hour: z.coerce.number().int().min(0).max(23), keep: z.coerce.number().int().min(1).max(90) }),
});

settingsRouter.get('/', async (req, res) => {
  const s = await getSettings();
  // Every signed-in user needs lists (payment modes, categories) and branding; only admins see the rest.
  if (can(req.ctx, 'settings.manage')) return res.json(s);
  res.json({
    businessName: s.businessName,
    tagline: s.tagline,
    logoAttachmentId: s.logoAttachmentId,
    paymentModes: s.paymentModes,
    expenseCategories: s.expenseCategories,
    maxEmployeeDiscountPercent: s.maxEmployeeDiscountPercent,
    allowOverpayment: s.allowOverpayment,
    defaultTaxPercent: s.defaultTaxPercent,
    gstEnabled: s.gstEnabled,
  });
});

settingsRouter.put('/', requirePerm('settings.manage'), async (req, res) => {
  const input = settingsInput.parse(req.body);
  const before = await getSettings();
  const next: BusinessSettings = {
    ...DEFAULT_SETTINGS,
    ...before,
    ...input,
    paymentModes: Array.from(new Set(input.paymentModes)),
    expenseCategories: Array.from(new Set(input.expenseCategories)),
    notifications: { ...before.notifications, ...input.notifications } as BusinessSettings['notifications'],
    updatedAt: nowIso(),
    updatedBy: req.ctx.user.uid,
  };
  if (next.gstEnabled && !next.gstin) throw badRequest('Enter the GSTIN or turn GST off.');
  const d = diff(before as any, next as any, Object.keys(settingsInput.shape));
  await saveSettings(next);
  if (d.changed.length) {
    await audit(req.ctx, {
      action: 'update',
      module: 'settings',
      recordId: 'business',
      recordLabel: 'Business settings',
      message: `${req.ctx.user.name} changed settings: ${describeChanges(d.changed, d.oldValue, d.newValue)}.`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
  }
  res.json(next);
});

// ---------------------------------------------------------- notifications ---

export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const { unread } = z.object({ unread: z.string().optional() }).parse(req.query);
  const items = (await fetchAll(COL.notifications, { where: ['userId', '==', req.ctx.user.uid] })).filter((n) => unread !== 'true' || !n.read);
  res.json(listResponse(items, q, ['title', 'message'], 'createdAt', { unreadCount: items.filter((n) => !n.read).length }));
});

notificationsRouter.get('/unread-count', async (req, res) => {
  const items = await fetchAll(COL.notifications, { where: ['userId', '==', req.ctx.user.uid] });
  const unread = items.filter((n) => !n.read).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ count: unread.length, latest: unread.slice(0, 5) });
});

notificationsRouter.post('/read', async (req, res) => {
  const { ids, all } = z.object({ ids: z.array(z.string()).max(500).optional().default([]), all: z.boolean().optional().default(false) }).parse(req.body ?? {});
  const mine = await fetchAll(COL.notifications, { where: ['userId', '==', req.ctx.user.uid] });
  const targets = mine.filter((n) => !n.read && (all || ids.includes(n.id)));
  for (let i = 0; i < targets.length; i += 400) {
    const batch = db.batch();
    for (const n of targets.slice(i, i + 400)) batch.update(db.collection(COL.notifications).doc(n.id), { read: true, readAt: nowIso() });
    await batch.commit();
  }
  res.json({ updated: targets.length });
});

// -------------------------------------------------------------- audit log ---

export const auditRouter = Router();

auditRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const f = z
    .object({ module: z.string().optional(), userId: z.string().optional(), action: z.string().optional(), recordId: z.string().optional() })
    .parse(req.query);
  // Record history on detail pages is visible to anyone who can see the record; the full log needs audit.view.
  if (!f.recordId && !can(req.ctx, 'audit.view')) return res.status(403).json({ error: 'You do not have permission to view audit logs.' });
  const items = f.recordId
    ? await fetchAll(COL.auditLogs, { where: ['recordId', '==', f.recordId] })
    : await fetchAll(COL.auditLogs, { dateField: 'date', from: q.from, to: q.to });
  const filtered = items.filter(
    (a) => (!f.module || a.module === f.module) && (!f.userId || a.userId === f.userId) && (!f.action || a.action === f.action),
  );
  res.json(listResponse(filtered, q, ['message', 'userName', 'recordLabel', 'module', 'action', 'reason'], 'at'));
});

// ----------------------------------------------------------------- search ---

export const searchRouter = Router();

/** Short-lived cache so type-ahead search doesn't re-read collections on every keystroke. */
const searchCache = new Map<string, { at: number; docs: Doc[] }>();
async function cached(col: string): Promise<Doc[]> {
  const hit = searchCache.get(col);
  if (hit && Date.now() - hit.at < 15_000) return hit.docs;
  const docs = (await fetchAll(col)).filter((d) => !d.deleted);
  searchCache.set(col, { at: Date.now(), docs });
  return docs;
}

searchRouter.get('/', async (req, res) => {
  const { q } = z.object({ q: z.string().trim().min(2, 'Type at least 2 characters.').max(100) }).parse(req.query);
  const ctx = req.ctx;
  const needle = q.replace(/\s+/g, ' ');
  const digits = needle.replace(/\D/g, '');
  const LIMIT = 6;
  const results: { group: string; items: { id: string; title: string; subtitle: string; link: string; badge?: string }[] }[] = [];

  const [customers, orders, payments, colleges] = await Promise.all([cached(COL.customers), cached(COL.orders), cached(COL.payments), cached(COL.colleges)]);

  const phoneMatch = (v?: string) => digits.length >= 4 && (v ?? '').replace(/\D/g, '').includes(digits);

  results.push({
    group: 'Customers',
    items: customers
      .filter((c) => canViewCustomer(ctx, c) && (matchesSearch(c, ['name', 'email', 'customerNo', 'collegeName'], needle) || phoneMatch(c.mobile) || phoneMatch(c.altMobile)))
      .slice(0, LIMIT)
      .map((c) => ({ id: c.id, title: c.name, subtitle: [c.customerNo, c.mobile, c.collegeName].filter(Boolean).join(' • '), link: `/customers/${c.id}`, badge: c.balance > 0 ? `Due ${formatINR(c.balance, false)}` : undefined })),
  });
  results.push({
    group: 'Orders',
    items: orders
      .filter((o) => canViewOrder(ctx, o as any) && (matchesSearch(o, ['orderNo', 'customerName', 'moduleRecordNo', 'saleNo', 'lastTxnNumber', 'customerEmail'], needle) || phoneMatch(o.customerMobile)))
      .slice(0, LIMIT)
      .map((o) => ({ id: o.id, title: `${o.orderNo} — ${o.customerName}`, subtitle: `${o.serviceSummary} • ${formatINR(o.totalAmount, false)}`, link: `/orders/${o.id}`, badge: o.status })),
  });
  results.push({
    group: 'Payments',
    items: payments
      .filter((p) => (can(ctx, 'payments.view_all') || p.employeeId === ctx.user.uid || p.orderEmployeeId === ctx.user.uid) && matchesSearch(p, ['paymentNo', 'txnNumber', 'orderNo'], needle))
      .slice(0, LIMIT)
      .map((p) => ({ id: p.id, title: `${p.paymentNo} — ${formatINR(p.amount, false)}`, subtitle: `${p.customerName} • ${p.orderNo} • ${p.mode}${p.txnNumber ? ` • ${p.txnNumber}` : ''}`, link: `/orders/${p.orderId}`, badge: p.voided ? 'Voided' : p.type })),
  });
  for (const m of MODULE_LIST) {
    const docs = await cached(m.collection);
    results.push({
      group: m.label,
      items: docs
        .filter((r) => (can(ctx, 'orders.view_all') || r.employeeId === ctx.user.uid || r.createdBy === ctx.user.uid) && (matchesSearch(r, ['recordNo', 'orderNo', 'customerName', 'email', 'txnNumber', ...m.searchFields], needle) || phoneMatch(r.mobile)))
        .slice(0, LIMIT)
        .map((r) => ({ id: r.id, title: `${r.recordNo} — ${String(r[m.titleField] ?? '')}`.slice(0, 120), subtitle: `${r.customerName}${r.isbn ? ` • ISBN ${r.isbn}` : ''}`, link: `/m/${m.key}/${r.id}`, badge: r.status })),
    });
  }
  const events = await cached(COL.conferenceEvents);
  results.push({
    group: 'Conferences',
    items: events
      .filter((e) => matchesSearch(e, ['name', 'code', 'conferenceNo', 'organizerName', 'city', 'theme'], needle))
      .slice(0, LIMIT)
      .map((e) => ({ id: e.id, title: `${e.name} (${e.code})`, subtitle: [e.conferenceNo, e.organizerName, e.startDate?.split('-').reverse().join('/')].filter(Boolean).join(' • '), link: `/conferences/${e.id}`, badge: e.status })),
  });
  if (can(ctx, 'colleges.view') || can(ctx, 'colleges.manage')) {
    results.push({
      group: 'Colleges',
      items: colleges
        .filter((c) => matchesSearch(c, ['name', 'collegeNo', 'city', 'contactPerson'], needle) || phoneMatch(c.mobile))
        .slice(0, LIMIT)
        .map((c) => ({ id: c.id, title: c.name, subtitle: [c.collegeNo, c.city].filter(Boolean).join(' • '), link: `/colleges/${c.id}` })),
    });
  }
  res.json({ q, results: results.filter((r) => r.items.length) });
});

// ---------------------------------------------------------------- backups ---

export const backupsRouter = Router();
const restoreUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024, files: 1 } });

backupsRouter.get('/', requirePerm('backup.manage'), async (_req, res) => {
  res.json(await listBackups());
});

/** Creates a backup now, stores it in Cloud Storage and streams it to the browser. */
backupsRouter.post('/', requirePerm('backup.manage'), async (req, res) => {
  const { name, buffer } = await createBackup(req.ctx, 'manual');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buffer);
});

backupsRouter.get('/:name', requirePerm('backup.manage'), async (req, res) => {
  const buf = await readBackup(String(req.params.name));
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${String(req.params.name)}"`);
  res.send(buf);
});

backupsRouter.post('/restore', requirePerm('backup.manage'), restoreUpload.single('file'), async (req, res) => {
  const { confirm } = z.object({ confirm: z.literal('RESTORE', { errorMap: () => ({ message: 'Type RESTORE to confirm.' }) }) }).parse(req.body ?? {});
  if (!req.file) throw badRequest('Choose a backup file.');
  void confirm;
  res.json(await restoreBackup(req.ctx, req.file.buffer));
});

