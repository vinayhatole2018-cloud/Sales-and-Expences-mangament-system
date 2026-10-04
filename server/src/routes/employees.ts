import { Router } from 'express';
import { z } from 'zod';
import { ALL_PERMISSIONS, EMPLOYEE_STATUSES, SYSTEM_ROLES, type Permission } from '@pbms/shared';
import { db, COL } from '../firebase';
import { requirePerm } from '../middleware/auth';
import { can, type Ctx } from '../lib/context';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { writeAudit, diff, describeChanges } from '../lib/audit';
import { getRoles, getUsers, invalidateDirectory, type UserDoc } from '../lib/directory';
import { fetchDoc, listResponse, nowIso } from '../lib/list';
import { hashPassword, queuePasswordWrite, zPassword } from '../lib/passwords';
import { revokeUserSessions } from '../lib/sessions';
import { listQuery, zDate, zEmail, zOptionalMobile, zOptionalText, zRequiredText } from '../lib/validation';

export { zPassword };
export const employeesRouter = Router();
export const rolesRouter = Router();
export const meRouter = Router();

const employeeBase = z.object({
  name: zRequiredText('Name', 120),
  employeeId: z.string().trim().max(20).regex(/^[A-Za-z0-9\-_]*$/, 'Employee ID may only contain letters, digits, - and _.').optional().default(''),
  email: zEmail,
  mobile: zOptionalMobile,
  role: zRequiredText('Role', 60),
  department: zOptionalText(80),
  joiningDate: zDate,
  status: z.enum(EMPLOYEE_STATUSES).default('Active'),
  photoAttachmentId: z.string().trim().max(128).optional().default(''),
});

/*
 * Who may manage whose account (create, edit, set/reset password, suspend):
 *  - Super Admin (`employees.manage`): everyone. Only a Super Admin can manage
 *    another Super Admin or grant that role.
 *  - Manager (`employees.manage_staff`): users with the Employee role only, and
 *    may only assign the Employee role.
 */
export function canManageRole(ctx: Ctx, role: string): boolean {
  if (role === 'super_admin') return ctx.user.role === 'super_admin';
  if (can(ctx, 'employees.manage')) return true;
  if (can(ctx, 'employees.manage_staff')) return role === 'employee';
  return false;
}

function assertCanManageRole(ctx: Ctx, role: string, action: string) {
  if (canManageRole(ctx, role)) return;
  if (can(ctx, 'employees.manage_staff')) throw forbidden(`Managers can only ${action} users with the Employee role.`);
  throw forbidden(`You do not have permission to ${action} this user.`);
}

async function nextEmployeeId(): Promise<string> {
  const users = await getUsers();
  const max = users.reduce((m, u) => {
    const n = /^EMP-(\d+)$/.exec(u.employeeId ?? '')?.[1];
    return n ? Math.max(m, Number(n)) : m;
  }, 0);
  return `EMP-${String(max + 1).padStart(3, '0')}`;
}

async function assertRoleExists(roleId: string) {
  const roles = await getRoles();
  if (!roles.has(roleId)) throw badRequest('Selected role does not exist.');
}

