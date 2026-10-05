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
import {
  ArrowRight,
  Banknote,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  UserCircle,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  isSectionAllowedForRole,
  portalSections,
} from "@/lib/portal-navigation";
import { manilaToday } from "@/lib/attendance-time";
import { trpc } from "@/lib/trpc";
import { EmployeesSection } from "./employees-section";
import { HolidaysSection } from "./holidays-section";
import { LeavePoliciesSection } from "./leave-policies-section";
import { LeavesSection } from "./leaves-section";
import { usePortalUser } from "./payroll-portal";
import { PendingLeaveApprovalsSection } from "./pending-leave-approvals";
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

function EmployeeOverview({
  user,
}: {
  user: {
    id?: string;
    organizationId?: string;
    employeeId?: string | null;
    name: string;
    email?: string;
    role: string;
  };
}) {
  const currentYear = new Date().getFullYear();

  const leaveBalancesQuery = trpc.leaves.getBalances.useQuery(
    { employeeId: user.employeeId ?? "", year: currentYear },
    { enabled: Boolean(user.employeeId), retry: false },
  );

  const payslipsQuery = trpc.payroll.getMyPayslips.useQuery(undefined, {
    enabled: Boolean(user.employeeId),
    retry: false,
  });

  const todayStr = manilaToday();
  const startOfMonth = `${todayStr.slice(0, 7)}-01`;

  const dtrQuery = trpc.timekeeping.getMyDTR.useQuery(
    {
      startDate: startOfMonth,
      endDate: todayStr,
    },
    { enabled: Boolean(user.employeeId), retry: false },
  );

  const holidaysQuery = trpc.holidays.list.useQuery(
    { year: currentYear },
    { retry: false },
  );

  // Derived metrics
  const balances = leaveBalancesQuery.data ?? [];
  const vacation = balances.find((b) => b.leaveType === "VACATION");
  const sick = balances.find((b) => b.leaveType === "SICK");

  const payslips = payslipsQuery.data ?? [];
  const latestPayslip = payslips[0];

  const dtrRecords = dtrQuery.data ?? [];
  const totalWorkedMinutes = dtrRecords.reduce(
    (sum, record) => sum + (record.actualWorkedMinutes || 0),
    0,
  );
  const totalHoursWorked = (totalWorkedMinutes / 60).toFixed(1);

  const holidaysList = holidaysQuery.data ?? [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingHolidays = holidaysList
    .filter((h) => new Date(h.date) >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const nextHoliday = upcomingHolidays[0] ?? holidaysList[0];

  return (
    <section className="space-y-6" aria-label="Employee overview">
      {/* Welcome Banner */}
      <Card className="bg-gradient-to-r from-primary/5 via-primary/[0.02] to-background border-primary/20">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">Welcome, {user.name}!</CardTitle>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Employee Self-Service
                </span>
              </div>
              <CardDescription>
                Access your personal compensation details, leave balances, recorded
                daily attendance, and payslips.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/portal/my-attendance"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Clock className="size-4 mr-1.5" />
                My Attendance
              </Link>
              <Link
                href="/portal/my-profile"
                className={buttonVariants({ variant: "default", size: "sm" })}
              >
                <UserCircle className="size-4 mr-1.5" />
                Profile & Payslips
              </Link>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Leave Balances */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Leave Balances</span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <CalendarDays className="size-4" />
            </div>
          </div>
          <div>
            {leaveBalancesQuery.isPending ? (
              <Skeleton className="h-7 w-28" />
            ) : vacation || sick ? (
              <div className="text-xl font-bold tracking-tight">
                {vacation?.balance ?? "0"}d VL · {sick?.balance ?? "0"}d SL
              </div>
            ) : (
              <div className="text-sm font-semibold text-muted-foreground">
                No credits allocated
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground flex items-center justify-between">
            <span>{currentYear} available credits</span>
            <Link
              href="/portal/my-profile"
              className="text-primary hover:underline font-medium"
            >
              Request →
            </Link>
          </p>
        </Card>

        {/* Latest Payslip Net Pay */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Latest Net Pay</span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
              <Banknote className="size-4" />
            </div>
          </div>
          <div>
            {payslipsQuery.isPending ? (
              <Skeleton className="h-7 w-32" />
            ) : latestPayslip ? (
              <div className="text-xl font-bold tracking-tight">
                {pesos(latestPayslip.netPayCents)}
              </div>
            ) : (
              <div className="text-sm font-semibold text-muted-foreground">
                No payslip issued yet
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground flex items-center justify-between truncate">
            <span className="truncate">
              {latestPayslip
                ? `${formatDate(latestPayslip.payrollRun.cutoffStartDate)} – ${formatDate(latestPayslip.payrollRun.cutoffEndDate)}`
                : "Awaiting next payroll"}
            </span>
            <Link
              href="/portal/my-profile"
              className="text-primary hover:underline font-medium shrink-0 ml-1"
            >
              History →
            </Link>
          </p>
        </Card>

        {/* Attendance Summary */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Recorded Attendance</span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
              <Clock className="size-4" />
            </div>
          </div>
          <div>
            {dtrQuery.isPending ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <div className="text-xl font-bold tracking-tight">
                {totalHoursWorked} hrs
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground flex items-center justify-between">
            <span>{dtrRecords.length} records logged</span>
            <Link
              href="/portal/my-attendance"
              className="text-primary hover:underline font-medium"
            >
              DTR →
            </Link>
          </p>
        </Card>

        {/* Next Holiday */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Next Holiday</span>
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-600 dark:text-purple-400">
              <CalendarCheck className="size-4" />
            </div>
          </div>
          <div>
            {holidaysQuery.isPending ? (
              <Skeleton className="h-7 w-32" />
            ) : nextHoliday ? (
              <div className="text-base font-bold tracking-tight truncate">
                {nextHoliday.name}
              </div>
            ) : (
              <div className="text-sm font-semibold text-muted-foreground">
                No upcoming holidays
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground flex items-center justify-between truncate">
            <span className="truncate">
              {nextHoliday ? formatDate(nextHoliday.date) : "Philippine calendar"}
            </span>
            <Link
              href="/portal/holidays"
              className="text-primary hover:underline font-medium shrink-0 ml-1"
            >
              View →
            </Link>
          </p>
        </Card>
      </div>

      {/* Two-Column Layout: Quick Action Hub & Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick Navigation Hub */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Self-Service Hub
            </CardTitle>
            <CardDescription>
              Quickly navigate to your daily employee operations.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/portal/my-attendance"
              className="group flex flex-col justify-between rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Clock className="size-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    My Attendance
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    DTR punches, tardiness, and worked hours
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/portal/my-profile"
              className="group flex flex-col justify-between rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <CalendarDays className="size-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    Leaves & Credits
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    File vacation or sick leave requests
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/portal/my-profile"
              className="group flex flex-col justify-between rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Banknote className="size-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    Payslips & Tax
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Itemized payslips and statutory deductions
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/portal/holidays"
              className="group flex flex-col justify-between rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <CalendarCheck className="size-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    Holiday Calendar
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Philippine statutory and regular holidays
                  </p>
                </div>
              </div>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Payslips Preview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">
                Recent Payslips
              </CardTitle>
              <CardDescription>
                Summary of your latest disbursed compensation.
              </CardDescription>
            </div>
            <Link
              href="/portal/my-profile"
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              View All <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {payslipsQuery.isPending ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : payslips.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                <FileText className="size-8 opacity-40 mb-2" />
                <p className="text-sm font-medium">No payslips available yet</p>
                <p className="text-xs">
                  Disbursed payroll payslips will appear here once finalized.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {payslips.slice(0, 3).map((payslip) => (
                  <div
                    key={payslip.id}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <div className="space-y-0.5">
                      <div className="font-medium">
                        {formatDate(payslip.payrollRun.cutoffStartDate)} –{" "}
                        {formatDate(payslip.payrollRun.cutoffEndDate)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Paid on {formatDate(payslip.payrollRun.paymentDate)} ·{" "}
                        <span className="font-medium text-foreground">
                          {payslip.payrollRun.cutoffSequence.replaceAll("_", " ")}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-foreground">
                        {pesos(payslip.netPayCents)}
                      </div>
                      <Link
                        href="/portal/my-profile"
                        className="text-xs text-primary hover:underline"
                      >
                        Details →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function PortalOverview() {
  const { user, isEmployee } = usePortalUser();

  const overview = trpc.dashboard.getOverview.useQuery(undefined, {
    enabled: !isEmployee,
    retry: false,
  });

  if (isEmployee) {
    return <EmployeeOverview user={user} />;
  }

  return (
    <div className="space-y-6">
      {overview.isPending ? (
        <div className="space-y-6">
          <div
            role="status"
            className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground shadow-xs"
          >
            <Loader2 className="size-4 animate-spin text-primary shrink-0" />
            <span>Loading dashboard analytics…</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="size-4 rounded-full" />
                </div>
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-3 w-40" />
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="space-y-1">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-8 w-20 rounded-md" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between border-b pb-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-16" />
              </div>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex justify-between py-2 border-b last:border-0"
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </CardContent>
          </Card>
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
            .filter(
              (section) =>
                section.id !== "overview" &&
                isSectionAllowedForRole(section.id, user.role),
            )
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
  const { canManageEmployees, isStaff } = usePortalUser();

  if (!isStaff) {
    return (
      <Card role="region" aria-label="Employee directory restricted">
        <CardHeader>
          <CardTitle>No staff records available</CardTitle>
          <CardDescription>
            Employee and payroll-run lists require a payroll or HR staff role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            You can review your personal records, compensation, leave balances,
            and payslips in your profile.
          </p>
          <Link
            href="/portal/my-profile"
            className={buttonVariants({ variant: "default" })}
          >
            Go to My Profile
          </Link>
        </CardContent>
      </Card>
    );
  }

  return <EmployeesSection canCreate={canManageEmployees} />;
}

export function PortalAttendance() {
  const props = useStaffEmployees();
  const { user, isStaff } = usePortalUser();

  if (!isStaff) {
    return (
      <Card role="region" aria-label="Attendance restricted">
        <CardHeader>
          <CardTitle>No staff records available</CardTitle>
          <CardDescription>
            Employee and payroll-run lists require a payroll or HR staff role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            You can view your daily time records and punch history in your
            personal attendance page.
          </p>
          <Link
            href="/portal/my-attendance"
            className={buttonVariants({ variant: "default" })}
          >
            Go to My Attendance
          </Link>
        </CardContent>
      </Card>
    );
  }

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
  const { user, canManageLeavePolicies, canApproveLeaves } = usePortalUser();
  return (
    <div className="space-y-6">
      {canApproveLeaves && <PendingLeaveApprovalsSection />}
      <LeavesSection
        {...props}
        canDecide={canApproveLeaves}
        actorEmployeeId={user.employeeId}
      />
      <LeavePoliciesSection canManage={canManageLeavePolicies} />
    </div>
  );
}

export function PortalYearEndTax() {
  const { employees } = useStaffEmployees();
  return <YearEndTaxSection employees={employees} />;
}

export function PortalHolidays() {
  const { canManageHolidays } = usePortalUser();
  return <HolidaysSection canManage={canManageHolidays} />;
}
