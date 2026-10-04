/**
 * Sets up a live Firebase project's database (Firestore has no fixed schema,
 * so "setting up the schema" means creating the starting documents):
 *
 *   - roles (Super Admin, Manager, Employee) with their permissions
 *   - business settings (defaults)
 *   - _meta/schema: the list of collections this system uses
 *   - optionally (--with-demo) the full demo data set, only into an EMPTY database
 *
 *   npm run setup:prod                 # structure only
 *   npm run setup:prod -- --with-demo  # structure + demo users, customers, orders…
 *
 * Safe to run more than once: existing documents are never overwritten.
 */
import { BACKUP_COLLECTIONS, PERMISSIONS_VERSION } from '@pbms/shared';
import { config } from '../config';
import { db, COL } from '../firebase';
import { ensureBaseData } from './bootstrap';

const withDemo = process.argv.includes('--with-demo');

const DESCRIPTIONS: Record<string, string> = {
  users: 'Employees and their profiles (role, status)',
  credentials: 'Password hashes (scrypt) — never returned by the API',
  sessions: 'Signed-in sessions (token hashes)',
  roles: 'Roles and their permissions',
  settings: 'Business settings',
  counters: 'Sequential record numbers (ORD-2026-00001 …)',
  customers: 'Customers / authors',
  colleges: 'Colleges and institutions',
  conferenceEvents: 'Conference master',
  services: 'Service catalogue and default prices',
  orders: 'Orders (owns all money: total, paid, balance)',
  sales: 'One sale per order',
  payments: 'Payments and refunds (voided, never deleted)',
  expenses: 'Expenses with approval workflow',
  transactions: 'Append-only money ledger',
  notifications: 'In-app notifications',
  auditLogs: 'Audit trail of every important action',
  attachments: 'Uploaded file metadata (files in Cloud Storage)',
  invoices: 'Issued invoices',
  researchPapers: 'Research paper records',
  conferences: 'Conference registrations',
  books: 'Book publication records',
  phdProjects: 'PhD projects',
  awards: 'Awards',
  certificates: 'Certificates',
};

async function main() {
  console.log(`Target: ${config.useEmulators ? `Firebase emulators (project ${config.projectId})` : `Firebase project ${config.projectId}`}`);

  // Prove we can read and write before doing anything else.
  const probe = db.collection('_meta').doc('connection-check');
  await probe.set({ at: new Date().toISOString() });
  await probe.delete();
  console.log('✓ Connected to Firestore (read + write OK)');

  const usersBefore = (await db.collection(COL.users).limit(1).get()).size;

  await ensureBaseData();
  console.log('✓ Roles and business settings in place');

  const collections = Array.from(new Set([...BACKUP_COLLECTIONS, 'sessions']));
  await db.collection('_meta').doc('schema').set(
    {
      app: 'Publication Business Manager',
      permissionsVersion: PERMISSIONS_VERSION,
      collections: collections.map((name) => ({ name, description: DESCRIPTIONS[name] ?? '' })),
      documentation: 'docs/DATABASE_SCHEMA.md',
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  console.log(`✓ Schema registry written (_meta/schema, ${collections.length} collections)`);

  if (withDemo) {
    if (usersBefore > 0) {
      console.log('! Demo data NOT loaded: the database already has users. Demo data only loads into an empty database.');
    } else {
      console.log('Loading demo data…');
      const { loadDemoData } = await import('./seed');
      await loadDemoData({ wipe: false });
      console.log('✓ Demo data loaded');
    }
  }

  console.log('\nDocument counts:');
  for (const name of collections) {
    const n = (await db.collection(name).count().get()).data().count;
    if (n) console.log(`  ${name.padEnd(16)} ${n}`);
  }
  console.log(
    withDemo && usersBefore === 0
      ? '\nDone. Sign in with the demo accounts (see server/src/seed/seed-data.ts) and CHANGE THEIR PASSWORDS, or create your own owner with npm run create-admin:prod.'
      : '\nDone. Next: create the owner login with npm run create-admin:prod -- --email … --password … --name …',
  );
  process.exit(0);
}

main().catch((e) => {
  const msg = String(e?.message ?? e);
  if (/Could not load the default credentials|ENOENT.*service-account|invalid_grant|PERMISSION_DENIED/i.test(msg)) {
    console.error('\nCannot access the Firebase project. Put the service-account key at server/service-account.json (Firebase console → Project settings → Service accounts → Generate new private key).');
  }
  console.error('\nSetup failed:', msg);
  process.exit(1);
});
