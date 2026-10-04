# Database schema (Cloud Firestore)

The system uses **Cloud Firestore** (a document database) instead of PostgreSQL, at the owner's request. Every table from the original specification maps to a top-level **collection**. Relationships are stored as document-id references (`customerId`, `orderId`, …) plus a few copied display fields (for example `customerName`), so list screens never need joins.

**Conventions (all collections)**

| Convention | Meaning |
|---|---|
| `id` | Firestore document id, also stored in the document. |
| `…No` | Human-readable sequential number, e.g. `ORD-2026-00001`, generated in a transaction from `counters`. Never reused. |
| Business dates | `YYYY-MM-DD` strings in India time (`orderDate`, `date`, `dateAdded`). They sort and range-filter correctly. |
| Timestamps | ISO-8601 UTC strings (`createdAt`, `updatedAt`, …). |
| Money | Rupees as numbers rounded to 2 decimals. **Calculated on the server only.** |
| `createdBy` / `createdByName` / `updatedBy` | uid (and name) of the employee who made the change. |
| `deleted` | Soft delete flag. Important records are never physically deleted. `deletedAt`, `deletedBy`, `deleteReason` record who and why. |

Browsers have **no direct access** to Firestore or Storage (see `firestore.rules` and `storage.rules`). Every read and write goes through the API server, which checks permissions, validates input, calculates money and writes the audit log in the same transaction.

---

## Entity relationships

```
users (employees) ─┬─< customers (assignedEmployeeId)
                   ├─< orders (employeeId) ─┬── sales (1:1, saleId)
                   │                        ├─< payments (orderId)
                   │                        ├── invoices (1:1, invoiceId)
                   │                        ├── publication record (1:1, moduleRecordId)
                   │                        └─< transactions (orderId)
                   └─< expenses (employeeId)

customers ──< orders ──< payments
colleges  ──< customers (collegeId) ──< orders (collegeId copied from customer)
services  ──< orders.items[].serviceId
roles     ──< users (role)
any record ──< attachments (entityType + entityId)
any record ──< auditLogs (module + recordId)
users     ──< notifications (userId)
conferenceEvents ──< conferences (registrations, conferenceEventId)
```

Publication collections (`researchPapers`, `conferences`, `books`, `phdProjects`, `awards`, `certificates`) each hold the module-specific details. Every publication record is linked **one-to-one** with an order, and the order owns the money. The record keeps a read-only mirror of the order's totals for fast listing.

---

## Collections

### `users` — employees and their logins
Accounts live entirely in this database (no Firebase Authentication). They are created by the Super Admin (any role) or a Manager (Employee role only) via `POST /api/employees`. There is no self-signup.

| Field | Type | Notes |
|---|---|---|
| name | string | |
| employeeId | string | `EMP-001` (auto) or custom; unique |
| email | string | login email; unique |
| mobile | string | |
| role | string | → `roles/{id}` (`super_admin`, `manager`, `employee`, or custom) |
| department | string | |
| joiningDate | date | |
| status | `Active` \| `Inactive` \| `Suspended` | non-Active users cannot sign in and their sessions are ended immediately |
| photoAttachmentId | string | → `attachments` |
| lastLoginAt | timestamp | |
| deleted | boolean | "removed" employee; records are kept |

### `credentials` — password hashes (never returned by any API)
Document id = user id.

| Field | Notes |
|---|---|
| passwordHash | `scrypt$N$r$p$salt$hash` (salted scrypt, 64-byte key) |
| passwordChangedAt, passwordSetBy | who last set it (the user, a manager or the Super Admin) |
| failedAttempts, lockedUntil, lastFailedAt | 5 wrong passwords lock the account for 15 minutes; a new password set by an administrator unlocks it |

### `sessions` — signed-in sessions
Document id = SHA-256 of the session token (the token itself is never stored).
`uid`, `createdAt`, `expiresAt` (12 hours, or 30 days with "Remember me"), `lastSeenAt`, `remember`, `ip`, `userAgent`. Sessions are deleted on logout, password change/reset, suspension, role change or removal; expired ones are purged by a background job.

**Who can set whose password**

| Actor | Can create / edit / set password for |
|---|---|
| Super Admin (`employees.manage`) | Managers, Employees (and other Super Admins) |
| Manager (`employees.manage_staff`) | Employees only; may assign only the Employee role |
| Employee | Only their own password (current password required) |

### `roles` — role-based access control
Document id = role key. Also covers the spec's `permissions` table: permissions are the fixed list in `shared/src/permissions.ts`, and each role stores the subset it grants.

| Field | Type | Notes |
|---|---|---|
| name, description | string | |
| permissions | string[] | e.g. `orders.view_all`, `payments.void` |
| system | boolean | built-in roles cannot be deleted; `super_admin` always has every permission |

