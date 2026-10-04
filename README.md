# Publication Business Management & Sales Management System

A centralised business system for a publication and academic-services business: research papers, conferences, books, PhD projects, awards, certificates, customers, colleges, orders, sales, payments, expenses, reports and a full audit trail. It supports role-based access for the owner (Super Admin), managers and employees.

- **Web:** React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, Recharts
- **API:** Node.js, Express 5, TypeScript, zod, firebase-admin, pdfkit, exceljs
- **Data:** Firebase Authentication, Cloud Firestore, Cloud Storage

## Quick start (local, no Firebase account needed)

Requirements: Node 20+, Java 11+ (for the emulators), Firebase CLI (`npm i -g firebase-tools`).

```bash
npm install
```

**One command** (from this project folder) starts everything and loads the demo data the first time:

```bash
npm run local
```

Or step by step — start the Firebase emulators (terminal 1; data is kept between restarts):

```bash
npm run emulators
```

Load the demo data (terminal 2): 6 users, 20 customers, 10 colleges, 14 services, 30 orders across every module, 39 payments and 15 expenses.

```bash
npm run seed
```

Start the API (port 4001) and the web app (port 5173):

```bash
npm run dev
```

Open http://localhost:5173. The demo logins (owner, manager, four employees) and their password are in `server/src/seed/seed-data.ts`. They exist only in the local emulator.

Emulator UI (browse the raw data): http://localhost:4000

## Tests

With the emulators running and seeded:

```bash
npm test
```

The integration tests drive the real API as different users. They cover authentication and role restrictions, balance calculation, over-payment, negative amounts, duplicate transaction numbers, amount-change audit with reason, the expense approval workflow, all 12 reports, PDF/Excel/CSV export, invoices, dashboard totals and global search.

## Documentation

- [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) — every collection, field, relationship, rule and index
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit, financial-integrity rules, scaling and future modules
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — connecting a real Firebase project and going live

## Roles

| | Super Admin | Manager | Employee |
|---|---|---|---|
| Dashboard | Company | Company | Own work |
| Customers / orders / payments | All | All | Own & assigned |
| Change order amounts (with reason) | ✓ | ✓ | — |
| Void payments, delete records, restore | ✓ | — | — |
| Approve expenses | ✓ | ✓ (not own) | — |
| Reports, analytics, exports | ✓ | ✓ | — (own performance only) |
| Conferences (add / edit / delete) | ✓ | ✓ | View & register papers |
| Employees & roles | Manage | View | — |
| Services, settings, backups, audit log | ✓ | — | — |

Permissions are editable per role in **Settings → Roles & permissions**, and custom roles can be created.

## Scripts

| Command | What it does |
|---|---|
| `npm run local` | Everything in one go: emulators, demo data (first run), API and web |
| `npm run emulators` | Firebase Auth, Firestore and Storage emulators with persisted data |
| `npm run seed` | Wipe the emulators and load demo data through the API |
| `npm run dev` | API + web in watch mode |
| `npm test` | Integration tests |
| `npm run typecheck` | TypeScript checks for server and web |
| `npm run build` | Production build (server bundle + web static files) |
| `npm run create-admin -- --email … --password … --name …` | Create the owner login on a fresh database |
