/**
 * Vercel serverless entry point. Vercel calls the default export for every
 * request routed to /api/*; the Express app handles it as usual.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app';
import { getSettings } from './lib/settings';
import { ensureBaseData } from './seed/bootstrap';

const app = createApp();

// Once per instance: make sure roles/settings exist and permissions are current.
let ready: Promise<void> | null = null;
function warmUp(): Promise<void> {
  ready ??= (async () => {
    await ensureBaseData().catch((e) => console.error('Base data check failed:', e));
    await getSettings().catch(() => undefined);
  })();
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await warmUp();
  return app(req as any, res as any);
}
