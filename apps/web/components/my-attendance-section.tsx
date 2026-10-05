"use client";

import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
  Shield,
  Timer,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { manilaToday } from "@/lib/attendance-time";
import { trpc } from "@/lib/trpc";
import { usePortalUser } from "./payroll-portal";

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export function MyAttendanceSection() {
  const { user, isStaff } = usePortalUser();

  const today = manilaToday();
  const defaultStart = `${today.slice(0, 7)}-01`;

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(today);
  const [queryRange, setQueryRange] = useState({
    startDate: defaultStart,
    endDate: today,
  });

  const dtr = trpc.timekeeping.getMyDTR.useQuery(
    {
      startDate: queryRange.startDate,
      endDate: queryRange.endDate,
    },
    {
      enabled: !!user.employeeId,
      retry: false,
    },
  );

  if (!user.employeeId) {
    return (
      <section className="space-y-6" aria-label="My Attendance">
        {isStaff ? (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-foreground font-semibold">
                <Shield className="size-5 text-primary" />
                Administrative Account Notice
              </CardTitle>
              <CardDescription>
                You are signed in as an administrator (
                {user.role.replaceAll("_", " ")}). Personal daily time records
                and biometric punch tracking are only recorded for staff
                enrolled in payroll.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                To inspect, correct, or import biometric attendance records for
                employees across the company, visit the Attendance & DTR
                workspace.
              </p>
              <div>
                <Link
                  href="/portal/attendance"
                  className={buttonVariants({ variant: "default" })}
                >
                  Go to Attendance & DTR Workspace &rarr;
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card role="region" aria-label="Attendance unavailable">
            <CardHeader>
              <CardTitle className="text-base text-destructive flex items-center gap-2">
                <AlertCircle className="size-5" />
                Employee Profile Not Linked
              </CardTitle>
              <CardDescription>
                Your user account is not linked to an employee profile. Please
                contact your HR administrator to connect your account to your
                payroll employee file.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>
    );
  }

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setQueryRange({ startDate, endDate });
  };

  const records = dtr.data ?? [];

  // Computed metrics
  const totalWorkedMinutes = records.reduce(
    (sum, r) => sum + (r.actualWorkedMinutes || 0),
    0,
  );
  const totalHoursWorked = (totalWorkedMinutes / 60).toFixed(1);

  const totalOvertimeMinutes = records.reduce(
    (sum, r) => sum + (r.overtimeMinutes || 0),
    0,
  );
  const totalTardinessMinutes = records.reduce(
    (sum, r) => sum + (r.tardinessMinutes || 0),
    0,
  );
  const totalUndertimeMinutes = records.reduce(
    (sum, r) => sum + (r.undertimeMinutes || 0),
    0,
  );

  return (
    <section className="space-y-6" aria-label="My Attendance">
      {/* 1. Date Range Filter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="size-5 text-primary" />
            My Attendance & DTR Records
          </CardTitle>
          <CardDescription>
            Your daily biometric punch-ins, worked hours, and timekeeping status
            in Asia/Manila.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleFilter}
            className="flex flex-wrap items-end gap-3"
          >
            <Field className="w-40">
              <FieldLabel className="text-xs">From Date</FieldLabel>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </Field>

            <Field className="w-40">
              <FieldLabel className="text-xs">To Date</FieldLabel>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </Field>

            <Button type="submit" size="default" disabled={dtr.isPending}>
              {dtr.isPending ? "Loading…" : "Filter DTR"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 2. Summary KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Days Logged</span>
            <Calendar className="size-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {records.length}
          </div>
          <p className="text-xs text-muted-foreground">recorded workdays</p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Hours Worked</span>
            <UserCheck className="size-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {totalHoursWorked} <span className="text-xs font-normal">hrs</span>
          </div>
          <p className="text-xs text-muted-foreground">regular civil time</p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Overtime</span>
            <Timer className="size-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {totalOvertimeMinutes}{" "}
            <span className="text-xs font-normal">min</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {(totalOvertimeMinutes / 60).toFixed(1)} OT hours
          </p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Tardiness</span>
            <AlertCircle className="size-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {totalTardinessMinutes}{" "}
            <span className="text-xs font-normal">min</span>
          </div>
          <p className="text-xs text-muted-foreground">
            late arrival penalties
          </p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Undertime</span>
            <AlertCircle className="size-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {totalUndertimeMinutes}{" "}
            <span className="text-xs font-normal">min</span>
          </div>
          <p className="text-xs text-muted-foreground">
            early departure minutes
          </p>
        </Card>
      </div>

      {/* 3. DTR Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Daily Attendance Breakdown
          </CardTitle>
          <CardDescription>
            Records for period {formatDate(queryRange.startDate)} to{" "}
            {formatDate(queryRange.endDate)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dtr.isPending ? (
            <div role="status" className="space-y-4 py-2">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                <span>Loading your daily time records…</span>
              </div>
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex justify-between border-b pb-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex justify-between py-2 border-b last:border-0"
                  >
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3.5 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ) : dtr.isError ? (
            <div className="space-y-2 py-4">
              <p role="alert" className="text-sm text-destructive">
                {dtr.error?.message || "Could not retrieve daily time records."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void dtr.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : records.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No daily time records found for the selected date range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b text-xs font-semibold text-muted-foreground bg-muted/30">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Day Type</th>
                    <th className="py-2.5 px-3">Time In</th>
                    <th className="py-2.5 px-3">Time Out</th>
                    <th className="py-2.5 px-3 text-right">Worked</th>
                    <th className="py-2.5 px-3 text-right">Overtime</th>
                    <th className="py-2.5 px-3 text-right">Tardy / Under</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs">
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-foreground whitespace-nowrap">
                        {formatDate(r.date)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {r.dayType.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {formatTime(r.timeIn)}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {formatTime(r.timeOut)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {(r.actualWorkedMinutes / 60).toFixed(1)} hrs
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {r.overtimeMinutes > 0 ? (
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">
                            +{r.overtimeMinutes}m
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {r.tardinessMinutes > 0 || r.undertimeMinutes > 0 ? (
                          <span className="text-destructive font-medium">
                            {r.tardinessMinutes > 0 &&
                              `${r.tardinessMinutes}m late`}
                            {r.tardinessMinutes > 0 &&
                              r.undertimeMinutes > 0 &&
                              " · "}
                            {r.undertimeMinutes > 0 &&
                              `${r.undertimeMinutes}m early`}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {r.isApproved ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle className="size-3" />
                            Approved
                          </span>
                        ) : (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            Regular
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
