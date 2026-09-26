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
import { Separator } from "@workspace/ui/components/separator";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

export function PayrollPortal() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<string | null>(null);
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const signedOut = me.error?.data?.code === "UNAUTHORIZED";
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      setSelectedRun(null);
      setSelectedSlip(null);
      queryClient.clear();
      void router.replace("/");
    },
  });

  useEffect(() => {
    if (signedOut) {
      void router.replace("/");
    }
  }, [router, signedOut]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Payroll</h1>
            <p className="text-slate-400">Payroll portal · API-backed records</p>
          </div>
          <div className="flex items-center gap-4">
            <Link className="text-blue-300 underline" href="/demo">
              Try the separate demo
            </Link>
            {me.data && (
              <Button
                type="button"
                variant="secondary"
                disabled={logout.isPending}
                onClick={() => logout.mutate()}
              >
                {logout.isPending ? "Signing out…" : "Sign out"}
              </Button>
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
        {me.isPending || signedOut ? (
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
              <Card>
                <CardHeader>
                  <CardTitle>No staff records available</CardTitle>
                  <CardDescription>
                  Employee and payroll-run lists require a payroll or HR staff
                  role.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="pt-5">
              <p role="alert">
                Could not reach the payroll API. Check that it is running, then
                retry.
              </p>
            <Link className="mt-3 inline-block text-blue-300 underline" href="/">
              Return to sign in
            </Link>
            </CardContent>
          </Card>
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
        <Card role="region" aria-label="Employees">
          <CardHeader>
            <CardTitle>Employees</CardTitle>
          </CardHeader>
          <CardContent>
          {employees.isPending ? (
            <p role="status">Loading employees…</p>
          ) : employees.isError ? (
            <p role="alert">
              Could not load employees. {" "}
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
                <li key={employee.id}>
                  <Card size="sm">
                    <CardContent className="py-3">
                  <strong>
                    {employee.firstName} {employee.lastName}
                  </strong>
                  <span className="block text-sm text-slate-400">
                    {employee.employeeNumber} · {employee.employmentStatus}
                  </span>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          </CardContent>
        </Card>
        <Card role="region" aria-label="Payroll runs">
          <CardHeader>
            <CardTitle>Payroll runs</CardTitle>
          </CardHeader>
          <CardContent>
          {runs.isPending ? (
            <p role="status">Loading payroll runs…</p>
          ) : runs.isError ? (
            <p role="alert">
              Could not load payroll runs. {" "}
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
                  <Button
                    type="button"
                    aria-pressed={selectedRun === run.id}
                    variant="outline"
                    className="h-auto w-full justify-start whitespace-normal p-3 text-left"
                    onClick={() => setSelectedRun(run.id)}
                  >
                    <strong>{date(run.paymentDate)}</strong>
                    <span className="block text-sm text-slate-400">
                      {run.cutoffSequence.replaceAll("_", " ")} · {run.status} ·{" "}
                      {run._count.payslips} payslips · {pesos(run.totalNetCents)} net
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          </CardContent>
        </Card>
      </div>
      {selectedRun && (
        <Card role="region" aria-label="Run details">
          <CardHeader>
            <CardTitle>Run details</CardTitle>
          </CardHeader>
          <CardContent>
          {details.isPending ? (
            <p role="status">Loading payslips…</p>
          ) : details.isError ? (
            <p role="alert">
              Could not load payslips. {" "}
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
                {date(details.data.cutoffStartDate)} – {" "}
                {date(details.data.cutoffEndDate)} · {details.data.status} ·
                Gross {pesos(details.data.totalGrossCents)} · Net {" "}
                {pesos(details.data.totalNetCents)}
              </p>
              {details.data.payslips.length === 0 ? (
                <p>No payslips in this run.</p>
              ) : (
                <ul className="space-y-2">
                  {details.data.payslips.map((entry) => (
                    <li key={entry.id}>
                      <Button
                        type="button"
                        aria-pressed={selectedSlip === entry.id}
                        variant="outline"
                        className="h-auto w-full justify-start whitespace-normal p-3 text-left"
                        onClick={() => setSelectedSlip(entry.id)}
                      >
                        {entry.employee.firstName} {entry.employee.lastName} ·{" "}
                        {entry.employee.employeeNumber} {" "}
                        <span className="text-slate-400">
                          — {pesos(entry.netPayCents)} net
                        </span>
                      </Button>
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
                  <Separator className="mb-4" />
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
          </CardContent>
        </Card>
      )}
    </>
  );
}