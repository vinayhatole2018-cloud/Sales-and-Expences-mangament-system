import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { z } from 'zod';
import { ALLOWED_UPLOAD_TYPES, ATTACHMENT_CATEGORIES, MAX_UPLOAD_BYTES, MODULE_LIST } from '@pbms/shared';
import { bucket, db, COL } from '../firebase';
import { can, type Ctx } from '../lib/context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { writeAudit } from '../lib/audit';
import { fetchAll, fetchDoc, nowIso, type Doc } from '../lib/list';

export const attachmentsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

const ENTITY_COLLECTIONS: Record<string, string> = {
  customer: COL.customers,
  order: COL.orders,
  expense: COL.expenses,
  user: COL.users,
  college: COL.colleges,
  conferenceEvent: COL.conferenceEvents,
  settings: COL.settings,
  ...Object.fromEntries(MODULE_LIST.map((m) => [m.key, m.collection])),
};

/** Checks the file's leading bytes match its declared type (defeats renamed executables). */
function magicMatches(mime: string, buf: Buffer): boolean {
  const hex = buf.subarray(0, 12).toString('hex');
  switch (mime) {
    case 'application/pdf':
      return buf.subarray(0, 5).toString() === '%PDF-';
    case 'image/png':
      return hex.startsWith('89504e470d0a1a0a');
    case 'image/jpeg':
      return hex.startsWith('ffd8ff');
    case 'image/webp':
      return buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return hex.startsWith('504b0304');
    case 'application/msword':
    case 'application/vnd.ms-excel':
      return hex.startsWith('d0cf11e0a1b11ae1');
    case 'text/plain':
      return !buf.subarray(0, 4096).includes(0);
    default:
      return false;
  }
}

async function canAccessEntity(ctx: Ctx, entityType: string, entityId: string): Promise<boolean> {
  // Settings, profiles and conferences are visible to every signed-in employee.
  if (entityType === 'settings' || entityType === 'user' || entityType === 'conferenceEvent') return true;
  const col = ENTITY_COLLECTIONS[entityType];
  if (!col) return false;
  const e = await fetchDoc(col, entityId);
  if (!e) return false;
  if (entityType === 'expense') return can(ctx, 'expenses.view_all') || e.employeeId === ctx.user.uid || e.createdBy === ctx.user.uid;
  if (entityType === 'customer') return can(ctx, 'customers.view_all') || e.assignedEmployeeId === ctx.user.uid || e.createdBy === ctx.user.uid;
  if (entityType === 'college') return can(ctx, 'colleges.view') || can(ctx, 'colleges.manage');
  return can(ctx, 'orders.view_all') || e.employeeId === ctx.user.uid || e.createdBy === ctx.user.uid;
}

async function canAccess(ctx: Ctx, a: Doc): Promise<boolean> {
  if (a.uploadedBy === ctx.user.uid) return true;
  if (!a.entityId) return false;
  return canAccessEntity(ctx, a.entityType, a.entityId);
}

