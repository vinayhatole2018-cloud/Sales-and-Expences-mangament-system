import { SYSTEM_ROLES, type Permission } from '@pbms/shared';
import { db, COL } from '../firebase';

export interface UserDoc {
  id: string;
  name: string;
  employeeId: string;
  email: string;
  mobile: string;
  role: string;
  department: string;
  joiningDate: string;
  status: 'Active' | 'Inactive' | 'Suspended';
  photoAttachmentId?: string;
  deleted?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface RoleDoc {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  system: boolean;
}

let usersCache: { value: UserDoc[]; at: number } | null = null;
let rolesCache: { value: Map<string, RoleDoc>; at: number } | null = null;
const USERS_TTL = 15_000;
const ROLES_TTL = 30_000;

export async function getUsers(): Promise<UserDoc[]> {
  if (usersCache && Date.now() - usersCache.at < USERS_TTL) return usersCache.value;
  const snap = await db.collection(COL.users).get();
  const value = snap.docs.map((d) => ({ ...(d.data() as UserDoc), id: d.id }));
  usersCache = { value, at: Date.now() };
  return value;
}

export async function getUser(uid: string): Promise<UserDoc | undefined> {
  return (await getUsers()).find((u) => u.id === uid);
}

export async function getRoles(): Promise<Map<string, RoleDoc>> {
  if (rolesCache && Date.now() - rolesCache.at < ROLES_TTL) return rolesCache.value;
  const snap = await db.collection(COL.roles).get();
  const value = new Map<string, RoleDoc>();
  // System roles always exist even before the database is seeded.
  for (const [id, r] of Object.entries(SYSTEM_ROLES)) value.set(id, { id, ...r, system: true });
  for (const d of snap.docs) value.set(d.id, { ...(d.data() as RoleDoc), id: d.id });
  // The owner role can never lose permissions.
  value.set('super_admin', { ...value.get('super_admin')!, permissions: SYSTEM_ROLES.super_admin.permissions });
  rolesCache = { value, at: Date.now() };
  return value;
}

export async function permissionsFor(roleId: string): Promise<Set<Permission>> {
  const role = (await getRoles()).get(roleId);
  return new Set(role?.permissions ?? []);
}

/** Active users whose role grants a permission. */
export async function usersWithPermission(perm: Permission): Promise<string[]> {
  const [users, roles] = await Promise.all([getUsers(), getRoles()]);
  return users
    .filter((u) => u.status === 'Active' && !u.deleted && roles.get(u.role)?.permissions.includes(perm))
    .map((u) => u.id);
}

export async function userName(uid: string | undefined): Promise<string> {
  if (!uid) return '';
  return (await getUser(uid))?.name ?? '';
}

export function invalidateDirectory(): void {
  usersCache = null;
  rolesCache = null;
}
