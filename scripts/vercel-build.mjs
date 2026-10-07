// Builds the whole app in Vercel's Build Output API v3 format (.vercel/output):
//
//   static/                 the web app (Vite build) served from Vercel's CDN
//   functions/api.func/     the Express API as one Node.js serverless function
//   config.json             routing (/api/* -> function, SPA fallback) + cron
//
// Vercel runs this as the build command and deploys the output as-is, so what
// you test locally is exactly what goes live:
//   npm run vercel-build && node scripts/vercel-smoke.mjs
//
// It works whatever Vercel's "Root Directory" is: the repo root, web/ or
// server/ (those folders have a scripts/vercel-build.mjs that runs this file),
// and the output is written to <the folder it was started from>/.vercel/output,
// which is where Vercel looks for it.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (step, err) => {
  const detail = String(err?.message || err).replace(/\n/g, '\n  ');
  console.error(`\n✖ Vercel build failed while ${step}:\n  ${detail}\n`);
  process.exit(1);
};
process.on('unhandledRejection', (e) => fail('building', e));

// Output folder: --out <dir> (relative to the repo root), else .vercel/output in
// the folder the build was started from when that is inside the repo (Vercel's
// Root Directory), else the repo root.
const outArg = process.argv.indexOf('--out');
const cwd = process.cwd();
const startedInside = cwd === root || cwd.startsWith(root + path.sep);
const out =
  outArg > 0 ? path.resolve(root, process.argv[outArg + 1]) : path.join(startedInside ? cwd : root, '.vercel/output');
const func = path.join(out, 'functions/api.func');
const REGION = process.env.VERCEL_FUNCTION_REGION || 'bom1'; // Mumbai, next to Firestore asia-south1

// Packages are installed once, at the repo root (npm workspaces). If Vercel's
// install step ran somewhere else they are missing; install them here.
if (!existsSync(path.join(root, 'node_modules/esbuild')) || !existsSync(path.join(root, 'node_modules/@vercel/nft'))) {
  console.log('▶ Installing packages at the repository root…');
  try {
    execSync('npm ci --include=dev --no-audit --no-fund', { cwd: root, stdio: 'inherit' });
  } catch (e) {
    fail('installing packages (npm ci)', e);
  }
}
const { build } = await import('esbuild').catch((e) => fail('loading esbuild', e));
const { nodeFileTrace } = await import('@vercel/nft').catch((e) => fail('loading @vercel/nft', e));
console.log(`▶ Repo root: ${root}\n▶ Output:    ${out}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(func, { recursive: true });

// 1. Web app ---------------------------------------------------------------
console.log('▶ Building web app…');
try {
  execSync('npm run build -w web', { cwd: root, stdio: 'inherit' });
} catch (e) {
  fail('building the web app (npm run build -w web) — see the errors above', e);
}
cpSync(path.join(root, 'web/dist'), path.join(out, 'static'), { recursive: true });

// 2. API function: bundle our code (incl. the shared workspace) -------------
console.log('▶ Bundling API…');
const serverPkg = JSON.parse(readFileSync(path.join(root, 'server/package.json'), 'utf8'));
const external = Object.keys(serverPkg.dependencies).filter((d) => !d.startsWith('@pbms/') && !d.startsWith('@types/'));
const entry = path.join(func, 'index.mjs');
await build({
  entryPoints: [path.join(root, 'server/src/vercel.ts')],
  outfile: entry,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: 'inline',
  external,
  logLevel: 'warning',
}).catch((e) => fail('bundling the API (server/src) — see the errors above', e));

// 3. Copy only the npm files the function actually uses ---------------------
console.log('▶ Tracing dependencies…');
const { fileList, warnings } = await nodeFileTrace([entry], { base: root, processCwd: root }).catch((e) =>
  fail('tracing the API dependencies', e),
);
for (const w of warnings) if (!/Failed to (resolve dependency|parse .*LICENSE)/.test(String(w.message))) console.warn('  trace warning:', w.message);
let copied = 0;
for (const rel of fileList) {
  if (!rel.startsWith('node_modules')) continue;
  const src = path.join(root, rel);
  const dest = path.join(func, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, { dereference: true });
  copied += 1;
}
// pdfkit loads its built-in font metrics from disk at runtime.
const pdfData = path.join(root, 'node_modules/pdfkit/js/data');
if (existsSync(pdfData)) cpSync(pdfData, path.join(func, 'node_modules/pdfkit/js/data'), { recursive: true });
console.log(`  ${copied} dependency files copied`);

writeFileSync(
  path.join(func, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 60,
      memory: 1024,
      regions: [REGION],
    },
    null,
    2,
  ),
);

// 4. Routing ------------------------------------------------------------------
writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { src: '^/api(/.*)?$', dest: '/api' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html', headers: { 'cache-control': 'no-cache' } },
      ],
      // Daily at 23:30 IST: reminders, scheduled backup, session clean-up.
      // (Vercel Hobby allows one run per day; Pro can run more often.)
      crons: [{ path: '/api/jobs/run', schedule: '0 18 * * *' }],
    },
    null,
    2,
  ),
);

console.log(`✔ Vercel output ready in ${path.relative(root, out).split(path.sep).join('/') || '.'} (API region ${REGION})`);
