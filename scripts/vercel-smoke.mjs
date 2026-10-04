// Runs the built Vercel function (.vercel/output/functions/api.func) on a local
// port against the Firestore emulator, applying the same routes as config.json,
// to prove the deployment package works before it goes to Vercel.
import http from 'node:http';
import { readFileSync, existsSync, cpSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.vercel/output');
process.env.USE_FIREBASE_EMULATORS ??= 'true';
process.env.ENABLE_JOBS = 'false';
process.env.CRON_SECRET ??= 'smoke-secret';

// Run the function from a folder OUTSIDE the project, like Vercel does, so a
// dependency missing from the package fails here instead of being found in ./node_modules.
const isolated = mkdtempSync(path.join(os.tmpdir(), 'pbms-func-'));
cpSync(path.join(out, 'functions/api.func'), isolated, { recursive: true });
console.log(`Function copied to ${isolated}`);
const { default: handler } = await import(pathToFileURL(path.join(isolated, 'index.mjs')).href);
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api')) return handler(req, res);
  const file = path.join(out, 'static', req.url === '/' ? 'index.html' : req.url);
  res.end(readFileSync(existsSync(file) ? file : path.join(out, 'static/index.html')));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const check = async (label, p, init, want) => {
  const r = await fetch(base + p, init);
  const ok = want(r.status);
  console.log(`${ok ? '✔' : '✖'} ${label} → ${r.status}`);
  return { ok, r };
};
const results = [];
results.push((await check('web index.html', '/', {}, (s) => s === 200)).ok);
results.push((await check('SPA deep link /orders/123', '/orders/123', {}, (s) => s === 200)).ok);
results.push((await check('API health', '/api/health', {}, (s) => s === 200)).ok);
const login = await check('API login (demo owner)', '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'vinay@pbms.test', password: 'Pbms@2026' }) }, (s) => s === 200);
results.push(login.ok);
const { token } = await login.r.json();
results.push((await check('API dashboard (authorised)', '/api/dashboard', { headers: { Authorization: `Bearer ${token}` } }, (s) => s === 200)).ok);
const pdf = await check('API PDF export (pdfkit fonts)', '/api/reports/orders/export?format=pdf', { headers: { Authorization: `Bearer ${token}` } }, (s) => s === 200);
results.push(pdf.ok && Buffer.from(await pdf.r.arrayBuffer()).subarray(0, 4).toString() === '%PDF');
const xlsx = await check('API Excel export', '/api/reports/orders/export?format=xlsx', { headers: { Authorization: `Bearer ${token}` } }, (s) => s === 200);
results.push(xlsx.ok);
results.push((await check('Cron without secret is refused', '/api/jobs/run', {}, (s) => s === 401)).ok);
results.push((await check('Cron with secret runs jobs', '/api/jobs/run', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }, (s) => s === 200)).ok);
server.close();
const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
