// Starts the Firebase emulators, importing previously saved data when present
// and exporting it again on exit so local data survives restarts.
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const dataDir = './.emulator-data';
const args = ['emulators:start', '--project', 'demo-pbms', '--export-on-exit', dataDir];
if (existsSync(dataDir)) args.push('--import', dataDir);

const child = process.platform === 'win32' ? spawn(['firebase', ...args].join(' '), { stdio: 'inherit', shell: true }) : spawn('firebase', args, { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
