# SweldoPH Payroll

A pnpm/Turborepo monorepo for a Philippine payroll platform. It contains a Next.js web app, a NestJS/tRPC API, a Prisma/PostgreSQL data layer, and a standalone payroll calculation engine.

> This project is under active development. Authentication, tenant-scoped authorization, and audit logging are implemented in the API, but the web sign-in flow and final regulatory validation are not complete. Do not use it for live payroll yet.

## Requirements

- Node.js 20.19 or newer
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
tenant fixtures. CI provides PostgreSQL 16 and applies migrations before testing.
The browser test runs against the built Next.js app with mocked tRPC responses;
it verifies the sign-in, staff lists, payslip detail, sign-out and demo separation.
The portal reads persisted data via the API (requires a running API and a staff
account for lists); it does not run or disburse payroll. Use the separate `/demo`
for simulated, in-memory workflows only. Use `localhost` consistently for web
and API so the development session cookie is sent to both; set
`NEXT_PUBLIC_API_URL` to the API's `/trpc` endpoint and allow the web origin in
`CORS_ORIGIN` when deploying on different origins.

## Compliance previews (not filing documents)

`compliance.listYearEndReconciliations` provides a tenant-scoped, read-only
review queue; `compliance.previewBir2316Reconciliation` produces an internal,
read-only worksheet, **not** an official BIR Form 2316. Its tax difference is not an
actual refund or deduction. Previous-employer income, remittances, year-end
tax settlements, and the current official form layout still require review.
See [the release-gate checklist](docs/validation-gates.md) before any BIR
certificate or bank file is issued. Do not use this project for live payroll.

## Paid-leave payroll rules

Approved paid leave is credited as **whole Monday–Friday workdays** when the
request's `daysCount` matches the scheduled weekdays in its date range.
Monthly staff retain their fixed basic salary; daily staff receive their daily
rate per leave day, and hourly staff receive eight hourly rates per leave day.
The daily/hourly credit is included in `Payslip.basicPayCents` and separately
recorded in `Payslip.paidLeavePayCents` (do not add the latter to gross again).
Leave days are not counted as hours worked. Overlapping requests and worked or
holiday DTRs on a paid-leave day block payroll for manual reconciliation.
Partial-day leave and nonstandard workweeks/shifts are not yet supported by
this payroll path; do not process them as ordinary full-day leave.

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
