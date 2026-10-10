"use client";

import { Badge } from "@workspace/ui/components/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import {
  Banknote,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  History,
  Loader2,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useWorkspaceUser } from "@/components/user-context";
import { EmployeeDashboard } from "@/features/dashboard/employee-dashboard";
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

function formatShortDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatRelativeTime(value: Date | string) {
  const date = new Date(value).getTime();
  const diffSeconds = Math.round((Date.now() - date) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return formatter.format(-diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return formatter.format(-diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return formatter.format(-diffDays, "day");
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return formatter.format(-diffMonths, "month");
  return formatter.format(-Math.round(diffMonths / 12), "year");
}

function badgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "PAID":
    case "DISBURSED":
    case "APPROVED":
    case "ACTIVE":
      return "default";
    case "CALCULATED":
    case "AUDITED":
    case "PENDING":
      return "secondary";
    case "CANCELLED":
    case "REJECTED":
      return "destructive";
    default:
      return "outline";
  }
}

function formatStatus(status: string) {
  return status
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

interface AttentionItem {
  key: string;
  title: string;
  detail: string;
  href: string;
  linkLabel: string;
}

export function DashboardSection() {
  const { user, isEmployee, isStaff, canApproveLeaves } = useWorkspaceUser();

  const overview = trpc.dashboard.getOverview.useQuery(undefined, {
    enabled: !isEmployee,
    retry: false,
  });

  if (isEmployee) {
    return <EmployeeDashboard user={user} />;
  }

  const attention: AttentionItem[] = [];
  const runs = overview.data?.payroll.recentRuns ?? [];
  if (overview.data) {
    if (canApproveLeaves && overview.data.leaves.pendingCount > 0) {
      const count = overview.data.leaves.pendingCount;
      attention.push({
        key: "pending-leaves",
        title: `${count} pending leave ${count === 1 ? "request" : "requests"}`,
        detail: "Requests awaiting review",
        href: "/leaves",
        linkLabel: "Review requests",
      });
    }
    if (isStaff) {
      const awaitingApproval = runs.filter((run) => run.status === "AUDITED");
      if (awaitingApproval.length > 0) {
        attention.push({
          key: "awaiting-approval",
          title: `${awaitingApproval.length} ${awaitingApproval.length === 1 ? "run" : "runs"} awaiting approval`,
          detail: "Audited cutoffs ready for the checker step",
          href: "/payroll-runs",
          linkLabel: "Review runs",
        });
      }
      const awaitingDisbursement = runs.filter(
        (run) => run.status === "APPROVED",
      );
      if (awaitingDisbursement.length > 0) {
        attention.push({
          key: "awaiting-disbursement",
          title: `${awaitingDisbursement.length} approved ${awaitingDisbursement.length === 1 ? "run" : "runs"} awaiting disbursement`,
          detail: "Approved payroll ready to release",
          href: "/payroll-runs",
          linkLabel: "Disburse",
        });
      }
    }
  }
  const trend = [...runs].reverse();
  const trendMax = trend.reduce(
    (max, run) => Math.max(max, Number(run.totalNetCents)),
    0,
  );
  const activity = overview.data?.audit ?? [];

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
          <div className="grid gap-4 lg:grid-cols-5">
            {[1, 2].map((i) => (
              <Card key={i} className="space-y-3 p-4 lg:col-span-1">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
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
                  href="/employees"
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
                  href="/payroll-runs"
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
                  href="/leaves"
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
                <Link
                  href="/loans"
                  className="mt-3 inline-flex items-center text-xs font-medium text-primary hover:underline"
                >
                  Manage loans & advances &rarr;
                </Link>
              </CardContent>
            </Card>
          </section>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card
              role="region"
              aria-label="Needs attention"
              className="lg:col-span-3"
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TriangleAlert
                    className="size-4 text-amber-600 dark:text-amber-400"
                    aria-hidden="true"
                  />
                  Needs attention
                </CardTitle>
                <CardDescription>
                  Items waiting on your action, newest workflow first.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {attention.length === 0 ? (
                  <div className="flex items-center gap-2.5 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                    <CheckCircle2
                      className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    <span>All clear — nothing needs your attention.</span>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {attention.map((item) => (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
                        >
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full bg-amber-500"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {item.title}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.detail}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-medium text-primary">
                            {item.linkLabel} &rarr;
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card
              role="region"
              aria-label="Net pay trend"
              className="lg:col-span-2"
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  Net pay trend
                </CardTitle>
                <CardDescription>
                  Recent cutoffs, oldest to newest.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {trend.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No payroll runs yet — trigger your first run to see the
                    trend.
                  </p>
                ) : (
                  <div
                    role="img"
                    aria-label={`Net pay across the last ${trend.length} cutoffs`}
                    className="flex h-32 items-end gap-2"
                  >
                    {trend.map((run) => {
                      const value = Number(run.totalNetCents);
                      const height =
                        trendMax > 0
                          ? Math.max(6, Math.round((value / trendMax) * 100))
                          : 0;
                      return (
                        <div
                          key={run.id}
                          className="flex min-w-0 flex-1 flex-col items-center gap-1"
                          title={`${formatDate(run.cutoffStartDate)} – ${formatDate(run.cutoffEndDate)}: ${pesos(run.totalNetCents)}`}
                        >
                          <div
                            aria-hidden="true"
                            style={{ height: `${height}%` }}
                            className="w-full rounded-sm bg-primary/80"
                          />
                          <span className="truncate text-[10px] text-muted-foreground">
                            {formatShortDate(run.cutoffEndDate)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

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
                  href="/payroll-runs"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  View all
                </Link>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cutoff Period</TableHead>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Net Pay</TableHead>
                        <TableHead className="text-right">Employees</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.data.payroll.recentRuns.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell>
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
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(run.paymentDate)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={badgeVariant(run.status)}>
                              {formatStatus(run.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {pesos(run.totalNetCents)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {run.payslipCount}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card role="region" aria-label="Recent activity">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Recent activity
              </CardTitle>
              <CardDescription>
                Latest recorded actions in this organization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recent activity recorded.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action</TableHead>
                        <TableHead>Record</TableHead>
                        <TableHead>Performed by</TableHead>
                        <TableHead className="text-right">When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activity.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">
                            {formatStatus(entry.action)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatStatus(entry.entityType)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {entry.userEmail}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatRelativeTime(entry.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
