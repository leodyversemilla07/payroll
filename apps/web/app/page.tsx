"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { trpc } from "@/lib/trpc";

const staffRoles = ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_SPECIALIST"];

function pesos(cents: bigint | number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(cents) / 100);
}

function date(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(new Date(value));
}

const panel = "rounded-xl border border-slate-800 bg-slate-900 p-6";

export default function Portal() {
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<string | null>(null);
  function clearAccountData() {
    setSelectedRun(null);
    setSelectedSlip(null);
    queryClient.clear();
  }
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      // Never carry results from another account across a sign-in.
      clearAccountData();
      await me.refetch();
    },
  });
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      clearAccountData();
      void me.refetch();
    },
  });

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await login
      .mutateAsync({
        email: String(data.get("email")),
        password: String(data.get("password")),
      })
      .catch(() => {
        /* Error is displayed below; never expose credentials. */
      });
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">SweldoPH</h1>
            <p className="text-slate-400">
              Payroll portal · API-backed records
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link className="text-blue-300 underline" href="/demo">
              Try the separate demo
            </Link>
            {me.data && (
              <button
                type="button"
                className="rounded bg-slate-700 px-4 py-2"
                disabled={logout.isPending}
                onClick={() => logout.mutate()}
              >
                {logout.isPending ? "Signing out…" : "Sign out"}
              </button>
            )}
          </div>
        </header>
        <p
          role="note"
          className="rounded-lg border border-amber-700 bg-amber-950/50 p-3 text-sm text-amber-200"
        >
          Not validated for live payroll. Regulatory, annual-tax/BIR 2316 and
          bank-file checks remain outstanding.
        </p>
        {me.isPending ? (
          <p role="status">Checking your session…</p>
        ) : me.data ? (
          <>
            <p>
              Signed in as <strong>{me.data.name}</strong> (
              {me.data.role.replaceAll("_", " ")})
            </p>
            {logout.isError && (
              <p role="alert">Sign out failed. Please retry.</p>
            )}
            {staffRoles.includes(me.data.role) ? (
              <StaffPortal
                selectedRun={selectedRun}
                setSelectedRun={(id) => {
                  setSelectedRun(id);
                  setSelectedSlip(null);
                }}
                selectedSlip={selectedSlip}
                setSelectedSlip={setSelectedSlip}
              />
            ) : (
              <section className={panel}>
                <h2 className="text-xl font-semibold">
                  No staff records available
                </h2>
                <p className="mt-2 text-slate-400">
                  Employee and payroll-run lists require a payroll or HR staff
                  role.
                </p>
              </section>
            )}
          </>
        ) : me.error?.data?.code === "UNAUTHORIZED" ? (
          <section
            className="mx-auto w-full max-w-md py-8"
            aria-label="Staff sign in"
          >
            <Card className="border border-slate-800 bg-slate-900 py-8 text-slate-100 shadow-xl shadow-black/20">
              <CardHeader className="gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">
                  Secure staff access
                </p>
                <CardTitle className="text-2xl font-semibold text-slate-50">
                  <h2>Sign in</h2>
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Use your SweldoPH staff account to view payroll records.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={signIn} className="space-y-6">
                  <FieldGroup className="gap-5">
                    <Field>
                      <FieldLabel
                        htmlFor="staff-email"
                        className="text-slate-200"
                      >
                        Email
                      </FieldLabel>
                      <Input
                        id="staff-email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        placeholder="name@company.com"
                        required
                        className="h-11 bg-slate-950 text-slate-50 placeholder:text-slate-500"
                      />
                    </Field>
                    <Field>
                      <FieldLabel
                        htmlFor="staff-password"
                        className="text-slate-200"
                      >
                        Password
                      </FieldLabel>
                      <Input
                        id="staff-password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        className="h-11 bg-slate-950 text-slate-50"
                      />
                    </Field>
                    {login.isError && (
                      <FieldError className="text-red-300">
                        {login.error.data?.code === "UNAUTHORIZED"
                          ? "Invalid email or password."
                          : "Sign in failed. Please retry."}
                      </FieldError>
                    )}
                    <Field>
                      <Button
                        type="submit"
                        disabled={login.isPending}
                        className="h-11 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-500"
                      >
                        {login.isPending ? "Signing in…" : "Sign in"}
                      </Button>
                      <FieldDescription className="text-center text-slate-400">
                        Access is provisioned by your payroll administrator.
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
          </section>
        ) : (
          <section className={panel}>
            <p role="alert">
              Could not reach the payroll API. Check that it is running, then
              retry.
            </p>
            <button
              type="button"
              className="mt-3 text-blue-300 underline"
              onClick={() => void me.refetch()}
            >
              Retry
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

function StaffPortal({
  selectedRun,
  setSelectedRun,
  selectedSlip,
  setSelectedSlip,
}: {
  selectedRun: string | null;
  setSelectedRun: (id: string | null) => void;
  selectedSlip: string | null;
  setSelectedSlip: (id: string | null) => void;
}) {
  const employees = trpc.employees.list.useQuery(undefined, { retry: false });
  const runs = trpc.payroll.listRuns.useQuery(undefined, { retry: false });
  const details = trpc.payroll.getRunDetails.useQuery(
    { runId: selectedRun ?? "" },
    { enabled: !!selectedRun, retry: false },
  );
  const slip = details.data?.payslips.find(
    (entry) => entry.id === selectedSlip,
  );

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        <section className={panel} aria-label="Employees">
          <h2 className="mb-4 text-xl font-semibold">Employees</h2>
          {employees.isPending ? (
            <p role="status">Loading employees…</p>
          ) : employees.isError ? (
            <p role="alert">
              Could not load employees.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void employees.refetch()}
              >
                Retry
              </button>
            </p>
          ) : employees.data.length === 0 ? (
            <p>No employees found.</p>
          ) : (
            <ul className="space-y-2">
              {employees.data.map((employee) => (
                <li
                  key={employee.id}
                  className="rounded border border-slate-700 p-3"
                >
                  <strong>
                    {employee.firstName} {employee.lastName}
                  </strong>
                  <span className="block text-sm text-slate-400">
                    {employee.employeeNumber} · {employee.employmentStatus}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={panel} aria-label="Payroll runs">
          <h2 className="mb-4 text-xl font-semibold">Payroll runs</h2>
          {runs.isPending ? (
            <p role="status">Loading payroll runs…</p>
          ) : runs.isError ? (
            <p role="alert">
              Could not load payroll runs.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void runs.refetch()}
              >
                Retry
              </button>
            </p>
          ) : runs.data.length === 0 ? (
            <p>No payroll runs found.</p>
          ) : (
            <ul className="space-y-2">
              {runs.data.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    aria-pressed={selectedRun === run.id}
                    className="w-full rounded border border-slate-700 p-3 text-left hover:border-blue-400"
                    onClick={() => setSelectedRun(run.id)}
                  >
                    <strong>{date(run.paymentDate)}</strong>
                    <span className="block text-sm text-slate-400">
                      {run.cutoffSequence.replaceAll("_", " ")} · {run.status} ·{" "}
                      {run._count.payslips} payslips ·{" "}
                      {pesos(run.totalNetCents)} net
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {selectedRun && (
        <section className={panel} aria-label="Run details">
          <h2 className="mb-4 text-xl font-semibold">Run details</h2>
          {details.isPending ? (
            <p role="status">Loading payslips…</p>
          ) : details.isError ? (
            <p role="alert">
              Could not load payslips.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void details.refetch()}
              >
                Retry
              </button>
            </p>
          ) : !details.data ? (
            <p>Run not found.</p>
          ) : (
            <>
              <p className="mb-4 text-slate-400">
                {date(details.data.cutoffStartDate)} –{" "}
                {date(details.data.cutoffEndDate)} · {details.data.status} ·
                Gross {pesos(details.data.totalGrossCents)} · Net{" "}
                {pesos(details.data.totalNetCents)}
              </p>
              {details.data.payslips.length === 0 ? (
                <p>No payslips in this run.</p>
              ) : (
                <ul className="space-y-2">
                  {details.data.payslips.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        aria-pressed={selectedSlip === entry.id}
                        className="w-full rounded border border-slate-700 p-3 text-left hover:border-blue-400"
                        onClick={() => setSelectedSlip(entry.id)}
                      >
                        {entry.employee.firstName} {entry.employee.lastName} ·{" "}
                        {entry.employee.employeeNumber}{" "}
                        <span className="text-slate-400">
                          — {pesos(entry.netPayCents)} net
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {slip && (
                <article
                  className="mt-6 rounded border border-blue-800 p-4"
                  aria-label="Payslip detail"
                >
                  <h3 className="mb-3 text-lg font-semibold">
                    Payslip · {slip.employee.firstName} {slip.employee.lastName}
                  </h3>
                  <p className="mb-2 text-sm text-slate-400">
                    Amounts in Philippine pesos; read-only record (not a PDF or
                    proof of disbursement).
                  </p>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    {(
                      [
                        ["Basic pay", slip.basicPayCents],
                        [
                          "Paid leave (included in basic)",
                          slip.paidLeavePayCents,
                        ],
                        ["Overtime", slip.overtimePayCents],
                        ["Night differential", slip.nightDiffPayCents],
                        ["Holiday pay", slip.holidayPayCents],
                        ["Rest day pay", slip.restDayPayCents],
                        ["Taxable allowances", slip.taxableAllowancesCents],
                        [
                          "Non-taxable allowances",
                          slip.nonTaxableAllowancesCents,
                        ],
                        [
                          "13th month/bonus payout (included in gross)",
                          slip.bonusPaidCents,
                        ],
                        ["Gross pay", slip.grossPayCents],
                        ["Tardiness", slip.tardinessDeductionCents],
                        ["Undertime", slip.undertimeDeductionCents],
                        ["Absence", slip.absenceDeductionCents],
                        ["SSS (including WISP)", slip.sssEmployeeCents],
                        [
                          "WISP (included in SSS above)",
                          slip.sssWispEmployeeCents,
                        ],
                        ["PhilHealth", slip.philhealthEmployeeCents],
                        ["Pag-IBIG", slip.pagibigEmployeeCents],
                        ["Withholding tax", slip.withholdingTaxCents],
                        ["Loans", slip.loanDeductionsCents],
                        ["Other deductions", slip.otherDeductionsCents],
                        ["Total deductions", slip.totalDeductionsCents],
                        ["Net pay", slip.netPayCents],
                      ] as const
                    ).map(([label, amount]) => (
                      <div key={label} className="contents">
                        <dt>{label}</dt>
                        <dd className="text-right font-medium">
                          {pesos(amount)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
