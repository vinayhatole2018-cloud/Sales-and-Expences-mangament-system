import { Router } from 'express';
import { z } from 'zod';
import {
  CONFERENCE_LEVELS,
  CONFERENCE_MODES,
  CONFERENCE_OPEN_STATUSES,
  CONFERENCE_STATUSES,
  MODULES,
  NOTIFICATION_TYPES,
  formatDateDisplay,
  sum,
  type ConferenceStatus,
} from '@pbms/shared';
import { db, COL } from '../firebase';
import { requirePerm } from '../middleware/auth';
import { can, type Ctx } from '../lib/context';
import { badRequest, conflict, notFound } from '../lib/errors';
import { allocIds } from '../lib/ids';
import { writeAudit, diff, describeChanges } from '../lib/audit';
import { queueNotifications } from '../lib/notify';
import { getUsers } from '../lib/directory';
import { fetchAll, fetchDoc, listResponse, nowIso, type Doc } from '../lib/list';
import {
  listQuery,
  zDate,
  zMoney,
  zOptionalDate,
  zOptionalEmail,
  zOptionalMobile,
  zOptionalText,
  zRequiredText,
} from '../lib/validation';

/*
 * Conference master. Super Admin and Managers (permission
 * `conferences.manage`) create, edit and delete conferences; every signed-in
 * employee can view them and register papers/authors against them.
 */
export const conferenceEventsRouter = Router();

/** Collection holding registrations (papers / authors) for conferences. */
const REG_COL = MODULES.conferences.collection;

const eventInput = z
  .object({
    name: zRequiredText('Conference name', 200),
    code: z
      .string({ required_error: 'Conference code is required.' })
      .trim()
      .min(1, 'Conference code is required.')
      .max(40)
      .regex(/^[A-Za-z0-9][A-Za-z0-9\-_/ .]*$/, 'Code may contain letters, digits, spaces and - _ / .'),
    level: z.enum(CONFERENCE_LEVELS).default('National'),
    theme: zOptionalText(500),
    organizerCollegeId: z.string().trim().max(128).optional().default(''),
    organizerName: zOptionalText(200),
    mode: z.enum(CONFERENCE_MODES).default('Offline'),
    venue: zOptionalText(300),
    city: zOptionalText(80),
    startDate: zDate,
    endDate: zOptionalDate,
    registrationDeadline: zOptionalDate,
    registrationFee: zMoney.optional().default(0),
    publicationFee: zMoney.optional().default(0),
    publicationDetails: zOptionalText(300),
    coordinatorName: zOptionalText(120),
    coordinatorMobile: zOptionalMobile,
    coordinatorEmail: zOptionalEmail,
    status: z.enum(CONFERENCE_STATUSES).default('Upcoming'),
    notes: zOptionalText(2000),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: 'End date cannot be before the start date.', path: ['endDate'] });

type EventInput = z.infer<typeof eventInput>;

async function resolveOrganizer(input: EventInput) {
  if (!input.organizerCollegeId) return { organizerCollegeId: '', organizerName: input.organizerName };
  const college = await fetchDoc(COL.colleges, input.organizerCollegeId);
  if (!college || college.deleted) throw badRequest('Selected organising college does not exist.');
  return { organizerCollegeId: college.id, organizerName: college.name };
}

async function assertCodeUnique(code: string, selfId?: string) {
  const dup = await fetchAll(COL.conferenceEvents, { where: ['codeLower', '==', code.toLowerCase()] });
  const clash = dup.find((d) => d.id !== selfId && !d.deleted);
  if (clash) throw conflict(`Conference code ${code} is already used by ${clash.name}.`);
}

function canSeeRegistration(ctx: Ctx, r: Doc) {
  return can(ctx, 'orders.view_all') || r.employeeId === ctx.user.uid || r.createdBy === ctx.user.uid;
}

/** Registrations grouped by conference (excluding deleted and cancelled). */
async function registrationStats() {
  const regs = (await fetchAll(REG_COL)).filter((r) => !r.deleted && r.status !== 'Cancelled');
  const byEvent = new Map<string, Doc[]>();
  for (const r of regs) {
    if (!r.conferenceEventId) continue;
    const list = byEvent.get(r.conferenceEventId) ?? [];
    list.push(r);
    byEvent.set(r.conferenceEventId, list);
  }
  return byEvent;
}

export function isOpenForRegistration(e: Doc): boolean {
  return !e.deleted && CONFERENCE_OPEN_STATUSES.includes(e.status as ConferenceStatus);
}

// ------------------------------------------------------------------- list ---

