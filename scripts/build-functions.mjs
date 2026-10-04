// Packages the API for Firebase Cloud Functions into ./functions-dist:
//   index.js      the server bundled with the shared workspace code
//   package.json  runtime dependencies (installed by Cloud Build on deploy)
//   .env          non-secret runtime settings + the one-time setup code
// Run automatically by `npm run deploy`.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'functions-dist');
const serverPkg = JSON.parse(readFileSync(path.join(root, 'server/package.json'), 'utf8'));
const deps = Object.fromEntries(Object.entries(serverPkg.dependencies).filter(([name]) => !name.startsWith('@pbms/')));

rmSync(path.join(out, 'index.js'), { force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(root, 'server/src/functions.ts')],
  outfile: path.join(out, 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: Object.keys(deps),
  logLevel: 'warning',
});

writeFileSync(
  path.join(out, 'package.json'),
  JSON.stringify(
    { name: 'pbms-functions', private: true, type: 'module', main: 'index.js', engines: { node: '22' }, dependencies: deps },
    null,
    2,
  ) + '\n',
);

// The one-time setup code (creates the first owner on an empty database).
// Kept in server/.setup-code (git-ignored) so it stays the same across deploys.
const codeFile = path.join(root, 'server/.setup-code');
if (!existsSync(codeFile)) writeFileSync(codeFile, randomBytes(9).toString('base64url') + '\n');
const setupCode = readFileSync(codeFile, 'utf8').trim();
writeFileSync(path.join(out, '.env'), `PBMS_SETUP_CODE=${setupCode}\nENABLE_JOBS=false\n`);

// The Firebase CLI loads the code locally to discover the functions, so the
// dependencies must be installed here (outside the npm workspaces).
console.log('Installing function dependencies…');
execSync('npm install --omit=dev --no-workspaces --no-audit --no-fund --loglevel=error', { cwd: out, stdio: 'inherit' });
console.log('Functions package ready in functions-dist/');
