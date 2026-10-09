"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import { Button } from "@workspace/ui/components/button";
import { Pencil, Trash2 } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

export type Policy =
  inferRouterOutputs<AppRouter>["leaves"]["listPolicies"][number];

interface LeavePoliciesDataTableProps {
  data: Policy[];
  canManage?: boolean;
  onEdit?: (policy: Policy) => void;
  onDelete?: (policy: Policy) => void;
  emptyAction?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function LeavePoliciesDataTable({
  data,
  canManage = false,
  onEdit,
  onDelete,
  emptyAction,
  emptyTitle = "No leave policies configured",
  emptyDescription = "Configure statutory or company leave policies to enable employee accruals and requests.",
}: LeavePoliciesDataTableProps) {
  const columns = useMemo<ColumnDef<Policy>[]>(() => {
    const cols: ColumnDef<Policy>[] = [
      {
        id: "leaveType",
        accessorKey: "leaveType",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Policy Code" />
        ),
        cell: ({ row }) => (
          <div className="font-semibold text-foreground">
            {row.original.leaveType}
          </div>
        ),
      },
      {
        id: "annualCredits",
        accessorFn: (row) => Number(row.annualCredits),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Annual Credits" />
        ),
        cell: ({ row }) => (
          <div className="font-medium whitespace-nowrap">
            {row.original.annualCredits} days
          </div>
        ),
      },
      {
        id: "accrualFrequency",
        accessorKey: "accrualFrequency",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Frequency" />
        ),
        cell: ({ row }) => (
          <span className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap">
            {row.original.accrualFrequency}
          </span>
        ),
      },
      {
        id: "carryoverPolicy",
        accessorKey: "carryoverPolicy",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Carryover" />
        ),
        cell: ({ row }) => {
          const policy = row.original;
          return (
            <div className="text-xs whitespace-nowrap">
              {policy.carryoverPolicy === "NO_CARRYOVER" ? (
                <span className="text-muted-foreground">None</span>
              ) : policy.carryoverPolicy === "CAPPED" ? (
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  Capped ({policy.maxCarryoverDays} days)
                </span>
              ) : (
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  Unlimited
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "eligibleAfterMonths",
        accessorFn: (row) => row.eligibleAfterMonths,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Min. Tenure" />
        ),
        cell: ({ row }) => (
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {row.original.eligibleAfterMonths} mos
          </div>
        ),
      },
      {
        id: "status",
        accessorFn: (row) => (row.isActive ? "ACTIVE" : "INACTIVE"),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
              row.original.isActive
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {row.original.isActive ? "Active" : "Inactive"}
          </span>
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
          const policy = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Edit ${policy.leaveType}`}
                onClick={() => onEdit?.(policy)}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Delete ${policy.leaveType}`}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onDelete?.(policy)}
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
        id: "accrualFrequency",
        label: "Frequency",
        options: [
          { value: "MONTHLY", label: "Monthly" },
          { value: "QUARTERLY", label: "Quarterly" },
          { value: "ANNUAL", label: "Annual" },
        ],
      },
      {
        id: "carryoverPolicy",
        label: "Carryover",
        options: [
          { value: "NO_CARRYOVER", label: "No Carryover" },
          { value: "CAPPED", label: "Capped" },
          { value: "UNLIMITED", label: "Unlimited" },
        ],
      },
      {
        id: "status",
        label: "Status",
        options: [
          { value: "ACTIVE", label: "Active" },
          { value: "INACTIVE", label: "Inactive" },
        ],
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search policies…"
      filters={filterOptions}
      itemLabel="policies"
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyAction={emptyAction}
      columnLabels={{
        leaveType: "Policy Code",
        annualCredits: "Annual Credits",
        accrualFrequency: "Frequency",
        carryoverPolicy: "Carryover",
        eligibleAfterMonths: "Min. Tenure",
        status: "Status",
      }}
      columnClassMap={{
        actions: "text-right",
      }}
    />
  );
}
