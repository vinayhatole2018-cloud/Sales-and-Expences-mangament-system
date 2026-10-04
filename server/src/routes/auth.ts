import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db, COL } from '../firebase';
import { bearerToken, clientIp, requireAuth } from '../middleware/auth';
import { badRequest, forbidden, unauthorized } from '../lib/errors';
import { writeAudit } from '../lib/audit';
import { getRoles, getUsers, invalidateDirectory } from '../lib/directory';
import { hashPassword, queuePasswordWrite, verifyPassword, zPassword } from '../lib/passwords';
import { createSession, hashToken, revokeSession, revokeUserSessions } from '../lib/sessions';
import { nowIso } from '../lib/list';
import type { Ctx } from '../lib/context';

/*
 * Sign-in against the system's own database (no Firebase Authentication).
 * Accounts are created only by the Super Admin or a Manager (see employees.ts).
 */
export const authRouter = Router();

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const INVALID = 'Incorrect email or password.';

// Brute-force protection per IP, on top of the per-account lockout below.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
});

function actorCtx(user: { id: string; name: string; email: string; role: string; employeeId: string }, roleName: string, ip: string): Ctx {
  return { user: { uid: user.id, name: user.name, email: user.email, role: user.role, roleName, employeeId: user.employeeId, permissions: new Set() }, ip };
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password, remember } = z
    .object({
      email: z.string({ required_error: 'Enter your email.' }).trim().toLowerCase().min(1, 'Enter your email.').max(200),
      password: z.string({ required_error: 'Enter your password.' }).min(1, 'Enter your password.').max(200),
      remember: z.boolean().optional().default(false),
    })
    .parse(req.body ?? {});
  const ip = clientIp(req);

  const user = (await getUsers()).find((u) => u.email?.toLowerCase() === email);
  const credRef = user ? db.collection(COL.credentials).doc(user.id) : null;
  const cred = credRef ? (await credRef.get()).data() : undefined;

  if (cred?.lockedUntil && cred.lockedUntil > nowIso()) {
    const mins = Math.ceil((Date.parse(cred.lockedUntil) - Date.now()) / 60000);
    throw forbidden(`Too many wrong passwords. This account is locked for ${mins} more minute${mins === 1 ? '' : 's'}, or ask the administrator to reset the password.`);
  }

  const ok = user && cred ? await verifyPassword(password, cred.passwordHash) : false;
  if (!ok || !user || !credRef) {
    if (user && credRef && cred) {
      const failed = Number(cred.failedAttempts ?? 0) + 1;
      const lock = failed >= MAX_FAILED;
      const batch = db.batch();
      batch.update(credRef, {
        failedAttempts: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : '',
        lastFailedAt: nowIso(),
      });
      const roleName = (await getRoles()).get(user.role)?.name ?? user.role;
      writeAudit(batch, actorCtx(user, roleName, ip), {
        action: lock ? 'login_locked' : 'login_failed',
        module: 'auth',
        recordId: user.id,
        recordLabel: user.employeeId,
        message: lock
          ? `${user.name}'s account was locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED} wrong passwords.`
          : `Failed sign-in for ${user.name} (attempt ${failed} of ${MAX_FAILED}).`,
      });
      await batch.commit();
    }
    throw unauthorized(INVALID);
  }

  if (user.deleted) throw unauthorized(INVALID);
  if (user.status !== 'Active') throw forbidden(`Your account is ${user.status.toLowerCase()}. Contact the administrator.`);

  const { token, session } = await createSession(user.id, { remember, ip, userAgent: String(req.headers['user-agent'] ?? '') });
  const roleName = (await getRoles()).get(user.role)?.name ?? user.role;
  const batch = db.batch();
  batch.update(credRef, { failedAttempts: 0, lockedUntil: '' });
  batch.update(db.collection(COL.users).doc(user.id), { lastLoginAt: session.createdAt });
  writeAudit(batch, actorCtx(user, roleName, ip), {
    action: 'login',
    module: 'auth',
    recordId: user.id,
    recordLabel: user.employeeId,
    message: `${user.name} signed in${remember ? ' (remember me)' : ''}.`,
  });
  await batch.commit();
  invalidateDirectory();
  res.json({ token, expiresAt: session.expiresAt });
});

authRouter.post('/logout', async (req, res) => {
  const token = bearerToken(req);
  if (token) await revokeSession(hashToken(token)).catch(() => undefined);
  res.json({ ok: true });
});

/** Employees change their own password (current password required). Other sessions are signed out. */
authRouter.post('/change-password', requireAuth, async (req, res) => {
  const ctx = req.ctx;
  const { currentPassword, newPassword } = z
    .object({ currentPassword: z.string().min(1, 'Enter your current password.'), newPassword: zPassword })
    .parse(req.body ?? {});
  if (currentPassword === newPassword) throw badRequest('The new password must be different from the current one.');
  const ref = db.collection(COL.credentials).doc(ctx.user.uid);
  const cred = (await ref.get()).data();
  if (!(await verifyPassword(currentPassword, cred?.passwordHash))) throw badRequest('Your current password is incorrect.');
  const batch = db.batch();
  queuePasswordWrite(batch, ctx.user.uid, await hashPassword(newPassword), ctx.user.uid);
  writeAudit(batch, ctx, {
    action: 'password_change',
    module: 'auth',
    recordId: ctx.user.uid,
    recordLabel: ctx.user.employeeId,
    message: `${ctx.user.name} changed their password.`,
  });
  await batch.commit();
  const others = await revokeUserSessions(ctx.user.uid, req.sessionId);
  res.json({ ok: true, signedOutElsewhere: others });
});
