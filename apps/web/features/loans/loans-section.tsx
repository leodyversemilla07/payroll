"use client";

import { Button } from "@workspace/ui/components/button";
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
import { FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
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
  X,
} from "lucide-react";
import { useState } from "react";
import { PageHeaderAction } from "@/components/page-header-action";
import { manilaToday } from "@/lib/attendance-time";
import { trpc } from "@/lib/trpc";
import { LoansDataTable } from "./loans-data-table";

export const LOAN_TYPE_LABELS: Record<string, string> = {
  SSS_SALARY_LOAN: "SSS Salary Loan",
  SSS_CALAMITY_LOAN: "SSS Calamity Loan",
  PAGIBIG_MULTI_PURPOSE: "Pag-IBIG Multi-Purpose Loan (MPL)",
  PAGIBIG_HOUSING: "Pag-IBIG Housing Loan",
  COMPANY_CASH_ADVANCE: "Company Cash Advance",
  COMPANY_EMERGENCY_LOAN: "Company Emergency Loan",
};

const LOAN_PROGRAM_ITEMS = Object.entries(LOAN_TYPE_LABELS).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

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

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [paymentLoanId, setPaymentLoanId] = useState<string | null>(null);

  // Queries
  const summaryQuery = trpc.loans.getSummary.useQuery();
  const loansQuery = trpc.loans.list.useQuery({
    status: "ALL",
  });

  const employeesQuery = trpc.employees.list.useQuery();

  return (
    <div className="space-y-6">
      <PageHeaderAction>
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
      </PageHeaderAction>

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

      {/* Loans Data Table */}
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
          ) : (
            <LoansDataTable
              data={loansQuery.data ?? []}
              onSelectLoan={(id) => setSelectedLoanId(id)}
              onRecordPayment={(id) => setPaymentLoanId(id)}
              selectedId={selectedLoanId}
            />
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
