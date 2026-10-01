# Payroll

A pnpm/Turborepo monorepo for a Philippine payroll platform. It contains a Next.js web app, a NestJS/tRPC API, a Prisma/PostgreSQL data layer, and a standalone payroll calculation engine.

> This project is under active development. Authentication, tenant-scoped authorization, and audit logging are implemented in the API, and the web sign-in flow uses the API. Final regulatory validation is not complete. Do not use it for live payroll yet.

## Requirements

- Node.js 24.11 or newer (Node 24 LTS)
- pnpm 10
- Docker Desktop or a PostgreSQL 16 instance

## Local setup

```bash
pnpm install
cp .env.example .env
pnpm docker:up
pnpm --filter @workspace/db db:generate
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed
# Copy the organization UUID printed by the seed into BOOTSTRAP_ORGANIZATION_ID.
pnpm auth:bootstrap
pnpm dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Services are available at:

- Web portal: http://localhost:3000 (sign in with a bootstrapped API account)
- Separate in-memory demo: http://localhost:3000/demo (never persisted)
- API: http://localhost:4000
- tRPC: http://localhost:4000/trpc
- MinIO console: http://localhost:9001

## Quality checks

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm test:smoke
pnpm --filter web exec playwright install chromium # once per machine
pnpm --filter web test:browser # after pnpm build
```

Biome is the repository-wide formatter and linter. Use `pnpm check` to verify
formatting, lint rules, and import organization; `pnpm check:write` applies safe
fixes; and `pnpm format` only formats files. Biome's nursery Tailwind class
sorter is intentionally disabled because its fix is unsafe and it cannot load
the project's Tailwind configuration. The smoke test launches the compiled API
and verifies its HTTP health endpoint.

`pnpm test` runs the payroll-engine Vitest suite and API Jest unit tests (the
latter mock Prisma). `pnpm test:e2e` also runs PostgreSQL-backed tRPC
integration tests for tenant authorization, leave approval transactions, and
payroll loan reversal. Run e2e tests with `NODE_ENV=test` and a **disposable,
migrated test database** in `DATABASE_URL`; they create and clean up their own
tenant fixtures. Suites run sequentially against the shared disposable database
to avoid unrelated fixture setup/teardown causing serializable predicate conflicts;
concurrency tests still run their competing operations in parallel. CI provides
PostgreSQL 16 and applies migrations before testing.
The browser test runs against the built Next.js app with mocked tRPC responses;
it verifies the sign-in, staff lists, payslip detail, sign-out and demo separation.
The portal reads persisted data via the API (requires a running API and a staff
account); its year-end tax section also records evidence, previews worksheets,
posts settlements and files corrections through the API, and staff can
trigger, approve, disburse and cancel payroll runs (maker-checker enforced by
the API). It does not generate bank files. Use the separate `/demo`
for simulated, in-memory workflows only. Use `localhost` consistently for web
and API so the development session cookie is sent to both; set
`NEXT_PUBLIC_API_URL` to the API's `/trpc` endpoint and allow the web origin in
`CORS_ORIGIN` when deploying on different origins.

## Leave balances, requests and decisions

The real staff portal loads an employee's recorded balances and up to 100 most
recent requests for an explicit year/status. Balance reads are read-only: they
no longer create assumed SIL, vacation or sick credits. Existing balances,
including legacy defaults, are **not verified entitlements**. Absent credits
block paid approval. SIL cash-conversion previews also require a recorded balance
and cannot exceed it.

HR/super admins can explicitly allocate or adjust annual credits after reviewing
policy and employee eligibility. `leaves.setCredits` requires an exact leave
code, a whole/half-day total (0–999.5), a source reference, a 10–500-character
reason, a loaded revision (null for a new balance), and an operation UUID. New
codes are uppercase; existing codes cannot be renamed or duplicated by casing.
The amount is a **new total**, not an increment. Usage is never reset/refunded;
availability is total less used credits. New allocations open with zero recorded
usage; approved paid requests without a balance block allocation rather than
inventing zero usage. Importing prior/external usage is not supported by this
form and requires manual reconciliation first. Totals below usage and inconsistent
legacy balances are rejected for manual reconciliation. Self-credit changes are
blocked for linked administrators; department managers/payroll specialists cannot
allocate credits.

