# Payroll

A pnpm/Turborepo monorepo for a Philippine payroll platform. It contains a Next.js web app, a NestJS/tRPC API, a Prisma/PostgreSQL data layer, and a standalone payroll calculation engine.

> This project is under active development. Authentication, tenant-scoped authorization, and audit logging are implemented in the API, and the web sign-in flow uses the API. Final regulatory validation is not complete. Do not use it for live payroll yet.

## Requirements

- Node.js 24.11 or newer (Node 24 LTS)
- pnpm 12.7.0 (the version pinned in `package.json`)
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
pnpm --filter web test:browser:live # real API + disposable PostgreSQL; setup below
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
`test:browser` runs against the built Next.js app with mocked tRPC responses;
it verifies sign-in, staff pages, payslip detail, sign-out, routing and access controls.
`test:browser:live` operates the actual built UI and API against disposable
PostgreSQL, without request interception. It creates a synthetic employee through
the UI, records 11 explicit approved attendance days, allocates/files/approves
leave, processes payroll, signs in as a different checker, marks disbursement,
reloads the persisted run, reads the payslip and verifies database/audit records.
The onboarding workflow provisions only tenant setup and staff accounts directly.
A separate session-isolation workflow provisions synthetic employees in two test
tenants, switches the real shared cookie in another tab, holds the employee SQL
read, and verifies that the new account never sees the former tenant's cached
row. It also verifies that a stale principal hint cannot post payroll. Both
workflows clean up only their own UUID-scoped tenants. This is integration verification, **not**
regulatory validation or a real bank payment. CI runs both browser suites.
The portal reads persisted data via the API (requires a running API and a staff
account); its year-end tax section also records evidence, previews worksheets,
posts settlements and files corrections through the API, and staff can
trigger, approve, disburse and cancel payroll runs (maker-checker enforced by
the API). It does not generate bank files. Use `localhost` consistently for web
and API so the development session cookie is sent to both; set
`NEXT_PUBLIC_API_URL` to the API's `/trpc` endpoint and allow the web origin in
`CORS_ORIGIN` when deploying on different origins.

### Real browser test on Windows (isolated database)

Use a **new disposable database**, never an existing employee/payroll database.
The live-browser configuration refuses non-local databases, database names other
than `payroll_browser`/`payroll_test`, missing explicit opt-in, and an already-running
API/web server on its ports. It does not reuse your `.env` database or seed/reset
other organizations. PostgreSQL must have all migrations applied first.

```powershell
docker run --rm --name payroll-browser-test -e POSTGRES_PASSWORD=local-test-only -e POSTGRES_DB=payroll_browser -p 127.0.0.1:5544:5432 -d postgres:16-alpine
$env:DATABASE_URL = 'postgresql://postgres:local-test-only@127.0.0.1:5544/payroll_browser?schema=public'
$env:NODE_ENV = 'test'
$env:PAYROLL_LIVE_TEST_DATABASE = '1'
$env:NEXT_PUBLIC_API_URL = 'http://localhost:4000/trpc'
pnpm db:migrate:deploy
pnpm build
pnpm --filter web test:browser:live
docker stop payroll-browser-test
```

Wait for PostgreSQL startup before migrating. Ports **4000** (API) and **3101**
(web) must be free. The public API URL is built into the web bundle; rebuild
after changing it. Playwright starts/stops both app servers and retains traces
and screenshots on failure. The disposable container is removed when stopped.
Remove these shell environment overrides before starting your normal dev stack.

## Portal sidebar navigation

