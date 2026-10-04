import { initializeApp, cert, applicationDefault, type AppOptions } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { config } from './config';

if (config.useEmulators) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';
}

const options: AppOptions = { projectId: config.projectId, storageBucket: config.storageBucket };
if (!config.useEmulators) {
  options.credential = config.serviceAccountJson
    ? cert(JSON.parse(config.serviceAccountJson))
    : config.serviceAccountBase64
    ? cert(JSON.parse(Buffer.from(config.serviceAccountBase64, 'base64').toString('utf8')))
    : applicationDefault();
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
