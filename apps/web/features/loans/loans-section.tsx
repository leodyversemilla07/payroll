"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import { manilaToday } from "@/lib/attendance-time";
import { trpc } from "@/lib/trpc";

export const LOAN_TYPE_LABELS: Record<string, string> = {
  SSS_SALARY_LOAN: "SSS Salary Loan",
  SSS_CALAMITY_LOAN: "SSS Calamity Loan",
  PAGIBIG_MULTI_PURPOSE: "Pag-IBIG Multi-Purpose Loan (MPL)",
  PAGIBIG_HOUSING: "Pag-IBIG Housing Loan",
  COMPANY_CASH_ADVANCE: "Company Cash Advance",
  COMPANY_EMERGENCY_LOAN: "Company Emergency Loan",
};

const STATUS_FILTER_ITEMS = [
  { value: "ACTIVE", label: "Active Loans" },
  { value: "PAID", label: "Paid / Settled" },
  { value: "ALL", label: "All Loans" },
];

const LOAN_TYPE_FILTER_ITEMS = [
  { value: "ALL", label: "All Loan Types" },
  ...Object.entries(LOAN_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const LOAN_PROGRAM_ITEMS = Object.entries(LOAN_TYPE_LABELS).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

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

export function LoansSection() {
  const utils = trpc.useUtils();

  // Filters state
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "PAID" | "ALL">(
    "ACTIVE",
  );
  const [loanTypeFilter, setLoanTypeFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [paymentLoanId, setPaymentLoanId] = useState<string | null>(null);

  // Queries
  const summaryQuery = trpc.loans.getSummary.useQuery();
  const loansQuery = trpc.loans.list.useQuery({
    status: statusFilter,
    loanType: loanTypeFilter === "ALL" ? undefined : (loanTypeFilter as never),
    search: searchQuery.trim() || undefined,
  });

  const employeesQuery = trpc.employees.list.useQuery();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Loans & Advances
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage statutory government loans (SSS, Pag-IBIG) and company
            advances with automated payroll amortization.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void utils.loans.list.invalidate();
              void utils.loans.getSummary.invalidate();
            }}
          >
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 size-4" />
            Create Loan
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Loans
            </CardTitle>
            <Landmark className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryQuery.data?.activeCount ?? 0}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Out of {summaryQuery.data?.totalCount ?? 0} total enrolled loans
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Outstanding Balance
            </CardTitle>
            <CreditCard className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {pesos(summaryQuery.data?.totalBalanceCents)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Total remaining unpaid balance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Principal
            </CardTitle>
            <Banknote className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pesos(summaryQuery.data?.totalPrincipalCents)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cumulative active loan principal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Amortization / Cutoff
            </CardTitle>
            <Clock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {pesos(summaryQuery.data?.totalAmortizationPerCutoffCents)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Scheduled payroll deduction per run
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <FieldLabel htmlFor="loan-search">Search</FieldLabel>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="loan-search"
                  placeholder="Employee name, ID, or reference..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <FieldLabel htmlFor="status-filter">Status</FieldLabel>
              <Select
                items={STATUS_FILTER_ITEMS}
                value={statusFilter}
                onValueChange={(val) => {
                  if (val) setStatusFilter(val as "ACTIVE" | "PAID" | "ALL");
                }}
              >
                <SelectTrigger id="status-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {STATUS_FILTER_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <FieldLabel htmlFor="type-filter">Loan Type</FieldLabel>
              <Select
                items={LOAN_TYPE_FILTER_ITEMS}
                value={loanTypeFilter}
                onValueChange={(val) => {
                  if (val) setLoanTypeFilter(val);
                }}
              >
                <SelectTrigger id="type-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {LOAN_TYPE_FILTER_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("ACTIVE");
                  setLoanTypeFilter("ALL");
                }}
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loans Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Loan Records</CardTitle>
          <CardDescription>
            Showing {loansQuery.data?.length ?? 0} loan entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loansQuery.isPending ? (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" />
              Loading loan accounts…
            </div>
          ) : loansQuery.data && loansQuery.data.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Employee</TableHead>
                    <TableHead>Loan Details</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Amortization</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loansQuery.data.map((loan) => {
                    const totalCents = Number(loan.totalAmountCents);
                    const balanceCents = Number(loan.balanceCents);
                    const paidPercent =
                      totalCents > 0
                        ? Math.min(
                            100,
                            Math.max(
                              0,
                              Math.round(
                                ((totalCents - balanceCents) / totalCents) *
                                  100,
                              ),
                            ),
                          )
                        : 100;

                    return (
                      <TableRow key={loan.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium whitespace-nowrap">
                          <div className="font-semibold text-foreground">
                            {loan.employee.firstName} {loan.employee.lastName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {loan.employee.employeeNumber} ·{" "}
                            {loan.employee.department?.name ?? "General"}
                          </div>
                        </TableCell>

                        <TableCell>
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
                            {loan.endDate
                              ? ` · End: ${formatDate(loan.endDate)}`
                              : ""}
                          </div>
                        </TableCell>

                        <TableCell className="text-right font-medium">
                          {pesos(loan.principalCents)}
                          {loan.totalAmountCents !== loan.principalCents && (
                            <div className="text-xs text-muted-foreground">
                              Total: {pesos(loan.totalAmountCents)}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right font-medium text-foreground">
                          {pesos(loan.amortizationCents)}
                          <div className="text-[11px] text-muted-foreground">
                            / cutoff
                          </div>
                        </TableCell>

                        <TableCell className="text-right">
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
                        </TableCell>

                        <TableCell className="text-center">
                          {loan.isActive ? (
                            <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-slate-500/20 bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                              Settled / Closed
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedLoanId(loan.id)}
                            >
                              Ledger
                            </Button>
                            {loan.isActive && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setPaymentLoanId(loan.id)}
                              >
                                Pay
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty className="my-6 rounded-2xl border border-dashed border-border/80 p-12">
              <EmptyMedia variant="icon">
                <Landmark className="size-5 text-muted-foreground" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No loans found</EmptyTitle>
                <EmptyDescription>
                  {searchQuery ||
                  statusFilter !== "ALL" ||
                  loanTypeFilter !== "ALL"
                    ? "Try adjusting your search criteria or resetting filters."
                    : "Click 'Create Loan' to enroll a government loan or company cash advance."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {searchQuery ||
                statusFilter !== "ALL" ||
                loanTypeFilter !== "ALL" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("ALL");
                      setLoanTypeFilter("ALL");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsCreateOpen(true)}
                  >
                    <Plus className="mr-1.5 size-4" />
                    Create Loan
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          )}
        </CardContent>
      </Card>

      {/* Create Loan Modal */}
      {isCreateOpen && (
        <CreateLoanModal
          employees={employeesQuery.data ?? []}
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => {
            setIsCreateOpen(false);
            void utils.loans.list.invalidate();
            void utils.loans.getSummary.invalidate();
          }}
        />
      )}

      {/* Loan Details & Ledger Modal */}
      {selectedLoanId && (
        <LoanLedgerModal
          loanId={selectedLoanId}
          onClose={() => setSelectedLoanId(null)}
          onRecordPaymentRequested={() => {
            setPaymentLoanId(selectedLoanId);
          }}
          onDeactivated={() => {
            void utils.loans.list.invalidate();
            void utils.loans.getSummary.invalidate();
          }}
        />
      )}

      {/* Quick Record Payment Modal */}
      {paymentLoanId && (
        <RecordPaymentModal
          loanId={paymentLoanId}
          onClose={() => setPaymentLoanId(null)}
          onPaid={() => {
            setPaymentLoanId(null);
            void utils.loans.list.invalidate();
            void utils.loans.getSummary.invalidate();
            if (selectedLoanId) {
              void utils.loans.getById.invalidate({ loanId: selectedLoanId });
            }
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------
// CREATE LOAN MODAL
// ----------------------------------------------------
interface CreateLoanModalProps {
  employees: Array<{
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    department?: { name: string } | null;
  }>;
  onClose: () => void;
  onCreated: () => void;
}

function CreateLoanModal({
  employees,
  onClose,
  onCreated,
}: CreateLoanModalProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [loanType, setLoanType] = useState<string>("SSS_SALARY_LOAN");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [principalPesos, setPrincipalPesos] = useState<number | "">("");
  const [totalAmountPesos, setTotalAmountPesos] = useState<number | "">("");
  const [amortizationPesos, setAmortizationPesos] = useState<number | "">("");
  const [startDate, setStartDate] = useState(manilaToday());
  const [endDate, setEndDate] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createMutation = trpc.loans.create.useMutation({
    onSuccess: () => {
      onCreated();
    },
    onError: (err) => {
      setErrorMessage(err.message || "Failed to create loan.");
    },
  });

  // Calculate real-time payoff estimate
  const principal = typeof principalPesos === "number" ? principalPesos : 0;
  const total =
    typeof totalAmountPesos === "number" ? totalAmountPesos : principal;
  const amortization =
    typeof amortizationPesos === "number" ? amortizationPesos : 0;
  const cutoffsToPayoff =
    amortization > 0 && total > 0 ? Math.ceil(total / amortization) : 0;
  const estimatedMonths = (cutoffsToPayoff / 2).toFixed(1);

  const handlePrincipalChange = (value: number | "") => {
    setPrincipalPesos(value);
    // If total amount was empty or equal to previous principal, update total as well
    if (totalAmountPesos === "" || totalAmountPesos === principalPesos) {
      setTotalAmountPesos(value);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!employeeId) {
      setErrorMessage("Please select an employee.");
      return;
    }
    if (!principal || principal <= 0) {
      setErrorMessage("Principal amount must be greater than zero.");
      return;
    }
    if (!total || total <= 0) {
      setErrorMessage("Total amount must be greater than zero.");
      return;
    }
    if (!amortization || amortization <= 0) {
      setErrorMessage("Amortization per cutoff must be greater than zero.");
      return;
    }
    if (!startDate) {
      setErrorMessage("Start date is required.");
      return;
    }
    if (endDate && endDate < startDate) {
      setErrorMessage("End date cannot be earlier than start date.");
      return;
    }

    createMutation.mutate({
      employeeId,
      loanType: loanType as never,
      referenceNumber: referenceNumber.trim() || undefined,
      principalPesos: principal,
      totalAmountPesos: total,
      amortizationPesos: amortization,
      startDate,
      endDate: endDate || undefined,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-loan-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-lg border bg-background p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b">
          <div>
            <h3 id="create-loan-title" className="text-lg font-semibold">
              Enroll New Employee Loan
            </h3>
            <p className="text-xs text-muted-foreground">
              Configure loan deduction terms for automated semi-monthly payroll
              runs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1">
            <FieldLabel htmlFor="create-loan-employee">Employee</FieldLabel>
            <Select
              items={employees.map((emp) => ({
                value: emp.id,
                label: `${emp.firstName} ${emp.lastName} (${emp.employeeNumber})${emp.department?.name ? ` · ${emp.department.name}` : ""}`,
              }))}
              value={employeeId}
              onValueChange={(val) => {
                if (val) setEmployeeId(val);
              }}
            >
              <SelectTrigger id="create-loan-employee" className="w-full">
                <SelectValue placeholder="Select an employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeNumber})
                      {emp.department?.name ? ` · ${emp.department.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel htmlFor="create-loan-type">
                Loan Program / Type
              </FieldLabel>
              <Select
                items={LOAN_PROGRAM_ITEMS}
                value={loanType}
                onValueChange={(val) => {
                  if (val) setLoanType(val);
                }}
              >
                <SelectTrigger id="create-loan-type" className="w-full">
                  <SelectValue placeholder="Select loan program / type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {LOAN_PROGRAM_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <FieldLabel htmlFor="create-loan-ref">
                Reference / PN Number
              </FieldLabel>
              <Input
                id="create-loan-ref"
                placeholder="e.g. SSS-2026-09876"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <FieldLabel htmlFor="create-principal">Principal (₱)</FieldLabel>
              <Input
                id="create-principal"
                type="number"
                step="0.01"
                min="0"
                placeholder="30000"
                value={principalPesos}
                onChange={(e) =>
                  handlePrincipalChange(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                required
              />
            </div>

            <div className="space-y-1">
              <FieldLabel htmlFor="create-total">Total to Repay (₱)</FieldLabel>
              <Input
                id="create-total"
                type="number"
                step="0.01"
                min="0"
                placeholder="30000"
                value={totalAmountPesos}
                onChange={(e) =>
                  setTotalAmountPesos(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                required
              />
            </div>

            <div className="space-y-1">
              <FieldLabel htmlFor="create-amortization">
                Amortization / Cutoff (₱)
              </FieldLabel>
              <Input
                id="create-amortization"
                type="number"
                step="0.01"
                min="0"
                placeholder="1250"
                value={amortizationPesos}
                onChange={(e) =>
                  setAmortizationPesos(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel htmlFor="create-start-date">
                First Deduction Date
              </FieldLabel>
              <Input
                id="create-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <FieldLabel htmlFor="create-end-date">
                Maturity / End Date (Optional)
              </FieldLabel>
              <Input
                id="create-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Real-time payoff preview */}
          {amortization > 0 && total > 0 && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Amortization Schedule Preview
              </div>
              <p className="text-muted-foreground">
                At{" "}
                <strong className="text-foreground">
                  ₱{amortization.toLocaleString()}
                </strong>{" "}
                per semi-monthly cutoff, this loan will take approximately{" "}
                <strong className="text-foreground">
                  {cutoffsToPayoff} cutoffs
                </strong>{" "}
                (~{estimatedMonths} months) to fully settle.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Enroll Loan
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// LOAN LEDGER MODAL
// ----------------------------------------------------
interface LoanLedgerModalProps {
  loanId: string;
  onClose: () => void;
  onRecordPaymentRequested: () => void;
  onDeactivated: () => void;
}

function LoanLedgerModal({
  loanId,
  onClose,
  onRecordPaymentRequested,
  onDeactivated,
}: LoanLedgerModalProps) {
  const loanQuery = trpc.loans.getById.useQuery({ loanId });
  const deactivateMutation = trpc.loans.deactivate.useMutation({
    onSuccess: () => {
      onDeactivated();
      void loanQuery.refetch();
    },
  });

  const loan = loanQuery.data;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="loan-ledger-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border bg-background p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b">
          <div>
            <h3 id="loan-ledger-title" className="text-lg font-semibold">
              Loan Details & Payment Ledger
            </h3>
            <p className="text-xs text-muted-foreground">
              Detailed deduction history and amortization ledger.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {loanQuery.isPending ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Loading loan ledger…
          </div>
        ) : !loan ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loan record not found.
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {/* Loan Card Summary */}
            <div className="grid gap-4 sm:grid-cols-2 rounded-lg border bg-muted/20 p-4 text-xs">
              <div>
                <span className="text-muted-foreground block">Employee</span>
                <span className="font-semibold text-sm text-foreground">
                  {loan.employee.firstName} {loan.employee.lastName}
                </span>
                <span className="text-muted-foreground block">
                  {loan.employee.employeeNumber} ·{" "}
                  {loan.employee.department?.name ?? "General"}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground block">
                  Loan Program
                </span>
                <span className="font-semibold text-sm text-foreground">
                  {LOAN_TYPE_LABELS[loan.loanType] || loan.loanType}
                </span>
                {loan.referenceNumber && (
                  <span className="text-muted-foreground block">
                    Ref: {loan.referenceNumber}
                  </span>
                )}
              </div>

              <div>
                <span className="text-muted-foreground block">
                  Total Amount
                </span>
                <span className="font-semibold text-foreground">
                  {pesos(loan.totalAmountCents)}
                </span>
                <span className="text-muted-foreground block">
                  Principal: {pesos(loan.principalCents)}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground block">
                  Remaining Balance
                </span>
                <span className="font-bold text-base text-amber-600 dark:text-amber-400">
                  {pesos(loan.balanceCents)}
                </span>
                <span className="text-muted-foreground block">
                  Amortization: {pesos(loan.amortizationCents)} / cutoff
                </span>
              </div>
            </div>

            {/* Repayment Progress */}
            {(() => {
              const total = Number(loan.totalAmountCents);
              const balance = Number(loan.balanceCents);
              const paid = total - balance;
              const percent =
                total > 0
                  ? Math.min(100, Math.max(0, Math.round((paid / total) * 100)))
                  : 100;

              return (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Repayment Progress</span>
                    <span className="font-semibold text-foreground">
                      {pesos(paid)} paid ({percent}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* Payment Ledger Table */}
            <div>
              <div className="flex items-center justify-between pb-2">
                <h4 className="font-semibold text-sm">
                  Payment History ({loan.payments.length})
                </h4>
                {loan.isActive && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onRecordPaymentRequested}
                  >
                    <Plus className="mr-1.5 size-3.5" />
                    Record Settlement
                  </Button>
                )}
              </div>

              {loan.payments.length > 0 ? (
                <div className="overflow-x-auto rounded-md border">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="uppercase text-[10px]">
                        <TableHead className="px-3 py-2">Date</TableHead>
                        <TableHead className="px-3 py-2">
                          Source / Cutoff
                        </TableHead>
                        <TableHead className="px-3 py-2 text-right">
                          Amount Paid
                        </TableHead>
                        <TableHead className="px-3 py-2 text-right">
                          Remaining Balance
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loan.payments.map((p) => {
                        const payrollRun = p.payslip?.payrollRun;
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="px-3 py-2 font-medium">
                              {formatDate(p.paymentDate)}
                            </TableCell>
                            <TableCell className="px-3 py-2 text-muted-foreground">
                              {payrollRun ? (
                                <span>
                                  Payroll Run (
                                  {formatDate(payrollRun.cutoffStartDate)} –{" "}
                                  {formatDate(payrollRun.cutoffEndDate)})
                                </span>
                              ) : (
                                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                  Manual / Direct Payment
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                              {pesos(p.amountPaidCents)}
                            </TableCell>
                            <TableCell className="px-3 py-2 text-right font-medium">
                              {pesos(p.balanceAfterCents)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Empty className="py-6 border rounded-md">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CreditCard className="size-6 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>No payments recorded yet</EmptyTitle>
                    <EmptyDescription>
                      Amortization will automatically deduct on the next payroll
                      run.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                {loan.isActive ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={deactivateMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Are you sure you want to deactivate this loan? Automated deductions will stop.",
                        )
                      ) {
                        deactivateMutation.mutate({ loanId: loan.id });
                      }
                    }}
                  >
                    Deactivate Loan
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    This loan account is closed.
                  </span>
                )}
              </div>

              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// RECORD PAYMENT MODAL
// ----------------------------------------------------
interface RecordPaymentModalProps {
  loanId: string;
  onClose: () => void;
  onPaid: () => void;
}

function RecordPaymentModal({
  loanId,
  onClose,
  onPaid,
}: RecordPaymentModalProps) {
  const loanQuery = trpc.loans.getById.useQuery({ loanId });
  const [amountPesos, setAmountPesos] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const paymentMutation = trpc.loans.recordPayment.useMutation({
    onSuccess: () => {
      onPaid();
    },
    onError: (err) => {
      setErrorMessage(err.message || "Failed to record payment.");
    },
  });

  const loan = loanQuery.data;
  const currentBalancePesos = loan ? Number(loan.balanceCents) / 100 : 0;
  const paymentAmount = typeof amountPesos === "number" ? amountPesos : 0;
  const remainingAfter = Math.max(0, currentBalancePesos - paymentAmount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!paymentAmount || paymentAmount <= 0) {
      setErrorMessage("Payment amount must be greater than zero.");
      return;
    }
    if (paymentAmount > currentBalancePesos) {
      setErrorMessage(
        `Payment amount (₱${paymentAmount.toLocaleString()}) cannot exceed the remaining balance (₱${currentBalancePesos.toLocaleString()}).`,
      );
      return;
    }

    paymentMutation.mutate({
      loanId,
      amountPesos: paymentAmount,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-payment-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="relative w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b">
          <div>
            <h3 id="record-payment-title" className="text-lg font-semibold">
              Record Direct Payment
            </h3>
            <p className="text-xs text-muted-foreground">
              Record an over-the-counter or cash settlement outside payroll.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {loan && (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Employee:</span>
                <span className="font-medium text-foreground">
                  {loan.employee.firstName} {loan.employee.lastName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Program:</span>
                <span className="font-medium text-foreground">
                  {LOAN_TYPE_LABELS[loan.loanType] || loan.loanType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Balance:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {pesos(loan.balanceCents)}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="payment-amount">
                  Payment Amount (₱)
                </FieldLabel>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[11px] text-primary"
                  onClick={() => setAmountPesos(currentBalancePesos)}
                >
                  Pay Full Balance
                </Button>
              </div>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={currentBalancePesos}
                placeholder={currentBalancePesos.toFixed(2)}
                value={amountPesos}
                onChange={(e) =>
                  setAmountPesos(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                required
              />
            </div>

            <div className="space-y-1">
              <FieldLabel htmlFor="payment-notes">
                Notes / Reference (Optional)
              </FieldLabel>
              <Input
                id="payment-notes"
                placeholder="e.g. Bank deposit, OTC payment, or cashier receipt #"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {paymentAmount > 0 && (
              <div className="rounded-md bg-muted/40 p-2.5 text-xs flex justify-between items-center">
                <span className="text-muted-foreground">
                  Balance After Payment:
                </span>
                <span className="font-bold text-foreground">
                  ₱
                  {remainingAfter.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={paymentMutation.isPending}>
                {paymentMutation.isPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Confirm Payment
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
