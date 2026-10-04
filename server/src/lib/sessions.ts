import { createHash, randomBytes } from 'node:crypto';
import { db, COL } from '../firebase';
import { nowIso } from './list';

/*
 * Login sessions are stored in Firestore (`sessions` collection). The browser
 * holds a random 256-bit token; only its SHA-256 hash is stored, so a database
 * leak does not reveal usable tokens. Sessions can be revoked instantly
 * (logout, password reset, suspension).
 */

export const SESSION_HOURS = 12;
export const REMEMBER_DAYS = 30;
const CACHE_MS = 30_000;
const TOUCH_MS = 5 * 60_000;

export interface SessionDoc {
  id: string;
  uid: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  remember: boolean;
  ip: string;
  userAgent: string;
}

const cache = new Map<string, { session: SessionDoc | null; at: number }>();

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(uid: string, opts: { remember: boolean; ip: string; userAgent: string }) {
  const token = randomBytes(32).toString('base64url');
  const id = hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + (opts.remember ? REMEMBER_DAYS * 24 : SESSION_HOURS) * 3600_000);
  const session: SessionDoc = {
    id,
    uid,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    lastSeenAt: now.toISOString(),
    remember: opts.remember,
    ip: opts.ip,
    userAgent: opts.userAgent.slice(0, 300),
  };
  await db.collection(COL.sessions).doc(id).set(session);
  return { token, session };
}

/** Returns the live session for a token, or null if unknown or expired. */
export async function resolveSession(token: string): Promise<SessionDoc | null> {
  if (!token || token.length > 200) return null;
  const id = hashToken(token);
  const hit = cache.get(id);
  let session: SessionDoc | null;
  if (hit && Date.now() - hit.at < CACHE_MS) {
    session = hit.session;
  } else {
    const snap = await db.collection(COL.sessions).doc(id).get();
    session = snap.exists ? (snap.data() as SessionDoc) : null;
    cache.set(id, { session, at: Date.now() });
  }
  if (!session) return null;
  if (session.expiresAt < nowIso()) {
    await revokeSession(id);
    return null;
  }
  if (Date.now() - Date.parse(session.lastSeenAt) > TOUCH_MS) {
    session.lastSeenAt = nowIso();
    db.collection(COL.sessions).doc(id).update({ lastSeenAt: session.lastSeenAt }).catch(() => undefined);
  }
  return session;
}

export async function revokeSession(id: string) {
  cache.delete(id);
  await db.collection(COL.sessions).doc(id).delete();
}

/** Signs a user out everywhere (optionally keeping the current session). */
export async function revokeUserSessions(uid: string, exceptId?: string): Promise<number> {
  const snap = await db.collection(COL.sessions).where('uid', '==', uid).get();
  const targets = snap.docs.filter((d) => d.id !== exceptId);
  for (let i = 0; i < targets.length; i += 400) {
    const batch = db.batch();
    for (const d of targets.slice(i, i + 400)) {
      batch.delete(d.ref);
      cache.delete(d.id);
    }
    await batch.commit();
  }
  return targets.length;
}

/** Housekeeping: removes expired sessions. */
export async function purgeExpiredSessions(): Promise<number> {
  const snap = await db.collection(COL.sessions).where('expiresAt', '<', nowIso()).limit(400).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => {
    batch.delete(d.ref);
    cache.delete(d.id);
  });
  await batch.commit();
  return snap.size;
}
