"use client";

import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  ArrowRight,
  Banknote,
  CalendarCheck,
  CalendarDays,
  Clock,
  FileText,
  UserCircle,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { manilaToday } from "@/lib/attendance-time";
import { trpc } from "@/lib/trpc";

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

function QueryError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col gap-2 text-sm">
      <p className="text-destructive">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function MetricCard({
  title,
  icon,
  children,
  description,
  href,
  actionLabel,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  description: ReactNode;
  href: string;
  actionLabel: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <span className="rounded-lg bg-primary/10 p-2 text-primary" aria-hidden>
          {icon}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="min-h-8">{children}</div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{description}</span>
          <Link
            href={href}
            className="shrink-0 font-medium text-primary hover:underline"
          >
            {actionLabel}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmployeeDashboard({
  user,
}: {
  user: {
    employeeId?: string | null;
    name: string;
  };
}) {
  const today = manilaToday();
  const currentYear = Number(today.slice(0, 4));
  const startOfMonth = `${today.slice(0, 7)}-01`;
  const hasEmployee = Boolean(user.employeeId);

  const leaveBalancesQuery = trpc.leaves.getBalances.useQuery(
    { employeeId: user.employeeId ?? "", year: currentYear },
    { enabled: hasEmployee, retry: false },
  );
  const payslipsQuery = trpc.payroll.getMyPayslips.useQuery(undefined, {
    enabled: hasEmployee,
    retry: false,
  });
  const dtrQuery = trpc.timekeeping.getMyDTR.useQuery(
    { startDate: startOfMonth, endDate: today },
    { enabled: hasEmployee, retry: false },
  );
  const holidaysQuery = trpc.holidays.list.useQuery(
    { year: currentYear },
    { retry: false },
  );

  const balances = leaveBalancesQuery.data ?? [];
  const vacation = balances.find((balance) => balance.leaveType === "VACATION");
  const sick = balances.find((balance) => balance.leaveType === "SICK");
  const payslips = payslipsQuery.data ?? [];
  const latestPayslip = payslips[0];
  const dtrRecords = dtrQuery.data ?? [];
  const totalWorkedMinutes = dtrRecords.reduce(
    (sum, record) => sum + (record.actualWorkedMinutes || 0),
    0,
  );
  const totalHoursWorked = (totalWorkedMinutes / 60).toFixed(1);
  const holidays = holidaysQuery.data ?? [];
  const nextHoliday = holidays
    .filter(
      (holiday) => new Date(holiday.date).toISOString().slice(0, 10) >= today,
    )
    .sort(
      (first, second) =>
        new Date(first.date).getTime() - new Date(second.date).getTime(),
    )[0];

  return (
    <section className="flex flex-col gap-6" aria-label="Employee overview">
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-primary/[0.02] to-background">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-xl">Welcome, {user.name}!</CardTitle>
            <CardDescription>
              Review your pay, leave, attendance, and employee records.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/portal/my-attendance"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Clock data-icon="inline-start" />
              My attendance
            </Link>
            <Link
              href="/portal/my-profile"
              className={buttonVariants({ size: "sm" })}
            >
              <UserCircle data-icon="inline-start" />
              View profile
            </Link>
          </div>
        </CardHeader>
      </Card>

      <section
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Employee metrics"
      >
        <MetricCard
          title="Latest net pay"
          icon={<Banknote />}
          description={
            latestPayslip
              ? `${formatDate(latestPayslip.payrollRun.cutoffStartDate)} – ${formatDate(latestPayslip.payrollRun.cutoffEndDate)}`
              : "Awaiting next payroll"
          }
          href="/portal/my-profile"
          actionLabel="View payslips"
        >
          {payslipsQuery.isPending ? (
            <Skeleton className="h-7 w-32" />
          ) : payslipsQuery.isError ? (
            <QueryError
              message="Payslip data could not be loaded."
              onRetry={() => void payslipsQuery.refetch()}
            />
          ) : latestPayslip ? (
            <p className="text-xl font-bold tracking-tight">
              {pesos(latestPayslip.netPayCents)}
            </p>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">
              No payslip issued yet
            </p>
          )}
        </MetricCard>

        <MetricCard
          title="Leave balances"
          icon={<CalendarDays />}
          description={`${currentYear} available credits`}
          href="/portal/my-profile"
          actionLabel="Request leave"
        >
          {leaveBalancesQuery.isPending ? (
            <Skeleton className="h-7 w-28" />
          ) : leaveBalancesQuery.isError ? (
            <QueryError
              message="Leave balances could not be loaded."
              onRetry={() => void leaveBalancesQuery.refetch()}
            />
          ) : vacation || sick ? (
            <p className="text-xl font-bold tracking-tight">
              {vacation?.balance ?? "0"}d VL · {sick?.balance ?? "0"}d SL
            </p>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">
              No credits allocated
            </p>
          )}
        </MetricCard>

        <MetricCard
          title="Attendance this month"
          icon={<Clock />}
          description={`${dtrRecords.length} records logged`}
          href="/portal/my-attendance"
          actionLabel="View attendance"
        >
          {dtrQuery.isPending ? (
            <Skeleton className="h-7 w-24" />
          ) : dtrQuery.isError ? (
            <QueryError
              message="Attendance could not be loaded."
              onRetry={() => void dtrQuery.refetch()}
            />
          ) : (
            <p className="text-xl font-bold tracking-tight">
              {totalHoursWorked} hrs
            </p>
          )}
        </MetricCard>

        <MetricCard
          title="Next holiday"
          icon={<CalendarCheck />}
          description={
            nextHoliday ? formatDate(nextHoliday.date) : "Philippine calendar"
          }
          href="/portal/holidays"
          actionLabel="View calendar"
        >
          {holidaysQuery.isPending ? (
            <Skeleton className="h-7 w-32" />
          ) : holidaysQuery.isError ? (
            <QueryError
              message="Holiday data could not be loaded."
              onRetry={() => void holidaysQuery.refetch()}
            />
          ) : nextHoliday ? (
            <p className="truncate text-base font-bold tracking-tight">
              {nextHoliday.name}
            </p>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">
              No upcoming holidays
            </p>
          )}
        </MetricCard>
      </section>

      {!hasEmployee ? (
        <Card role="alert" className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base">
              Employee profile unavailable
            </CardTitle>
            <CardDescription>
              Your employee record is not linked to this account, so personal
              dashboard data cannot be loaded.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Action needed</CardTitle>
            <CardDescription>
              Start with the items that need your attention.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {latestPayslip ? (
              <Link
                href="/portal/my-profile"
                className="flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                <span className="flex items-center gap-3">
                  <Banknote className="text-primary" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">
                      Payslip available
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Review your latest net pay and deductions.
                    </span>
                  </span>
                </span>
                <ArrowRight aria-hidden />
              </Link>
            ) : null}
            {dtrRecords.length === 0 ? (
              <Link
                href="/portal/my-attendance"
                className="flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                <span className="flex items-center gap-3">
                  <Clock className="text-primary" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">
                      Review attendance
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      No records are logged for the current month.
                    </span>
                  </span>
                </span>
                <ArrowRight aria-hidden />
              </Link>
            ) : null}
            {latestPayslip && dtrRecords.length > 0 ? (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                You are all caught up. Use the links below to review your
                personal records.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Self-service</CardTitle>
            <CardDescription>
              Access the records and actions you use most often.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              {
                href: "/portal/my-attendance",
                title: "My attendance",
                description: "DTR punches and worked hours",
                icon: <Clock />,
              },
              {
                href: "/portal/my-profile",
                title: "Leaves and credits",
                description: "Review balances and requests",
                icon: <CalendarDays />,
              },
              {
                href: "/portal/my-profile",
                title: "Payslips and tax",
                description: "Itemized pay and deductions",
                icon: <Banknote />,
              },
              {
                href: "/portal/holidays",
                title: "Holiday calendar",
                description: "Philippine statutory holidays",
                icon: <CalendarCheck />,
              },
            ].map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                <span
                  className="rounded-lg bg-primary/10 p-2 text-primary"
                  aria-hidden
                >
                  {item.icon}
                </span>
                <span>
                  <span className="block text-sm font-semibold">
                    {item.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Recent payslips</CardTitle>
              <CardDescription>Latest disbursed compensation.</CardDescription>
            </div>
            <Link
              href="/portal/my-profile"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View all <ArrowRight />
            </Link>
          </CardHeader>
          <CardContent>
            {payslipsQuery.isPending ? (
              <div className="flex flex-col gap-3">
                {[1, 2].map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between gap-3"
                  >
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : payslipsQuery.isError ? (
              <QueryError
                message="Recent payslips could not be loaded."
                onRetry={() => void payslipsQuery.refetch()}
              />
            ) : payslips.length === 0 ? (
              <Empty className="py-6 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileText className="size-6 text-muted-foreground" />
                  </EmptyMedia>
                  <EmptyTitle>No payslips available yet</EmptyTitle>
                  <EmptyDescription>
                    Finalized payslips will appear here after payroll is
                    released.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-3">
                {payslips.slice(0, 3).map((payslip) => (
                  <div
                    key={payslip.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {formatDate(payslip.payrollRun.cutoffStartDate)} –{" "}
                        {formatDate(payslip.payrollRun.cutoffEndDate)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Paid on {formatDate(payslip.payrollRun.paymentDate)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">
                        {pesos(payslip.netPayCents)}
                      </p>
                      <Link
                        href="/portal/my-profile"
                        className="text-xs text-primary hover:underline"
                      >
                        Details
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
