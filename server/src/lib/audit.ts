import type { DocumentData, DocumentReference } from 'firebase-admin/firestore';
import { formatINR } from '@pbms/shared';
import { db, COL } from '../firebase';
import type { Ctx } from './context';
import { nowIso } from './list';

/** Anything that can queue a write: a Transaction or a WriteBatch. */
export interface Writer {
  set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): unknown;
  update(ref: DocumentReference, data: DocumentData): unknown;
}

export interface AuditEntry {
  action: string;
  module: string;
  recordId?: string;
  recordLabel?: string;
  message: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
}

/**
 * Queues an audit log write in the same transaction/batch as the change it
 * describes, so a change can never be saved without its audit record.
 */
export function writeAudit(w: Writer, ctx: Ctx, e: AuditEntry): void {
  const ref = db.collection(COL.auditLogs).doc();
  const at = nowIso();
  w.set(ref, {
    id: ref.id,
    userId: ctx.user.uid,
    userName: ctx.user.name,
    userRole: ctx.user.roleName,
    action: e.action,
    module: e.module,
    recordId: e.recordId ?? '',
    recordLabel: e.recordLabel ?? '',
    message: e.message,
    oldValue: e.oldValue === undefined ? null : JSON.parse(JSON.stringify(e.oldValue)),
    newValue: e.newValue === undefined ? null : JSON.parse(JSON.stringify(e.newValue)),
    reason: e.reason ?? '',
    ip: ctx.ip ?? '',
    at,
    date: at.slice(0, 10),
  });
}

/** Standalone audit write (outside a transaction). */
export async function audit(ctx: Ctx, e: AuditEntry): Promise<void> {
  const batch = db.batch();
  writeAudit(batch, ctx, e);
  await batch.commit();
}

const IGNORED = new Set(['updatedAt', 'updatedBy', 'updatedByName', 'createdAt']);

/** Returns only the fields that changed between two versions of a record. */
export function diff(before: Record<string, any>, after: Record<string, any>, fields?: string[]) {
  const keys = fields ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const k of keys) {
    if (IGNORED.has(k) || !(k in after)) continue;
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) {
      oldValue[k] = before[k] ?? null;
      newValue[k] = after[k] ?? null;
    }
  }
  return { changed: Object.keys(newValue), oldValue, newValue };
}

export function describeChanges(changed: string[], oldValue: Record<string, unknown>, newValue: Record<string, unknown>): string {
  return changed
    .slice(0, 6)
    .map((k) => {
      const fmt = (v: unknown) =>
        typeof v === 'number' && /amount|price|fee|charge|total|paid|balance/i.test(k) ? formatINR(v) : JSON.stringify(v);
      return `${k}: ${fmt(oldValue[k])} → ${fmt(newValue[k])}`;
    })
    .join('; ') + (changed.length > 6 ? ` (+${changed.length - 6} more)` : '');
}