### `settings` — business configuration
Documents: `business` (all settings) and `jobs` (background job lock).

| Field (`business`) | Notes |
|---|---|
| businessName, tagline, logoAttachmentId, address, phone, email, website | invoice and report header |
| gstEnabled, gstin, defaultTaxPercent | GST-ready |
| invoicePrefix, orderPrefix | used by `counters` |
| paymentModes[], expenseCategories[] | configurable lists |
| allowOverpayment | if false, payments cannot exceed the balance |
| maxEmployeeDiscountPercent | larger discounts need `orders.edit_amount` |
| invoiceTerms, authorizedSignatory | |
| notifications{type: boolean} | per-type on/off |
| deadlineReminderDays, pendingPaymentReminderDays | reminder jobs |
| backup{enabled, hour, keep} | scheduled backups |

### `counters` — sequential number generator
Id = `{key}-{year}` (e.g. `order-2026`). Fields: `seq`, `key`, `year`. Keys: `order`, `sale`, `payment`, `invoice`, `expense`, `customer`, `college`, `service`, plus each module (`research-papers` → `PAP`, `conferences` → `CNF`, `books` → `BK`, `phd` → `PHD`, `awards` → `AWD`, `certificates` → `CRT`).

### `customers`
| Field | Type | Notes |
|---|---|---|
| customerNo | string | `CUS-2026-00001` |
| name, mobile (unique), altMobile, email | string | mobile normalised (no spaces) |
| address, city, state | string | |
| collegeId, collegeName | string | → `colleges` (or free-text institution) |
| department, designation | string | |
| customerType | enum | Author, Student, Professor, Research Scholar, College, Institution, Other |
| assignedEmployeeId, assignedEmployeeName | string | → `users` |
| dateAdded | date | |
| notes | string | |
| status | `Active` \| `Inactive` \| `Blocked` | |
| totalBilled, totalPaid, balance, orderCount | number | **server-maintained running totals** (updated atomically with every order and payment change) |
| lastOrderDate | date | |
| deleted | boolean | cannot delete while a balance is outstanding |

### `colleges`
| Field | Notes |
|---|---|
| collegeNo | `COL-2026-00001` |
| name (+ `nameLower`, unique), city, state, contactPerson, mobile, email, address | |
| assignedEmployeeId, assignedEmployeeName | |
| notes, deleted | |

College totals (orders, sales, pending, service usage) are **calculated live** from `orders.collegeId`, so they are always correct.

### `conferenceEvents` — conference master
Conferences that papers and authors are registered for. **Super Admin and Managers** (permission `conferences.manage`) create, edit, delete and restore them. **Every employee can view them.** Adding a conference notifies all active employees.

| Field | Notes |
|---|---|
| conferenceNo | `CONF-2026-00001` |
| name (+ `nameLower`), code (+ `codeLower`, unique, e.g. `ICEET-2026`) | |
| level | International, National, State, University, College |
| theme | |
| organizerCollegeId, organizerName | → `colleges`, or free text |
| mode | Offline, Online, Hybrid |
| venue, city | |
| startDate, endDate, registrationDeadline | dates; end ≥ start |
| registrationFee, publicationFee | default fees loaded into new registrations |
| publicationDetails | proceedings / journal / ISBN |
| coordinatorName, coordinatorMobile, coordinatorEmail | |
| status | Upcoming, Registration Open, Registration Closed, Completed, Cancelled. New registrations are accepted only while **Upcoming** or **Registration Open**. |
| notes, deleted | cannot be deleted while it has active registrations; cancel it instead |

Registration counts, revenue and pending are calculated live from `conferences.conferenceEventId`. Brochures and schedules attach via `attachments` (`entityType = conferenceEvent`). Editing a conference's name, code or organiser updates the copies on its registrations.

### `services` — service master and pricing
| Field | Notes |
|---|---|
| serviceNo | `SRV-2026-00001` |
| name (+ `nameLower`, unique) | |
| category | Research Paper, Conference, Book, PhD, Award, Certificate, Other |
| description | |
| basePrice | default price loaded into new orders |
| taxPercent | used when GST is enabled |
| status | `Active` \| `Inactive` |

Service performance (orders, revenue, collected) is calculated live from order items.

### `orders` — the centre of every transaction
Also covers the spec's `order_items` table: items are embedded in the order, because they are always read and written together.

