import 'dotenv/config';

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

/** True when running inside Google Cloud (Cloud Functions / Cloud Run). */
const inGoogleCloud = Boolean(process.env.K_SERVICE || process.env.FUNCTION_TARGET);
/** True when running on Vercel. */
const onVercel = Boolean(process.env.VERCEL);

/** Cloud Functions provides the project's Firebase config as JSON. */
const firebaseConfig = (() => {
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG || '{}') as { projectId?: string; storageBucket?: string };
  } catch {
    return {};
  }
})();

const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || process.env.GCLOUD_PROJECT || 'demo-pbms';

export const config = {
  port: Number(process.env.PORT || 4001),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  inGoogleCloud,
  // Emulators by default for local development; never in Google Cloud or on Vercel.
  useEmulators: bool(process.env.USE_FIREBASE_EMULATORS, !inGoogleCloud && !onVercel),
  projectId,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket || `${projectId}.appspot.com`,
  serviceAccountBase64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 1500),
  enableJobs: bool(process.env.ENABLE_JOBS, true),
  isProduction: process.env.NODE_ENV === 'production' || inGoogleCloud || onVercel,
  /** One-time code for creating the first owner login on an empty database (see routes/setup.ts). */
  setupCode: process.env.PBMS_SETUP_CODE || '',
};
