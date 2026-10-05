"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Pencil,
  Play,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { manilaToday } from "@/lib/attendance-time";
import { trpc } from "@/lib/trpc";

type Policy = inferRouterOutputs<AppRouter>["leaves"]["listPolicies"][number];
type AccrualResult = inferRouterOutputs<AppRouter>["leaves"]["runAccrual"];
type CarryoverResult = inferRouterOutputs<AppRouter>["leaves"]["runCarryover"];

const monthsList = [
  { value: 1, label: "January (Month 1)" },
  { value: 2, label: "February (Month 2)" },
  { value: 3, label: "March (Month 3)" },
  { value: 4, label: "April (Month 4)" },
  { value: 5, label: "May (Month 5)" },
  { value: 6, label: "June (Month 6)" },
  { value: 7, label: "July (Month 7)" },
  { value: 8, label: "August (Month 8)" },
  { value: 9, label: "September (Month 9)" },
  { value: 10, label: "October (Month 10)" },
  { value: 11, label: "November (Month 11)" },
  { value: 12, label: "December (Month 12)" },
];

const quartersList = [
  { value: 1, label: "Q1 (Jan – Mar)" },
  { value: 2, label: "Q2 (Apr – Jun)" },
  { value: 3, label: "Q3 (Jul – Sep)" },
  { value: 4, label: "Q4 (Oct – Dec)" },
];

