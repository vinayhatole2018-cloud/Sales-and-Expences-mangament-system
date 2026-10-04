import type { Permission } from '@pbms/shared';
import { forbidden } from './errors';

/** The signed-in user performing an action. */
export interface Actor {
  uid: string;
  name: string;
  email: string;
  role: string;
  roleName: string;
  employeeId: string;
  permissions: Set<Permission>;
}

/** Everything a service function needs to know about who is acting and from where. */
export interface Ctx {
  user: Actor;
  ip?: string;
}

export function can(ctx: Ctx, perm: Permission): boolean {
  return ctx.user.permissions.has(perm);
}

export function assertCan(ctx: Ctx, perm: Permission, message?: string): void {
  if (!can(ctx, perm)) throw forbidden(message);
}

/** A system actor used by background jobs and the seed script. */
export function systemCtx(name = 'System'): Ctx {
  return {
    user: {
      uid: 'system',
      name,
      email: '',
      role: 'super_admin',
      roleName: 'System',
      employeeId: 'SYSTEM',
      permissions: new Set<Permission>(),
    },
  };
}
