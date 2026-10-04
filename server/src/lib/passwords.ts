import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { z } from 'zod';
import { db, COL } from '../firebase';
import { nowIso } from './list';
import type { Writer } from './audit';

/*
 * Passwords are stored ONLY as salted scrypt hashes in `credentials/{uid}`,
 * a collection that list/report endpoints never read. Format:
 *   scrypt$N$r$p$<salt base64>$<hash base64>
 */

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const zPassword = z
  .string({ required_error: 'Password is required.' })
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password must contain letters and numbers.');

/** Queues the write of a new password hash (resets lockout counters). */
export function queuePasswordWrite(w: Writer, uid: string, passwordHash: string, setBy: string) {
  w.set(db.collection(COL.credentials).doc(uid), {
    uid,
    passwordHash,
    passwordChangedAt: nowIso(),
    passwordSetBy: setBy,
    failedAttempts: 0,
    lockedUntil: '',
  });
}