/** Lightweight list for dropdowns — available to every signed-in user. */
employeesRouter.get('/options', async (_req, res) => {
  const users = await getUsers();
  res.json(
    users
      .filter((u) => !u.deleted)
      .map((u) => ({ id: u.id, name: u.name, employeeId: u.employeeId, status: u.status, role: u.role }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
});

const canSeeStaff = requirePerm('employees.view', 'employees.manage', 'employees.manage_staff');
const canManageStaff = requirePerm('employees.manage', 'employees.manage_staff');

employeesRouter.get('/', canSeeStaff, async (req, res) => {
  const ctx = req.ctx;
  const q = listQuery.parse(req.query);
  const { status, role } = z.object({ status: z.string().optional(), role: z.string().optional() }).parse(req.query);
  const roles = await getRoles();
  const users = (await getUsers())
    .filter((u) => (q.includeDeleted || !u.deleted) && (!status || u.status === status) && (!role || u.role === role))
    .map((u) => ({ ...u, roleName: roles.get(u.role)?.name ?? u.role, canManage: canManageRole(ctx, u.role) && u.id !== ctx.user.uid }));
  res.json(listResponse(users, q, ['name', 'employeeId', 'email', 'mobile', 'department', 'roleName'], 'name'));
});

/** Roles the signed-in user may assign when creating or editing a user. */
employeesRouter.get('/assignable-roles', canSeeStaff, async (req, res) => {
  const roles = await getRoles();
  res.json(
    Array.from(roles.values())
      .filter((r) => canManageRole(req.ctx, r.id))
      .map((r) => ({ id: r.id, name: r.name })),
  );
});

employeesRouter.get('/:id', canSeeStaff, async (req, res) => {
  const u = await fetchDoc(COL.users, String(req.params.id));
  if (!u) throw notFound('Employee');
  const roles = await getRoles();
  res.json({ ...u, roleName: roles.get(u.role)?.name ?? u.role, canManage: canManageRole(req.ctx, u.role) && u.id !== req.ctx.user.uid });
});

employeesRouter.post('/', canManageStaff, async (req, res) => {
  const input = employeeBase.extend({ password: zPassword }).parse(req.body);
  const ctx = req.ctx;
  await assertRoleExists(input.role);
  assertCanManageRole(ctx, input.role, 'create');
  const users = await getUsers();
  const employeeId = input.employeeId || (await nextEmployeeId());
  if (users.some((u) => u.employeeId?.toLowerCase() === employeeId.toLowerCase())) throw conflict(`Employee ID ${employeeId} is already used.`);
  if (users.some((u) => u.email?.toLowerCase() === input.email)) throw conflict('An employee with this email already exists.');

  const { password, ...profile } = input;
  const passwordHash = await hashPassword(password);
  const ref = db.collection(COL.users).doc();
  const now = nowIso();
  const doc: UserDoc & Record<string, unknown> = {
    id: ref.id,
    ...profile,
    employeeId,
    deleted: false,
    createdAt: now,
    createdBy: ctx.user.uid,
    createdByName: ctx.user.name,
    updatedAt: now,
  };
  const batch = db.batch();
  batch.set(ref, doc);
  queuePasswordWrite(batch, ref.id, passwordHash, ctx.user.uid);
  writeAudit(batch, ctx, {
    action: 'create',
    module: 'employees',
    recordId: ref.id,
    recordLabel: employeeId,
    message: `${ctx.user.name} created a login for ${input.name} (${employeeId}) as ${input.role} and set the initial password.`,
    newValue: doc,
  });
  await batch.commit();
  invalidateDirectory();
  res.status(201).json(doc);
});

employeesRouter.put('/:id', canManageStaff, async (req, res) => {
  const input = employeeBase.parse(req.body);
  const ctx = req.ctx;
  const before = (await fetchDoc(COL.users, String(req.params.id))) as (UserDoc & Record<string, any>) | null;
  if (!before) throw notFound('Employee');
  assertCanManageRole(ctx, before.role, 'edit');
  if (input.role !== before.role) {
    await assertRoleExists(input.role);
    assertCanManageRole(ctx, input.role, 'assign roles to');
  }
  if (before.id === ctx.user.uid && (input.role !== before.role || input.status !== 'Active')) {
    throw badRequest('You cannot change your own role or status.');
  }
  const users = await getUsers();
  const employeeId = input.employeeId || before.employeeId;
  if (users.some((u) => u.id !== before.id && u.employeeId?.toLowerCase() === employeeId.toLowerCase())) throw conflict(`Employee ID ${employeeId} is already used.`);
  if (users.some((u) => u.id !== before.id && u.email?.toLowerCase() === input.email)) throw conflict('Another user already has this email.');

  const after = { ...before, ...input, employeeId, updatedAt: nowIso(), updatedBy: ctx.user.uid };
  const d = diff(before, after, Object.keys(employeeBase.shape));
  const batch = db.batch();
  batch.set(db.collection(COL.users).doc(before.id), after);
  if (d.changed.length) {
    writeAudit(batch, ctx, {
      action: d.changed.includes('status') ? 'status_change' : d.changed.includes('role') ? 'role_change' : 'update',
      module: 'employees',
      recordId: before.id,
      recordLabel: employeeId,
      message: `${ctx.user.name} updated employee ${input.name}: ${describeChanges(d.changed, d.oldValue, d.newValue)}.`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
  }
  await batch.commit();
  invalidateDirectory();
  // Suspension and role changes take effect immediately.
  if (input.status !== 'Active' || input.role !== before.role) await revokeUserSessions(before.id);
  res.json(after);
});

/** Set a new password for another user (Super Admin: anyone; Manager: Employee role only). */
employeesRouter.post('/:id/reset-password', canManageStaff, async (req, res) => {
  const { password } = z.object({ password: zPassword }).parse(req.body);
  const ctx = req.ctx;
  const u = await fetchDoc(COL.users, String(req.params.id));
  if (!u || u.deleted) throw notFound('Employee');
  if (u.id === ctx.user.uid) throw badRequest('Use My profile → Change password to change your own password.');
  assertCanManageRole(ctx, u.role, 'set passwords for');
  const batch = db.batch();
  queuePasswordWrite(batch, u.id, await hashPassword(password), ctx.user.uid);
  writeAudit(batch, ctx, {
    action: 'password_reset',
    module: 'employees',
    recordId: u.id,
    recordLabel: u.employeeId,
    message: `${ctx.user.name} set a new password for ${u.name} (${u.employeeId}). They were signed out of all devices.`,
  });
  await batch.commit();
  await revokeUserSessions(u.id);
  res.json({ ok: true });
});

employeesRouter.delete('/:id', requirePerm('employees.manage'), async (req, res) => {
  const ctx = req.ctx;
  const u = await fetchDoc(COL.users, String(req.params.id));
  if (!u) throw notFound('Employee');
  if (u.id === ctx.user.uid) throw badRequest('You cannot remove your own account.');
  assertCanManageRole(ctx, u.role, 'remove');
  const batch = db.batch();
  batch.update(db.collection(COL.users).doc(u.id), { deleted: true, status: 'Inactive', deletedAt: nowIso(), deletedBy: ctx.user.uid });
  writeAudit(batch, ctx, {
    action: 'delete',
    module: 'employees',
    recordId: u.id,
    recordLabel: u.employeeId,
    message: `${ctx.user.name} removed employee ${u.name} (${u.employeeId}). Their login is disabled; their records are kept.`,
  });
  await batch.commit();
  invalidateDirectory();
  await revokeUserSessions(u.id);
  res.json({ ok: true });
});

employeesRouter.post('/:id/restore', requirePerm('employees.manage'), async (req, res) => {
  const ctx = req.ctx;
  const u = await fetchDoc(COL.users, String(req.params.id));
  if (!u) throw notFound('Employee');
  const batch = db.batch();
  batch.update(db.collection(COL.users).doc(u.id), { deleted: false, status: 'Active', deletedAt: '', deletedBy: '' });
  writeAudit(batch, ctx, { action: 'restore', module: 'employees', recordId: u.id, recordLabel: u.employeeId, message: `${ctx.user.name} restored employee ${u.name}.` });
  await batch.commit();
  invalidateDirectory();
  res.json({ ok: true });
});

// ------------------------------------------------------------------ roles ---

const roleInput = z.object({
  name: zRequiredText('Role name', 60),
  description: zOptionalText(300),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])).max(ALL_PERMISSIONS.length),
});

rolesRouter.get('/', requirePerm('employees.view', 'employees.manage', 'roles.manage'), async (_req, res) => {
  const [roles, users] = await Promise.all([getRoles(), getUsers()]);
  res.json(
    Array.from(roles.values()).map((r) => ({
      ...r,
      userCount: users.filter((u) => u.role === r.id && !u.deleted).length,
      system: r.id in SYSTEM_ROLES,
    })),
  );
});

rolesRouter.post('/', requirePerm('roles.manage'), async (req, res) => {
  const input = roleInput.parse(req.body);
  const id = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!id) throw badRequest('Enter a valid role name.');
  const roles = await getRoles();
  if (roles.has(id)) throw conflict('A role with this name already exists.');
  const role = { id, ...input, system: false, createdAt: nowIso() };
  const batch = db.batch();
  batch.set(db.collection(COL.roles).doc(id), role);
  writeAudit(batch, req.ctx, { action: 'create', module: 'roles', recordId: id, recordLabel: input.name, message: `${req.ctx.user.name} created role ${input.name}.`, newValue: role });
  await batch.commit();
  invalidateDirectory();
  res.status(201).json(role);
});

rolesRouter.put('/:id', requirePerm('roles.manage'), async (req, res) => {
  const input = roleInput.parse(req.body);
  const id = String(req.params.id);
  if (id === 'super_admin') throw badRequest('The Super Admin role always has every permission.');
  const roles = await getRoles();
  const before = roles.get(id);
  if (!before) throw notFound('Role');
  const after = { ...before, ...input, system: id in SYSTEM_ROLES, updatedAt: nowIso() };
  const d = diff(before, after, ['name', 'description', 'permissions']);
  const batch = db.batch();
  batch.set(db.collection(COL.roles).doc(id), after);
  writeAudit(batch, req.ctx, {
    action: 'update',
    module: 'roles',
    recordId: id,
    recordLabel: after.name,
    message: `${req.ctx.user.name} changed permissions of role ${after.name}.`,
    oldValue: d.oldValue,
    newValue: d.newValue,
  });
  await batch.commit();
  invalidateDirectory();
  res.json(after);
});

rolesRouter.delete('/:id', requirePerm('roles.manage'), async (req, res) => {
  const id = String(req.params.id);
  if (id in SYSTEM_ROLES) throw badRequest('Built-in roles cannot be deleted.');
  const users = await getUsers();
  if (users.some((u) => u.role === id && !u.deleted)) throw badRequest('This role is assigned to employees. Reassign them first.');
  const batch = db.batch();
  batch.delete(db.collection(COL.roles).doc(id));
  writeAudit(batch, req.ctx, { action: 'delete', module: 'roles', recordId: id, recordLabel: id, message: `${req.ctx.user.name} deleted role ${id}.` });
  await batch.commit();
  invalidateDirectory();
  res.json({ ok: true });
});

// --------------------------------------------------------------------- me ---

meRouter.get('/', async (req, res) => {
  const u = await fetchDoc(COL.users, req.ctx.user.uid);
  res.json({
    ...u,
    roleName: req.ctx.user.roleName,
    permissions: Array.from(req.ctx.user.permissions),
  });
});

meRouter.put('/', async (req, res) => {
  const input = z.object({ mobile: zOptionalMobile, photoAttachmentId: z.string().trim().max(128).optional().default('') }).parse(req.body);
  const before = await fetchDoc(COL.users, req.ctx.user.uid);
  if (!before) throw notFound('Profile');
  const batch = db.batch();
  batch.update(db.collection(COL.users).doc(before.id), { ...input, updatedAt: nowIso() });
  const d = diff(before, { ...before, ...input });
  if (d.changed.length) {
    writeAudit(batch, req.ctx, {
      action: 'update',
      module: 'employees',
      recordId: before.id,
      recordLabel: before.employeeId,
      message: `${req.ctx.user.name} updated their profile.`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
  }
  await batch.commit();
  invalidateDirectory();
  res.json({ ok: true });
});
