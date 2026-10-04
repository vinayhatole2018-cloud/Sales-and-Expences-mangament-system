// Bundles the API server (including the shared workspace package) into dist/.
// Third-party npm packages stay external and are installed on the host.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@pbms/'));

await build({
  entryPoints: ['src/index.ts', 'src/seed/createAdmin.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  external,
  outExtension: { '.js': '.js' },
});
console.log('Server built to dist/');
