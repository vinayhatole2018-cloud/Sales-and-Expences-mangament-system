import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db, COL } from '../firebase';
import { config } from '../config';
import { clientIp } from '../middleware/auth';
import { badRequest, forbidden } from '../lib/errors';
import { audit } from '../lib/audit';
import { zEmail, zRequiredText } from '../lib/validation';
import { zPassword } from '../lib/passwords';
import { ensureBaseData, ensureOwner } from '../seed/bootstrap';

/*
 * First-run setup for a brand-new live database: creates the Super Admin
 * (owner) login. It works ONLY while the database has no users at all and
 * ONLY with the one-time setup code from the deployment (PBMS_SETUP_CODE).
 * Once any user exists it is permanently disabled.
 */
export const setupRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: 'Too many attempts. Please wait 15 minutes.' },
});

async function hasUsers(): Promise<boolean> {
  return !(await db.collection(COL.users).limit(1).get()).empty;
}

function codeMatches(given: string): boolean {
  const expected = config.setupCode;
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

setupRouter.get('/status', async (_req, res) => {
  res.json({ needsOwner: !(await hasUsers()) && Boolean(config.setupCode) });
});

setupRouter.post('/owner', limiter, async (req, res) => {
  const input = z
    .object({
      setupCode: z.string().trim().min(1, 'Enter the setup code.').max(200),
      name: zRequiredText('Name', 120),
      email: zEmail,
      password: zPassword,
    })
    .parse(req.body ?? {});
  if (await hasUsers()) throw forbidden('Setup is already complete. Sign in instead.');
  if (!codeMatches(input.setupCode)) throw badRequest('The setup code is not correct.');

  await ensureBaseData();
  const uid = await ensureOwner({ name: input.name, email: input.email, password: input.password });
  await audit(
    { user: { uid, name: input.name, email: input.email, role: 'super_admin', roleName: 'Super Admin', employeeId: 'EMP-001', permissions: new Set() }, ip: clientIp(req) },
    { action: 'create', module: 'setup', recordId: uid, recordLabel: 'EMP-001', message: `First-time setup: ${input.name} created as the Super Admin (owner).` },
  );
  res.status(201).json({ ok: true });
});
