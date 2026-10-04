import { config } from './config';
import { createApp } from './app';
import { startJobs } from './jobs';
import { getSettings } from './lib/settings';
import { migrateRolePermissions } from './seed/bootstrap';

const app = createApp();

app.listen(config.port, async () => {
  console.log(`API listening on http://localhost:${config.port} (${config.useEmulators ? 'Firebase emulators' : `project ${config.projectId}`})`);
  await getSettings().catch((e) => console.error('Could not load settings:', e.message));
  await migrateRolePermissions()
    .then((roles) => roles.length && console.log(`Updated permissions of built-in roles: ${roles.join(', ')}`))
    .catch((e) => console.error('Role permission migration failed:', e.message));
  if (config.enableJobs) startJobs();
});