Balance updates, append-only `LeaveCreditChange` provenance and the before/after
audit commit together. Paid approval also increments the balance revision, so a
stale adjustment cannot overwrite a debit. Identical committed operation replays
return the original change without another write/audit; changed payloads or actors
cannot reuse that operation ID. Keep the same draft/operation ID when retrying an
uncertain response. After a conflict, explicitly discard/reload before starting
a fresh adjustment. The editor retains its loaded snapshot during background
refresh failures and blocks employee/year switching until save or explicit cancel.

`leaves.listCreditChanges` exposes up to 100 most recent allocation/adjustment
attestations per employee/year, with actor, source, reason and numeric snapshots.
Approval debits remain in audit records separately. Existing balances are not
backfilled as verified ledger entries. Unchanged totals may be explicitly recorded
with a fresh source/reason, but neither that history nor a reference string proves
statutory eligibility or source authenticity. Automatic accrual, carryover, leave
usage corrections and durable source-document storage are not implemented.

Staff can file requests with explicit paid/unpaid treatment, a reason, and
Monday–Friday calendar dates (1900–2100). Whole days or one named half weekday
are supported; split cross-year requests. Other schedules/fractions, overlapping
half-day pairing, holidays and eligibility require manual reconciliation. Filing
does not reserve or debit credits; pending/approved date overlaps are rejected.

HR/super admins can approve or reject pending requests in the portal. The API
retains department-manager approval rights and linked employee self-read/filing;
manager/employee leave screens are not included. A linked approver cannot approve
their own employee leave. Approval checks recorded available credits and existing
approved overlaps, and any non-cancelled regular payroll cutoff covering the
dates blocks approval. Decisions do not rewrite payslips. Rejection requires a
10–500-character reason and cannot reverse approved leave or refund credits.

Filing and its audit commit together. Approval, any paid-credit debit, and the
before/after audit also commit together, as do rejection, actor/reason and its
audit. Concurrent decisions cannot overdraw or replace each other; replays retain
the original decision and do not debit/audit twice. Unpaid approval does not
write absence DTRs; reconcile attendance explicitly. Drafts are not stored in the
browser and survive background refresh failures. Browser tests mock tRPC;
PostgreSQL tests cover persistence, tenant isolation, audit rollback and races.

Deploy migrations `20261002000000_leave_rejection` and
`20261002010000_leave_credit_changes` with `pnpm db:migrate:deploy` before using
the updated API. They add rejection provenance, a balance revision and the credit
change table; existing credit amounts/usage remain unchanged, and no entitlement
or verified history is fabricated. Do not run seeding against populated databases.

## Attendance and DTR

The staff portal now loads an employee's persisted DTR for an explicit date
range (up to 366 calendar days), and supports manual additions/corrections.
Missing dates are not assumed to be full attendance or absence. Punches are
entered/displayed in **Asia/Manila (UTC+08:00)** regardless of the browser's
local timezone; overnight shifts are supported within a 24-hour punch interval.
Total worked minutes include overtime, and minute totals are not inferred from
punches. Partial punches, inconsistent totals, absent days with worked time,
double holidays, and legacy premium breakdowns require reconciliation.

Corrections require all minute totals, explicit absence/approval flags, a reason
of 10–500 characters, and the loaded `updatedAt` version (null for a new date).
`timekeeping.adjustAttendance` no longer assumes a 480-minute shift or automatic
approval. The attendance change and actor/reason/before/after audit entry commit
in one serializable transaction. Stale/concurrent changes return a conflict,
not an overwrite. New manual entries start unapproved in the UI; attendance
approval is not payroll approval. Drafts are not saved to browser storage and
remain mounted during background refresh failures.

