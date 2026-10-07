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

/** The service-account key (raw JSON or base64), if one was provided. */
const serviceAccountText =
  process.env.FIREBASE_SERVICE_ACCOUNT ||
  (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8') : '');
const serviceAccountProject = (() => {
  try {
    return (JSON.parse(serviceAccountText || '{}') as { project_id?: string }).project_id;
  } catch {
    return undefined;
  }
})();

// The key's own project wins: a key can only open its own project, so a stale
// FIREBASE_PROJECT_ID (e.g. the emulator's demo-pbms copied from .env) is ignored.
const projectId =
  serviceAccountProject || process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || process.env.GCLOUD_PROJECT || 'demo-pbms';
const envBucket = process.env.FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket;

export const config = {
  port: Number(process.env.PORT || 4001),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  inGoogleCloud,
  // Emulators by default for local development. Never in Google Cloud or on
  // Vercel, where no emulator can exist (even if USE_FIREBASE_EMULATORS=true was copied over).
  useEmulators: !inGoogleCloud && !onVercel && bool(process.env.USE_FIREBASE_EMULATORS, true),
  projectId,
  // Projects created since late 2024 use <id>.firebasestorage.app; older ones <id>.appspot.com.
  // A bucket named after another project (a copied emulator value) is ignored.
  storageBucket:
    envBucket && envBucket.startsWith(projectId)
      ? envBucket
      : serviceAccountProject
      ? `${projectId}.firebasestorage.app`
      : envBucket || `${projectId}.appspot.com`,
  /** The service-account key JSON (from FIREBASE_SERVICE_ACCOUNT, or decoded from FIREBASE_SERVICE_ACCOUNT_BASE64). */
  serviceAccountText,
  onVercel,
  /** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` to /api/jobs/run. */
  cronSecret: process.env.CRON_SECRET || '',
  /** Vercel limits request bodies to 4.5 MB, so uploads are capped lower there. */
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || (onVercel ? 4 * 1024 * 1024 : 10 * 1024 * 1024)),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 1500),
  enableJobs: bool(process.env.ENABLE_JOBS, true),
  isProduction: process.env.NODE_ENV === 'production' || inGoogleCloud || onVercel,
  /** One-time code for creating the first owner login on an empty database (see routes/setup.ts). */
  setupCode: process.env.PBMS_SETUP_CODE || '',
};
