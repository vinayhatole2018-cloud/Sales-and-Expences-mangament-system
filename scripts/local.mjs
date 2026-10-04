// One command to run everything locally:
//   npm run local
// Starts the Firebase emulators (data saved in .emulator-data), loads the demo
// data the first time, then starts the API (port 4001) and the web app (5173).
// Press Ctrl+C once to stop everything; emulator data is saved on exit.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shell = process.platform === 'win32';
const children = [];

/** Spawns a command from the project root. Arguments must not contain spaces. */
function spawnIn(cmd, args) {
  return shell ? spawn([cmd, ...args].join(' '), { cwd: root, stdio: 'inherit', shell }) : spawn(cmd, args, { cwd: root, stdio: 'inherit' });
}

function run(cmd, args, name) {
  const child = spawnIn(cmd, args);
  child.on('exit', (code) => {
    if (!stopping) {
      console.log(`\n[local] ${name} stopped (code ${code}). Shutting down.`);
      stop();
    }
  });
  children.push(child);
  return child;
}

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGINT');
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

async function waitFor(url, label, tries = 90) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} did not start. Is Java installed? (java -version)`);
}

async function hasUsers() {
  // Accounts live in the Firestore "users" collection (no Firebase Authentication).
  const r = await fetch('http://127.0.0.1:8080/v1/projects/demo-pbms/databases/(default)/documents/users?pageSize=1').catch(() => null);
  if (!r || !r.ok) return false;
  const body = await r.json().catch(() => ({}));
  return Array.isArray(body.documents) && body.documents.length > 0;
}

// Relative to the project root: the absolute path may contain spaces.
const dataDir = './.emulator-data';
const emuArgs = ['emulators:start', '--project', 'demo-pbms', '--export-on-exit', dataDir];
if (existsSync(path.join(root, dataDir))) emuArgs.push('--import', dataDir);

console.log('[local] Starting Firebase emulators…');
run('firebase', emuArgs, 'Firebase emulators');
await waitFor('http://127.0.0.1:8080/', 'Firestore emulator');

if (!(await hasUsers())) {
  console.log('[local] Empty database — loading demo data…');
  await new Promise((resolve, reject) => {
    const seed = spawnIn('npm', ['run', 'seed']);
    seed.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('Seeding failed.'))));
  });
}

console.log('[local] Starting API and web app…');
run('npm', ['run', 'dev'], 'API/web');
await waitFor('http://localhost:5173/', 'Web app');
console.log('\n[local] Ready:  http://localhost:5173   (emulator UI: http://localhost:4000)\n');
