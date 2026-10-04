import { Router } from 'express';
import { z } from 'zod';
import { NOTIFICATION_TYPES, formatINR, sum, todayYMD } from '@pbms/shared';
import { db, COL } from '../firebase';
import { requirePerm } from '../middleware/auth';
import { can, type Ctx } from '../lib/context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { allocIds } from '../lib/ids';
import { writeAudit, diff, describeChanges } from '../lib/audit';
import { queueNotifications } from '../lib/notify';
import { getSettings } from '../lib/settings';
import { getUser, usersWithPermission } from '../lib/directory';
import { fetchAll, fetchDoc, listResponse, nowIso, type Doc } from '../lib/list';
import { listQuery, zDate, zOptionalText, zPositiveMoney, zRequiredText } from '../lib/validation';
import { queueLedger } from '../services/orders';

export const expensesRouter = Router();

const expenseInput = z.object({
  date: zDate,
  category: zRequiredText('Expense category', 60),
  description: zRequiredText('Description', 500),
  amount: zPositiveMoney,
  mode: zRequiredText('Payment mode', 40),
  receiptAttachmentId: z.string().trim().max(128).optional().default(''),
  remarks: zOptionalText(1000),
  employeeId: z.string().trim().max(128).optional().default(''),
  reason: zOptionalText(500),
});

function canViewExpense(ctx: Ctx, e: Doc) {
  return can(ctx, 'expenses.view_all') || e.employeeId === ctx.user.uid || e.createdBy === ctx.user.uid;
}

async function validateLists(category: string, mode: string) {
  const s = await getSettings();
  if (!s.expenseCategories.includes(category)) throw badRequest(`Unknown expense category "${category}".`);
  if (!s.paymentModes.includes(mode)) throw badRequest(`Unknown payment mode "${mode}".`);
}

function expenseLedger(tx: FirebaseFirestore.Transaction, ctx: Ctx, e: Doc, amount: number, description: string, date = e.date) {
  queueLedger(tx, ctx, {
    type: 'Expense',
    amount,
    date,
    description,
    refId: e.id,
    refNo: e.expenseNo,
    paymentMode: e.mode,
    employeeId: e.employeeId,
    employeeName: e.employeeName,
    category: e.category,
  });
}

expensesRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const f = z
    .object({ status: z.string().optional(), category: z.string().optional(), employeeId: z.string().optional(), mode: z.string().optional() })
    .parse(req.query);
  const all = await fetchAll(COL.expenses, { dateField: 'date', from: q.from, to: q.to });
  const items = all.filter(
    (e) =>
      ((q.includeDeleted && can(req.ctx, 'records.restore')) || !e.deleted) &&
      canViewExpense(req.ctx, e) &&
      (!f.status || e.approvalStatus === f.status) &&
      (!f.category || e.category === f.category) &&
      (!f.employeeId || e.employeeId === f.employeeId) &&
      (!f.mode || e.mode === f.mode),
  );
  const live = items.filter((e) => !e.deleted);
  res.json(
    listResponse(items, q, ['expenseNo', 'description', 'category', 'employeeName', 'remarks'], 'createdAt', {
      totals: {
        approved: sum(live.filter((e) => e.approvalStatus === 'Approved'), (e) => e.amount),
        pending: sum(live.filter((e) => e.approvalStatus === 'Pending'), (e) => e.amount),
        rejected: sum(live.filter((e) => e.approvalStatus === 'Rejected'), (e) => e.amount),
      },
    }),
  );
});