attachmentsRouter.post('/', upload.single('file'), async (req, res) => {
  const ctx = req.ctx;
  const meta = z
    .object({
      entityType: z.string().trim().max(40).default(''),
      entityId: z.string().trim().max(128).default(''),
      category: z.enum(ATTACHMENT_CATEGORIES).default('Other'),
      description: z.string().trim().max(300).optional().default(''),
    })
    .parse(req.body ?? {});
  const file = req.file;
  if (!file) throw badRequest('Choose a file to upload.');
  if (meta.entityType && !ENTITY_COLLECTIONS[meta.entityType]) throw badRequest('Invalid attachment target.');
  if (meta.entityType === 'settings' && !can(ctx, 'settings.manage')) throw forbidden();
  if (meta.entityType === 'conferenceEvent' && !can(ctx, 'conferences.manage')) throw forbidden('Only managers can attach files to conferences.');
  // Records can be attached to once they exist; drafts (no entityId yet) are linked on save.
  if (meta.entityId && !(await canAccessEntity(ctx, meta.entityType, meta.entityId))) throw forbidden();

  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExt = ALLOWED_UPLOAD_TYPES[file.mimetype];
  if (!allowedExt || !allowedExt.includes(ext)) {
    throw badRequest('This file type is not allowed. Upload PDF, JPG, PNG, WEBP, DOC(X), XLS(X) or TXT files.');
  }
  if (!magicMatches(file.mimetype, file.buffer)) throw badRequest('The file content does not match its type.');

  const ref = db.collection(COL.attachments).doc();
  const safeName = path.basename(file.originalname).replace(/[^A-Za-z0-9._\- ]/g, '_').slice(-120);
  const storagePath = `attachments/${meta.entityType || 'unlinked'}/${ref.id}/${safeName}`;
  await bucket.file(storagePath).save(file.buffer, { contentType: file.mimetype, resumable: false, metadata: { metadata: { uploadedBy: ctx.user.uid } } });

  const doc = {
    id: ref.id,
    ...meta,
    fileName: safeName,
    contentType: file.mimetype,
    size: file.size,
    storagePath,
    uploadedBy: ctx.user.uid,
    uploadedByName: ctx.user.name,
    createdAt: nowIso(),
    deleted: false,
  };
  const batch = db.batch();
  batch.set(ref, doc);
  writeAudit(batch, ctx, {
    action: 'upload',
    module: 'attachments',
    recordId: ref.id,
    recordLabel: safeName,
    message: `${ctx.user.name} uploaded ${meta.category.toLowerCase()} "${safeName}"${meta.entityType ? ` to ${meta.entityType}` : ''}.`,
    newValue: { entityType: meta.entityType, entityId: meta.entityId, size: file.size },
  });
  await batch.commit();
  res.status(201).json(doc);
});

attachmentsRouter.get('/', async (req, res) => {
  const { entityType, entityId } = z.object({ entityType: z.string().min(1), entityId: z.string().min(1) }).parse(req.query);
  if (!(await canAccessEntity(req.ctx, entityType, entityId))) throw forbidden();
  const items = (await fetchAll(COL.attachments, { where: ['entityId', '==', entityId] }))
    .filter((a) => a.entityType === entityType && !a.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(items);
});

attachmentsRouter.get('/:id/download', async (req, res) => {
  const a = await fetchDoc(COL.attachments, String(req.params.id));
  if (!a || a.deleted) throw notFound('File');
  if (!(await canAccess(req.ctx, a))) throw forbidden();
  const [buf] = await bucket.file(a.storagePath).download();
  const inline = req.query.inline === '1' && /^(image\/|application\/pdf)/.test(a.contentType);
  res.setHeader('Content-Type', a.contentType);
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(a.fileName)}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(buf);
});

attachmentsRouter.delete('/:id', async (req, res) => {
  const ctx = req.ctx;
  const a = await fetchDoc(COL.attachments, String(req.params.id));
  if (!a || a.deleted) throw notFound('File');
  const recent = Date.now() - Date.parse(a.createdAt) < 24 * 3600 * 1000;
  if (!(can(ctx, 'records.restore') || (a.uploadedBy === ctx.user.uid && recent))) {
    throw forbidden('Only the uploader (within 24 hours) or the owner can remove files.');
  }
  const batch = db.batch();
  batch.update(db.collection(COL.attachments).doc(a.id), { deleted: true, deletedAt: nowIso(), deletedBy: ctx.user.uid });
  writeAudit(batch, ctx, { action: 'delete', module: 'attachments', recordId: a.id, recordLabel: a.fileName, message: `${ctx.user.name} removed file "${a.fileName}". The file is retained in storage.` });
  await batch.commit();
  res.json({ ok: true });
});

/** Loads an image attachment (e.g. the business logo) for PDF generation. */
export async function loadImage(attachmentId: string): Promise<Buffer | null> {
  if (!attachmentId) return null;
  const a = await fetchDoc(COL.attachments, attachmentId);
  if (!a || a.deleted || !/^image\/(png|jpeg)$/.test(a.contentType)) return null;
  try {
    const [buf] = await bucket.file(a.storagePath).download();
    return buf;
  } catch {
    return null;
  }
}