A date covered by any non-cancelled **regular payroll run in the tenant** is
frozen for corrections, legacy punches, and per-day biometrics writes. Resolve
payroll first; disbursed payroll cannot be cancelled. Corrections do not rewrite
payslips or retroactively recalculate posted payroll. The existing approval and
paid-leave reconciliation checks remain in effect.

The staff UI is available to super admins, HR admins, and payroll specialists.
The API retains its existing department-manager timekeeping role and employee
self-read authorization; manager/employee attendance screens are not included
in this pass. Biometrics import UI and batch-atomic import are separate work.

## Employee creation and profiles

The API-backed portal supports HR/super-admin employee creation and read-only
employee details for authorized payroll/HR staff. Branch and department choices
come from the current tenant; creation requires explicit choices and a complete
personal, employment, statutory, and bank profile. The `employees.create` API
now requires these fields instead of inserting fictional dates, addresses,
identifiers, or bank accounts. Missing organization setup blocks creation.
Draft onboarding and employee editing are not implemented in this workflow.

Creation currently supports **monthly-paid employees only**. Rates are accepted
in PHP to at most two decimal places and stored in centavos; the existing
261-day/year and 8-hour/day derived-rate convention is unchanged and still
requires independent validation. Tax-exempt and managerial flags require
verified legal eligibility, not inference from a job title or salary.
Government/bank identifiers are masked in the detail view, but entered
identifiers are not independently verified. Form data is not saved to browser
storage. Employee creation does not create a login account or transfer funds.

The employee, compensation, and creation audit record commit in one database
transaction. New employee references use a UUID rather than a count-based
sequence to avoid concurrent-registration/deletion collisions; existing
references are unchanged. Duplicate records are rejected without overwriting
an employee. Browser tests mock tRPC; dedicated PostgreSQL integration tests
also verify persistence, tenant isolation, concurrent registration, and rollback
when audit persistence fails.

## Compliance previews (not filing documents)

`compliance.listYearEndReconciliations` provides a tenant-scoped, read-only
review queue; `compliance.previewBir2316Reconciliation` produces an internal,
read-only worksheet, **not** an official BIR Form 2316. HR staff can record
write-once, self-reported prior-employer declarations/income and monthly
remittance references; `compliance.getTaxEvidence` reads the references with
full supersession history. Rows are never mutated: the `compliance.correct*`
procedures append a higher-version row (with reason and a different reviewer,
four-eyes) that replaces the current one, and every reader annualizes,
remits, and settles from the latest version per key. The
queue blocks missing or conflicting evidence. Transcribed previous-employer
2316 figures are annualized with present-employer payroll in one graduated-
table computation per RR 11-2018 §2.79 (prior taxable taken as stated, never
re-bucketed); minimum-wage earners with prior taxable income stay blocked for
manual review. A computed tax difference is not a
payment: `compliance.recordYearEndSettlement` posts a write-once
`YearEndTaxSettlement` row recording the entered attestation that a deficiency
was withheld from (or a refund paid with) disbursed payroll. This does not
transfer money or independently verify the payment. Active employees
settle against December payroll only; separated employees settle with
termination-month pay, and a deficiency larger than that month's disbursed net
pay is rejected instead of driving net pay negative. The preview and queue
recompute the remaining balance live, so later disbursements surface a new
balance due instead of trusting the settled snapshot. `compliance.issueBir2316`
(HR only) records an issuance snapshot, but only for a conclusive,
fully-settled reconciliation — never a computed-but-unpaid difference — and
freezes the reconciled figures into a `Bir2316Issuance` snapshot for audit.
This is not a validated official BIR form. Issuance records carry their
January-31 statutory deadline as information and are
voided, never deleted; a re-issue appends a new version. No filing-eligibility
verdict (e.g. substituted filing) is made by the API. Previous-employer
income, remittances, and the current official form layout still require
review. See [the release-gate checklist](docs/validation-gates.md) before any
BIR certificate or bank file is issued. Do not use this project for live
payroll.

