"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import { cn } from "@workspace/ui/lib/utils";
import { CheckCircle } from "lucide-react";
import { useMemo } from "react";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

export type MyDTRRecord =
  inferRouterOutputs<AppRouter>["timekeeping"]["getMyDTR"][number];

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

interface MyAttendanceDataTableProps {
  data: MyDTRRecord[];
}

export function MyAttendanceDataTable({ data }: MyAttendanceDataTableProps) {
  const columns = useMemo<ColumnDef<MyDTRRecord>[]>(
    () => [
      {
        id: "date",
        accessorKey: "date",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Date" />
        ),
        cell: ({ row }) => (
          <div className="font-medium text-foreground whitespace-nowrap">
            {formatDate(row.original.date)}
          </div>
        ),
      },
      {
        id: "dayType",
        accessorKey: "dayType",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Day Type" />
        ),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
                r.dayType === "REGULAR_WORKDAY"
                  ? "border-border bg-muted/80 text-foreground"
                  : r.dayType === "DOUBLE_HOLIDAY"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                    : r.dayType.includes("HOLIDAY")
                      ? "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
              )}
            >
              {r.dayType.replaceAll("_", " ")}
            </span>
          );
        },
      },
      {
        id: "timeIn",
        accessorKey: "timeIn",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Time In" />
        ),
        cell: ({ row }) => (
          <span className="font-mono">{formatTime(row.original.timeIn)}</span>
        ),
      },
      {
        id: "timeOut",
        accessorKey: "timeOut",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Time Out" />
        ),
        cell: ({ row }) => (
          <span className="font-mono">{formatTime(row.original.timeOut)}</span>
        ),
      },
      {
        id: "workedHours",
        accessorFn: (row) => row.actualWorkedMinutes,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Worked"
            className="justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium">
            {(row.original.actualWorkedMinutes / 60).toFixed(1)} hrs
          </div>
        ),
      },
      {
        id: "overtimeMinutes",
        accessorFn: (row) => row.overtimeMinutes,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Overtime"
            className="justify-end"
          />
        ),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-right">
              {r.overtimeMinutes > 0 ? (
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  +{r.overtimeMinutes}m
                </span>
              ) : (
                "-"
              )}
            </div>
          );
        },
      },
      {
        id: "tardiness",
        accessorFn: (row) => row.tardinessMinutes + row.undertimeMinutes,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Tardy / Under"
            className="justify-end"
          />
        ),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-right">
              {r.tardinessMinutes > 0 || r.undertimeMinutes > 0 ? (
                <span className="font-medium text-destructive">
                  {r.tardinessMinutes > 0 && `${r.tardinessMinutes}m late`}
                  {r.tardinessMinutes > 0 && r.undertimeMinutes > 0 && " · "}
                  {r.undertimeMinutes > 0 && `${r.undertimeMinutes}m early`}
                </span>
              ) : (
                "-"
              )}
            </div>
          );
        },
      },
      {
        id: "status",
        accessorFn: (row) => (row.isApproved ? "APPROVED" : "REGULAR"),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Status"
            className="justify-center"
          />
        ),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-center">
              {r.isApproved ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle className="size-3" />
                  Approved
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                  Regular
                </span>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  const filterOptions = useMemo(
    () => [
      {
        id: "dayType",
        label: "Day Type",
        options: [
          { value: "REGULAR_WORKDAY", label: "Regular Workday" },
          { value: "REST_DAY", label: "Rest Day" },
          {
            value: "SPECIAL_NON_WORKING_HOLIDAY",
            label: "Special Non-Working Holiday",
          },
          { value: "REGULAR_HOLIDAY", label: "Regular Holiday" },
          { value: "DOUBLE_HOLIDAY", label: "Double Holiday" },
        ],
      },
      {
        id: "status",
        label: "Status",
        options: [
          { value: "APPROVED", label: "Approved" },
          { value: "REGULAR", label: "Regular / Pending" },
        ],
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search attendance records…"
      filters={filterOptions}
      itemLabel="attendance records"
      emptyTitle="No daily time records"
      emptyDescription="No daily time records found for the selected date range."
      columnLabels={{
        date: "Date",
        dayType: "Day Type",
        timeIn: "Time In",
        timeOut: "Time Out",
        workedHours: "Worked",
        overtimeMinutes: "Overtime",
        tardiness: "Tardy / Under",
        status: "Status",
      }}
      columnClassMap={{
        workedHours: "text-right",
        overtimeMinutes: "text-right",
        tardiness: "text-right",
        status: "text-center",
      }}
    />
  );
}