expensesRouter.post('/', requirePerm('expenses.create'), async (req, res) => {
  const input = expenseInput.parse(req.body);
  const ctx = req.ctx;
  await validateLists(input.category, input.mode);
  const employeeId = input.employeeId || ctx.user.uid;
  if (employeeId !== ctx.user.uid && !can(ctx, 'expenses.view_all')) throw forbidden('You can only submit your own expenses.');
  const employee = await getUser(employeeId);
  if (!employee) throw badRequest('Selected employee does not exist.');
  // The owner's own expenses need no one else's approval.
  const autoApprove = ctx.user.role === 'super_admin';
  const approvers = autoApprove ? [] : await usersWithPermission('expenses.approve');
  const ref = db.collection(COL.expenses).doc();

  const expense = await db.runTransaction(async (tx) => {
    const ids = await allocIds(tx, { expense: 1 });
    const now = nowIso();
    const { reason: _r, ...fields } = input;
    const e = {
      id: ref.id,
      expenseNo: ids.next('expense'),
      ...fields,
      employeeId: employee.id,
      employeeName: employee.name,
      approvalStatus: autoApprove ? 'Approved' : 'Pending',
      approvedBy: autoApprove ? ctx.user.uid : '',
      approvedByName: autoApprove ? ctx.user.name : '',
      approvedAt: autoApprove ? now : '',
      reviewRemarks: '',
      createdAt: now,
      createdBy: ctx.user.uid,
      createdByName: ctx.user.name,
      updatedAt: now,
      deleted: false,
    };
    ids.commit();
    tx.set(ref, e);
    if (autoApprove) expenseLedger(tx, ctx, e, e.amount, `Expense ${e.expenseNo} — ${e.category}: ${e.description}`);
    if (e.receiptAttachmentId) tx.set(db.collection(COL.attachments).doc(e.receiptAttachmentId), { entityType: 'expense', entityId: e.id }, { merge: true });
    writeAudit(tx, ctx, {
      action: 'create',
      module: 'expenses',
      recordId: e.id,
      recordLabel: e.expenseNo,
      message: `${ctx.user.name} submitted expense ${e.expenseNo} of ${formatINR(e.amount)} (${e.category})${autoApprove ? ' — auto-approved' : ''}.`,
      newValue: e,
    });
    queueNotifications(
      tx,
      approvers,
      {
        type: NOTIFICATION_TYPES.EXPENSE_SUBMITTED,
        title: 'Expense awaiting approval',
        message: `${employee.name}: ${formatINR(e.amount)} for ${e.category} — ${e.description}`,
        link: `/expenses?status=Pending`,
      },
      { excludeUid: ctx.user.uid },
    );
    return e;
  });
  res.status(201).json(expense);
});

expensesRouter.get('/:id', async (req, res) => {
  const e = await fetchDoc(COL.expenses, String(req.params.id));
  if (!e) throw notFound('Expense');
  if (!canViewExpense(req.ctx, e)) throw forbidden();
  res.json(e);
});

expensesRouter.put('/:id', requirePerm('expenses.create', 'expenses.approve'), async (req, res) => {
  const input = expenseInput.parse(req.body);
  const ctx = req.ctx;
  await validateLists(input.category, input.mode);
  const result = await db.runTransaction(async (tx) => {
    const ref = db.collection(COL.expenses).doc(String(req.params.id));
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Expense');
    const before = snap.data() as Doc;
    if (before.deleted) throw badRequest('This expense has been deleted.');
    if (!canViewExpense(ctx, before)) throw forbidden();
    if (before.approvalStatus !== 'Pending') {
      if (ctx.user.role !== 'super_admin') throw forbidden('Reviewed expenses can only be changed by the owner.');
      if (!input.reason) throw badRequest('Enter a reason for changing a reviewed expense.');
    } else if (before.employeeId !== ctx.user.uid && !can(ctx, 'expenses.approve')) {
      throw forbidden();
    }
    const { reason, employeeId: _e, ...fields } = input;
    const after = { ...before, ...fields, updatedAt: nowIso(), updatedBy: ctx.user.uid };
    const d = diff(before, after, ['date', 'category', 'description', 'amount', 'mode', 'receiptAttachmentId', 'remarks']);
    if (!d.changed.length) return before;
    tx.set(ref, after);
    if (before.approvalStatus === 'Approved' && after.amount !== before.amount) {
      expenseLedger(tx, ctx, after, after.amount - before.amount, `Expense ${before.expenseNo} corrected ${formatINR(before.amount)} → ${formatINR(after.amount)}: ${reason}`, todayYMD());
    }
    writeAudit(tx, ctx, {
      action: d.changed.includes('amount') ? 'amount_change' : 'update',
      module: 'expenses',
      recordId: before.id,
      recordLabel: before.expenseNo,
      message: `${ctx.user.name} updated expense ${before.expenseNo}: ${describeChanges(d.changed, d.oldValue, d.newValue)}.`,
      oldValue: d.oldValue,
      newValue: d.newValue,
      reason,
    });
    return after;
  });
  res.json(result);
});

