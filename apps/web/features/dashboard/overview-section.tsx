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
  CalendarDays,
  CreditCard,
  Loader2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useWorkspaceUser } from "@/components/user-context";
import { EmployeeDashboard } from "@/features/dashboard/employee-dashboard";
import { trpc } from "@/lib/trpc";
import {
  isSectionAllowedForRole,
  workspaceSections,
} from "@/lib/workspace-navigation";

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
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function OverviewSection() {
  const { user, isEmployee } = useWorkspaceUser();

  const overview = trpc.dashboard.getOverview.useQuery(undefined, {
    enabled: !isEmployee,
    retry: false,
  });

  if (isEmployee) {
    return <EmployeeDashboard user={user} />;
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
        </>
      ) : null}

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Workspace Navigation
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspaceSections
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