| Field | Type | Notes |
|---|---|---|
| orderNo | string | `ORD-2026-00001` (prefix configurable) |
| customerId, customerNo, customerName, customerMobile, customerEmail | | snapshot at order time |
| collegeId, collegeName | | copied from the customer |
| items[] | array | `{serviceId, serviceName, category, description, quantity, unitPrice, discount, taxPercent, taxAmount, amount}` |
| serviceSummary, category | string | display helpers; `category` = first item's |
| module, moduleRecordId, moduleRecordNo | | link to the publication record, if any |
| employeeId, employeeName | | assigned employee |
| orderDate, expectedDate | date | |
| priority | Low \| Normal \| High \| Urgent | |
| status | New, Assigned, In Progress, Pending Customer, Completed, Delivered, Cancelled | |
| notes | string | |
| subtotal, discountTotal, taxTotal, **totalAmount** | number | computed from items |
| **billedAmount** | number | = totalAmount, or 0 if cancelled |
| advanceAmount | number | sum of Advance payments |
| **paidAmount** | number | net received (payments − refunds) |
| refundedAmount | number | |
| **balance** | number | `max(billedAmount − paidAmount, 0)`, never negative |
| refundDue | number | `max(paidAmount − billedAmount, 0)` |
| paymentStatus | Unpaid, Partial, Paid, Refund Pending, Refunded | derived |
| paymentCount, lastPaymentDate, lastPaymentMode, lastTxnNumber | | |
| saleId, saleNo | | → `sales` |
| invoiceId | | → `invoices` |
| completedAt | timestamp | |

Rules enforced by the server:
- Totals are recomputed from the items on every change. Frontend numbers are ignored.
- Changing the amount needs `orders.edit_amount` and a reason. The old and new amounts go to `auditLogs`, and an Adjustment goes to `transactions`.
- The total can never go below the amount already paid.
- Orders with payments cannot be deleted; cancel and refund instead.

### `sales` — one sale per order (id = `saleId`)
`saleNo` (`SAL-2026-00001`), `date`, `orderId`, `orderNo`, `customerId`, `customerName`, `employeeId`, `employeeName`, `serviceName`, `category`, `quantity`, `unitPrice`, `subtotal`, `discount`, `tax`, `totalAmount`, `billedAmount`, `advanceAmount`, `paidAmount`, `balance`, `paymentStatus`, `paymentMode`, `txnNumber`, `remarks`, `orderStatus`, `collegeId`, `deleted`.
Rewritten in the same transaction as its order, so it can never disagree with the order.

### `payments`
| Field | Notes |
|---|---|
| paymentNo | `PAY-2026-00001` |
| orderId, orderNo, customerId, customerName, customerMobile, serviceName, category, module, collegeId | |
| orderEmployeeId | employee who owns the order (for performance) |
| employeeId, employeeName | who recorded it |
| amount | > 0 |
| date, mode, txnNumber | `txnNumber` unique among non-voided payments |
| type | Advance, Partial Payment, Full Payment, Final Payment, Refund |
| remarks | |
| voided, voidReason, voidedAt, voidedBy | payments are **voided, never deleted** (owner only, reason required) |

Each payment updates the order, sale, customer totals, publication record mirror, ledger, audit log and notifications in **one Firestore transaction**. A payment above the balance is rejected unless `allowOverpayment` is on. A refund cannot exceed the amount paid.

### `expenses`
| Field | Notes |
|---|---|
| expenseNo | `EXP-2026-00001` |
| date, category, description, amount (> 0), mode | category and mode must exist in settings |
| employeeId, employeeName | |
| receiptAttachmentId | → `attachments` |
| approvalStatus | Pending → Approved / Rejected |
| approvedBy, approvedByName, approvedAt, reviewRemarks | |
| remarks, deleted | |

Workflow: submit (Pending), then a manager or admin approves or rejects (no self-approval except the owner). Only **Approved** expenses count in reports and profit.

### `transactions` — money ledger (append-only)
One row per money event: `Sale`, `Payment`, `Refund`, `Expense` (on approval) and `Adjustment` (amount change, cancel, void, delete, restore). Rows are never edited.

`txnNo` (`TXN-20260930-AB12CD`), `type`, `amount` (negative for reversals), `date`, `description`, `orderId`, `orderNo`, `customerId`, `customerName`, `serviceName`, `category`, `employeeId`, `employeeName`, `orderTotal`, `orderAdvance`, `orderPaid`, `orderBalance` (snapshot after the event), `paymentMode`, `txnNumber`, `refId`, `refNo`, `createdAt`, `createdBy`.

### Publication collections
Common fields on every record: `recordNo`, `customerId`, `customerName`, `mobile`, `email`, `collegeId`, `employeeId`, `employeeName`, `date`, `expectedDate`, `status`, `remarks`, `paymentMode`, `txnNumber` (of the advance), `orderId`, `orderNo`, and the mirrored `totalAmount`, `advanceAmount`, `paidAmount`, `balance`, `paymentStatus`, `orderStatus`, plus `deleted`.

