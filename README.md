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

- Web: http://localhost:3000
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
```

Biome is the repository-wide formatter and linter. Use `pnpm check` to verify
formatting, lint rules, and import organization; `pnpm check:write` applies safe
fixes; and `pnpm format` only formats files. Biome's nursery Tailwind class
sorter is intentionally disabled because its fix is unsafe and it cannot load
the project's Tailwind configuration. The smoke test launches the compiled API
and verifies its HTTP health endpoint.

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