conferenceEventsRouter.get('/', async (req, res) => {
  const ctx = req.ctx;
  const q = listQuery.parse(req.query);
  const f = z.object({ status: z.string().optional(), mode: z.string().optional(), level: z.string().optional(), open: z.string().optional() }).parse(req.query);
  const [events, stats] = await Promise.all([fetchAll(COL.conferenceEvents, { dateField: 'startDate', from: q.from, to: q.to }), registrationStats()]);
  const showMoney = can(ctx, 'finance.view_all');
  const items = events
    .filter(
      (e) =>
        ((q.includeDeleted && can(ctx, 'conferences.manage')) || !e.deleted) &&
        (!f.status || e.status === f.status) &&
        (!f.mode || e.mode === f.mode) &&
        (!f.level || e.level === f.level) &&
        (f.open !== 'true' || isOpenForRegistration(e)),
    )
    .map((e) => {
      const regs = stats.get(e.id) ?? [];
      return {
        ...e,
        registrations: regs.length,
        myRegistrations: regs.filter((r) => r.employeeId === ctx.user.uid).length,
        revenue: showMoney ? sum(regs, (r) => r.totalAmount) : null,
        pending: showMoney ? sum(regs, (r) => r.balance) : null,
        openForRegistration: isOpenForRegistration(e),
      };
    });
  res.json(listResponse(items, q, ['conferenceNo', 'name', 'code', 'organizerName', 'city', 'venue', 'theme', 'coordinatorName'], 'startDate'));
});

/** Compact list for the registration form's conference picker. */
conferenceEventsRouter.get('/options', async (_req, res) => {
  const events = await fetchAll(COL.conferenceEvents);
  res.json(
    events
      .filter((e) => !e.deleted && e.status !== 'Cancelled')
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((e) => ({
        id: e.id,
        conferenceNo: e.conferenceNo,
        name: e.name,
        code: e.code,
        organizerName: e.organizerName,
        startDate: e.startDate,
        status: e.status,
        registrationFee: e.registrationFee,
        publicationFee: e.publicationFee,
        openForRegistration: isOpenForRegistration(e),
      })),
  );
});

conferenceEventsRouter.get('/:id', async (req, res) => {
  const ctx = req.ctx;
  const event = await fetchDoc(COL.conferenceEvents, String(req.params.id));
  if (!event || (event.deleted && !can(ctx, 'conferences.manage'))) throw notFound('Conference');
  const all = (await fetchAll(REG_COL, { where: ['conferenceEventId', '==', event.id] })).filter((r) => !r.deleted);
  const active = all.filter((r) => r.status !== 'Cancelled');
  const visible = all.filter((r) => canSeeRegistration(ctx, r)).sort((a, b) => b.date.localeCompare(a.date));
  const showMoney = can(ctx, 'finance.view_all');
  const money = showMoney ? active : active.filter((r) => canSeeRegistration(ctx, r));
  res.json({
    event: { ...event, openForRegistration: isOpenForRegistration(event) },
    registrations: visible,
    summary: {
      registrations: active.length,
      authors: active.reduce((a, r) => a + Math.max((r.authors ?? []).length, 1), 0),
      myRegistrations: active.filter((r) => r.employeeId === ctx.user.uid).length,
      revenue: sum(money, (r) => r.totalAmount),
      collected: sum(money, (r) => r.paidAmount),
      pending: sum(money, (r) => r.balance),
      scope: showMoney ? 'all' : 'own',
    },
  });
});

// ------------------------------------------------------------------ write ---

conferenceEventsRouter.post('/', requirePerm('conferences.manage'), async (req, res) => {
  const ctx = req.ctx;
  const input = eventInput.parse(req.body);
  await assertCodeUnique(input.code);
  const organizer = await resolveOrganizer(input);
  const everyone = (await getUsers()).filter((u) => u.status === 'Active' && !u.deleted).map((u) => u.id);
  const ref = db.collection(COL.conferenceEvents).doc();

  const event = await db.runTransaction(async (tx) => {
    const ids = await allocIds(tx, { conference: 1 });
    const now = nowIso();
    const e = {
      id: ref.id,
      conferenceNo: ids.next('conference'),
      ...input,
      ...organizer,
      codeLower: input.code.toLowerCase(),
      nameLower: input.name.toLowerCase(),
      createdAt: now,
      createdBy: ctx.user.uid,
      createdByName: ctx.user.name,
      updatedAt: now,
      deleted: false,
    };
    ids.commit();
    tx.set(ref, e);
    writeAudit(tx, ctx, {
      action: 'create',
      module: 'conference-events',
      recordId: e.id,
      recordLabel: e.conferenceNo,
      message: `${ctx.user.name} added conference ${e.name} (${e.code}) starting ${formatDateDisplay(e.startDate)}.`,
      newValue: e,
    });
    queueNotifications(
      tx,
      everyone,
      {
        type: NOTIFICATION_TYPES.CONFERENCE_ADDED,
        title: 'New conference added',
        message: `${e.name} (${e.code}) — ${formatDateDisplay(e.startDate)}${e.organizerName ? `, ${e.organizerName}` : ''}`,
        link: `/conferences/${e.id}`,
      },
      { excludeUid: ctx.user.uid },
    );
    return e;
  });
  res.status(201).json(event);
});

