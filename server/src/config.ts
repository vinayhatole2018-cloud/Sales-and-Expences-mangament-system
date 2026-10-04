import 'dotenv/config';

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const config = {
  port: Number(process.env.PORT || 4001),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  useEmulators: bool(process.env.USE_FIREBASE_EMULATORS, true),
  projectId: process.env.FIREBASE_PROJECT_ID || 'demo-pbms',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID || 'demo-pbms'}.appspot.com`,
  serviceAccountBase64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 1500),
  enableJobs: bool(process.env.ENABLE_JOBS, true),
  isProduction: process.env.NODE_ENV === 'production',
};