export function LeavePoliciesSection({
  canManage = true,
}: {
  canManage?: boolean;
}) {
  const currentYear = Number(manilaToday().slice(0, 4));
  const currentMonth = Number(manilaToday().slice(5, 7));

  // Active sub-panels: 'LIST' | 'CREATE_POLICY' | 'EDIT_POLICY' | 'ACCRUAL' | 'CARRYOVER'
  const [activePanel, setActivePanel] = useState<
    "LIST" | "CREATE_POLICY" | "EDIT_POLICY" | "ACCRUAL" | "CARRYOVER"
  >("LIST");
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);

  // Status & Notification state
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Policy Form state
  const [policyLeaveType, setPolicyLeaveType] = useState("");
  const [policyAnnualCredits, setPolicyAnnualCredits] = useState("15");
  const [policyAccrualFrequency, setPolicyAccrualFrequency] = useState<
    "MONTHLY" | "QUARTERLY" | "ANNUAL"
  >("MONTHLY");
  const [policyCarryoverPolicy, setPolicyCarryoverPolicy] = useState<
    "NO_CARRYOVER" | "CAPPED" | "UNLIMITED"
  >("NO_CARRYOVER");
  const [policyMaxCarryoverDays, setPolicyMaxCarryoverDays] = useState("5");
  const [policyEligibleMonths, setPolicyEligibleMonths] = useState("6");
  const [policyIsActive, setPolicyIsActive] = useState(true);

  // Accrual Form state
  const [accrualYear, setAccrualYear] = useState(String(currentYear));
  const [accrualFrequency, setAccrualFrequency] = useState<
    "MONTHLY" | "QUARTERLY" | "ANNUAL"
  >("MONTHLY");
  const [accrualPeriod, setAccrualPeriod] = useState(String(currentMonth));
  const [accrualLeaveType, setAccrualLeaveType] = useState("");
  const [accrualResult, setAccrualResult] = useState<AccrualResult | null>(
    null,
  );

  // Carryover Form state
  const [carryoverFromYear, setCarryoverFromYear] = useState(
    String(currentYear - 1),
  );
  const [carryoverLeaveType, setCarryoverLeaveType] = useState("");
  const [carryoverResult, setCarryoverResult] =
    useState<CarryoverResult | null>(null);

  const utils = trpc.useUtils();
  const policiesQuery = trpc.leaves.listPolicies.useQuery(
    { includeInactive: true },
    { retry: false },
  );

  const createPolicyMutation = trpc.leaves.createPolicy.useMutation({
    onSuccess: (created) => {
      void utils.leaves.listPolicies.invalidate();
      setActivePanel("LIST");
      setErrorMessage(null);
      setStatusMessage(
        `Leave policy for "${created.leaveType}" created successfully.`,
      );
    },
    onError: (err) => {
      setErrorMessage(err.message || "Failed to create leave policy.");
    },
  });

  const updatePolicyMutation = trpc.leaves.updatePolicy.useMutation({
    onSuccess: (updated) => {
      void utils.leaves.listPolicies.invalidate();
      setActivePanel("LIST");
      setEditingPolicy(null);
      setErrorMessage(null);
      setStatusMessage(
        `Leave policy for "${updated.leaveType}" updated successfully.`,
      );
    },
    onError: (err) => {
      setErrorMessage(err.message || "Failed to update leave policy.");
    },
  });

  const deletePolicyMutation = trpc.leaves.deletePolicy.useMutation({
    onSuccess: (deleted) => {
      void utils.leaves.listPolicies.invalidate();
      setErrorMessage(null);
      setStatusMessage(`Policy "${deleted.leaveType}" deleted.`);
    },
    onError: (err) => {
      setErrorMessage(`Failed to delete policy: ${err.message}`);
    },
  });

  const runAccrualMutation = trpc.leaves.runAccrual.useMutation({
    onSuccess: (res) => {
      void utils.leaves.getBalances.invalidate();
      void utils.leaves.listCreditChanges.invalidate();
      setAccrualResult(res);
      setErrorMessage(null);
      if (!res.dryRun) {
        setStatusMessage(
          `Accrual executed successfully for ${res.processedCount} employee(s) (+${res.totalCreditsAccrued} total credits).`,
        );
      }
    },
    onError: (err) => {
      setErrorMessage(err.message || "Failed to run accrual.");
    },
  });

  const runCarryoverMutation = trpc.leaves.runCarryover.useMutation({
    onSuccess: (res) => {
      void utils.leaves.getBalances.invalidate();
      void utils.leaves.listCreditChanges.invalidate();
      setCarryoverResult(res);
      setErrorMessage(null);
      if (!res.dryRun) {
        setStatusMessage(
          `Carryover executed successfully for ${res.processedCount} employee(s) (+${res.totalCreditsCarriedOver} carried over).`,
        );
      }
    },
    onError: (err) => {
      setErrorMessage(err.message || "Failed to run carryover.");
    },
  });

  function startCreate() {
    setPolicyLeaveType("");
    setPolicyAnnualCredits("15");
    setPolicyAccrualFrequency("MONTHLY");
    setPolicyCarryoverPolicy("NO_CARRYOVER");
    setPolicyMaxCarryoverDays("5");
    setPolicyEligibleMonths("6");
    setPolicyIsActive(true);
    setErrorMessage(null);
    setActivePanel("CREATE_POLICY");
  }

  function startEdit(policy: Policy) {
    setEditingPolicy(policy);
    setPolicyLeaveType(policy.leaveType);
    setPolicyAnnualCredits(policy.annualCredits);
    setPolicyAccrualFrequency(policy.accrualFrequency);
    setPolicyCarryoverPolicy(policy.carryoverPolicy);
    setPolicyMaxCarryoverDays(policy.maxCarryoverDays ?? "5");
    setPolicyEligibleMonths(String(policy.eligibleAfterMonths));
    setPolicyIsActive(policy.isActive);
    setErrorMessage(null);
    setActivePanel("EDIT_POLICY");
  }

  function handleSavePolicy(e: FormEvent) {
    e.preventDefault();
    const annualNum = Number(policyAnnualCredits);
    const monthsNum = Number(policyEligibleMonths);
    const maxDaysNum =
      policyCarryoverPolicy === "CAPPED"
        ? Number(policyMaxCarryoverDays)
        : undefined;

    if (
      !Number.isFinite(annualNum) ||
      annualNum < 0 ||
      annualNum > 365 ||
      !Number.isInteger(annualNum * 2)
    ) {
      setErrorMessage(
        "Annual credits must be between 0 and 365 in 0.5-day increments.",
      );
      return;
    }

    if (
      policyCarryoverPolicy === "CAPPED" &&
      (!maxDaysNum || maxDaysNum <= 0 || !Number.isInteger(maxDaysNum * 2))
    ) {
      setErrorMessage(
        "Capped carryover requires a valid positive maximum days in 0.5 increments.",
      );
      return;
    }

    if (activePanel === "CREATE_POLICY") {
      if (!policyLeaveType.trim()) {
        setErrorMessage("Leave policy code is required.");
        return;
      }
      createPolicyMutation.mutate({
        leaveType: policyLeaveType.trim().toUpperCase(),
        annualCredits: annualNum,
        accrualFrequency: policyAccrualFrequency,
        carryoverPolicy: policyCarryoverPolicy,
        maxCarryoverDays: maxDaysNum,
        eligibleAfterMonths: monthsNum,
        isActive: policyIsActive,
      });
    } else if (editingPolicy) {
      updatePolicyMutation.mutate({
        id: editingPolicy.id,
        annualCredits: annualNum,
        accrualFrequency: policyAccrualFrequency,
        carryoverPolicy: policyCarryoverPolicy,
        maxCarryoverDays: maxDaysNum,
        eligibleAfterMonths: monthsNum,
        isActive: policyIsActive,
      });
    }
  }

  function handleDeletePolicy(policy: Policy) {
    if (
      window.confirm(
        `Are you sure you want to delete leave policy "${policy.leaveType}"?`,
      )
    ) {
      deletePolicyMutation.mutate({ id: policy.id });
    }
  }

  function handleRunAccrual(dryRun: boolean) {
    const yr = Number(accrualYear);
    const prd =
      accrualFrequency === "ANNUAL" ? 1 : Number(accrualPeriod || "1");
    if (!Number.isInteger(yr) || yr < 1900 || yr > 2100) {
      setErrorMessage("Enter a valid year between 1900 and 2100.");
      return;
    }
    runAccrualMutation.mutate({
      year: yr,
      frequency: accrualFrequency,
      period: prd,
      leaveType: accrualLeaveType.trim() ? accrualLeaveType.trim() : undefined,
      dryRun,
    });
  }

  function handleRunCarryover(dryRun: boolean) {
    const fromYr = Number(carryoverFromYear);
    if (!Number.isInteger(fromYr) || fromYr < 1900 || fromYr > 2100) {
      setErrorMessage("Enter a valid from-year between 1900 and 2100.");
      return;
    }
    runCarryoverMutation.mutate({
      fromYear: fromYr,
      toYear: fromYr + 1,
      leaveType: carryoverLeaveType.trim()
        ? carryoverLeaveType.trim()
        : undefined,
      dryRun,
    });
  }

  const policies = policiesQuery.data ?? [];

  return (
    <Card role="region" aria-label="Leave policies and accrual">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div>
          <CardTitle
            role="heading"
            aria-level={2}
            className="flex items-center gap-2"
          >
            <Clock className="size-5 text-primary" />
            Leave Policies & Automatic Accrual
          </CardTitle>
          <CardDescription>
            Configure leave entitlements, automated monthly/annual accruals, and
            year-end carryover rules.
          </CardDescription>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {activePanel !== "LIST" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setActivePanel("LIST");
                  setErrorMessage(null);
                }}
              >
                Back to Policies
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setErrorMessage(null);
                    setAccrualResult(null);
                    setActivePanel("ACCRUAL");
                  }}
                >
                  <Sparkles className="mr-1.5 size-4 text-amber-500" />
                  Run Accrual
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setErrorMessage(null);
                    setCarryoverResult(null);
                    setActivePanel("CARRYOVER");
                  }}
                >
                  <Repeat className="mr-1.5 size-4 text-blue-500" />
                  Year-End Carryover
                </Button>
                <Button type="button" size="sm" onClick={startCreate}>
                  <Plus className="mr-1.5 size-4" />
                  New Policy
                </Button>
              </>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status and Error banners */}
        {statusMessage && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-200"
          >
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span>{statusMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 1. CREATE OR EDIT POLICY FORM */}
        {(activePanel === "CREATE_POLICY" || activePanel === "EDIT_POLICY") && (
          <form
            onSubmit={handleSavePolicy}
            className="rounded-lg border bg-muted/20 p-4 space-y-4"
            aria-label={
              activePanel === "CREATE_POLICY"
                ? "Create leave policy"
                : "Edit leave policy"
            }
          >
            <h3 className="text-sm font-semibold">
              {activePanel === "CREATE_POLICY"
                ? "Create New Leave Policy"
                : `Edit Leave Policy: ${editingPolicy?.leaveType}`}
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              {activePanel === "CREATE_POLICY" ? (
                <Field>
                  <FieldLabel htmlFor="policy-leave-type">
                    Leave Policy Code
                  </FieldLabel>
                  <Input
                    id="policy-leave-type"
                    placeholder="e.g. VACATION, SICK, SIL"
                    value={policyLeaveType}
                    onChange={(e) => setPolicyLeaveType(e.target.value)}
                    required
                  />
                  <FieldDescription>
                    Uppercase policy identifier (e.g. VACATION, SICK, SIL,
                    EMERGENCY).
                  </FieldDescription>
                </Field>
              ) : (
                <Field>
                  <FieldLabel>Leave Policy Code</FieldLabel>
                  <Input value={editingPolicy?.leaveType} disabled />
                  <FieldDescription>
                    Policy code cannot be changed once created.
                  </FieldDescription>
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="policy-annual-credits">
                  Annual Credits (Days / Year)
                </FieldLabel>
                <Input
                  id="policy-annual-credits"
                  type="number"
                  step="0.5"
                  min="0"
                  max="365"
                  value={policyAnnualCredits}
                  onChange={(e) => setPolicyAnnualCredits(e.target.value)}
                  required
                />
                <FieldDescription>
                  Total statutory or company leave days per calendar year.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="policy-accrual-frequency">
                  Accrual Frequency
                </FieldLabel>
                <Select
                  value={policyAccrualFrequency}
                  onValueChange={(val) => {
                    if (val)
                      setPolicyAccrualFrequency(
                        val as "MONTHLY" | "QUARTERLY" | "ANNUAL",
                      );
                  }}
                >
                  <SelectTrigger id="policy-accrual-frequency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">
                      Monthly (Annual credits / 12 per month)
                    </SelectItem>
                    <SelectItem value="QUARTERLY">
                      Quarterly (Annual credits / 4 per quarter)
                    </SelectItem>
                    <SelectItem value="ANNUAL">
                      Annual (Full allocation once per year)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="policy-carryover-policy">
                  Year-End Carryover Policy
                </FieldLabel>
                <Select
                  value={policyCarryoverPolicy}
                  onValueChange={(val) => {
                    if (val)
                      setPolicyCarryoverPolicy(
                        val as "NO_CARRYOVER" | "CAPPED" | "UNLIMITED",
                      );
                  }}
                >
                  <SelectTrigger id="policy-carryover-policy" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NO_CARRYOVER">
                      No Carryover (Unused credits expire Dec 31)
                    </SelectItem>
                    <SelectItem value="CAPPED">
                      Capped (Roll over up to maximum days)
                    </SelectItem>
                    <SelectItem value="UNLIMITED">
                      Unlimited (Roll over all remaining balance)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {policyCarryoverPolicy === "CAPPED" && (
                <Field>
                  <FieldLabel htmlFor="policy-max-carryover">
                    Maximum Carryover Days
                  </FieldLabel>
                  <Input
                    id="policy-max-carryover"
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="365"
                    value={policyMaxCarryoverDays}
                    onChange={(e) => setPolicyMaxCarryoverDays(e.target.value)}
                    required
                  />
                  <FieldDescription>
                    Maximum unused credits allowed to carry forward into the
                    next year.
                  </FieldDescription>
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="policy-eligible-months">
                  Eligible After Tenure (Months)
                </FieldLabel>
                <Input
                  id="policy-eligible-months"
                  type="number"
                  min="0"
                  max="120"
                  value={policyEligibleMonths}
                  onChange={(e) => setPolicyEligibleMonths(e.target.value)}
                  required
                />
                <FieldDescription>
                  Minimum completed months of service before accruals start
                  (e.g. 6 for regular, 12 for SIL).
                </FieldDescription>
              </Field>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Checkbox
                id="policy-is-active"
                checked={policyIsActive}
                onCheckedChange={(checked) => setPolicyIsActive(!!checked)}
              />
              <FieldLabel
                htmlFor="policy-is-active"
                className="cursor-pointer text-sm font-normal"
              >
                Policy is Active and available for accruals
              </FieldLabel>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setActivePanel("LIST");
                  setErrorMessage(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createPolicyMutation.isPending ||
                  updatePolicyMutation.isPending
                }
              >
                {activePanel === "CREATE_POLICY"
                  ? "Save Policy"
                  : "Save Changes"}
              </Button>
            </div>
          </form>
        )}

        {/* 2. RUN ACCRUAL PANEL */}
        {activePanel === "ACCRUAL" && (
          <section
            className="rounded-lg border bg-muted/20 p-4 space-y-4"
            aria-label="Run leave accrual"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="size-4 text-amber-500" />
                  Run Automatic Leave Accrual
                </h3>
                <p className="text-xs text-muted-foreground">
                  Calculate and allocate credits for active employees based on
                  service tenure and configured frequencies.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="accrual-year">Accrual Year</FieldLabel>
                <Input
                  id="accrual-year"
                  type="number"
                  value={accrualYear}
                  onChange={(e) => setAccrualYear(e.target.value)}
                  min="1900"
                  max="2100"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="accrual-frequency">Frequency</FieldLabel>
                <Select
                  value={accrualFrequency}
                  onValueChange={(val) => {
                    if (val) {
                      setAccrualFrequency(
                        val as "MONTHLY" | "QUARTERLY" | "ANNUAL",
                      );
                      setAccrualPeriod("1");
                    }
                  }}
                >
                  <SelectTrigger id="accrual-frequency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                    <SelectItem value="ANNUAL">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {accrualFrequency === "MONTHLY" && (
                <Field>
                  <FieldLabel htmlFor="accrual-period">Target Month</FieldLabel>
                  <Select
                    value={accrualPeriod}
                    onValueChange={(val) => {
                      if (val) setAccrualPeriod(val);
                    }}
                  >
                    <SelectTrigger id="accrual-period" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthsList.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              {accrualFrequency === "QUARTERLY" && (
                <Field>
                  <FieldLabel htmlFor="accrual-period">
                    Target Quarter
                  </FieldLabel>
                  <Select
                    value={accrualPeriod}
                    onValueChange={(val) => {
                      if (val) setAccrualPeriod(val);
                    }}
                  >
                    <SelectTrigger id="accrual-period" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {quartersList.map((q) => (
                        <SelectItem key={q.value} value={q.value}>
                          {q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="accrual-leave-type">
                  Filter Leave Type (Optional)
                </FieldLabel>
                <Select
                  value={accrualLeaveType || "ALL"}
                  onValueChange={(val) => setAccrualLeaveType(val === "ALL" ? "" : (val ?? ""))}
                >
                  <SelectTrigger id="accrual-leave-type" className="w-full">
                    <SelectValue placeholder="All Active Policies" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Active Policies</SelectItem>
                    {policies
                      .filter((p) => p.isActive)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.leaveType}>
                          {p.leaveType}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={runAccrualMutation.isPending}
                onClick={() => handleRunAccrual(true)}
              >
                <Eye className="mr-1.5 size-4" />
                Preview Accrual
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={runAccrualMutation.isPending}
                onClick={() => handleRunAccrual(false)}
              >
                <Play className="mr-1.5 size-4 fill-current" />
                Execute Accrual
              </Button>
            </div>

            {/* Accrual Preview / Results */}
            {accrualResult && (
              <section
                className="mt-4 space-y-3 rounded-lg border bg-background p-3"
                aria-label="Accrual results"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div className="text-xs font-semibold">
                    {accrualResult.dryRun
                      ? "Preview Results"
                      : "Execution Results"}
                    : {accrualResult.year}{" "}
                    {accrualResult.frequency === "MONTHLY"
                      ? `Month ${accrualResult.period}`
                      : accrualResult.frequency === "QUARTERLY"
                        ? `Q${accrualResult.period}`
                        : "Annual"}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>
                      Eligible:{" "}
                      <strong className="text-foreground">
                        {accrualResult.eligibleCount}
                      </strong>{" "}
                      / {accrualResult.totalEmployees}
                    </span>
                    <span>
                      Accrued:{" "}
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {accrualResult.processedCount}
                      </strong>
                    </span>
                    <span>
                      Total Added:{" "}
                      <strong className="text-foreground">
                        +{accrualResult.totalCreditsAccrued} days
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="p-2">Employee</th>
                        <th className="p-2">Type</th>
                        <th className="p-2">Tenure</th>
                        <th className="p-2">Credit</th>
                        <th className="p-2">Balance</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {accrualResult.items.map((item) => (
                        <tr
                          key={`${item.employeeId}-${item.leaveType}`}
                          className="hover:bg-muted/30"
                        >
                          <td className="p-2 font-medium">
                            {item.employeeName} ({item.employeeNumber})
                          </td>
                          <td className="p-2">{item.leaveType}</td>
                          <td className="p-2">{item.tenureMonths} mos</td>
                          <td className="p-2 font-semibold text-emerald-600 dark:text-emerald-400">
                            +{item.creditsToAccrue}
                          </td>
                          <td className="p-2">
                            {item.previousBalance} → {item.newBalance}
                          </td>
                          <td className="p-2">
                            <span
                              className={`rounded-full px-2 py-0.5 font-medium ${
                                item.status === "ACCRUED"
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : item.status === "ALREADY_ACCRUED"
                                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {item.status.replaceAll("_", " ")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </section>
        )}

        {/* 3. RUN CARRYOVER PANEL */}
        {activePanel === "CARRYOVER" && (
          <section
            className="rounded-lg border bg-muted/20 p-4 space-y-4"
            aria-label="Run leave carryover"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Repeat className="size-4 text-blue-500" />
                  Run Year-End Leave Carryover
                </h3>
                <p className="text-xs text-muted-foreground">
                  Roll over unused leave credits from the previous calendar year
                  into the new year according to capped or unlimited policies.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="carryover-from-year">From Year</FieldLabel>
                <Input
                  id="carryover-from-year"
                  type="number"
                  value={carryoverFromYear}
                  onChange={(e) => setCarryoverFromYear(e.target.value)}
                  min="1900"
                  max="2100"
                />
                <FieldDescription>
                  Unused balances from {carryoverFromYear} will carry over into{" "}
                  {Number(carryoverFromYear) + 1}.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Target Year</FieldLabel>
                <Input value={Number(carryoverFromYear) + 1} disabled />
              </Field>

              <Field>
                <FieldLabel htmlFor="carryover-leave-type">
                  Filter Leave Type (Optional)
                </FieldLabel>
                <Select
                  value={carryoverLeaveType || "ALL"}
                  onValueChange={(val) => setCarryoverLeaveType(val === "ALL" ? "" : (val ?? ""))}
                >
                  <SelectTrigger id="carryover-leave-type" className="w-full">
                    <SelectValue placeholder="All Carryover Policies" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Carryover Policies</SelectItem>
                    {policies
                      .filter((p) => p.carryoverPolicy !== "NO_CARRYOVER")
                      .map((p) => (
                        <SelectItem key={p.id} value={p.leaveType}>
                          {p.leaveType} ({p.carryoverPolicy})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={runCarryoverMutation.isPending}
                onClick={() => handleRunCarryover(true)}
              >
                <Eye className="mr-1.5 size-4" />
                Preview Carryover
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={runCarryoverMutation.isPending}
                onClick={() => handleRunCarryover(false)}
              >
                <Play className="mr-1.5 size-4 fill-current" />
                Execute Carryover
              </Button>
            </div>

            {/* Carryover Preview / Results */}
            {carryoverResult && (
              <section
                className="mt-4 space-y-3 rounded-lg border bg-background p-3"
                aria-label="Carryover results"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div className="text-xs font-semibold">
                    {carryoverResult.dryRun
                      ? "Preview Results"
                      : "Execution Results"}
                    : {carryoverResult.fromYear} → {carryoverResult.toYear}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>
                      Evaluated:{" "}
                      <strong className="text-foreground">
                        {carryoverResult.totalEvaluated}
                      </strong>
                    </span>
                    <span>
                      Carried Over:{" "}
                      <strong className="text-blue-600 dark:text-blue-400">
                        {carryoverResult.processedCount}
                      </strong>
                    </span>
                    <span>
                      Total Days:{" "}
                      <strong className="text-foreground">
                        +{carryoverResult.totalCreditsCarriedOver} days
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="p-2">Employee</th>
                        <th className="p-2">Type</th>
                        <th className="p-2">Prior Unused</th>
                        <th className="p-2">Carried Over</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {carryoverResult.items.map((item) => (
                        <tr
                          key={`${item.employeeId}-${item.leaveType}`}
                          className="hover:bg-muted/30"
                        >
                          <td className="p-2 font-medium">
                            {item.employeeName} ({item.employeeNumber})
                          </td>
                          <td className="p-2">{item.leaveType}</td>
                          <td className="p-2">
                            {item.unusedFromPriorYear} days
                          </td>
                          <td className="p-2 font-semibold text-blue-600 dark:text-blue-400">
                            +{item.carriedOver} days
                          </td>
                          <td className="p-2">
                            <span
                              className={`rounded-full px-2 py-0.5 font-medium ${
                                item.status === "CARRIED_OVER"
                                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                  : item.status === "ALREADY_PROCESSED"
                                    ? "bg-purple-500/10 text-purple-700 dark:text-purple-300"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {item.status.replaceAll("_", " ")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </section>
        )}

        {/* 4. POLICIES LIST TABLE */}
        {policiesQuery.isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Loading leave policies...
          </div>
        ) : policies.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center space-y-3">
            <Clock className="mx-auto size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No leave policies configured.</p>
            <p className="text-xs text-muted-foreground">
              Define company policies like Vacation Leave, Sick Leave, or
              statutory Service Incentive Leave (SIL) to enable automated
              accruals and carryovers.
            </p>
            {canManage && (
              <Button type="button" size="sm" onClick={startCreate}>
                <Plus className="mr-1.5 size-4" />
                Create First Policy
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                  <th className="p-3">Policy Code</th>
                  <th className="p-3">Annual Credits</th>
                  <th className="p-3">Frequency</th>
                  <th className="p-3">Carryover</th>
                  <th className="p-3">Min. Tenure</th>
                  <th className="p-3">Status</th>
                  {canManage && <th className="p-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {policies.map((policy) => (
                  <tr key={policy.id} className="hover:bg-muted/30">
                    <td className="p-3 font-semibold">{policy.leaveType}</td>
                    <td className="p-3 font-medium">
                      {policy.annualCredits} days
                    </td>
                    <td className="p-3">
                      <span className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                        {policy.accrualFrequency}
                      </span>
                    </td>
                    <td className="p-3 text-xs">
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
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {policy.eligibleAfterMonths} mos
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          policy.isActive
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {policy.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {canManage && (
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Edit ${policy.leaveType}`}
                            onClick={() => startEdit(policy)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete ${policy.leaveType}`}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDeletePolicy(policy)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
