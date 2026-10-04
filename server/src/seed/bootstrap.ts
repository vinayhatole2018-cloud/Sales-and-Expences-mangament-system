import { PERMISSION_MIGRATIONS, PERMISSIONS_VERSION, SYSTEM_ROLES } from '@pbms/shared';
import { invalidateDirectory } from '../lib/directory';
import { db, COL } from '../firebase';
import { hashPassword, queuePasswordWrite } from '../lib/passwords';
import { DEFAULT_SETTINGS, type BusinessSettings } from '../lib/settings';

/** Ensures system roles and settings documents exist. Safe to run repeatedly. */
export async function ensureBaseData(settingsOverride: Partial<BusinessSettings> = {}) {
  const batch = db.batch();
  for (const [id, r] of Object.entries(SYSTEM_ROLES)) {
    const ref = db.collection(COL.roles).doc(id);
    const snap = await ref.get();
    if (!snap.exists) batch.set(ref, { id, ...r, system: true, permissionsVersion: PERMISSIONS_VERSION, createdAt: new Date().toISOString() });
  }
  const sref = db.collection(COL.settings).doc('business');
  const s = await sref.get();
  if (!s.exists) batch.set(sref, { ...DEFAULT_SETTINGS, ...settingsOverride, updatedAt: new Date().toISOString() });
  await batch.commit();
  await migrateRolePermissions();
}

/**
 * Gives built-in roles any permissions added in newer releases (see
 * PERMISSION_MIGRATIONS) exactly once, keeping the owner's own edits.
 */
export async function migrateRolePermissions(): Promise<string[]> {
  const changed: string[] = [];
  for (const id of Object.keys(SYSTEM_ROLES)) {
    const ref = db.collection(COL.roles).doc(id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const current = Number(snap.get('permissionsVersion') ?? 1);
    if (current >= PERMISSIONS_VERSION) continue;
    const perms = new Set<string>(snap.get('permissions') ?? []);
    for (const m of PERMISSION_MIGRATIONS) {
      if (m.version > current) for (const p of m.grants[id as keyof typeof SYSTEM_ROLES] ?? []) perms.add(p);
    }
    await ref.update({ permissions: Array.from(perms), permissionsVersion: PERMISSIONS_VERSION });
    changed.push(id);
  }
  if (changed.length) invalidateDirectory();
  return changed;
}

/**
 * Creates (or repairs) the owner account in the users collection and sets its
 * password hash. Used by the seed and by `npm run create-admin`.
 */
export async function ensureOwner(p: { name: string; email: string; password: string; mobile?: string }) {
  const email = p.email.trim().toLowerCase();
  const existing = await db.collection(COL.users).where('email', '==', email).limit(1).get();
  const ref = existing.empty ? db.collection(COL.users).doc() : existing.docs[0].ref;
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.set(
    ref,
    {
      id: ref.id,
      name: p.name,
      ...(existing.empty ? { employeeId: 'EMP-001', createdAt: now, createdBy: 'bootstrap', joiningDate: now.slice(0, 10) } : {}),
      email,
      mobile: p.mobile ?? (existing.empty ? '' : existing.docs[0].get('mobile') ?? ''),
      role: 'super_admin',
      department: 'Management',
      status: 'Active',
      photoAttachmentId: existing.empty ? '' : existing.docs[0].get('photoAttachmentId') ?? '',
      deleted: false,
      updatedAt: now,
    },
    { merge: true },
  );
  queuePasswordWrite(batch, ref.id, await hashPassword(p.password), 'bootstrap');
  await batch.commit();
  invalidateDirectory();
  return ref.id;
}