The real staff portal uses the existing [shadcn Base UI sidebar](https://ui.shadcn.com/docs/components/base/sidebar)
with grouped workspace/payroll links, a desktop icon rail, Ctrl/Cmd+B toggle,
mobile drawer. The server reads only the non-sensitive
`sidebar_state` preference to restore desktop collapse. Each destination is a
separate Next.js page inside a shared authenticated portal layout. Links support
browser Back/Forward, direct URLs and reloads; only the current page's business
queries/forms are mounted. Unsaved entries are not saved to browser storage or
automatically submitted; reloads discard them. Navigation is hidden from anonymous and non-staff users;
existing API role/tenant checks still govern every read and mutation.

| Destination | URL |
| --- | --- |
| Overview | `/portal` |
| Employees | `/portal/employees` |
| Attendance & DTR | `/portal/attendance` |
| Leave management | `/portal/leaves` |
| Process payroll | `/portal/process-payroll` |
| Payroll runs & payslips | `/portal/payroll-runs` |
| Year-end tax | `/portal/year-end-tax` |

Composition follows the configured **Base UI / Rhea** preset and the official
[icon-collapse sidebar block](https://ui.shadcn.com/r/styles/base-rhea/sidebar-07.json):
menu-based brand/account slots, an inset surface, and a section breadcrumb.
Colors use semantic theme tokens. The mobile sheet overrides its side-specific
width to honor the sidebar's `18rem` token, capped on very narrow screens.
Browser regressions check light/dark surface alignment, collapsed icon geometry,
account visibility, and drawer width at 320px, 390px and 700px viewports.

## Regular payroll eligibility and attendance safeguards

- Only active employees hired on or before the cutoff end date are eligible.
  For daily/hourly employees hired during a cutoff, only the hire date through
  cutoff end is read for attendance and paid-leave credits; pre-hire DTRs cannot
  create pay.
- Monthly salary currently supports full **1–15** and **16–month-end** cutoffs.
  Mid-cutoff monthly hires and custom monthly periods are blocked until an
  approved proration policy is implemented; the system does not invent a formula
  or award a full half-month salary for a partial employment period.
- Under the current **Monday–Friday** model, every eligible weekday needs an
  explicit approved DTR (worked time, absence, holiday or rest-day exception) or
  approved full-day paid leave. Missing dates are not treated as worked time or
  automatically converted into absences. An approved zero-work workday without
  an explicit absence is also blocked. Half-day leave needs approved worked
  attendance; it cannot cover a missing or zero-work DTR.
- Payroll errors identify the employee and missing dates. Correct and approve
  attendance through **Attendance & DTR**, then retry. A failed run rolls back
  payslips, loan collections and payroll audit records together.

This is not a configurable shift/holiday calendar or validated new-hire/statutory
proration policy. Weekend/rotating schedules and the remaining calculation and
compliance release gates still need dedicated validation.

## Allowance frequency and loan repayment windows

Regular payroll resolves configured allowances before applying tax/de minimis
classification:

- `PER_CUTOFF` grants the full configured amount each cutoff.
- `MONTHLY` grants half on the first cutoff and the remaining half on the second;
  an odd centavo belongs to the second cutoff. The two shares exactly conserve
  the configured monthly amount. A missing first-cutoff grant is not automatically
  carried into a later run.
- Unsupported frequencies, negative allowance amounts, and missing/inconsistent
  de minimis category/type configuration block payroll. Monthly allowances for mid-cutoff hires or
  custom periods also block until an approved allowance-proration policy exists.

Active, positive-balance loans are deducted only when the **cutoff end civil date**
falls inside their inclusive `startDate`/`endDate` repayment window. A null end
date is open-ended. Starting during the cutoff makes one full configured
per-cutoff amortization eligible, subject to available net pay and the remaining
balance; it is not daily-prorated. A later payment date does not make a
future-effective loan eligible. Expired balances remain outstanding for review;
the system neither collects past the configured end date nor marks them settled.
Invalid active repayment dates/amounts block payroll. The loan-creation API also
rejects an end date before its start date.

Replays preserve posted payslips and do not grant/collect again. Cancellation
refunds only actual installment ledger entries, even if loan dates have since
changed; recalculation uses the current configuration. Monthly allowance splitting
and cutoff-end loan eligibility are development scheduling conventions, not
independent approval of employee contracts, company policy, or statutory treatment.
Versioned allowance changes, missing-cutoff true-ups and partial-period policy
remain separate validation requirements.

## Manila biometrics and half-day leave reconciliation

Biometric CSV timestamps without an offset are interpreted as **Asia/Manila
wall time (UTC+08:00)**. Explicit ISO `Z`/offset timestamps are instants. DTR
grouping, shift comparisons and night-window overlap use Manila civil dates,
independent of the server timezone. Supported simple CSV formats are:

```csv
Employee_ID,Timestamp,Punch_Type
EMP001,2026-09-21 09:00:00,CHECK_IN
EMP001,2026-09-21T10:00:00Z,CHECK_OUT
```

Separate `ID,Date,Time,Type` columns are also supported. Types are `CHECK_IN`,
`CHECK_OUT`, `AUTO`, `1` (in), or `2` (out); omitted types mean `AUTO`. Invalid
dates/formats are rejected rather than silently skipped. Multiple, duplicate,
inverted or unmatched punches are flagged for reconciliation, not invented
worked time. Overnight shift pairing is not implemented.

Imports create **unapproved** DTRs only for the caller's tenant. HR must review
the shift, break and holiday treatment through Attendance & DTR before approving.
CSV imports cannot overwrite an existing DTR: use a versioned correction with a
reason. The API's complete import and import audit share one serializable
transaction; malformed/conflicting batches and audit failures leave no partial
imports. Re-uploading already-recorded dates returns a conflict, not an upsert.

Under the supported eight-hour weekday model, approved half-day paid leave
credits 240 minutes without converting it into worked time. Payroll accepts
consistent full-shift deduction minutes or already leave-adjusted minutes,
removes the paid half day only once, and preserves actual remaining tardiness or
undertime. The source DTR is unchanged. Ambiguous split shortfalls, missing
deductions and incompatible clock/break totals block payroll for manual review.
There is still no approved AM/PM leave-slot, rotating/overnight shift or break
calendar; biometric estimates and these reconciliation rules are not statutory
or company-policy certification.

## Large synthetic sandbox dataset

The former in-memory demonstration page has been removed. Sample data now lives
in PostgreSQL and is read through the real portal/API.

`pnpm --filter @workspace/api seed:sandbox` adds a deterministic 2026 fixture
dataset to the explicitly marked browser sandbox tenant, preserving existing
employees, accounts and passwords. Build the API and its workspace dependencies
first. The default adds **200 employees**, 5 branches, 8 departments,
39,400 weekday attendance records from January 1 through October 2,
18 regular cutoff runs (January–September),
3,600 payslips, 600 leave balances/credit allocations, 1,200 varied leave requests,
50 loans with matching installment ledgers, overtime, and clearly synthetic tax evidence.

```powershell
# DATABASE_URL must point to your migrated LOCAL payroll_browser/payroll_test.
$env:NODE_ENV = 'test'
$env:PAYROLL_SANDBOX_SEED = '1'
$env:PAYROLL_SANDBOX_ORGANIZATION_ID = '<sandbox-organization-uuid>'
$env:PAYROLL_SANDBOX_EMPLOYEES = '200' # optional; 20–500
pnpm exec turbo build --filter=@workspace/api...
pnpm --filter @workspace/api seed:sandbox
```

The target must be named `Payroll Browser Sandbox — Synthetic Records Only`,
with existing `admin@sandbox.test` (SUPER_ADMIN) and `payroll@sandbox.test`
(PAYROLL_SPECIALIST) accounts. Other tenants, remote databases, non-test database
names, custom schemas and production mode are refused. Inserts and the completion
marker share one transaction; failure rolls back the dataset. Re-running the same
seed version is a no-op, and changing the employee count after seeding is rejected.
Bootstrap `db:seed` also now refuses populated or remote/production databases rather
than deleting them. Remove these shell environment overrides afterward.

**These are fictional fixtures, not real employment history, legal leave entitlements,
approved shifts, regulatory calculations, remittances or bank payments.** Historical
DISBURSED/APPROVED states are synthetic display scenarios, with explicit seed audit
labels. No certificates, settlement/payment attestations, bank files or new login
accounts are generated. Existing live-payroll release gates remain open.

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
The amount is a **new total**, not an increment. This form never resets/refunds usage;
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
Approval debits and cancellation refunds remain in audit records separately. Existing balances are not
backfilled as verified ledger entries. Unchanged totals may be explicitly recorded
with a fresh source/reason, but neither that history nor a reference string proves
statutory eligibility or source authenticity. Automatic accrual, carryover, leave
general/external usage corrections and durable source-document storage are not implemented.

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

Staff with timekeeping access can withdraw pending requests; the API also permits
linked employees to withdraw their own pending requests. Approved reversal is a
separate HR/super-admin operation, never a linked-self refund. Both require a
10–500-character reason and preserve original approval/cancellation provenance.
A stale withdrawal cannot reverse an intervening approval. Every non-cancelled
regular cutoff, including drafts and disbursed runs, blocks approved reversal.
Paid approval now records its exact debit balance and days; reversal restores
that recorded amount once, with a balance revision and transactional request and
balance audits. Replays preserve the first cancellation actor/reason, and refunds
invalidate stale credit edits. Legacy paid approvals without debit provenance,
missing balances or inconsistent usage require manual reconciliation: aggregate
usage is not proof of a refundable debit. Unpaid reversals and pending withdrawals
never change credits. Cancellation does not alter DTRs or payroll snapshots;
explicitly reconcile attendance before any future payroll, without assuming
worked time or absence. Cancelled dates may be refiled subject to normal checks.

Filing and its audit commit together. Approval, any paid-credit debit, and the
before/after audit also commit together, as do rejection, actor/reason and its
audit. Concurrent decisions cannot overdraw or replace each other; replays retain
the original decision and do not debit/audit twice. Unpaid approval does not
write absence DTRs; reconcile attendance explicitly. Drafts are not stored in the
browser and survive background refresh failures. Browser tests mock tRPC;
PostgreSQL tests cover persistence, tenant isolation, audit rollback and races.

Deploy migrations `20261002000000_leave_rejection`,
`20261002010000_leave_credit_changes` and `20261003000000_leave_cancellation`
with `pnpm db:migrate:deploy` before using the updated API. They add rejection and
cancellation/debit provenance, a balance revision and the credit change table; existing credit amounts/usage remain unchanged, and no entitlement
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

## Final-pay previews (not settlements)

`employees.calculateFinalPay` is an HR/super-admin **read-only development preview**.
It does not post payroll, debit leave, collect a loan, issue a tax certificate or
pay a refund. There is no final-pay portal editor or posting workflow yet.

The API requires an explicit exit date, unpaid final-period days (0–31), unused
SIL days (0–366), and `authorizedLoanDeductionsCents` as a bounded nonnegative
centavo string. Days use whole/half-day steps. Entering zero is an explicit
scenario statement, not independent verification. Positive monetization also
requires `priorMonetizedLeaveDaysInYear`, including explicitly verified zero,
and sufficient consistent recorded SIL availability; missing credits never
become an assumed five-day grant. Positive proposed debt deductions require a
`loanAuthorizationReference` and cannot exceed recorded debt. Outstanding debt
is shown separately and is not automatically deducted. References are
attestations, not proof of lawful authorization or inspected documents.

Retirement scenarios require explicit `retirementBenefitTaxTreatment`
(`EXEMPT`/`TAXABLE`), `isRepeatRetirementClaim`, and
`retirementTaxSourceReference`. The limited statutory preview cannot infer an
exemption from age, round a shorter tenure into five-year eligibility, or model
private-plan/early-retirement coverage. Anniversary-derived service years and
age use UTC civil dates, not a 365.25-day approximation. Company-covered service
and any overrides still require independent review.

The service reads employee, disbursed ledger, effective prior-employer evidence
and latest tax settlement in one repeatable-read snapshot. A prior-employer
declaration is required; transcribed prior taxable income/withholding are added
without re-bucketing them as present-employer benefits. Recorded refunds and
deficiency collections reduce the remaining tax difference instead of being
proposed again. Pending employee/remittance corrections and employee payroll
reservations in DRAFT/PROCESSING/AUDITED/APPROVED block the preview. Unclassified
MWE income, inconsistent sources and unsupported retirement policies fail
closed for manual reconciliation.

The result retains `signedNetFinalPayCents` and `unfundedDeductionsCents` when
proposed deductions exceed available final pay; the payable display is zero,
not proof of collection. This is an exit-year projection using currently
recorded compensation, not a historical rate snapshot or a complete settlement
of prior-year arrears, external leave usage or debt. Rules, entitlements,
authorizations, exemptions and actual payments remain release gates.

Periodic and annual withholding arithmetic use BigInt centavos and half-up
rounding of the final fractional tax centavo. These arithmetic tests do not
establish approval of the configured tables, classifications or effective dates.

## Compliance previews (not filing documents)

`compliance.listYearEndReconciliations` provides a tenant-scoped, read-only
review queue; `compliance.previewBir2316Reconciliation` produces an internal,
read-only worksheet, **not** an official BIR Form 2316. HR staff can record
write-once, self-reported prior-employer declarations/income and monthly
remittance references; `compliance.getTaxEvidence` reads the references with
full supersession history. Effective evidence rows are never edited: the
`compliance.correct*` procedures now create **pending proposals**, not immediate
replacement evidence. `compliance.listTaxCorrections` exposes the oldest 100
pending requests for a tenant/year, including recorded/proposed values.
`compliance.reviewTaxCorrection` publishes a higher version only when a different
**signed-in, active HR/admin** approves with a written review reason. Reviewer
identity comes from the session; caller-supplied reviewer/provenance fields are
rejected. Payroll specialists may propose settlement corrections but cannot
review them. Rejection retains the proposal and leaves effective evidence
unchanged. Duplicate pending targets, self-review, inactive/demoted/foreign
reviewers and concurrent duplicate decisions are blocked. Changed target
evidence (or changed payroll/evidence sources for settlement proposals) requires
rejection and a fresh request. Every reader annualizes, remits and settles from
the latest **approved** version per key. The
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
voided, never deleted; a re-issue appends a new version. Pending corrections for
the employee or organization remittances block issuance. Evidence recording,
proposal/review, settlement recording and issuance/void APIs commit with their
audits in serializable transactions; audit failures leave no partial versions.

Issuances freeze a lossless, versioned source fingerprint covering employee and
employer identity, compensation, disbursed payroll paid in the tax year, and tax
evidence/settlement versions. Reads and review-queue rows report **CURRENT**,
**STALE**, **UNVERIFIABLE** (legacy snapshot without a fingerprint), or **VOIDED**.
`CURRENT` means only that captured sources match; it is not tax/form approval.
The check is conservative: even a reference-only or employee metadata change
may require review. Pending proposals alone do not change effective sources.
Stale snapshots stay frozen; HR must review, void and re-issue, never silently
refresh them. Fingerprint format changes must accompany source/calculation-policy
changes. This is not a digital signature or proof of source-document authenticity.

Apply migration `20261003010000_tax_correction_review` and regenerate the Prisma
client before running the updated API. Old correction clients supplying a
reviewer UUID must switch to the pending-request/review workflow.

No filing-eligibility
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

Regular and 13th-month run creation, approval, disbursement marking and
cancellation now commit their payroll changes and audit record in the same
database transaction. Audit persistence failures roll back payslips, loan
collections/refunds and run changes. Approval/disbursement use conditional
state transitions with serializable conflict retries: concurrent checkers cannot
overwrite the winning approval, and only one disbursement transition succeeds.
Repeated approval/disbursement requests return a conflict; reload the run after
an uncertain response rather than assuming it failed. Identical run-creation
retries return the existing run without another creation audit or loan debit.
Cancellation retains the removed run/payslip snapshot in its transactional
audit and refunds loans once; repeating cancellation for the removed ID returns
not found. Marking a run `DISBURSED` does not send money or verify a bank transfer.

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

## Portal session and cache isolation

Authentication queries use a stable root cache; business queries/mutations use
an independently disposable cache keyed by verified user, organization, role
and linked employee. Focus session checks remain enabled. A scope change or
expiry discards business drafts/cache and cancels reads before another account
can observe them; returning to an earlier account starts a fresh cache. Display
name/email changes alone do not discard same-account drafts. Failed background
session/data refreshes retain same-principal drafts; employee registration
choices show a cached-data warning rather than unmounting the editor. No
business drafts, identifiers or passwords are added to browser storage.

Portal business requests include `x-payroll-principal`, non-secret identity
freshness metadata. The API compares it with its **server-authenticated** user
before protected reads/writes and rejects mismatches with UNAUTHORIZED. This is
not a credential or a trusted role/tenant assertion; existing clients without
the optional hint still require normal authentication and authorization. A
rejection causes the portal to recheck authentication, not automatically retry
a mutation as another user. Requests already authorized before an account
switch may still commit server-side; cancelling/discarding client state cannot
undo those writes. Their original actor and server transaction safeguards still
apply. Cached identity accompanying an expired-session error never redirects
the sign-in screen back into the portal.

## Authentication and authorization

The API uses opaque, random session tokens stored only in an `HttpOnly`, `SameSite=Lax` cookie. Passwords are hashed with Node's scrypt implementation, sessions are stored as hashes, and browser origins are checked against `CORS_ORIGIN`.

Create the first tenant administrator only after an organization exists:

```bash
# Set BOOTSTRAP_ORGANIZATION_ID, BOOTSTRAP_ADMIN_EMAIL,
# BOOTSTRAP_ADMIN_NAME, and BOOTSTRAP_ADMIN_PASSWORD in .env.
pnpm auth:bootstrap
```

The bootstrap command refuses to overwrite an existing account. API roles are `SUPER_ADMIN`, `HR_ADMIN`, `PAYROLL_SPECIALIST`, `DEPARTMENT_MANAGER`, and `EMPLOYEE`. Tenant identifiers are derived from the authenticated session rather than accepted from API clients. Sensitive mutations and compliance exports write to `AuditLog`.
