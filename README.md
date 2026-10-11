# Payroll

A full-stack Philippine payroll platform in a pnpm/Turborepo monorepo: a Next.js staff portal, a NestJS + tRPC API, a Prisma/PostgreSQL data layer, and a standalone payroll calculation engine covering SSS, PhilHealth, Pag-IBIG, withholding tax, 13th-month pay, and BIR year-end workflows.

> [!WARNING]
> Under active development. Authentication, tenant-scoped authorization, and audit logging are implemented, but final regulatory validation is not complete. **Do not use this for live payroll.** See [docs/validation-gates.md](docs/validation-gates.md).

## Features

- **Maker-checker payroll runs** — trigger → approve (a different person) → disburse, with transactional audit records and loan-collection reversal on cancel.
- **Attendance & DTR** — Manila-timezone daily time records, manual corrections with versioning, and biometric CSV import with fail-closed validation.
- **Leave management** — credit allocation with provenance, request/approve/reject/withdraw flows, and paid-leave payroll reconciliation.
- **Loans** — amortization schedules, per-cutoff deductions, and installment ledger refunds on payroll cancellation.
- **Year-end tax workspace** — prior-employer evidence, monthly remittance references, settlement posting, BIR 2316 issuance with source-fingerprint freshness, 1601-C summaries, 1604-C alphalists, and DOLE 13th-month reports. These are internal previews and worksheets, not filed documents.
- **Role-based access** — `SUPER_ADMIN`, `HR_ADMIN`, `PAYROLL_SPECIALIST`, `DEPARTMENT_MANAGER`, `EMPLOYEE`, enforced in both API and UI.
- **Dashboard, notifications, holidays, and employee self-service** (profile, payslips, DTR, leave).

## Architecture

| Package | Stack |
| --- | --- |
| `apps/web` | Next.js 16, React 19, tRPC 11 client, TanStack Query/Table, Tailwind CSS, Base UI |
| `apps/api` | NestJS 11, tRPC 11 routers, Zod validation, serializable transactions |
| `packages/db` | Prisma 6, PostgreSQL 16 |
| `packages/payroll-engine` | Framework-free TypeScript math (statutory tables, BigInt centavos) |
| `packages/ui` | Shared UI primitives |

Money is stored and computed as **BigInt centavos** end to end; the engine has no I/O so tables can be unit-tested in isolation. Tenant identity is always derived from the authenticated session — never from client input — and sensitive mutations write to `AuditLog`.

```
┌─────────────┐   tRPC/HTTPS    ┌──────────────┐   Prisma   ┌────────────┐
│  Next.js    │ ──────────────▶ │  NestJS API  │ ─────────▶ │ PostgreSQL │
│  portal     │ ◀────────────── │  tRPC router │            │     16     │
└─────────────┘  superjson      └──────┬───────┘            └────────────┘
                                      │ imports math from
                               ┌──────▼───────┐
                               │payroll-engine│
                               └──────────────┘
```

How money moves: setup (organization, employees, leave credits) → attendance approval → payroll trigger → checker approval → disbursement → payslips. Disbursed runs are immutable. See [docs/payroll-workflow.md](docs/payroll-workflow.md) for the lifecycle diagrams.

## Getting started

### Prerequisites

- Node.js 24 LTS
- pnpm 12.7.0 (pinned in `package.json`)
- Docker Desktop, or a local PostgreSQL 16 instance

### Run locally

```bash
pnpm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
pnpm docker:up              # postgres, redis, minio
pnpm --filter @workspace/db db:generate
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed
pnpm auth:bootstrap         # first admin; needs BOOTSTRAP_* in .env
pnpm dev
```

| Service | URL |
| --- | --- |
| Web portal | http://localhost:3000 |
| API / tRPC | http://localhost:4000/trpc |
| MinIO console | http://localhost:9001 |

> [!TIP]
> Use `localhost` (not `127.0.0.1`) for both web and API in development so the session cookie is sent to both.

### Configuration

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `CORS_ORIGIN` / `NEXT_PUBLIC_API_URL` | Web origin allow-list and API endpoint |
| `AUTH_COOKIE_NAME` / `AUTH_SESSION_TTL_HOURS` | Session cookie settings |
| `BOOTSTRAP_*` | One-time first-admin creation (`pnpm auth:bootstrap`) |
| `S3_*` | Payslip PDF object storage (MinIO/S3) |

Production needs at minimum `DATABASE_URL`; run `pnpm db:migrate:deploy` before starting the API (`pnpm build && pnpm --filter @workspace/api start:prod`).

## Using the portal

Sign in with a bootstrapped account. Navigation is role-filtered; every read and mutation is still authorized server-side.

| Page | Route | Who |
| --- | --- | --- |
| Dashboard | `/dashboard` | Staff |
| Employees | `/employees` | HR / payroll staff |
| Attendance & DTR | `/attendance` | HR / payroll staff |
| Leave management | `/leaves` | HR / payroll staff |
| Process payroll | `/process-payroll` | Payroll makers |
| Payroll runs & payslips | `/payroll-runs` | Staff (scoped) |
| Year-end tax | `/year-end-tax` | HR |
| Loans, Holidays, Notifications | `/loans`, `/holidays`, `/notifications` | Staff (scoped) |
| My attendance, Profile, Security | `/my-attendance`, `/profile`, `/security` | Self-service |

Sessions use opaque random tokens in an `HttpOnly`, `SameSite=Lax` cookie; passwords are hashed with scrypt.

## Testing

```bash
pnpm check && pnpm typecheck   # biome + tsc
pnpm test                      # unit: payroll-engine (vitest) + API (jest, mocked Prisma)
pnpm test:e2e                   # API integration on a disposable PostgreSQL database
pnpm build && pnpm test:smoke   # production API health check
pnpm --filter web test:browser        # 143 Playwright tests, mocked tRPC
pnpm --filter web test:browser:live   # 2 live tests: real UI + API + disposable DB
```

> [!NOTE]
> `test:e2e` and `test:browser:live` require `NODE_ENV=test` and a disposable, migrated database (`payroll_test` / `payroll_browser`). They create and clean up their own UUID-scoped fixtures and refuse non-local or production databases.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit, e2e, build, smoke, a 2-shard mocked browser suite with merged HTML report, and the live suite — all on PostgreSQL 16.

## Synthetic data

`pnpm --filter @workspace/api seed:sandbox` loads a deterministic 2026 fixture (200 employees, attendance, runs, payslips, leave, loans, tax evidence) into an explicitly marked sandbox tenant. Fixtures are clearly synthetic and never touch other tenants. See `apps/api/src/sandbox/` for the guardrails.

## Documentation

- [docs/payroll-workflow.md](docs/payroll-workflow.md) — run lifecycle and end-to-end money flow (Mermaid diagrams, code references)
- [docs/validation-gates.md](docs/validation-gates.md) — release-gate checklist; required reading before any live use