| Collection | Number | Specific fields | Total = | Statuses |
|---|---|---|---|---|
| `researchPapers` | PAP | paperTitle, paperType (Regular/Backdate/Conference/Certificate), journalName, writingFees | writingFees | New → In Progress → Submitted → Under Review → Accepted → Published → Completed / Cancelled |
| `conferences` (registrations) | CREG | **conferenceEventId** → `conferenceEvents` (required); conferenceName, conferenceNumber, collegeName (copied from the conference by the server); paperTitle, hardCopyRequired, pdfRequired, price, fees, **authors[] {name, mobile, email}** (covers `conference_authors`) | price + fees | New → In Progress → Submitted → Accepted → Presented → Published → Completed / Cancelled |
| `books` | BK | bookName, pages, copies, writingAmount, publicationAmount, isbn (unique) | writing + publication | Manuscript Received → Writing → Editing → Designing → Printing → Published → Delivered → Completed / Cancelled |
| `phdProjects` | PHD | subject, researchTopic, pages, bwPages, colourPages, copies, typingCharges, writingCharges, bindingCharges, isbn (unique) | typing + writing + binding | Topic → Research → Writing → Typing → Formatting → Printing → Binding → Final Delivery → Completed / Cancelled |
| `awards` | AWD | awardName, awardCategory, place, year, amount | amount | New → In Progress → Confirmed → Delivered → Completed / Cancelled |
| `certificates` | CRT | certificateName, certificateType, quantity, price | quantity × price | New → In Progress → Printed → Delivered → Completed / Cancelled |

The definitions live in `shared/src/modules.ts`. Adding a field there updates validation, forms, tables and search together.

### `invoices`
`invoiceNo` (`INV-2026-00001`), `invoiceDate`, `orderId`, `orderNo`, `orderDate`, `customer{…}`, `business{…}` (snapshot), `items[]`, `subtotal`, `discount`, `tax`, `total`, `paid`, `balance`, `paymentStatus`, `paymentMode`, `txnNumber`, `payments[]`, `terms`, `signatory`, `employeeName`, `version`.
The number and date are fixed once issued. "Refresh" updates paid and balance and increments `version`. Also covers `invoice_items`, since items are embedded.

### `attachments`
`entityType` (customer, order, expense, user, college, settings, or a module key), `entityId`, `category`, `description`, `fileName`, `contentType`, `size`, `storagePath` (Cloud Storage), `uploadedBy`, `uploadedByName`, `createdAt`, `deleted`.
Files are checked for type (extension, MIME and magic bytes) and size (≤ 10 MB). They are downloaded only through the API after an access check.

### `notifications`
`userId`, `type` (order_assigned, payment_received, payment_pending, expense_submitted, expense_approved, expense_rejected, order_completed, deadline_approaching), `title`, `message`, `link`, `read`, `readAt`, `createdAt`. Reminder notifications use deterministic ids, so they are never duplicated.

### `auditLogs`
`userId`, `userName`, `userRole`, `action` (create, update, amount_change, status_change, price_change, cancel, delete, restore, void, refund, approve, reject, login, logout, password_change, password_reset, role_change, export, upload, backup, invoice_create, …), `module`, `recordId`, `recordLabel`, `message` (human sentence, e.g. "Priya Sharma changed order ORD-2026-00031 amount from ₹5,000.00 to ₹6,000.00."), `oldValue`, `newValue` (changed fields only), `reason`, `ip`, `at`, `date`.
Written in the **same transaction** as the change it describes. No API can edit or delete it.

---

## Indexes

All queries use either a single equality filter (`customerId ==`, `orderId ==`, `recordId ==`, `userId ==`, `mobile ==`, `txnNumber ==`, …) or a single range on a date field (`orderDate`, `date`, `dateAdded`, `expectedDate`). Firestore creates these single-field indexes automatically, so **no composite indexes are required** (`firestore.indexes.json` is empty on purpose). Extra filtering, search and sorting run on the server in memory. This suits a single business with tens of thousands of records. See `ARCHITECTURE.md` for when and how to add composite indexes.

## Security rules
`firestore.rules` and `storage.rules` deny all direct client access. Only the API (Admin SDK with a service account) can read or write.

## Backups
`POST /api/backups` exports every collection in `BACKUP_COLLECTIONS` to a JSON file in Cloud Storage (`backups/`) and downloads it. A daily scheduled backup runs after the configured hour (IST) and keeps the last N. Restore upserts documents and takes a safety backup first. For disaster recovery you can additionally enable Firestore's managed [scheduled backups / PITR](https://firebase.google.com/docs/firestore/backups) in the Google Cloud console.