## Paid-leave payroll rules

Approved paid leave is credited as **whole Monday–Friday workdays** when the
request's `daysCount` matches the scheduled weekdays in its date range.
A request may instead take exactly one half day: `daysCount` in 0.5 steps,
one half day short of the scheduled weekdays, with the partial weekday named
in `partialDate`. The partial date keeps its real DTR — up to half a standard
shift of worked minutes still counts as hours worked, with overtime, holiday
premiums, absence, or a missing record blocking payroll for manual
reconciliation. Monthly staff retain their fixed basic salary; daily staff
receive their daily rate per leave day (half rate for the partial date), and
hourly staff receive eight hourly rates per leave day (four for the partial
date). A sub-centavo remainder from an odd rate is truncated.
The daily/hourly credit is included in `Payslip.basicPayCents` and separately
recorded in `Payslip.paidLeavePayCents` (do not add the latter to gross again).
Leave days are not counted as hours worked. Overlapping requests and worked or
holiday DTRs on a paid-leave day block payroll for manual reconciliation.
Finer-than-half-day leave and nonstandard workweeks/shifts are not yet
supported by this payroll path; do not process them as ordinary leave.

## Payroll run policy

Regular payroll supports one first and one second cutoff per organization and
calendar month; the cutoff start and end must be in the same month. A second
run with altered dates cannot pay that cutoff again, and the first and second
cutoffs cannot overlap. Same-date retries return the existing run; cancel
non-disbursed runs in reverse dependency order before
recalculating.

13th-month runs pay one-twelfth of **disbursed regular basic earnings through
the special cutoff**, less earlier disbursed 13th-month payments for that year.
An early release can therefore be followed by a later, strictly forward-dated
true-up once further regular earnings have been disbursed. Each prior special
run must itself be disbursed. A request with no additional earned amount is
rejected rather than creating a duplicate payment. Cancelling the underlying
regular run is blocked once a later special payout depends on it; disbursed
runs cannot be cancelled. Retroactive reductions and cross-year tax adjustments
still require manual review; a true-up cannot issue a negative payout.

## Database commands

```bash
pnpm --filter @workspace/db db:generate
pnpm --filter @workspace/db db:push
pnpm --filter @workspace/db db:migrate
pnpm db:migrate:deploy
pnpm --filter @workspace/db db:seed
pnpm --filter @workspace/db db:studio
```

## Production API

Build from the repository root so workspace dependencies are compiled first:

```bash
pnpm build
pnpm --filter @workspace/api start:prod
```

Production deployments must provide at least `DATABASE_URL`; see `.env.example` for the complete configuration. Run `pnpm db:migrate:deploy` before starting the API.

## Authentication and authorization

The API uses opaque, random session tokens stored only in an `HttpOnly`, `SameSite=Lax` cookie. Passwords are hashed with Node's scrypt implementation, sessions are stored as hashes, and browser origins are checked against `CORS_ORIGIN`.

Create the first tenant administrator only after an organization exists:

```bash
# Set BOOTSTRAP_ORGANIZATION_ID, BOOTSTRAP_ADMIN_EMAIL,
# BOOTSTRAP_ADMIN_NAME, and BOOTSTRAP_ADMIN_PASSWORD in .env.
pnpm auth:bootstrap
```

The bootstrap command refuses to overwrite an existing account. API roles are `SUPER_ADMIN`, `HR_ADMIN`, `PAYROLL_SPECIALIST`, `DEPARTMENT_MANAGER`, and `EMPLOYEE`. Tenant identifiers are derived from the authenticated session rather than accepted from API clients. Sensitive mutations and compliance exports write to `AuditLog`.
