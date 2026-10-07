import { initializeApp, cert, applicationDefault, type AppOptions } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { config } from './config';

if (config.useEmulators) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';
}

/**
 * Why the database can't be reached, in words an admin can act on (null when
 * the setup looks right). The Vercel handler shows this instead of crashing.
 */
export let credentialProblem: string | null = null;

const options: AppOptions = { projectId: config.projectId, storageBucket: config.storageBucket };
if (!config.useEmulators) {
  if (config.serviceAccountText) {
    try {
      options.credential = cert(JSON.parse(config.serviceAccountText));
    } catch {
      credentialProblem =
        'FIREBASE_SERVICE_ACCOUNT is not a valid service-account key. Paste the whole contents of the key .json file (starting with { and ending with }).';
    }
  } else if (config.onVercel) {
    credentialProblem =
      'FIREBASE_SERVICE_ACCOUNT is not set for this deployment. Add it in Vercel → Settings → Environment Variables with "Production" ticked, then redeploy.';
  } else {
    options.credential = applicationDefault();
  }
}

export const app = initializeApp(options);
export const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });
export const bucket = getStorage(app).bucket();

export const COL = {
  users: 'users',
  /** Password hashes (never returned by any API). */
  credentials: 'credentials',
  /** Login sessions (token hashes). */
  sessions: 'sessions',
  roles: 'roles',
  settings: 'settings',
  counters: 'counters',
  customers: 'customers',
  colleges: 'colleges',
  conferenceEvents: 'conferenceEvents',
  services: 'services',
  orders: 'orders',
  sales: 'sales',
  payments: 'payments',
  expenses: 'expenses',
  transactions: 'transactions',
  notifications: 'notifications',
  auditLogs: 'auditLogs',
  attachments: 'attachments',
  invoices: 'invoices',
} as const;
