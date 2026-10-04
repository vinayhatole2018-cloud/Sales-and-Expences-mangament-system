/**
 * Creates the Super Admin (owner) login on a fresh database.
 *
 *   npm run create-admin -- --email owner@example.com --password "S3cure-pass" --name "Vinay"
 *
 * Also creates the built-in roles and default business settings if missing.
 */
import { ensureBaseData, ensureOwner } from './bootstrap';
import { config } from '../config';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg('email');
const password = arg('password');
const name = arg('name') ?? 'Vinay';

if (!email || !password) {
  console.error('Usage: npm run create-admin -- --email <email> --password <password> [--name <name>]');
  process.exit(1);
}
if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error('Password must be at least 8 characters and contain letters and numbers.');
  process.exit(1);
}

console.log(`Target: ${config.useEmulators ? 'Firebase emulators' : `project ${config.projectId}`}`);
await ensureBaseData();
const uid = await ensureOwner({ name, email, password });
console.log(`Super Admin ready: ${email} (uid ${uid}). Sign in to the web app with these credentials.`);
process.exit(0);
