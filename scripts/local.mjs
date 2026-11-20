// One command to run everything locally:
//   npm run local
// Starts clean Firebase emulators, then starts the API (port 4001) and the web app (5173).
// Press Ctrl+C once to stop everything; emulator data is saved on exit.
import { spawn } from 'node:child_process';
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

const emuArgs = ['emulators:start', '--project', 'demo-pbms'];

console.log('[local] Starting Firebase emulators…');
run('firebase', emuArgs, 'Firebase emulators');
await waitFor('http://127.0.0.1:8080/', 'Firestore emulator');

console.log('[local] Starting API and web app…');
run('npm', ['run', 'dev'], 'API/web');
await waitFor('http://localhost:5173/', 'Web app');
console.log('\n[local] Ready:  http://localhost:5173   (emulator UI: http://localhost:4000)\n');
