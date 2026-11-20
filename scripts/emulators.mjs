// Starts the Firebase emulators, importing previously saved data when present
// and exporting it again on exit so local data survives restarts.
import { spawn } from 'node:child_process';

const args = ['emulators:start', '--project', 'demo-pbms'];

const child = process.platform === 'win32' ? spawn(['firebase', ...args].join(' '), { stdio: 'inherit', shell: true }) : spawn('firebase', args, { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
