/**
 * Firebase Cloud Functions entry point (production on Firebase Hosting).
 *
 *   api   — the whole Express API. Firebase Hosting rewrites /api/** here, so
 *           the web app and API share https://<project>.web.app.
 *   jobs  — background jobs (reminders, scheduled backups, session clean-up)
 *           every 30 minutes, replacing the timer used when self-hosting.
 *
 * Inside Google Cloud the project's own service account is used
 * automatically, so no key file is needed.
 */
import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { NextFunction, Request, Response } from 'express';
import { createApp } from './app';
import { runJobsOnce } from './jobs';
import { getSettings } from './lib/settings';
import { ensureBaseData } from './seed/bootstrap';

export const REGION = 'asia-south1';
setGlobalOptions({ region: REGION, maxInstances: 10 });

// Make sure roles/settings exist and built-in role permissions are current,
// once per server instance, before the first request is handled.
let ready: Promise<void> | null = null;
function warmUp(): Promise<void> {
  ready ??= (async () => {
    await ensureBaseData().catch((e) => console.error('Base data check failed:', e));
    await getSettings().catch(() => undefined);
  })();
  return ready;
}

const app = createApp();
const handler = async (req: Request, res: Response) => {
  await warmUp();
  app(req, res, ((err?: unknown) => {
    if (err) console.error(err);
  }) as NextFunction);
};

export const api = onRequest({ memory: '512MiB', timeoutSeconds: 120, concurrency: 40 }, handler as any);

export const jobs = onSchedule({ schedule: 'every 30 minutes', timeZone: 'Asia/Kolkata', memory: '512MiB', timeoutSeconds: 300 }, async () => {
  await warmUp();
  await runJobsOnce();
});
