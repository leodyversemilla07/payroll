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
  AlertCircle,
  Calendar,
  Clock,
  Loader2,
  Shield,
  Timer,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DateRangePicker, monthPresets } from "@/components/date-range-picker";
import { useWorkspaceUser } from "@/components/user-context";
import { manilaToday } from "@/lib/attendance-time";
import { trpc } from "@/lib/trpc";
import { MyAttendanceDataTable } from "./my-attendance-data-table";

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function MyAttendanceSection() {
  const { user, isStaff } = useWorkspaceUser();

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
                  href="/attendance"
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
            <DateRangePicker
              fromId="my-dtr-start"
              toId="my-dtr-end"
              fromLabel="From Date"
              toLabel="To Date"
              value={{ from: startDate, to: endDate }}
              onChange={(next) => {
                setStartDate(next.from);
                setEndDate(next.to);
              }}
              presets={monthPresets(today)}
            />

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
          ) : (
            <MyAttendanceDataTable data={records} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
