# Connecting your Firebase project and deploying

## Deploy on Vercel (recommended for this project)

The repo deploys as **one Vercel project**: the web app on Vercel's CDN and the API as a Node.js function in Mumbai (`bom1`), on the same domain. `vercel.json` makes Vercel run `scripts/vercel-build.mjs`, which writes Vercel's Build Output (`.vercel/output`). Test the exact package locally with `npm run vercel-build && npm run vercel-smoke` (needs the emulator running).

**Vercel → Project → Settings**
- Root Directory: the repository root (leave empty). Framework Preset: **Other** (vercel.json sets the commands).
- Environment Variables (Production):

| Name | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | `publish-management-syste-63f32` |
| `FIREBASE_STORAGE_BUCKET` | `publish-management-syste-63f32.firebasestorage.app` |
| `FIREBASE_SERVICE_ACCOUNT` | the **whole contents** of the service-account JSON key (secret) |
| `CRON_SECRET` | any long random string (protects the daily jobs endpoint) |
| `PBMS_SETUP_CODE` | any long random string — used once on the sign-in page to create the owner |

Do **not** set `NODE_ENV`. Uploads are limited to 4 MB on Vercel (request size limit); backup *restore* of large files must be done locally with the key file.

After the first deploy, open the site: the sign-in page shows **First-time setup**. Enter `PBMS_SETUP_CODE`, your name, email and password to create the Super Admin. That screen disappears once the owner exists.

---

## Firebase Hosting + Cloud Functions (alternative, needs the Blaze plan)


Everything runs locally against the Firebase Emulator Suite today. To go live you need a Firebase project. The steps below take about 30 minutes.

## 1. What to prepare in the Firebase console

1. Create a project (or use an existing one). Note the **project id**.
2. Firebase **Authentication is not needed**: logins are stored in Firestore by this system.
3. **Firestore Database** → Create database (production mode). Region: `asia-south1 (Mumbai)`.
4. **Storage** → Get started, same region.
5. The web app does not use the Firebase SDK, so no web config is needed.
6. **Project settings → Service accounts** → *Generate new private key*. This JSON is a **secret**. It goes only on the API server, never in the web app or in git.

Share with the developer: project id, the web app config, and the service-account JSON (through a secure channel).

## 2. Push the schema, rules and indexes

```bash
firebase login
firebase use --add            # pick your project, alias "prod"
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Firestore creates collections automatically on first write. Then create the owner login and the base data (roles and settings):

```bash
cd server
# server/.env: USE_FIREBASE_EMULATORS=false, FIREBASE_PROJECT_ID=..., FIREBASE_STORAGE_BUCKET=...,
#              GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
npm run create-admin -- --email owner@yourdomain.com --password "Choose-A-Strong-1" --name "Vinay"
```

Do **not** run `npm run seed` against production. It only works on the emulators.

## 3. Deploy the API server

Any Node 20+ host works. Recommended: **Google Cloud Run** (same project, scales to zero).

```bash
cd server
npm run build              # bundles to dist/
# Cloud Run (uses server/Dockerfile):
gcloud run deploy pbms-api --source . --region asia-south1 --allow-unauthenticated \
  --set-env-vars USE_FIREBASE_EMULATORS=false,FIREBASE_PROJECT_ID=<id>,FIREBASE_STORAGE_BUCKET=<bucket>,CORS_ORIGIN=https://<your-site>,NODE_ENV=production
```

On Cloud Run the default service account already has Firebase access, so no key file is needed. On other hosts (Render, Railway, a VPS) set `FIREBASE_SERVICE_ACCOUNT_BASE64` to the base64 of the service-account JSON.

Set `ENABLE_JOBS=true` on exactly one long-running instance (or use Cloud Scheduler to call a job endpoint) for reminders and scheduled backups. The jobs are idempotent, so duplicate runs are harmless.

## 4. Deploy the web app (Firebase Hosting)

```bash
# web/.env.production
VITE_USE_FIREBASE_EMULATORS=false
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=<id>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<id>
VITE_FIREBASE_APP_ID=...
VITE_API_URL=https://pbms-api-xxxx.a.run.app

npm run build -w web
firebase deploy --only hosting
```

(Alternatively add a Hosting rewrite `/api/** → Cloud Run service pbms-api` and leave `VITE_API_URL` empty.)

## 5. After go-live checklist

- [ ] Sign in as the owner. In **Settings** set the business name, logo, address, GST and prefixes.
- [ ] Add services and prices in **Services & Pricing**.
- [ ] Create employee logins in **Employees**.
- [ ] In **Settings → Backups**, confirm the daily backup is on, then run one manual backup.
- [ ] Optional: enable Firestore point-in-time recovery / managed backups in Google Cloud.
- [ ] Check that the service-account JSON is not in the repository (`.gitignore` covers `service-account*.json` and `.env`).