expensesRouter.put('/:id/approve', requirePerm('expenses.approve'), async (req, res) => {
  const { decision, remarks } = z
    .object({ decision: z.enum(['Approved', 'Rejected']).default('Approved'), remarks: zOptionalText(500) })
    .parse(req.body ?? {});
  const ctx = req.ctx;
  const result = await db.runTransaction(async (tx) => {
    const ref = db.collection(COL.expenses).doc(String(req.params.id));
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Expense');
    const before = snap.data() as Doc;
    if (before.deleted) throw badRequest('This expense has been deleted.');
    if (before.approvalStatus !== 'Pending') throw badRequest(`This expense is already ${before.approvalStatus.toLowerCase()}.`);
    if (before.employeeId === ctx.user.uid && ctx.user.role !== 'super_admin') throw forbidden('You cannot approve your own expense.');
    if (decision === 'Rejected' && !remarks) throw badRequest('Enter a reason for rejecting this expense.');
    const now = nowIso();
    const after: Doc = { ...before, approvalStatus: decision, approvedBy: ctx.user.uid, approvedByName: ctx.user.name, approvedAt: now, reviewRemarks: remarks, updatedAt: now };
    tx.set(ref, after);
    if (decision === 'Approved') expenseLedger(tx, ctx, after, after.amount, `Expense ${after.expenseNo} — ${after.category}: ${after.description}`);
    writeAudit(tx, ctx, {
      action: decision === 'Approved' ? 'approve' : 'reject',
      module: 'expenses',
      recordId: before.id,
      recordLabel: before.expenseNo,
      message: `${ctx.user.name} ${decision.toLowerCase()} expense ${before.expenseNo} of ${formatINR(before.amount)} (${before.employeeName}).`,
      oldValue: { approvalStatus: 'Pending' },
      newValue: { approvalStatus: decision },
      reason: remarks,
    });
    queueNotifications(
      tx,
      [before.employeeId],
      {
        type: decision === 'Approved' ? NOTIFICATION_TYPES.EXPENSE_APPROVED : NOTIFICATION_TYPES.EXPENSE_REJECTED,
        title: `Expense ${decision.toLowerCase()}`,
        message: `${before.expenseNo}: ${formatINR(before.amount)} for ${before.category}${remarks ? ` — ${remarks}` : ''}`,
        link: '/expenses',
      },
      { excludeUid: ctx.user.uid },
    );
    return after;
  });
  res.json(result);
});

expensesRouter.delete('/:id', requirePerm('expenses.delete'), async (req, res) => {
  const { reason } = z.object({ reason: zRequiredText('Reason', 500) }).parse(req.body ?? {});
  const ctx = req.ctx;
  await db.runTransaction(async (tx) => {
    const ref = db.collection(COL.expenses).doc(String(req.params.id));
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Expense');
    const e = snap.data() as Doc;
    if (e.deleted) throw badRequest('This expense is already deleted.');
    tx.update(ref, { deleted: true, deletedAt: nowIso(), deletedBy: ctx.user.uid, deleteReason: reason });
    if (e.approvalStatus === 'Approved') expenseLedger(tx, ctx, e, -e.amount, `Expense ${e.expenseNo} deleted: ${reason}`, todayYMD());
    writeAudit(tx, ctx, {
      action: 'delete',
      module: 'expenses',
      recordId: e.id,
      recordLabel: e.expenseNo,
      message: `${ctx.user.name} deleted expense ${e.expenseNo} of ${formatINR(e.amount)}.`,
      oldValue: { deleted: false },
      newValue: { deleted: true },
      reason,
    });
  });
  res.json({ ok: true });
});

expensesRouter.post('/:id/restore', requirePerm('records.restore'), async (req, res) => {
  const ctx = req.ctx;
  await db.runTransaction(async (tx) => {
    const ref = db.collection(COL.expenses).doc(String(req.params.id));
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Expense');
    const e = snap.data() as Doc;
    if (!e.deleted) throw badRequest('This expense is not deleted.');
    tx.update(ref, { deleted: false, deletedAt: '', deletedBy: '', deleteReason: '' });
    if (e.approvalStatus === 'Approved') expenseLedger(tx, ctx, e, e.amount, `Expense ${e.expenseNo} restored`, todayYMD());
    writeAudit(tx, ctx, {
      action: 'restore',
      module: 'expenses',
      recordId: e.id,
      recordLabel: e.expenseNo,
      message: `${ctx.user.name} restored expense ${e.expenseNo}.`,
      oldValue: { deleted: true },
      newValue: { deleted: false },
    });
  });
  res.json({ ok: true });
});
