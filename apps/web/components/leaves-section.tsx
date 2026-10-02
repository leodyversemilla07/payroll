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
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select";
import { type FormEvent, useState } from "react";
import { manilaToday } from "@/lib/attendance-time";
import { leaveSchedule } from "@/lib/leave-schedule";
import { trpc } from "@/lib/trpc";
import { LeaveCancellationForm } from "./leave-cancellation";
import { LeaveCreditTools } from "./leave-credits";

type Outputs = inferRouterOutputs<AppRouter>["leaves"];
type Balance = Outputs["getBalances"][number];
type Leave = Outputs["listRequests"][number];
type EmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
};
type ApiError = { message: string; data?: { code?: string } | null };
function errorText(error: ApiError) {
  if (
    ["NOT_FOUND", "FORBIDDEN", "CONFLICT", "UNPROCESSABLE_CONTENT"].includes(
      error.data?.code ?? "",
    )
  )
    return error.message;
  if (error.data?.code === "BAD_REQUEST")
    return "Leave details were rejected. Check the dates, type, half-day selection and reason.";
  return "Could not complete the leave request. Please retry.";
}
function date(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function LeavesSection({
  employees,
  employeeListFailed,
  canDecide,
  actorEmployeeId,
}: {
  employees: EmployeeOption[];
  employeeListFailed: boolean;
  canDecide: boolean;
  actorEmployeeId?: string;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [yearText, setYearText] = useState(manilaToday().slice(0, 4));
  const [loaded, setLoaded] = useState<{
    employeeId: string;
    year: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const year = Number(yearText);
  function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeeId || !Number.isInteger(year) || year < 1900 || year > 2100) {
      setValidationError("Select an employee and a year from 1900 to 2100.");
      return;
    }
    setValidationError(null);
    setLoaded({ employeeId, year });
    void utils.leaves.getBalances.invalidate();
    void utils.leaves.listRequests.invalidate();
  }
  const selected = employees.find(
    (employee) => employee.id === loaded?.employeeId,
  );
  return (
    <Card role="region" aria-label="Leave management">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Leave management
        </CardTitle>
        <CardDescription>
          Recorded balances, requests and decisions. Reading a balance never
          grants leave credits. Company policy and statutory eligibility still
          require verification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={load}>
          <FieldSet disabled={busy || editorOpen}>
            <FieldLegend>Load employee leave records</FieldLegend>
            <Field>
              <FieldLabel htmlFor="leave-employee">Leave employee</FieldLabel>
              <NativeSelect
                id="leave-employee"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.currentTarget.value)}
                className="w-full"
                required
              >
                <NativeSelectOption value="">
                  Select an employee
                </NativeSelectOption>
                {employees.map((employee) => (
                  <NativeSelectOption key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName} ·{" "}
                    {employee.employeeNumber}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="leave-year">Leave year</FieldLabel>
              <Input
                id="leave-year"
                type="number"
                min={1900}
                max={2100}
                value={yearText}
                onChange={(event) => setYearText(event.currentTarget.value)}
                required
              />
            </Field>
            {employeeListFailed && (
              <FieldDescription>
                Employee choices could not be loaded. Use Retry in the Employees
                section.
              </FieldDescription>
            )}
            {validationError && <FieldError>{validationError}</FieldError>}
            <Button
              type="submit"
              disabled={busy || editorOpen || employeeListFailed}
            >
              Load leave records
            </Button>
          </FieldSet>
        </form>
        {loaded ? (
          <EmployeeLeaves
            key={`${loaded.employeeId}:${loaded.year}`}
            employeeId={loaded.employeeId}
            year={loaded.year}
            name={
              selected
                ? `${selected.firstName} ${selected.lastName}`
                : "Selected employee"
            }
            canDecide={canDecide}
            canApproveOwn={loaded.employeeId !== actorEmployeeId}
            onBusy={setBusy}
            onEditing={setEditorOpen}
          />
        ) : (
          <p>Select an employee and load their leave year.</p>
        )}
      </CardContent>
    </Card>
  );
}

function EmployeeLeaves({
  employeeId,
  year,
  name,
  canDecide,
  canApproveOwn,
  onBusy,
  onEditing,
}: {
  employeeId: string;
  year: number;
  name: string;
  canDecide: boolean;
  canApproveOwn: boolean;
  onBusy: (busy: boolean) => void;
  onEditing: (editing: boolean) => void;
}) {
  const [status, setStatus] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [creditEditing, setCreditEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancellation, setCancellation] = useState<Leave | null>(null);
  const [decision, setDecision] = useState<{
    request: Leave;
    kind: "approve" | "reject";
  } | null>(null);
  const balances = trpc.leaves.getBalances.useQuery(
    { employeeId, year },
    { retry: false },
  );
  const requests = trpc.leaves.listRequests.useQuery(
    {
      employeeId,
      year,
      status:
        status === "ALL"
          ? undefined
          : (status as "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"),
      limit: 100,
    },
    { retry: false },
  );
  function setPending(value: boolean) {
    setBusy(value);
    onBusy(value);
  }
  const utils = trpc.useUtils();
  function invalidate() {
    void utils.leaves.getBalances.invalidate();
    void utils.leaves.listRequests.invalidate();
    void utils.timekeeping.getDTR.invalidate();
  }
  return (
    <div className="space-y-6">
      <p className="break-words">
        {name} · leave year {year}
      </p>
      {notice && <p role="status">{notice}</p>}
      <Card size="sm" role="region" aria-label="Leave balances">
        <CardHeader>
          <CardTitle role="heading" aria-level={3}>
            Recorded leave balances
          </CardTitle>
        </CardHeader>
        <CardContent>
          {balances.isPending ? (
            <p role="status">Loading leave balances…</p>
          ) : balances.data === undefined ? (
            <p role="alert">
              Could not load leave balances.{" "}
              <Button
                type="button"
                variant="outline"
                onClick={() => void balances.refetch()}
              >
                Retry balances
              </Button>
            </p>
          ) : (
            <div className="space-y-3">
              {balances.isError && (
                <p role="alert">
                  Balance refresh failed; previously loaded balances are shown.{" "}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void balances.refetch()}
                  >
                    Retry balances
                  </Button>
                </p>
              )}
              {balances.data.length === 0 ? (
                <p>
                  No leave balances are recorded. Paid approval requires
                  verified credits to be recorded by HR/admin. No entitlements
                  are granted automatically.
                </p>
              ) : (
                <ul className="space-y-3">
                  {balances.data.map((balance) => (
                    <li key={balance.id} className="break-words">
                      <strong>{balance.leaveType}</strong>
                      <p>
                        {balance.balance} available · {balance.usedCredits} used
                        · {balance.totalCredits} credited day(s)
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-sm text-muted-foreground">
                Pending requests do not reserve credits. The server checks the
                current balance when approving paid leave.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <LeaveCreditTools
        employeeId={employeeId}
        year={year}
        balances={balances.data}
        readFailed={balances.isError}
        canManage={canDecide && canApproveOwn}
        disabled={busy || !!decision || !!cancellation || showForm}
        onBusy={setPending}
        onEditing={(editing) => {
          setCreditEditing(editing);
          onEditing(editing);
        }}
        onRecorded={(replayed) =>
          setNotice(
            replayed
              ? "Previously recorded credit change confirmed; no duplicate adjustment was created."
              : "Leave credits recorded. Used credits were not reset.",
          )
        }
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy || !!decision || !!cancellation || creditEditing}
        aria-expanded={showForm}
        aria-controls="leave-request-form"
        onClick={() => {
          setShowForm((value) => !value);
          setNotice(null);
        }}
      >
        {showForm ? "Cancel new leave request" : "New leave request"}
      </Button>
      {showForm && (
        <LeaveRequestForm
          employeeId={employeeId}
          year={year}
          balances={balances.data ?? []}
          onBusy={setPending}
          onFiled={() => {
            setShowForm(false);
            setNotice(
              "Leave request filed as pending. No credits were deducted.",
            );
            invalidate();
          }}
        />
      )}
      <Card size="sm" role="region" aria-label="Leave requests">
        <CardHeader>
          <CardTitle role="heading" aria-level={3}>
            Leave requests
          </CardTitle>
          <CardDescription>
            Up to 100 most recent requests intersecting this year. Review dates,
            pay treatment and source evidence before deciding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="leave-status">Request status</FieldLabel>
            <NativeSelect
              id="leave-status"
              value={status}
              disabled={busy || !!decision || !!cancellation}
              onChange={(event) => setStatus(event.currentTarget.value)}
              className="w-full"
            >
              <NativeSelectOption value="ALL">All statuses</NativeSelectOption>
              {["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map((entry) => (
                <NativeSelectOption key={entry} value={entry}>
                  {entry}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {requests.isPending ? (
            <p role="status">Loading leave requests…</p>
          ) : requests.data === undefined ? (
            <p role="alert">
              Could not load leave requests.{" "}
              <Button
                type="button"
                variant="outline"
                onClick={() => void requests.refetch()}
              >
                Retry requests
              </Button>
            </p>
          ) : (
            <div className="space-y-4">
              {requests.isError && (
                <p role="alert">
                  Request refresh failed; previously loaded records and your
                  draft are still shown.{" "}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void requests.refetch()}
                  >
                    Retry requests
                  </Button>
                </p>
              )}
              {requests.data.length === 0 ? (
                <p>No leave requests match this employee, year and status.</p>
              ) : (
                <ul className="space-y-3">
                  {requests.data.map((request) => (
                    <li key={request.id}>
                      <Card
                        size="sm"
                        role="region"
                        aria-label={`Leave request ${date(request.startDate)} ${request.leaveType}`}
                      >
                        <CardHeader>
                          <CardTitle role="heading" aria-level={4}>
                            {request.leaveType} · {request.status}
                          </CardTitle>
                          <CardDescription>
                            {date(request.startDate)} to {date(request.endDate)}{" "}
                            · {request.daysCount} day(s) ·{" "}
                            {request.isPaid ? "Paid" : "Unpaid"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {request.partialDate && (
                            <p>Half-day date: {date(request.partialDate)}</p>
                          )}
                          <p className="break-words">
                            Reason: {request.reason}
                          </p>
                          {request.rejectionReason && (
                            <p className="break-words">
                              Rejection reason: {request.rejectionReason}
                            </p>
                          )}
                          {request.approvedById && (
                            <p className="break-all text-sm text-muted-foreground">
                              Approved by user: {request.approvedById}
                            </p>
                          )}
                          {request.rejectedById && (
                            <p className="break-all text-sm text-muted-foreground">
                              Rejected by user: {request.rejectedById}
                            </p>
                          )}
                          {request.cancellationReason && (
                            <p className="break-words">
                              Cancellation reason: {request.cancellationReason}
                            </p>
                          )}
                          {request.cancelledById && (
                            <p className="break-all text-sm text-muted-foreground">
                              Cancelled by user: {request.cancelledById} · from{" "}
                              {request.cancelledFromStatus}
                            </p>
                          )}
                          {request.cancelledAt && (
                            <p className="break-words text-sm text-muted-foreground">
                              Recorded cancellation time (UTC):{" "}
                              {new Date(request.cancelledAt).toISOString()}
                            </p>
                          )}
                          {request.refundedDays && (
                            <p>
                              Recorded credit restoration:{" "}
                              {request.refundedDays} day(s)
                            </p>
                          )}
                          {(request.status === "PENDING" ||
                            (request.status === "APPROVED" &&
                              canDecide &&
                              canApproveOwn)) && (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={
                                busy ||
                                !!decision ||
                                !!cancellation ||
                                showForm ||
                                creditEditing
                              }
                              onClick={() => {
                                setCancellation(request);
                                onEditing(true);
                                setNotice(null);
                              }}
                            >
                              {request.status === "PENDING"
                                ? "Withdraw request"
                                : "Reverse approved leave"}
                            </Button>
                          )}
                          {request.status === "PENDING" && canDecide && (
                            <div className="flex flex-wrap gap-3">
                              {canApproveOwn ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={
                                    busy ||
                                    !!decision ||
                                    !!cancellation ||
                                    showForm ||
                                    creditEditing
                                  }
                                  onClick={() => {
                                    setDecision({ request, kind: "approve" });
                                    setNotice(null);
                                  }}
                                >
                                  Review approval
                                </Button>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Your own employee leave request requires
                                  another approver.
                                </p>
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                disabled={
                                  busy ||
                                  !!decision ||
                                  !!cancellation ||
                                  showForm ||
                                  creditEditing
                                }
                                onClick={() => {
                                  setDecision({ request, kind: "reject" });
                                  setNotice(null);
                                }}
                              >
                                Reject request
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
              {!canDecide && (
                <p className="text-sm text-muted-foreground">
                  This staff role can file and read requests, but approval and
                  rejection require an authorized approver.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {cancellation && (
        <LeaveCancellationForm
          key={cancellation.id}
          request={cancellation}
          onBusy={setPending}
          onClose={() => {
            setCancellation(null);
            onEditing(false);
            void utils.leaves.listRequests.invalidate();
            void utils.leaves.getBalances.invalidate();
          }}
          onDone={() => {
            setCancellation(null);
            onEditing(false);
            setNotice(
              "Leave request recorded as CANCELLED. Review attendance before future payroll.",
            );
            invalidate();
          }}
        />
      )}
      {decision && (
        <LeaveDecision
          key={`${decision.request.id}:${decision.kind}`}
          request={decision.request}
          kind={decision.kind}
          onBusy={setPending}
          onCancel={() => setDecision(null)}
          onDone={(status) => {
            setDecision(null);
            setNotice(`Leave request recorded as ${status}.`);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function LeaveRequestForm({
  employeeId,
  year,
  balances,
  onBusy,
  onFiled,
}: {
  employeeId: string;
  year: number;
  balances: Balance[];
  onBusy: (busy: boolean) => void;
  onFiled: () => void;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [partial, setPartial] = useState("");
  const [payTreatment, setPayTreatment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const schedule = leaveSchedule(start, end, halfDay, partial);
  const file = trpc.leaves.request.useMutation({
    onMutate: () => onBusy(true),
    onSettled: () => onBusy(false),
    onSuccess: onFiled,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file.isPending) return;
    const data = new FormData(event.currentTarget);
    const leaveType = String(data.get("leaveType") ?? "").trim();
    const reason = String(data.get("reason") ?? "").trim();
    if (schedule.error) {
      setError(schedule.error);
      return;
    }
    if (
      start.slice(0, 4) !== String(year) ||
      end.slice(0, 4) !== String(year) ||
      !leaveType ||
      !reason ||
      !["PAID", "UNPAID"].includes(payTreatment)
    ) {
      setError(
        "Complete the type, pay treatment and reason using dates in the loaded leave year.",
      );
      return;
    }
    setError(null);
    file.mutate({
      employeeId,
      leaveType,
      startDate: start,
      endDate: end,
      daysCount: schedule.days,
      ...(halfDay ? { partialDate: partial } : {}),
      isPaid: payTreatment === "PAID",
      reason,
    });
  }
  return (
    <Card
      id="leave-request-form"
      size="sm"
      role="region"
      aria-label="File leave request"
    >
      <CardHeader>
        <CardTitle role="heading" aria-level={3}>
          File leave request
        </CardTitle>
        <CardDescription>
          Supports Monday–Friday schedules, whole days or one named half-day per
          range. Cross-year requests must be split. Other shifts/fractions and
          AM/PM pairing require manual review.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <FieldSet disabled={file.isPending}>
              <FieldLegend>Request details</FieldLegend>
              <Field>
                <FieldLabel htmlFor="leave-pay">Pay treatment</FieldLabel>
                <NativeSelect
                  id="leave-pay"
                  value={payTreatment}
                  onChange={(event) =>
                    setPayTreatment(event.currentTarget.value)
                  }
                  className="w-full"
                  required
                >
                  <NativeSelectOption value="">
                    Select paid or unpaid
                  </NativeSelectOption>
                  <NativeSelectOption value="PAID">
                    Paid leave
                  </NativeSelectOption>
                  <NativeSelectOption value="UNPAID">
                    Unpaid leave
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              {payTreatment === "PAID" ? (
                <Field>
                  <FieldLabel htmlFor="leave-type-paid">Leave type</FieldLabel>
                  <NativeSelect
                    id="leave-type-paid"
                    name="leaveType"
                    defaultValue=""
                    className="w-full"
                    required
                  >
                    <NativeSelectOption value="">
                      Select recorded balance type
                    </NativeSelectOption>
                    {balances.map((balance) => (
                      <NativeSelectOption
                        key={balance.id}
                        value={balance.leaveType}
                      >
                        {balance.leaveType} · {balance.balance} available day(s)
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  {balances.length === 0 && (
                    <FieldDescription>
                      No recorded balance types are available. Configure
                      verified credits or choose unpaid leave.
                    </FieldDescription>
                  )}
                </Field>
              ) : payTreatment === "UNPAID" ? (
                <Field>
                  <FieldLabel htmlFor="leave-type-unpaid">
                    Leave type
                  </FieldLabel>
                  <Input
                    id="leave-type-unpaid"
                    name="leaveType"
                    maxLength={50}
                    required
                  />
                </Field>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="leave-start">
                    Leave start date
                  </FieldLabel>
                  <Input
                    id="leave-start"
                    type="date"
                    min={`${year}-01-01`}
                    max={`${year}-12-31`}
                    value={start}
                    onChange={(event) => setStart(event.currentTarget.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="leave-end">Leave end date</FieldLabel>
                  <Input
                    id="leave-end"
                    type="date"
                    min={`${year}-01-01`}
                    max={`${year}-12-31`}
                    value={end}
                    onChange={(event) => setEnd(event.currentTarget.value)}
                    required
                  />
                </Field>
              </div>
              <Field orientation="horizontal">
                <Checkbox
                  id="leave-half"
                  checked={halfDay}
                  onCheckedChange={setHalfDay}
                />
                <FieldLabel htmlFor="leave-half">
                  One half-day within this request
                </FieldLabel>
              </Field>
              {halfDay && (
                <Field>
                  <FieldLabel htmlFor="leave-partial">Half-day date</FieldLabel>
                  <Input
                    id="leave-partial"
                    type="date"
                    min={start || `${year}-01-01`}
                    max={end || `${year}-12-31`}
                    value={partial}
                    onChange={(event) => setPartial(event.currentTarget.value)}
                    required
                  />
                </Field>
              )}
              <p>
                Requested days:{" "}
                {schedule.error ? "Select a valid schedule" : schedule.days}
              </p>
              <Field>
                <FieldLabel htmlFor="leave-reason">Leave reason</FieldLabel>
                <Input
                  id="leave-reason"
                  name="reason"
                  maxLength={2000}
                  required
                />
              </Field>
              <FieldDescription>
                Filing creates a pending request without reserving credits. Paid
                leave affects payroll only after approval and attendance
                reconciliation; unpaid leave does not automatically create
                absence DTRs. Drafts are not stored in the browser.
              </FieldDescription>
            </FieldSet>
            {error && <FieldError>{error}</FieldError>}
            {file.isError && (
              <FieldError>
                {errorText(file.error)} Your entries have been kept.
              </FieldError>
            )}
            <Button type="submit" disabled={file.isPending}>
              {file.isPending ? "Filing leave…" : "File leave request"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function LeaveDecision({
  request,
  kind,
  onBusy,
  onCancel,
  onDone,
}: {
  request: Leave;
  kind: "approve" | "reject";
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
  onDone: (status: string) => void;
}) {
  const approve = trpc.leaves.approve.useMutation({
    onMutate: () => onBusy(true),
    onSettled: () => onBusy(false),
    onSuccess: (saved) => onDone(saved.status),
  });
  const reject = trpc.leaves.reject.useMutation({
    onMutate: () => onBusy(true),
    onSettled: () => onBusy(false),
    onSuccess: (saved) => onDone(saved.status),
  });
  const pending = approve.isPending || reject.isPending;
  const error = approve.error ?? reject.error;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (kind === "approve") approve.mutate({ requestId: request.id });
    else
      reject.mutate({
        requestId: request.id,
        rejectionReason: String(
          new FormData(event.currentTarget).get("rejectionReason") ?? "",
        ).trim(),
      });
  }
  return (
    <Card size="sm" role="region" aria-label="Leave decision">
      <CardHeader>
        <CardTitle role="heading" aria-level={3}>
          {kind === "approve"
            ? "Confirm leave approval"
            : "Reject pending leave"}
        </CardTitle>
        <CardDescription>
          {date(request.startDate)} to {date(request.endDate)} ·{" "}
          {request.daysCount} day(s) · {request.isPaid ? "Paid" : "Unpaid"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <p className="break-words">Request reason: {request.reason}</p>
            {kind === "approve" ? (
              <p>
                {request.isPaid
                  ? "Approval debits the recorded available balance once. Insufficient credits, overlapping approvals or processed payroll block it."
                  : "Unpaid approval does not debit a balance or write attendance."}{" "}
                The decision and audit record commit together.
              </p>
            ) : (
              <Field>
                <FieldLabel htmlFor="leave-reject-reason">
                  Rejection reason
                </FieldLabel>
                <Input
                  id="leave-reject-reason"
                  name="rejectionReason"
                  minLength={10}
                  maxLength={500}
                  disabled={pending}
                  required
                />
                <FieldDescription>
                  Rejecting a pending request does not debit or refund credits.
                  Approved requests cannot be rejected here.
                </FieldDescription>
              </Field>
            )}
            {error && <FieldError>{errorText(error)}</FieldError>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Saving leave decision…"
                  : kind === "approve"
                    ? "Confirm approval"
                    : "Confirm rejection"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onCancel}
              >
                Cancel leave decision
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
