import { addDays, daysBetween, formatINR, NOTIFICATION_TYPES, todayYMD, CLOSED_ORDER_STATUSES, type OrderStatus } from '@pbms/shared';
import { db, COL } from './firebase';
import { systemCtx } from './lib/context';
import { fetchAll } from './lib/list';
import { queueNotifications } from './lib/notify';
import { getSettings } from './lib/settings';
import { createBackup, pruneScheduledBackups } from './services/backups';
import { purgeExpiredSessions } from './lib/sessions';

/*
 * Background jobs. They are idempotent (notifications use deterministic ids,
 * backups take a Firestore lock) so running several server instances is safe.
 */

const INTERVAL_MS = 30 * 60 * 1000;

async function reminders() {
  const s = await getSettings();
  const today = todayYMD();
  const orders = (await fetchAll(COL.orders)).filter((o) => !o.deleted && !CLOSED_ORDER_STATUSES.includes(o.status as OrderStatus));
  const batch = db.batch();
  let n = 0;
  const deadline = addDays(today, s.deadlineReminderDays);
  for (const o of orders) {
    if (o.expectedDate && o.expectedDate <= deadline) {
      const overdue = o.expectedDate < today;
      queueNotifications(
        batch,
        [o.employeeId],
        {
          type: NOTIFICATION_TYPES.DEADLINE_APPROACHING,
          title: overdue ? 'Order overdue' : 'Order deadline approaching',
          message: `${o.orderNo} for ${o.customerName} is ${overdue ? 'overdue since' : 'due on'} ${o.expectedDate.split('-').reverse().join('/')}.`,
          link: `/orders/${o.id}`,
        },
        { dedupeKey: `deadline-${o.id}-${o.expectedDate}-${overdue ? 'late' : 'soon'}` },
      );
      n += 1;
    }
  }
  // Pending payments: remind once per reminder window per order.
  const allOpen = (await fetchAll(COL.orders)).filter((o) => !o.deleted && o.status !== 'Cancelled' && o.balance > 0);
  for (const o of allOpen) {
    const since = daysBetween(o.lastPaymentDate || o.orderDate, today);
    if (since >= s.pendingPaymentReminderDays) {
      const window = Math.floor(since / s.pendingPaymentReminderDays);
      queueNotifications(
        batch,
        [o.employeeId],
        {
          type: NOTIFICATION_TYPES.PAYMENT_PENDING,
          title: 'Payment pending',
          message: `${o.customerName} (${o.customerMobile}) owes ${formatINR(o.balance)} on ${o.orderNo}. No payment for ${since} days.`,
          link: `/orders/${o.id}`,
        },
        { dedupeKey: `pending-${o.id}-${window}` },
      );
      n += 1;
    }
    if (n > 400) break;
  }
  if (n) await batch.commit();
}

async function scheduledBackup() {
  const s = await getSettings();
  if (!s.backup.enabled) return;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()));
  if (hour < s.backup.hour) return;
  const today = todayYMD();
  const lock = db.collection(COL.settings).doc('jobs');
  const acquired = await db.runTransaction(async (tx) => {
    const snap = await tx.get(lock);
    if (snap.get('lastBackupDate') === today) return false;
    tx.set(lock, { lastBackupDate: today, lastBackupAt: new Date().toISOString() }, { merge: true });
    return true;
  });
  if (!acquired) return;
  await createBackup(systemCtx('Scheduled backup'), 'scheduled');
  await pruneScheduledBackups(s.backup.keep);
}

async function tick() {
  for (const [name, job] of [
    ['reminders', reminders],
    ['backup', scheduledBackup],
    ['sessions', purgeExpiredSessions],
  ] as const) {
    try {
      await job();
    } catch (e) {
      console.error(`[jobs] ${name} failed`, e);
    }
  }
}

export function startJobs() {
  setTimeout(tick, 15_000);
  setInterval(tick, INTERVAL_MS).unref();
}
