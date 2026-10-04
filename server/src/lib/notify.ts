import type { NotificationType } from '@pbms/shared';
import { db, COL } from '../firebase';
import type { Writer } from './audit';
import { nowIso } from './list';
import { peekSettings } from './settings';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  /** In-app path to open, e.g. /orders/abc. */
  link?: string;
}

/**
 * Queues notifications for users in the same transaction/batch as the event.
 * Respects the per-type switches in business settings. `excludeUid` skips the
 * person who caused the event. A `dedupeKey` makes the write idempotent.
 */
export function queueNotifications(
  w: Writer,
  userIds: Iterable<string>,
  n: NotificationInput,
  opts: { excludeUid?: string; dedupeKey?: string } = {},
): void {
  if (peekSettings().notifications[n.type] === false) return;
  const unique = new Set(Array.from(userIds).filter((u) => u && u !== opts.excludeUid && u !== 'system'));
  const at = nowIso();
  for (const userId of unique) {
    const ref = opts.dedupeKey
      ? db.collection(COL.notifications).doc(`${opts.dedupeKey}-${userId}`.replace(/[^A-Za-z0-9_\-]/g, '_'))
      : db.collection(COL.notifications).doc();
    w.set(ref, { id: ref.id, userId, ...n, link: n.link ?? '', read: false, createdAt: at });
  }
}
