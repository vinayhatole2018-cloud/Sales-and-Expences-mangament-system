import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '@pbms/shared';
import type { Ctx } from '../lib/context';
import { forbidden, unauthorized } from '../lib/errors';
import { getRoles, getUser } from '../lib/directory';
import { resolveSession } from '../lib/sessions';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx: Ctx;
      sessionId?: string;
    }
  }
}

export function clientIp(req: Request): string {
  return (req.ip || req.socket.remoteAddress || '').replace('::ffff:', '');
}

export function bearerToken(req: Request): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/**
 * Authenticates the request from a session token issued by POST /api/auth/login
 * (stored in Firestore), then loads the employee and their role permissions.
 * Suspended, inactive or removed accounts are rejected even with a valid session.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = bearerToken(req);
  if (!token) return next(unauthorized());
  const session = await resolveSession(token);
  if (!session) return next(unauthorized('Your session has expired. Please sign in again.'));

  const user = await getUser(session.uid);
  if (!user || user.deleted) return next(unauthorized('Your account is no longer active. Contact the administrator.'));
  if (user.status !== 'Active') return next(forbidden(`Your account is ${user.status.toLowerCase()}. Contact the administrator.`));

  const role = (await getRoles()).get(user.role);
  req.sessionId = session.id;
  req.ctx = {
    user: {
      uid: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleName: role?.name ?? user.role,
      employeeId: user.employeeId,
      permissions: new Set<Permission>(role?.permissions ?? []),
    },
    ip: clientIp(req),
  };
  next();
}

/** Allows the request if the user holds ANY of the listed permissions. */
export function requirePerm(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (perms.some((p) => req.ctx.user.permissions.has(p))) return next();
    next(forbidden());
  };
}
