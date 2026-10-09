"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import { Button } from "@workspace/ui/components/button";
import { Pencil, Trash2 } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

export type Holiday = inferRouterOutputs<AppRouter>["holidays"]["list"][number];

export const holidayDayTypes = [
  {
    value: "REGULAR_HOLIDAY",
    label: "Regular Holiday (200% worked / 100% unworked)",
    shortLabel: "Regular Holiday",
    badgeColor:
      "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
  },
  {
    value: "SPECIAL_NON_WORKING_HOLIDAY",
    label: "Special Non-Working Holiday (130% worked / 0% unworked)",
    shortLabel: "Special Non-Working Holiday",
    badgeColor:
      "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
  },
  {
    value: "SPECIAL_WORKING_HOLIDAY",
    label: "Special Working Holiday (100% regular pay)",
    shortLabel: "Special Working Holiday",
    badgeColor:
      "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  {
    value: "DOUBLE_HOLIDAY",
    label: "Double Holiday (300% worked / 200% unworked)",
    shortLabel: "Double Holiday",
    badgeColor:
      "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
] as const;

function formatHolidayDate(dateValue: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(new Date(dateValue));
}

interface HolidaysDataTableProps {
  data: Holiday[];
  canManage?: boolean;
  onEdit?: (holiday: Holiday) => void;
  onDelete?: (holiday: Holiday) => void;
  emptyAction?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function HolidaysDataTable({
  data,
  canManage = true,
  onEdit,
  onDelete,
  emptyAction,
  emptyTitle = "No holidays found",
  emptyDescription = "No holidays match your criteria.",
}: HolidaysDataTableProps) {
  const columns = useMemo<ColumnDef<Holiday>[]>(() => {
    const cols: ColumnDef<Holiday>[] = [
      {
        id: "date",
        accessorKey: "date",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Date" />
        ),
        cell: ({ row }) => (
          <div className="font-medium whitespace-nowrap">
            {formatHolidayDate(row.original.date)}
          </div>
        ),
      },
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Holiday Name" />
        ),
        cell: ({ row }) => (
          <div className="font-medium text-foreground">{row.original.name}</div>
        ),
      },
      {
        id: "dayType",
        accessorKey: "dayType",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Type" />
        ),
        cell: ({ row }) => {
          const typeConfig = holidayDayTypes.find(
            (t) => t.value === row.original.dayType,
          );
          return (
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${
                typeConfig?.badgeColor ?? "bg-muted"
              }`}
            >
              {row.original.dayType.replaceAll("_", " ")}
            </span>
          );
        },
      },
      {
        id: "recurrence",
        accessorFn: (row) => (row.isRecurring ? "Annual" : "One-time"),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Recurrence" />
        ),
        cell: ({ row }) => (
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {row.original.isRecurring ? (
              <span className="inline-flex items-center text-foreground font-medium">
                Annual
              </span>
            ) : (
              "One-time"
            )}
          </div>
        ),
      },
    ];

    if (canManage) {
      cols.push({
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const holiday = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Edit ${holiday.name}`}
                onClick={() => onEdit?.(holiday)}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Delete ${holiday.name}`}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onDelete?.(holiday)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        },
      });
    }

    return cols;
  }, [canManage, onEdit, onDelete]);

  const filterOptions = useMemo(
    () => [
      {
        id: "dayType",
        label: "Day Type",
        options: holidayDayTypes.map((type) => ({
          value: type.value,
          label: type.shortLabel,
        })),
      },
      {
        id: "recurrence",
        label: "Recurrence",
        options: [
          { value: "Annual", label: "Annual / Recurring" },
          { value: "One-time", label: "One-time Holiday" },
        ],
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search holidays…"
      filters={filterOptions}
      itemLabel="holidays"
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyAction={emptyAction}
      columnLabels={{
        date: "Date",
        name: "Holiday Name",
        dayType: "Type",
        recurrence: "Recurrence",
      }}
      columnClassMap={{
        actions: "text-right",
      }}
    />
  );
}
