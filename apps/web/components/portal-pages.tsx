"use client";

import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Banknote, CalendarDays, CreditCard, Users } from "lucide-react";
import Link from "next/link";
import { portalSections } from "@/lib/portal-navigation";
import { trpc } from "@/lib/trpc";
import { EmployeesSection } from "./employees-section";
import { HolidaysSection } from "./holidays-section";
import { LeavePoliciesSection } from "./leave-policies-section";
import { LeavesSection } from "./leaves-section";
import { usePortalUser } from "./payroll-portal";
import { TimekeepingSection } from "./timekeeping-section";
import { YearEndTaxSection } from "./year-end-tax";

function pesos(value: bigint | number | string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value) / 100);
}

function formatDate(value: Date | string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-PH", {
        timeZone: "UTC",
        dateStyle: "medium",
      }).format(new Date(value))
    : "—";
}

function useStaffEmployees() {
  const employees = trpc.employees.list.useQuery(undefined, { retry: false });
  return {
    employees: (employees.data ?? []).map((entry) => ({
      id: entry.id,
      firstName: entry.firstName,
      lastName: entry.lastName,
      employeeNumber: entry.employeeNumber,
      employmentStatus: entry.employmentStatus,
    })),
    employeeListFailed: employees.isError,
  };
}

export function PortalOverview() {
  const overview = trpc.dashboard.getOverview.useQuery(undefined, {
    retry: false,
  });

  return (
    <div className="space-y-6">
      {overview.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-40" />
            </Card>
          ))}
        </div>
      ) : overview.isError && !overview.data ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-amber-900 dark:text-amber-200">
              Dashboard statistics unavailable
            </CardTitle>
            <CardDescription>
              Could not refresh latest organizational metrics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void overview.refetch()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : overview.data ? (
        <>
          <section
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Dashboard metrics"
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Employees
                </CardTitle>
                <Users
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {overview.data.employees.active}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    / {overview.data.employees.total} total
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {overview.data.employees.onLeave} on leave ·{" "}
                  {overview.data.employees.resigned} resigned
                </p>
                <Link
                  href="/portal/employees"
                  className="mt-3 inline-flex items-center text-xs font-medium text-primary hover:underline"
                >
                  Manage employees &rarr;
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Latest Payroll
                </CardTitle>
                <Banknote
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {overview.data.payroll.latestRun
                    ? pesos(overview.data.payroll.latestRun.totalNetCents)
                    : "No runs yet"}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {overview.data.payroll.latestRun
                    ? `${overview.data.payroll.latestRun.status} · ${formatDate(
                        overview.data.payroll.latestRun.paymentDate,
                      )}`
                    : "Start your first payroll run"}
                </p>
                <Link
                  href="/portal/payroll-runs"
                  className="mt-3 inline-flex items-center text-xs font-medium text-primary hover:underline"
                >
                  View payroll runs &rarr;
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pending Leaves
                </CardTitle>
                <CalendarDays
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {overview.data.leaves.pendingCount}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {overview.data.leaves.pendingCount === 1
                    ? "1 request requires review"
                    : `${overview.data.leaves.pendingCount} requests require review`}
                </p>
                <Link
                  href="/portal/leaves"
                  className="mt-3 inline-flex items-center text-xs font-medium text-primary hover:underline"
                >
                  Review leave requests &rarr;
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Loans
                </CardTitle>
                <CreditCard
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {pesos(overview.data.loans.totalOutstandingCents)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {overview.data.loans.activeCount}{" "}
                  {overview.data.loans.activeCount === 1
                    ? "active loan"
                    : "active loans"}
                </p>
                <span className="mt-3 block text-xs text-muted-foreground">
                  Auto-deducted during payroll
                </span>
              </CardContent>
            </Card>
          </section>

          {overview.data.payroll.recentRuns.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    Recent Payroll Runs
                  </CardTitle>
                  <CardDescription>
                    Last {overview.data.payroll.recentRuns.length} cutoffs
                    processed
                  </CardDescription>
                </div>
                <Link
                  href="/portal/payroll-runs"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  View all
                </Link>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Cutoff Period</th>
                        <th className="pb-2 font-medium">Payment Date</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium text-right">Net Pay</th>
                        <th className="pb-2 font-medium text-right">
                          Employees
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {overview.data.payroll.recentRuns.map((run) => (
                        <tr key={run.id} className="hover:bg-muted/50">
                          <td className="py-2.5">
                            <span className="font-medium">
                              {formatDate(run.cutoffStartDate)} –{" "}
                              {formatDate(run.cutoffEndDate)}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              (
                              {run.cutoffSequence === "FIRST_CUTOFF"
                                ? "1st Cutoff"
                                : "2nd Cutoff"}
                              )
                            </span>
                          </td>
                          <td className="py-2.5 text-muted-foreground">
                            {formatDate(run.paymentDate)}
                          </td>
                          <td className="py-2.5">
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                              {run.status}
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-medium">
                            {pesos(run.totalNetCents)}
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">
                            {run.payslipCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Workspace Navigation
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {portalSections
            .filter((section) => section.id !== "overview")
            .map((section) => (
              <Card
                key={section.id}
                className="hover:border-primary/50 transition-colors"
              >
                <CardHeader>
                  <section.icon
                    className="mb-2 size-5 text-primary"
                    aria-hidden="true"
                  />
                  <CardTitle>{section.label}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    className="text-sm font-medium text-primary underline underline-offset-4"
                    href={section.href}
                  >
                    Open {section.label}
                  </Link>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>
    </div>
  );
}

export function PortalEmployees() {
  const { canManageEmployees } = usePortalUser();
  return <EmployeesSection canCreate={canManageEmployees} />;
}

export function PortalAttendance() {
  const props = useStaffEmployees();
  const { user } = usePortalUser();
  const canImport = [
    "SUPER_ADMIN",
    "HR_ADMIN",
    "PAYROLL_SPECIALIST",
    "DEPARTMENT_MANAGER",
  ].includes(user.role);
  return <TimekeepingSection {...props} canImport={canImport} />;
}

export function PortalLeaves() {
  const props = useStaffEmployees();
  const { user, canManageEmployees } = usePortalUser();
  return (
    <div className="space-y-6">
      <LeavesSection
        {...props}
        canDecide={canManageEmployees}
        actorEmployeeId={user.employeeId}
      />
      <LeavePoliciesSection canManage={canManageEmployees} />
    </div>
  );
}

export function PortalYearEndTax() {
  const { employees } = useStaffEmployees();
  return <YearEndTaxSection employees={employees} />;
}

export function PortalHolidays() {
  const { canManageEmployees } = usePortalUser();
  return <HolidaysSection canManage={canManageEmployees} />;
}
