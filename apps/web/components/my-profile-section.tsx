"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select";
import { Separator } from "@workspace/ui/components/separator";
import {
  Banknote,
  Calendar,
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  ShieldAlert,
  User,
  X,
} from "lucide-react";
import { useState } from "react";
import { manilaToday } from "@/lib/attendance-time";
import { downloadBase64File } from "@/lib/download-file";
import { trpc } from "@/lib/trpc";
import { MfaSettingsCard } from "./mfa-settings-card";
import { usePortalUser } from "./payroll-portal";

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

function maskId(val: string | null | undefined, visibleCount = 4): string {
  if (!val) return "-";
  const clean = val.trim();
  if (clean.length <= visibleCount) return clean;
  const hiddenLength = clean.length - visibleCount;
  return `${"*".repeat(hiddenLength)}${clean.slice(hiddenLength)}`;
}

export function MyProfileSection() {
  const { user } = usePortalUser();
  const utils = trpc.useUtils();

  const [showSensitive, setShowSensitive] = useState(false);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(
    null,
  );

  // Leave filing state
  const [showFilingForm, setShowFilingForm] = useState(false);
  const [leaveType, setLeaveType] = useState("VACATION");
  const [startDate, setStartDate] = useState(manilaToday());
  const [endDate, setEndDate] = useState(manilaToday());
  const [daysCount, setDaysCount] = useState("1");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [isPaid, setIsPaid] = useState(true);
  const [reason, setReason] = useState("");
  const [filingError, setFilingError] = useState<string | null>(null);
  const [filingSuccess, setFilingSuccess] = useState<string | null>(null);

  // Leave withdraw state
  const [withdrawingRequestId, setWithdrawingRequestId] = useState<
    string | null
  >(null);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const profile = trpc.employees.getMyProfile.useQuery(undefined, {
    retry: false,
  });

  const currentYear = Number(manilaToday().slice(0, 4));
  const leaveRequests = trpc.leaves.listRequests.useQuery(
    {
      employeeId: user.employeeId ?? "",
      year: currentYear,
      limit: 50,
    },
    {
      enabled: !!user.employeeId,
      retry: false,
    },
  );

  const payslips = trpc.payroll.getMyPayslips.useQuery(undefined, {
    enabled: !!user.employeeId,
    retry: false,
  });

  const fileLeave = trpc.leaves.request.useMutation({
    onSuccess: () => {
      setFilingSuccess("Leave request submitted successfully!");
      setFilingError(null);
      setReason("");
      setShowFilingForm(false);
      void utils.employees.getMyProfile.invalidate();
      void utils.leaves.listRequests.invalidate();
      void utils.leaves.getBalances.invalidate();
    },
    onError: (err) => {
      setFilingError(err.message || "Could not submit leave request.");
      setFilingSuccess(null);
    },
  });

  const withdrawLeave = trpc.leaves.withdraw.useMutation({
    onSuccess: () => {
      setWithdrawingRequestId(null);
      setWithdrawReason("");
      setWithdrawError(null);
      void utils.employees.getMyProfile.invalidate();
      void utils.leaves.listRequests.invalidate();
      void utils.leaves.getBalances.invalidate();
    },
    onError: (err) => {
      setWithdrawError(err.message || "Failed to withdraw leave request.");
    },
  });

  const handleFileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.employeeId) return;

    const days = Number(daysCount);
    if (Number.isNaN(days) || days <= 0) {
      setFilingError("Please enter a valid number of days.");
      return;
    }

    if (!reason.trim()) {
      setFilingError("A reason is required to submit a leave request.");
      return;
    }

    setFilingError(null);
    setFilingSuccess(null);

    fileLeave.mutate({
      employeeId: user.employeeId,
      leaveType,
      startDate,
      endDate,
      daysCount: isHalfDay ? 0.5 : days,
      partialDate: isHalfDay ? startDate : undefined,
      isPaid,
      reason: reason.trim(),
    });
  };

  const handleWithdrawSubmit = (e: React.FormEvent, requestId: string) => {
    e.preventDefault();
    if (withdrawReason.trim().length < 10) {
      setWithdrawError("Withdrawal reason must be at least 10 characters.");
      return;
    }
    setWithdrawError(null);
    withdrawLeave.mutate({
      requestId,
      reason: withdrawReason.trim(),
    });
  };

  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [downloadPdfError, setDownloadPdfError] = useState<string | null>(null);

  const handleDownloadMyPayslipPdf = async (payslipId: string) => {
    setDownloadingPdfId(payslipId);
    setDownloadPdfError(null);
    try {
      const data = await utils.payroll.downloadPayslip.fetch({ payslipId });
      downloadBase64File(data.dataBase64, data.fileName, "application/pdf");
    } catch (err) {
      setDownloadPdfError(
        err instanceof Error ? err.message : "Failed to download payslip PDF.",
      );
    } finally {
      setDownloadingPdfId(null);
    }
  };

  if (profile.isPending) {
    return (
      <div
        className="py-12 text-center text-sm text-muted-foreground"
        role="status"
      >
        Loading your employee profile…
      </div>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <Card role="region" aria-label="Profile unavailable">
        <CardHeader>
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <ShieldAlert className="size-5" />
            Profile Unavailable
          </CardTitle>
          <CardDescription>
            {profile.error?.message ||
              "No employee profile is currently linked to your user account. Please contact HR."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void profile.refetch()}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const emp = profile.data;
  const activePayslip = payslips.data?.find((p) => p.id === selectedPayslipId);

  return (
    <section className="space-y-6" aria-label="My Profile">
      {/* 1. Header Profile Banner */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl">
                {emp.firstName[0]}
                {emp.lastName[0]}
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">
                  {emp.firstName} {emp.middleName ? `${emp.middleName} ` : ""}
                  {emp.lastName} {emp.suffix ?? ""}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-0.5">
                  <span className="font-mono font-medium text-foreground">
                    {emp.employeeNumber}
                  </span>
                  <span>·</span>
                  <span>{emp.department?.name ?? "Department"}</span>
                  <span>·</span>
                  <span>{emp.branch?.name ?? "Branch"}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {emp.employmentStatus}
              </span>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {emp.employmentType
                  ? emp.employmentType.replaceAll("_", " ")
                  : "REGULAR"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Personal & Statutory Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="size-5 text-primary" />
              Personal & Statutory Details
            </CardTitle>
            <CardDescription>
              Your registered personal background and Philippine government IDs.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSensitive(!showSensitive)}
            className="gap-1.5"
            aria-label={
              showSensitive ? "Hide sensitive IDs" : "Show sensitive IDs"
            }
          >
            {showSensitive ? (
              <>
                <EyeOff className="size-4" />
                Hide Sensitive IDs
              </>
            ) : (
              <>
                <Eye className="size-4" />
                Show Sensitive IDs
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">
                Email Address
              </span>
              <span className="font-medium text-foreground">{emp.email}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Contact Number
              </span>
              <span className="font-medium text-foreground">
                {emp.contactNumber}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Date of Birth
              </span>
              <span className="font-medium text-foreground">
                {formatDate(emp.dateOfBirth)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Gender
              </span>
              <span className="font-medium text-foreground">{emp.gender}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Civil Status
              </span>
              <span className="font-medium text-foreground">
                {emp.civilStatus}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Hire Date
              </span>
              <span className="font-medium text-foreground">
                {formatDate(emp.hireDate)}
              </span>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <span className="text-xs text-muted-foreground block">
                Residential Address
              </span>
              <span className="font-medium text-foreground">
                {emp.residentialAddress}
              </span>
            </div>

            <Separator className="sm:col-span-2 lg:col-span-3 my-1" />

            <div>
              <span className="text-xs text-muted-foreground block">
                BIR TIN
              </span>
              <span className="font-mono font-medium text-foreground">
                {showSensitive ? emp.tin : maskId(emp.tin)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                SSS Number
              </span>
              <span className="font-mono font-medium text-foreground">
                {showSensitive ? emp.sssNo : maskId(emp.sssNo)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                PhilHealth ID
              </span>
              <span className="font-mono font-medium text-foreground">
                {showSensitive ? emp.philhealthNo : maskId(emp.philhealthNo)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Pag-IBIG MID
              </span>
              <span className="font-mono font-medium text-foreground">
                {showSensitive ? emp.pagibigNo : maskId(emp.pagibigNo)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Payroll Bank
              </span>
              <span className="font-medium text-foreground">
                {emp.bankName}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Bank Account Number
              </span>
              <span className="font-mono font-medium text-foreground">
                {showSensitive
                  ? emp.bankAccountNumber
                  : maskId(emp.bankAccountNumber)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Compensation & Allowances */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Banknote className="size-5 text-primary" />
            Compensation & Allowances
          </CardTitle>
          <CardDescription>
            Your current pay rate basis and non-taxable de minimis benefits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">
                Basic Monthly Rate
              </span>
              <span className="font-semibold text-foreground">
                {pesos(emp.compensation?.basicRateMonthlyCents)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Daily Rate
              </span>
              <span className="font-semibold text-foreground">
                {pesos(emp.compensation?.basicRateDailyCents)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Tax Status
              </span>
              <span className="font-medium text-foreground">
                {emp.compensation?.isTaxExempt
                  ? "Minimum Wage / Tax Exempt"
                  : "Regular Taxable"}
              </span>
            </div>
          </div>

          {emp.allowances && emp.allowances.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <span className="text-xs font-semibold text-muted-foreground block mb-2">
                Active Monthly Allowances
              </span>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {emp.allowances.map((allowance) => (
                  <div
                    key={allowance.id}
                    className="rounded-md border bg-muted/30 p-2.5 text-xs flex justify-between items-center"
                  >
                    <div>
                      <span className="font-medium text-foreground block">
                        {allowance.name}
                      </span>
                      <span className="text-muted-foreground">
                        {allowance.type.replaceAll("_", " ")}
                      </span>
                    </div>
                    <span className="font-semibold text-foreground">
                      {pesos(allowance.amountCents)} / mo
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Leave Balances & Filing */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="size-5 text-primary" />
              Leave Credits & Requests
            </CardTitle>
            <CardDescription>
              Your available leave balances and leave request submission.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant={showFilingForm ? "secondary" : "default"}
            size="sm"
            onClick={() => {
              setShowFilingForm(!showFilingForm);
              setFilingError(null);
              setFilingSuccess(null);
            }}
          >
            {showFilingForm ? "Cancel Filing" : "File Leave Request"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Leave Balances Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {emp.leaveBalances && emp.leaveBalances.length > 0 ? (
              emp.leaveBalances.map((bal) => (
                <div
                  key={bal.id}
                  className="rounded-lg border bg-card p-3.5 space-y-1"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                    {bal.leaveType.replaceAll("_", " ")}
                  </span>
                  <div className="text-2xl font-bold text-foreground">
                    {bal.balance?.toString() ?? "0"}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      days left
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex justify-between pt-1 border-t">
                    <span>Total: {bal.totalCredits?.toString() ?? "0"}</span>
                    <span>Used: {bal.usedCredits?.toString() ?? "0"}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground col-span-full">
                No leave credit policies allocated yet for calendar year{" "}
                {currentYear}.
              </p>
            )}
          </div>

          {/* Collapsible Leave Filing Form */}
          {showFilingForm && (
            <form
              onSubmit={handleFileSubmit}
              className="rounded-lg border bg-muted/20 p-4 space-y-4"
            >
              <h3 className="text-sm font-semibold text-foreground">
                New Leave Request
              </h3>

              {filingError && (
                <p
                  role="alert"
                  className="text-sm text-destructive bg-destructive/10 p-2 rounded"
                >
                  {filingError}
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field>
                  <FieldLabel>Leave Type</FieldLabel>
                  <NativeSelect
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                  >
                    <NativeSelectOption value="VACATION">
                      Vacation Leave
                    </NativeSelectOption>
                    <NativeSelectOption value="SICK">
                      Sick Leave
                    </NativeSelectOption>
                    <NativeSelectOption value="SIL">
                      Service Incentive Leave (SIL)
                    </NativeSelectOption>
                    <NativeSelectOption value="MATERNITY">
                      Maternity Leave
                    </NativeSelectOption>
                    <NativeSelectOption value="PATERNITY">
                      Paternity Leave
                    </NativeSelectOption>
                    <NativeSelectOption value="SOLO_PARENT">
                      Solo Parent Leave
                    </NativeSelectOption>
                    <NativeSelectOption value="EMERGENCY">
                      Emergency Leave
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>

                <Field>
                  <FieldLabel>Start Date</FieldLabel>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel>End Date</FieldLabel>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel>Number of Days</FieldLabel>
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="90"
                    value={isHalfDay ? "0.5" : daysCount}
                    disabled={isHalfDay}
                    onChange={(e) => setDaysCount(e.target.value)}
                    required
                  />
                </Field>

                <div className="flex flex-col justify-center space-y-2 pt-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="halfDayCheckbox"
                      checked={isHalfDay}
                      onCheckedChange={(checked) => setIsHalfDay(!!checked)}
                    />
                    <label
                      htmlFor="halfDayCheckbox"
                      className="text-sm text-foreground cursor-pointer"
                    >
                      Half-day leave (0.5 day)
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="isPaidCheckbox"
                      checked={isPaid}
                      onCheckedChange={(checked) => setIsPaid(!!checked)}
                    />
                    <label
                      htmlFor="isPaidCheckbox"
                      className="text-sm text-foreground cursor-pointer"
                    >
                      Paid leave (deduct from credits)
                    </label>
                  </div>
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <Field>
                    <FieldLabel>Reason for Leave</FieldLabel>
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Brief explanation of your leave request…"
                      required
                    />
                  </Field>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilingForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={fileLeave.isPending}>
                  {fileLeave.isPending ? "Submitting…" : "Submit Request"}
                </Button>
              </div>
            </form>
          )}

          {filingSuccess && (
            <p
              role="status"
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200"
            >
              {filingSuccess}
            </p>
          )}

          {/* Leave History Table */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              Recent Leave Requests ({currentYear})
            </h3>
            {leaveRequests.isPending ? (
              <p className="text-xs text-muted-foreground">
                Loading leave history…
              </p>
            ) : leaveRequests.data && leaveRequests.data.length > 0 ? (
              <div className="divide-y rounded-md border text-sm">
                {leaveRequests.data.map((req) => (
                  <div
                    key={req.id}
                    className="p-3 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {req.leaveType.replaceAll("_", " ")}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                            req.status === "APPROVED"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : req.status === "PENDING"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : req.status === "REJECTED"
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {req.status}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({req.daysCount}{" "}
                          {Number(req.daysCount) === 1 ? "day" : "days"})
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(req.startDate)} to {formatDate(req.endDate)}{" "}
                        · Reason: {req.reason}
                      </p>
                    </div>

                    {req.status === "PENDING" && (
                      <div>
                        {withdrawingRequestId === req.id ? (
                          <form
                            onSubmit={(e) => handleWithdrawSubmit(e, req.id)}
                            className="flex items-center gap-2"
                          >
                            <Input
                              value={withdrawReason}
                              onChange={(e) =>
                                setWithdrawReason(e.target.value)
                              }
                              placeholder="Reason to withdraw (min 10 chars)…"
                              className="text-xs h-8 w-60"
                              required
                            />
                            <Button
                              type="submit"
                              size="sm"
                              variant="destructive"
                              className="h-8 text-xs"
                              disabled={withdrawLeave.isPending}
                            >
                              Confirm
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs"
                              onClick={() => {
                                setWithdrawingRequestId(null);
                                setWithdrawReason("");
                                setWithdrawError(null);
                              }}
                            >
                              Cancel
                            </Button>
                          </form>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setWithdrawingRequestId(req.id);
                              setWithdrawReason("");
                              setWithdrawError(null);
                            }}
                            className="text-xs text-destructive hover:bg-destructive/10"
                          >
                            Withdraw
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No leave requests recorded for this year.
              </p>
            )}
            {withdrawError && (
              <p role="alert" className="text-xs text-destructive mt-1">
                {withdrawError}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 5. My Payslips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="size-5 text-primary" />
            My Payslips
          </CardTitle>
          <CardDescription>
            Historical payslips from disbursed and completed payroll runs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {payslips.isPending ? (
            <p className="text-sm text-muted-foreground">
              Loading your payslips…
            </p>
          ) : payslips.data && payslips.data.length > 0 ? (
            <div className="divide-y rounded-md border text-sm">
              {payslips.data.map((slip) => (
                <div
                  key={slip.id}
                  className="p-3.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {slip.payrollRun.cutoffSequence.replaceAll("_", " ")}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {slip.payrollRun.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Period: {formatDate(slip.payrollRun.cutoffStartDate)} –{" "}
                      {formatDate(slip.payrollRun.cutoffEndDate)} · Payment:{" "}
                      {formatDate(slip.payrollRun.paymentDate)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right mr-2">
                      <span className="text-xs text-muted-foreground block">
                        Net Pay
                      </span>
                      <span className="font-bold text-foreground text-base">
                        {pesos(slip.netPayCents)}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedPayslipId(slip.id);
                        setDownloadPdfError(null);
                      }}
                    >
                      View Details
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title="Download PDF"
                      aria-label={`Download PDF for ${slip.payrollRun.cutoffSequence}`}
                      onClick={() => handleDownloadMyPayslipPdf(slip.id)}
                      disabled={downloadingPdfId === slip.id}
                    >
                      {downloadingPdfId === slip.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No disbursed payslips are available for your account yet.
            </p>
          )}

          {/* Payslip Detail Modal */}
          {activePayslip && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Payslip detail"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            >
              <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-background shadow-2xl">
                <CardHeader className="flex flex-row items-start justify-between pb-3">
                  <div>
                    <CardTitle className="text-lg">
                      Payslip —{" "}
                      {activePayslip.payrollRun.cutoffSequence.replaceAll(
                        "_",
                        " ",
                      )}
                    </CardTitle>
                    <CardDescription>
                      Cutoff:{" "}
                      {formatDate(activePayslip.payrollRun.cutoffStartDate)} –{" "}
                      {formatDate(activePayslip.payrollRun.cutoffEndDate)} ·
                      Disbursed:{" "}
                      {formatDate(activePayslip.payrollRun.paymentDate)}
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedPayslipId(null)}
                    aria-label="Close payslip modal"
                  >
                    <X className="size-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {/* Earnings */}
                  <div className="space-y-1.5 rounded-lg border p-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Earnings
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>Basic Pay:</div>
                      <div className="text-right font-medium">
                        {pesos(activePayslip.basicPayCents)}
                      </div>
                      {Number(activePayslip.paidLeavePayCents) > 0 && (
                        <>
                          <div>Paid Leave Pay:</div>
                          <div className="text-right font-medium">
                            {pesos(activePayslip.paidLeavePayCents)}
                          </div>
                        </>
                      )}
                      {Number(activePayslip.overtimePayCents) > 0 && (
                        <>
                          <div>Overtime Pay:</div>
                          <div className="text-right font-medium">
                            {pesos(activePayslip.overtimePayCents)}
                          </div>
                        </>
                      )}
                      {Number(activePayslip.holidayPayCents) > 0 && (
                        <>
                          <div>Holiday Pay:</div>
                          <div className="text-right font-medium">
                            {pesos(activePayslip.holidayPayCents)}
                          </div>
                        </>
                      )}
                      {Number(activePayslip.taxableAllowancesCents) > 0 && (
                        <>
                          <div>Taxable Allowances:</div>
                          <div className="text-right font-medium">
                            {pesos(activePayslip.taxableAllowancesCents)}
                          </div>
                        </>
                      )}
                      {Number(activePayslip.nonTaxableAllowancesCents) > 0 && (
                        <>
                          <div>De Minimis / Non-taxable Allowances:</div>
                          <div className="text-right font-medium">
                            {pesos(activePayslip.nonTaxableAllowancesCents)}
                          </div>
                        </>
                      )}
                      <div className="font-semibold border-t pt-1">
                        Total Gross Pay:
                      </div>
                      <div className="text-right font-bold text-foreground border-t pt-1">
                        {pesos(activePayslip.grossPayCents)}
                      </div>
                    </div>
                  </div>

                  {/* Deductions */}
                  <div className="space-y-1.5 rounded-lg border p-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Deductions
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Number(activePayslip.tardinessDeductionCents) > 0 && (
                        <>
                          <div>Tardiness / Lates:</div>
                          <div className="text-right font-medium text-destructive">
                            -{pesos(activePayslip.tardinessDeductionCents)}
                          </div>
                        </>
                      )}
                      {Number(activePayslip.undertimeDeductionCents) > 0 && (
                        <>
                          <div>Undertime:</div>
                          <div className="text-right font-medium text-destructive">
                            -{pesos(activePayslip.undertimeDeductionCents)}
                          </div>
                        </>
                      )}
                      {Number(activePayslip.absenceDeductionCents) > 0 && (
                        <>
                          <div>Absences:</div>
                          <div className="text-right font-medium text-destructive">
                            -{pesos(activePayslip.absenceDeductionCents)}
                          </div>
                        </>
                      )}
                      <div>SSS Employee Contribution:</div>
                      <div className="text-right font-medium text-destructive">
                        -{pesos(activePayslip.sssEmployeeCents)}
                      </div>
                      <div>PhilHealth Employee Contribution:</div>
                      <div className="text-right font-medium text-destructive">
                        -{pesos(activePayslip.philhealthEmployeeCents)}
                      </div>
                      <div>Pag-IBIG Employee Contribution:</div>
                      <div className="text-right font-medium text-destructive">
                        -{pesos(activePayslip.pagibigEmployeeCents)}
                      </div>
                      <div>Withholding Tax:</div>
                      <div className="text-right font-medium text-destructive">
                        -{pesos(activePayslip.withholdingTaxCents)}
                      </div>
                      {Number(activePayslip.loanDeductionsCents) > 0 && (
                        <>
                          <div>Loan Amortizations:</div>
                          <div className="text-right font-medium text-destructive">
                            -{pesos(activePayslip.loanDeductionsCents)}
                          </div>
                        </>
                      )}
                      <div className="font-semibold border-t pt-1">
                        Total Deductions:
                      </div>
                      <div className="text-right font-bold text-destructive border-t pt-1">
                        -{pesos(activePayslip.totalDeductionsCents)}
                      </div>
                    </div>
                  </div>

                  {/* Net Pay Banner */}
                  <div className="rounded-lg bg-primary/10 p-3.5 flex justify-between items-center">
                    <span className="font-bold text-foreground">
                      Take-Home Net Pay:
                    </span>
                    <span className="text-xl font-extrabold text-primary">
                      {pesos(activePayslip.netPayCents)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleDownloadMyPayslipPdf(activePayslip.id)
                      }
                      disabled={downloadingPdfId === activePayslip.id}
                    >
                      {downloadingPdfId === activePayslip.id ? (
                        <>
                          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                          Downloading PDF…
                        </>
                      ) : (
                        <>
                          <Download className="mr-1.5 size-3.5" />
                          Download Official PDF
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedPayslipId(null);
                        setDownloadPdfError(null);
                      }}
                    >
                      Close
                    </Button>
                  </div>
                  {downloadPdfError && (
                    <p className="text-xs text-destructive">
                      {downloadPdfError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    Note: Payslip PDF is encrypted. Use your Date of Birth in
                    MMDDYYYY format to unlock.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <MfaSettingsCard />
    </section>
  );
}
