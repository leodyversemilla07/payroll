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
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Separator } from "@workspace/ui/components/separator";
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
  Calendar,
  Download,
  Eye,
  EyeOff,
  FileText,
  Landmark,
  LayoutDashboard,
  Link as LinkIcon,
  Loader2,
  Shield,
  ShieldAlert,
  User,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MfaSettingsCard } from "@/components/mfa-settings-card";
import { usePortalUser } from "@/components/payroll-portal";
import { LOAN_TYPE_LABELS } from "@/features/loans/loans-section";
import { manilaToday } from "@/lib/attendance-time";
import { downloadBase64File } from "@/lib/download-file";
import { trpc } from "@/lib/trpc";

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
  const { user, isStaff, canManageEmployees } = usePortalUser();
  const utils = trpc.useUtils();

  const [showSensitive, setShowSensitive] = useState(false);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(
    null,
  );

  // Profile linking state (for admin users who don't have an employee profile)
  const [selectedEmployeeToLink, setSelectedEmployeeToLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  const availableEmployees = trpc.employees.list.useQuery(undefined, {
    enabled: !user.employeeId && canManageEmployees,
    retry: false,
  });

  const linkEmployeeMutation = trpc.users.linkEmployee.useMutation({
    onSuccess: () => {
      setLinkSuccess("Employee profile linked successfully!");
      setLinkError(null);
      void utils.auth.me.invalidate();
      void utils.employees.getMyProfile.invalidate();
    },
    onError: (err) => {
      setLinkError(err.message || "Failed to link employee profile.");
      setLinkSuccess(null);
    },
  });

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeToLink) return;
    setLinkError(null);
    setLinkSuccess(null);
    linkEmployeeMutation.mutate({
      userId: user.id,
      employeeId: selectedEmployeeToLink,
    });
  };

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
    enabled: !!user.employeeId,
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

  const myLoans = trpc.loans.getMyLoans.useQuery(undefined, {
    enabled: !!user.employeeId,
    retry: false,
  });
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);

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

  const emp = profile.data;
  const activePayslip = payslips.data?.find((p) => p.id === selectedPayslipId);

  const [taxCertificateYear, setTaxCertificateYear] = useState(
    new Date().getFullYear(),
  );
  const [downloadingBirPdf, setDownloadingBirPdf] = useState(false);
  const [downloadBirError, setDownloadBirError] = useState<string | null>(null);

  const bir2316Issuance = trpc.compliance.getBir2316Issuance.useQuery(
    {
      employeeId: emp?.id ?? "",
      taxYear: taxCertificateYear,
    },
    {
      enabled: Boolean(emp?.id),
      retry: false,
    },
  );

  const handleDownloadMyBir2316 = async () => {
    if (!emp?.id) return;
    setDownloadingBirPdf(true);
    setDownloadBirError(null);
    try {
      const data = await utils.compliance.downloadBir2316Pdf.fetch({
        employeeId: emp.id,
        taxYear: taxCertificateYear,
        isPreview: false,
      });
      downloadBase64File(data.dataBase64, data.fileName, "application/pdf");
    } catch (err) {
      setDownloadBirError(
        err instanceof Error
          ? err.message
          : "Failed to download BIR Form 2316 PDF.",
      );
    } finally {
      setDownloadingBirPdf(false);
    }
  };

  return (
    <section className="space-y-6" aria-label="My Profile">
      {/* 1. User Account Overview (Always displayed) */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl">
                {user.name.trim()[0]?.toUpperCase() || "U"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight">
                    {user.name}
                  </h2>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {user.role.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
                  <span>{user.email}</span>
                  <span>·</span>
                  <span className="font-mono text-xs">
                    Org: {user.organizationId}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {user.employeeId ? (
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Linked Employee
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  Unlinked Account
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Employee Profile Section or Administrative Notice */}
      {!user.employeeId ? (
        isStaff ? (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-foreground font-semibold">
                <Shield className="size-5 text-primary" />
                Administrative System Account
              </CardTitle>
              <CardDescription>
                You are signed in as an administrator (
                {user.role.replaceAll("_", " ")}). This user account manages the
                payroll system and organization records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-background/80 p-4 border border-border/50 text-sm space-y-2">
                <p className="font-medium text-foreground">
                  Why are employee details not shown?
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Personal statutory details (TIN, SSS, PhilHealth, Pag-IBIG),
                  compensation rates, daily time records, leave balances, and
                  payslips are only generated for staff enrolled as employees in
                  the payroll system.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href="/portal/employees"
                  className={buttonVariants({
                    variant: "default",
                    size: "sm",
                  })}
                >
                  <Users className="mr-2 size-4" />
                  Employee Directory
                </Link>
                <Link
                  href="/portal/payroll-runs"
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                  })}
                >
                  <Banknote className="mr-2 size-4" />
                  Payroll Operations
                </Link>
                <Link
                  href="/portal"
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                  })}
                >
                  <LayoutDashboard className="mr-2 size-4" />
                  Workspace Overview
                </Link>
              </div>

              {canManageEmployees &&
                availableEmployees.data &&
                availableEmployees.data.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Link an Existing Employee Record
                    </p>
                    <form
                      onSubmit={handleLinkSubmit}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <Field className="w-64">
                        <FieldLabel className="text-xs">
                          Choose Employee Record
                        </FieldLabel>
                        <Select
                          items={availableEmployees.data.map((e) => ({
                            value: e.id,
                            label: `${e.employeeNumber} — ${e.firstName} ${e.lastName}`,
                          }))}
                          value={selectedEmployeeToLink || undefined}
                          onValueChange={(val) =>
                            setSelectedEmployeeToLink(val ?? "")
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select employee…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {availableEmployees.data.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.employeeNumber} — {e.firstName}{" "}
                                  {e.lastName}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Button
                        type="submit"
                        size="default"
                        disabled={
                          !selectedEmployeeToLink ||
                          linkEmployeeMutation.isPending
                        }
                      >
                        {linkEmployeeMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Linking…
                          </>
                        ) : (
                          <>
                            <LinkIcon className="mr-2 size-4" />
                            Link Profile
                          </>
                        )}
                      </Button>
                    </form>
                    {linkError && (
                      <p className="text-xs text-destructive">{linkError}</p>
                    )}
                    {linkSuccess && (
                      <p className="text-xs text-emerald-600">{linkSuccess}</p>
                    )}
                  </div>
                )}
            </CardContent>
          </Card>
        ) : (
          <Card role="region" aria-label="Profile unavailable">
            <CardHeader>
              <CardTitle className="text-base text-destructive flex items-center gap-2">
                <ShieldAlert className="size-5" />
                Employee Profile Not Linked
              </CardTitle>
              <CardDescription>
                {profile.error?.message ||
                  "No employee profile is currently linked to your user account. Please contact your HR administrator to connect your account to your payroll record."}
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
        )
      ) : profile.isPending ? (
        <Card className="py-8 text-center text-sm text-muted-foreground">
          <CardContent className="flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin text-primary" />
            Loading your employee records…
          </CardContent>
        </Card>
      ) : emp ? (
        <>
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
                      {emp.firstName}{" "}
                      {emp.middleName ? `${emp.middleName} ` : ""}
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
                  Your registered personal background and Philippine government
                  IDs.
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
                  <span className="font-medium text-foreground">
                    {emp.email}
                  </span>
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
                  <span className="font-medium text-foreground">
                    {emp.gender}
                  </span>
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
                    {showSensitive
                      ? emp.philhealthNo
                      : maskId(emp.philhealthNo)}
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
                        <span>
                          Total: {bal.totalCredits?.toString() ?? "0"}
                        </span>
                        <span>Used: {bal.usedCredits?.toString() ?? "0"}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full">
                    <Empty className="py-6 border-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Calendar className="size-6 text-muted-foreground" />
                        </EmptyMedia>
                        <EmptyTitle>
                          No leave credit policies allocated yet for calendar
                          year {currentYear}.
                        </EmptyTitle>
                        <EmptyDescription>
                          Annual leave credits will appear here once allocated
                          by HR.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </div>
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
                      <Select
                        items={[
                          { value: "VACATION", label: "Vacation Leave" },
                          { value: "SICK", label: "Sick Leave" },
                          {
                            value: "SIL",
                            label: "Service Incentive Leave (SIL)",
                          },
                          { value: "MATERNITY", label: "Maternity Leave" },
                          { value: "PATERNITY", label: "Paternity Leave" },
                          { value: "SOLO_PARENT", label: "Solo Parent Leave" },
                          { value: "EMERGENCY", label: "Emergency Leave" },
                        ]}
                        value={leaveType}
                        onValueChange={(val) => {
                          if (val) setLeaveType(val);
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select leave type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="VACATION">
                              Vacation Leave
                            </SelectItem>
                            <SelectItem value="SICK">Sick Leave</SelectItem>
                            <SelectItem value="SIL">
                              Service Incentive Leave (SIL)
                            </SelectItem>
                            <SelectItem value="MATERNITY">
                              Maternity Leave
                            </SelectItem>
                            <SelectItem value="PATERNITY">
                              Paternity Leave
                            </SelectItem>
                            <SelectItem value="SOLO_PARENT">
                              Solo Parent Leave
                            </SelectItem>
                            <SelectItem value="EMERGENCY">
                              Emergency Leave
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
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
                    <Button
                      type="submit"
                      size="sm"
                      disabled={fileLeave.isPending}
                    >
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
                            <Badge
                              variant={
                                req.status === "APPROVED"
                                  ? "default"
                                  : req.status === "PENDING"
                                    ? "secondary"
                                    : "destructive"
                              }
                            >
                              {req.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              ({req.daysCount}{" "}
                              {Number(req.daysCount) === 1 ? "day" : "days"})
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(req.startDate)} to{" "}
                            {formatDate(req.endDate)} · Reason: {req.reason}
                          </p>
                        </div>

                        {req.status === "PENDING" && (
                          <div>
                            {withdrawingRequestId === req.id ? (
                              <form
                                onSubmit={(e) =>
                                  handleWithdrawSubmit(e, req.id)
                                }
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
                  <Empty className="py-6 border-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Calendar className="size-6 text-muted-foreground" />
                      </EmptyMedia>
                      <EmptyTitle>
                        No leave requests recorded for this year.
                      </EmptyTitle>
                      <EmptyDescription>
                        Submitted leave applications and approvals will appear
                        here.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
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
                            {slip.payrollRun.cutoffSequence.replaceAll(
                              "_",
                              " ",
                            )}
                          </span>
                          <Badge variant="outline">
                            {slip.payrollRun.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Period: {formatDate(slip.payrollRun.cutoffStartDate)}{" "}
                          – {formatDate(slip.payrollRun.cutoffEndDate)} ·
                          Payment: {formatDate(slip.payrollRun.paymentDate)}
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
                <Empty className="py-8 border-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FileText className="size-6 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>
                      No disbursed payslips are available for your account yet.
                    </EmptyTitle>
                    <EmptyDescription>
                      Payslips will be published here upon disbursement of
                      completed payroll runs.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
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
                          {formatDate(activePayslip.payrollRun.cutoffStartDate)}{" "}
                          – {formatDate(activePayslip.payrollRun.cutoffEndDate)}{" "}
                          · Disbursed:{" "}
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
                          {Number(activePayslip.nonTaxableAllowancesCents) >
                            0 && (
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
                          {Number(activePayslip.tardinessDeductionCents) >
                            0 && (
                            <>
                              <div>Tardiness / Lates:</div>
                              <div className="text-right font-medium text-destructive">
                                -{pesos(activePayslip.tardinessDeductionCents)}
                              </div>
                            </>
                          )}
                          {Number(activePayslip.undertimeDeductionCents) >
                            0 && (
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
                        Note: Payslip PDF is encrypted. Use your Date of Birth
                        in MMDDYYYY format to unlock.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 6. My Loans & Cash Advances */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Landmark className="size-5 text-primary" />
                My Loans & Cash Advances
              </CardTitle>
              <CardDescription>
                Track government loans (SSS, Pag-IBIG) and company cash advances
                with payroll amortization schedules.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {myLoans.isPending ? (
                <p className="text-sm text-muted-foreground">
                  Loading your loans…
                </p>
              ) : myLoans.data && myLoans.data.length > 0 ? (
                <div className="space-y-3">
                  {myLoans.data.map((loan) => {
                    const total = Number(loan.totalAmountCents);
                    const balance = Number(loan.balanceCents);
                    const paid = total - balance;
                    const percent =
                      total > 0
                        ? Math.min(
                            100,
                            Math.max(0, Math.round((paid / total) * 100)),
                          )
                        : 100;
                    const isExpanded = expandedLoanId === loan.id;

                    return (
                      <div
                        key={loan.id}
                        className="rounded-lg border p-4 text-sm space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold text-foreground flex items-center gap-2">
                              {LOAN_TYPE_LABELS[loan.loanType] || loan.loanType}
                              {loan.isActive ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                                  Fully Settled
                                </span>
                              )}
                            </div>
                            {loan.referenceNumber && (
                              <div className="text-xs text-muted-foreground">
                                Ref: {loan.referenceNumber}
                              </div>
                            )}
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">
                              Remaining Balance
                            </div>
                            <div className="font-bold text-base text-foreground">
                              {pesos(loan.balanceCents)}
                            </div>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Paid: {pesos(paid)}</span>
                            <span>
                              Total: {pesos(loan.totalAmountCents)} ({percent}%)
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>

                        {/* Deduction terms & dates */}
                        <div className="grid gap-2 sm:grid-cols-3 text-xs bg-muted/20 p-2.5 rounded-md">
                          <div>
                            <span className="text-muted-foreground block">
                              Amortization / Cutoff
                            </span>
                            <span className="font-medium text-foreground">
                              {pesos(loan.amortizationCents)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">
                              Start Date
                            </span>
                            <span className="font-medium text-foreground">
                              {formatDate(loan.startDate)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">
                              End / Maturity Date
                            </span>
                            <span className="font-medium text-foreground">
                              {loan.endDate
                                ? formatDate(loan.endDate)
                                : "Until fully paid"}
                            </span>
                          </div>
                        </div>

                        {/* Toggle Payment Ledger */}
                        {loan.payments.length > 0 && (
                          <div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2 text-primary"
                              onClick={() =>
                                setExpandedLoanId(isExpanded ? null : loan.id)
                              }
                            >
                              {isExpanded
                                ? "Hide Payment History"
                                : `View Payment History (${loan.payments.length})`}
                            </Button>

                            {isExpanded && (
                              <div className="mt-2 overflow-x-auto rounded-md border text-xs">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="uppercase text-[10px]">
                                      <TableHead className="px-3 py-1.5">
                                        Date
                                      </TableHead>
                                      <TableHead className="px-3 py-1.5">
                                        Source
                                      </TableHead>
                                      <TableHead className="px-3 py-1.5 text-right">
                                        Amount Paid
                                      </TableHead>
                                      <TableHead className="px-3 py-1.5 text-right">
                                        Balance After
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {loan.payments.map((p) => {
                                      const payrollRun = p.payslip?.payrollRun;
                                      return (
                                        <TableRow key={p.id}>
                                          <TableCell className="px-3 py-1.5">
                                            {formatDate(p.paymentDate)}
                                          </TableCell>
                                          <TableCell className="px-3 py-1.5 text-muted-foreground">
                                            {payrollRun
                                              ? `Payroll Cutoff (${formatDate(payrollRun.cutoffStartDate)} – ${formatDate(payrollRun.cutoffEndDate)})`
                                              : "Direct / Manual Payment"}
                                          </TableCell>
                                          <TableCell className="px-3 py-1.5 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                            {pesos(p.amountPaidCents)}
                                          </TableCell>
                                          <TableCell className="px-3 py-1.5 text-right">
                                            {pesos(p.balanceAfterCents)}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty className="py-8 border-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Landmark className="size-6 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>
                      No loans or cash advances are recorded for your account.
                    </EmptyTitle>
                    <EmptyDescription>
                      Approved company loans and statutory advances will appear
                      here.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>

          {/* 7. BIR Form 2316 (Certificate of Compensation Payment / Tax Withheld) */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="size-5 text-primary" />
                    BIR Form 2316 (Annual Tax Certificate)
                  </CardTitle>
                  <CardDescription>
                    Official Certificate of Compensation Payment / Tax Withheld
                    issued by your employer for the BIR.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Tax Year:
                  </span>
                  <Select
                    items={[
                      {
                        value: String(new Date().getFullYear()),
                        label: String(new Date().getFullYear()),
                      },
                      {
                        value: String(new Date().getFullYear() - 1),
                        label: String(new Date().getFullYear() - 1),
                      },
                      {
                        value: String(new Date().getFullYear() - 2),
                        label: String(new Date().getFullYear() - 2),
                      },
                    ]}
                    value={String(taxCertificateYear)}
                    onValueChange={(val) => {
                      if (val) {
                        setTaxCertificateYear(Number(val));
                        setDownloadBirError(null);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[110px] h-9">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={String(new Date().getFullYear())}>
                          {new Date().getFullYear()}
                        </SelectItem>
                        <SelectItem
                          value={String(new Date().getFullYear() - 1)}
                        >
                          {new Date().getFullYear() - 1}
                        </SelectItem>
                        <SelectItem
                          value={String(new Date().getFullYear() - 2)}
                        >
                          {new Date().getFullYear() - 2}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {bir2316Issuance.isPending ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                  <span>Checking annual tax certificate status…</span>
                </div>
              ) : bir2316Issuance.data?.status === "ISSUED" ? (
                <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          Official BIR Form 2316 (Tax Year {taxCertificateYear})
                        </span>
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Issued · v{bir2316Issuance.data.version ?? 1}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Issued on {formatDate(bir2316Issuance.data.issuedAt)} ·
                        Statutory deadline:{" "}
                        {bir2316Issuance.data.statutoryDeadline ??
                          `Jan 31, ${taxCertificateYear + 1}`}
                      </p>
                      {bir2316Issuance.data.hadPriorEmployer ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Note: Multiple employers recorded for this tax year.
                          Substituted filing does not apply.
                        </p>
                      ) : (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          Qualified for Substituted Filing under BIR RR 11-2018
                          (Single Employer).
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      disabled={downloadingBirPdf}
                      onClick={handleDownloadMyBir2316}
                    >
                      {downloadingBirPdf ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Generating PDF…
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 size-4" />
                          Download BIR Form 2316
                        </>
                      )}
                    </Button>
                  </div>
                  {downloadBirError && (
                    <p role="alert" className="text-xs text-destructive">
                      {downloadBirError}
                    </p>
                  )}
                </div>
              ) : (
                <Empty className="py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FileText className="size-6 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>
                      No certificate issued for Tax Year {taxCertificateYear}
                    </EmptyTitle>
                    <EmptyDescription>
                      Your official BIR Form 2316 certificate has not yet been
                      issued by HR for this tax year. Issued certificates will
                      be available for download here once annualization is
                      completed.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
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
      )}

      <div id="mfa" className="pt-2">
        <MfaSettingsCard />
      </div>
    </section>
  );
}
