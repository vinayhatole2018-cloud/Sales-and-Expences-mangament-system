# Architecture

```
 Browser (React SPA)                API server (Node/Express)              Firebase
┌────────────────────┐  HTTPS   ┌───────────────────────────────┐   ┌──────────────────┐
│ sign-in form       │──token──▶│ check session (Firestore)      │   │                  │
│ (no Firebase SDK)  │          │ load user + role permissions   │◀─▶│ Cloud Firestore  │
│                    │  JSON    │ zod validation                 │   │ Cloud Storage    │
│ React Query, UI    │◀────────▶│ business services (money,      │   └──────────────────┘
└────────────────────┘          │ audit, notifications) in       │
                                │ Firestore transactions         │
                                │ reports: PDF / Excel / CSV     │
                                │ jobs: reminders, backups       │
                                └───────────────────────────────┘
```

## Repository layout

```
shared/   Types and rules used by both sides: roles & permissions, statuses,
          publication module definitions, money & date helpers.
server/   Express 5 + TypeScript API (firebase-admin).
  src/lib/        errors, validation, ids (counters), audit, notifications, settings, list helpers
  src/services/   orders & payments (the financial core), analytics, invoices, backups
  src/routes/     one router per area (customers, orders, modules, expenses, reports, …)
  src/reports/    report builders + PDF/Excel/CSV exporters
  src/seed/       bootstrap, create-admin, development seed
  src/tests/      integration tests (run against the emulators)
web/      React 19 + Vite + Tailwind 4 SPA.
  src/components  UI kit, data table, filters, charts, business widgets
  src/pages       one file per screen
docs/     this documentation
```

## Why an API server in front of Firebase

The specification requires that financial values are calculated and validated on the backend, that every change is audited, and that employees cannot see or change what they shouldn't. With Firestore those guarantees need trusted code. The API:

- verifies the Firebase ID token on every request and re-checks the user's status (a suspended employee is locked out immediately);
- checks permissions per action and **scopes data** (employees only see their own customers, orders, payments and expenses);
- recalculates every money field and writes the order, sale, customer totals, publication record, payment, ledger row, audit entry and notifications in **one Firestore transaction**, so either everything is saved or nothing is;
- holds the service-account credentials, so no secret ever reaches the browser;
- applies rate limiting, Helmet security headers, CORS allow-listing, JSON size limits and upload validation.

Firestore and Storage rules deny all direct client access, so the API cannot be bypassed.

## Authentication model

- **Logins are stored in the system's own Firestore database**, not in Firebase Authentication. Passwords are kept only as salted scrypt hashes in `credentials`, a collection no API ever returns.
- `POST /api/auth/login` checks the email and password and returns a random session token. Only its SHA-256 hash is stored in `sessions`. The browser sends the token as `Authorization: Bearer …`; "Remember me" keeps it for 30 days, otherwise it lasts 12 hours and ends when the browser closes.
- **Account creation and passwords:** the Super Admin creates and sets passwords for managers and employees. Managers create and set passwords for Employee-role users only. Everyone can change their own password (current password required) under **My profile**.
- Setting a new password, suspending, changing the role or removing a user ends all of that user's sessions immediately.
- 5 wrong passwords lock an account for 15 minutes, and sign-in is also rate-limited per IP. Sign-ins, failures, lockouts and password changes are all in the audit log.

## Financial integrity

| Rule | Where |
|---|---|
| Balance = billed − paid, never negative | `deriveFinancials()` in `server/src/services/orders.ts` |
| Payment ≤ balance (unless overpayment allowed); refund ≤ paid | `recordPayment()` |
| No negative sales, payments or expenses | zod schemas (`zMoney`, `zPositiveMoney`) |
| Unique transaction numbers | checked inside the payment transaction |
| Amount changes need permission + reason, audited with old/new | `prepareOrderUpdate()` |
| Discounts above the configured % need a manager | `checkDiscountAuthority()` |
| Records are soft-deleted; payments are voided; the ledger is append-only | orders, payments, expenses services |
| Customer totals always equal the sum of their orders | incremental updates in the same transaction (verified by the integration tests) |

## Reports

`server/src/reports/builders.ts` produces a common `ReportData` shape (summary, columns, rows, totals) for 12 reports. The same data feeds the on-screen view and the PDF (pdfkit), Excel (exceljs) and CSV exporters, so exports always match the screen. Every export is audited.

Figures are defined once in `services/analytics.ts`:
- **Sales / Revenue**: billed amount of non-cancelled orders by order date.
- **Collection**: payments − refunds by payment date.
- **Expenses**: approved expenses by expense date.
- **Net revenue / Net profit**: sales − expenses (plus cash profit = collection − expenses).
- **Pending**: order balances.

## Scaling path

Lists and reports currently load the relevant date range and filter in memory. This is simple, index-free and fast for a single business (tens of thousands of orders). When volumes grow:

1. Add composite indexes (e.g. `orders: employeeId ASC, orderDate DESC`) and push more filters into Firestore queries in `lib/list.ts`.
2. Keep daily/monthly aggregate documents (updated in the same transactions) so dashboards read a few documents instead of scanning.
3. Add cursor pagination to list endpoints.

## Future-ready extension points

| Future feature | Hook |
|---|---|
| WhatsApp / SMS / email notifications | `lib/notify.ts` is the single place notifications are created. Add a delivery channel there (or a Firestore-triggered function on `notifications`). |
| Online payment gateway | Create payments through `recordPayment()` from a webhook handler; the ledger, balances and audit come for free. |
| Customer portal / mobile app | Reuse the REST API; add a `customer` role with scoped permissions. |
| GST invoices | `gstEnabled`, `gstin`, per-service `taxPercent` and per-item `taxAmount` already exist. |
| Multi-branch | Add `branchId` to users/orders/expenses and a branch filter in `applyScope()`. |
| Payroll, inventory, CRM, subscriptions | New routers and collections following the same patterns (zod validation, transaction + `writeAudit`). |
