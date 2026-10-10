"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useMemo } from "react";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { LOAN_TYPE_LABELS } from "./loans-section";

export type LoanListItem =
  inferRouterOutputs<AppRouter>["loans"]["list"][number];

const LOAN_TYPE_VARIANTS: Record<string, string> = {
  SSS_SALARY_LOAN:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  SSS_CALAMITY_LOAN:
    "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",
  PAGIBIG_MULTI_PURPOSE:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  PAGIBIG_HOUSING:
    "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  COMPANY_CASH_ADVANCE:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  COMPANY_EMERGENCY_LOAN:
    "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
};

function pesos(cents: bigint | number | null | undefined) {
  if (cents === null || cents === undefined) return "₱0.00";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(cents) / 100);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(new Date(value));
}

interface LoansDataTableProps {
  data: LoanListItem[];
  onSelectLoan: (loanId: string) => void;
  onRecordPayment: (loanId: string) => void;
  selectedId?: string | null;
}

export function LoansDataTable({
  data,
  onSelectLoan,
  onRecordPayment,
  selectedId,
}: LoansDataTableProps) {
  const columns = useMemo<ColumnDef<LoanListItem>[]>(
    () => [
      {
        id: "employee",
        accessorFn: (row) =>
          `${row.employee.firstName} ${row.employee.lastName} ${row.employee.employeeNumber}`,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Employee" />
        ),
        cell: ({ row }) => {
          const loan = row.original;
          return (
            <div className="font-medium whitespace-nowrap">
              <div className="font-semibold text-foreground">
                {loan.employee.firstName} {loan.employee.lastName}
              </div>
              <div className="text-xs text-muted-foreground">
                {loan.employee.employeeNumber} ·{" "}
                {loan.employee.department?.name ?? "General"}
              </div>
            </div>
          );
        },
      },
      {
        id: "loanType",
        accessorKey: "loanType",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Loan Details" />
        ),
        cell: ({ row }) => {
          const loan = row.original;
          return (
            <div>
              <span
                className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${
                  LOAN_TYPE_VARIANTS[loan.loanType] || "bg-muted"
                }`}
              >
                {LOAN_TYPE_LABELS[loan.loanType] || loan.loanType}
              </span>
              {loan.referenceNumber && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Ref: {loan.referenceNumber}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground">
                Start: {formatDate(loan.startDate)}
                {loan.endDate ? ` · End: ${formatDate(loan.endDate)}` : ""}
              </div>
            </div>
          );
        },
      },
      {
        id: "principal",
        accessorFn: (row) => Number(row.principalCents),
        header: ({ column }) => (
          <div className="text-right">
            <DataTableColumnHeader
              column={column}
              title="Principal"
              className="justify-end"
            />
          </div>
        ),
        cell: ({ row }) => {
          const loan = row.original;
          return (
            <div className="text-right font-medium">
              {pesos(loan.principalCents)}
              {loan.totalAmountCents !== loan.principalCents && (
                <div className="text-xs text-muted-foreground">
                  Total: {pesos(loan.totalAmountCents)}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "amortization",
        accessorFn: (row) => Number(row.amortizationCents),
        header: ({ column }) => (
          <div className="text-right">
            <DataTableColumnHeader
              column={column}
              title="Amortization"
              className="justify-end"
            />
          </div>
        ),
        cell: ({ row }) => {
          const loan = row.original;
          return (
            <div className="text-right font-medium text-foreground">
              {pesos(loan.amortizationCents)}
              <div className="text-[11px] text-muted-foreground">/ cutoff</div>
            </div>
          );
        },
      },
      {
        id: "balance",
        accessorFn: (row) => Number(row.balanceCents),
        header: ({ column }) => (
          <div className="text-right">
            <DataTableColumnHeader
              column={column}
              title="Balance"
              className="justify-end"
            />
          </div>
        ),
        cell: ({ row }) => {
          const loan = row.original;
          const totalCents = Number(loan.totalAmountCents);
          const balanceCents = Number(loan.balanceCents);
          const paidPercent =
            totalCents > 0
              ? Math.min(
                  100,
                  Math.max(
                    0,
                    Math.round(
                      ((totalCents - balanceCents) / totalCents) * 100,
                    ),
                  ),
                )
              : 100;

          return (
            <div className="text-right">
              <div className="font-semibold text-foreground">
                {pesos(loan.balanceCents)}
              </div>
              <div className="mt-1 flex items-center justify-end gap-1.5">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${paidPercent}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {paidPercent}%
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: "status",
        accessorFn: (row) => (row.isActive ? "ACTIVE" : "PAID"),
        header: ({ column }) => (
          <div className="text-center">
            <DataTableColumnHeader
              column={column}
              title="Status"
              className="justify-center"
            />
          </div>
        ),
        cell: ({ row }) => {
          const loan = row.original;
          return (
            <div className="text-center">
              {loan.isActive ? (
                <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-500/20 bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  Settled / Closed
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const loan = row.original;
          return (
            <div className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-8 p-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                  }
                >
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLoan(loan.id);
                      }}
                    >
                      View ledger
                    </DropdownMenuItem>
                    {loan.isActive && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onRecordPayment(loan.id);
                        }}
                      >
                        Record payment
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [onSelectLoan, onRecordPayment],
  );

  const filterOptions = useMemo(
    () => [
      {
        id: "status",
        label: "Status",
        options: [
          { value: "ACTIVE", label: "Active Loans" },
          { value: "PAID", label: "Settled / Closed" },
        ],
      },
      {
        id: "loanType",
        label: "Loan Type",
        options: Object.entries(LOAN_TYPE_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search by employee or loan…"
      filters={filterOptions}
      itemLabel="loans"
      emptyTitle="No loans found"
      emptyDescription="No loans match your search or filter criteria."
      selectedRowId={selectedId}
      getRowId={(row) => row.id}
      columnLabels={{
        employee: "Employee",
        loanType: "Loan Details",
        principal: "Principal",
        amortization: "Amortization",
        balance: "Balance",
        status: "Status",
      }}
      columnClassMap={{
        principal: "text-right",
        amortization: "text-right",
        balance: "text-right",
        status: "text-center",
        actions: "text-right",
      }}
    />
  );
}
