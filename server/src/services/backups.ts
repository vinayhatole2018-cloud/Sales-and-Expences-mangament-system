import { BACKUP_COLLECTIONS } from '@pbms/shared';
import { bucket, db } from '../firebase';
import type { Ctx } from '../lib/context';
import { badRequest, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { invalidateDirectory } from '../lib/directory';
import { invalidateSettings } from '../lib/settings';

const PREFIX = 'backups/';
const NAME_RE = /^backup-[0-9TZ\-]+-(manual|scheduled|pre-restore)\.json$/;

interface BackupFile {
  meta: { app: 'pbms'; version: 1; createdAt: string; createdBy: string; kind: string; counts: Record<string, number> };
  data: Record<string, Record<string, unknown>[]>;
}

export async function createBackup(ctx: Ctx, kind: 'manual' | 'scheduled' | 'pre-restore') {
  const data: BackupFile['data'] = {};
  const counts: Record<string, number> = {};
  for (const col of BACKUP_COLLECTIONS) {
    const snap = await db.collection(col).get();
    data[col] = snap.docs.map((d) => ({ __id: d.id, ...d.data() }));
    counts[col] = snap.size;
  }
  const createdAt = new Date().toISOString();
  const file: BackupFile = { meta: { app: 'pbms', version: 1, createdAt, createdBy: ctx.user.name, kind, counts }, data };
  const buffer = Buffer.from(JSON.stringify(file));
  const name = `backup-${createdAt.replace(/[:.]/g, '-')}-${kind}.json`;
  await bucket.file(PREFIX + name).save(buffer, { contentType: 'application/json', resumable: false });
  await audit(ctx, {
    action: 'backup',
    module: 'backups',
    recordId: name,
    recordLabel: name,
    message: `${ctx.user.name} created a ${kind} backup (${Object.values(counts).reduce((a, b) => a + b, 0)} records).`,
  });
  return { name, buffer, counts };
}

export async function listBackups() {
  const [files] = await bucket.getFiles({ prefix: PREFIX });
  return files
    .map((f) => ({ name: f.name.slice(PREFIX.length), size: Number(f.metadata.size ?? 0), createdAt: String(f.metadata.timeCreated ?? '') }))
    .filter((f) => NAME_RE.test(f.name))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function readBackup(name: string): Promise<Buffer> {
  if (!NAME_RE.test(name)) throw badRequest('Invalid backup name.');
  const file = bucket.file(PREFIX + name);
  const [exists] = await file.exists();
  if (!exists) throw notFound('Backup');
  const [buf] = await file.download();
  return buf;
}

export async function pruneScheduledBackups(keep: number) {
  const scheduled = (await listBackups()).filter((b) => b.name.endsWith('-scheduled.json'));
  for (const b of scheduled.slice(keep)) await bucket.file(PREFIX + b.name).delete().catch(() => undefined);
}

/**
 * Restores documents from a backup file (upsert). A safety backup of the
 * current state is taken first. Documents created after the backup are left
 * in place so no data is ever silently removed.
 */
export async function restoreBackup(ctx: Ctx, raw: Buffer) {
  let file: BackupFile;
  try {
    file = JSON.parse(raw.toString('utf8'));
  } catch {
    throw badRequest('This is not a valid backup file.');
  }
  if (file?.meta?.app !== 'pbms' || typeof file.data !== 'object') throw badRequest('This is not a backup created by this system.');

  const safety = await createBackup(ctx, 'pre-restore');
  let written = 0;
  for (const col of BACKUP_COLLECTIONS) {
    const docs = file.data[col];
    if (!Array.isArray(docs)) continue;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      for (const d of docs.slice(i, i + 400)) {
        const { __id, ...rest } = d as { __id: string } & Record<string, unknown>;
        if (typeof __id !== 'string' || !__id || __id.includes('/')) continue;
        batch.set(db.collection(col).doc(__id), rest);
        written += 1;
      }
      await batch.commit();
    }
  }
  invalidateDirectory();
  invalidateSettings();
  await audit(ctx, {
    action: 'restore',
    module: 'backups',
    recordId: file.meta.createdAt,
    recordLabel: `Backup of ${file.meta.createdAt}`,
    message: `${ctx.user.name} restored the backup from ${file.meta.createdAt} (${written} records). Safety backup: ${safety.name}.`,
  });
  return { restored: written, safetyBackup: safety.name };
}