conferenceEventsRouter.put('/:id', requirePerm('conferences.manage'), async (req, res) => {
  const ctx = req.ctx;
  const id = String(req.params.id);
  const input = eventInput.parse(req.body);
  await assertCodeUnique(input.code, id);
  const organizer = await resolveOrganizer(input);

  const result = await db.runTransaction(async (tx) => {
    const ref = db.collection(COL.conferenceEvents).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Conference');
    const before = snap.data() as Doc;
    if (before.deleted) throw badRequest('This conference has been deleted. Restore it first.');
    const after: Doc = {
      ...before,
      ...input,
      ...organizer,
      codeLower: input.code.toLowerCase(),
      nameLower: input.name.toLowerCase(),
      updatedAt: nowIso(),
      updatedBy: ctx.user.uid,
    };
    const d = diff(before, after, [...Object.keys(eventInput.innerType().shape), 'organizerName']);
    if (!d.changed.length) return before;
    tx.set(ref, after);
    writeAudit(tx, ctx, {
      action: d.changed.includes('status') ? 'status_change' : 'update',
      module: 'conference-events',
      recordId: id,
      recordLabel: before.conferenceNo,
      message: `${ctx.user.name} updated conference ${before.name}: ${describeChanges(d.changed, d.oldValue, d.newValue)}.`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
    return after;
  });

  // Keep the conference details shown on registrations in step with the master.
  const regs = await fetchAll(REG_COL, { where: ['conferenceEventId', '==', id] });
  const stale = regs.filter((r) => r.conferenceName !== result.name || r.conferenceNumber !== result.code || r.collegeName !== result.organizerName);
  for (let i = 0; i < stale.length; i += 400) {
    const batch = db.batch();
    for (const r of stale.slice(i, i + 400)) {
      batch.update(db.collection(REG_COL).doc(r.id), { conferenceName: result.name, conferenceNumber: result.code, collegeName: result.organizerName });
    }
    await batch.commit();
  }
  res.json(result);
});

conferenceEventsRouter.delete('/:id', requirePerm('conferences.manage'), async (req, res) => {
  const ctx = req.ctx;
  const id = String(req.params.id);
  const { reason } = z.object({ reason: zRequiredText('Reason', 500) }).parse(req.body ?? {});
  const active = (await fetchAll(REG_COL, { where: ['conferenceEventId', '==', id] })).filter((r) => !r.deleted && r.status !== 'Cancelled');
  if (active.length) {
    throw badRequest(`This conference has ${active.length} active registration${active.length === 1 ? '' : 's'}. Set its status to Cancelled instead, or cancel the registrations first.`);
  }
  await db.runTransaction(async (tx) => {
    const ref = db.collection(COL.conferenceEvents).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Conference');
    const e = snap.data() as Doc;
    if (e.deleted) throw badRequest('This conference is already deleted.');
    tx.update(ref, { deleted: true, deletedAt: nowIso(), deletedBy: ctx.user.uid, deleteReason: reason });
    writeAudit(tx, ctx, {
      action: 'delete',
      module: 'conference-events',
      recordId: id,
      recordLabel: e.conferenceNo,
      message: `${ctx.user.name} deleted conference ${e.name} (${e.code}).`,
      oldValue: { deleted: false },
      newValue: { deleted: true },
      reason,
    });
  });
  res.json({ ok: true });
});

conferenceEventsRouter.post('/:id/restore', requirePerm('conferences.manage'), async (req, res) => {
  const ctx = req.ctx;
  const id = String(req.params.id);
  const e = await fetchDoc(COL.conferenceEvents, id);
  if (!e) throw notFound('Conference');
  if (!e.deleted) throw badRequest('This conference is not deleted.');
  await assertCodeUnique(e.code, id);
  const batch = db.batch();
  batch.update(db.collection(COL.conferenceEvents).doc(id), { deleted: false, deletedAt: '', deletedBy: '', deleteReason: '' });
  writeAudit(batch, ctx, {
    action: 'restore',
    module: 'conference-events',
    recordId: id,
    recordLabel: e.conferenceNo,
    message: `${ctx.user.name} restored conference ${e.name} (${e.code}).`,
    oldValue: { deleted: true },
    newValue: { deleted: false },
  });
  await batch.commit();
  res.json({ ok: true });
});
