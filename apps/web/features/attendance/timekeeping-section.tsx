"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import { Badge } from "@workspace/ui/components/badge";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { Clock, Loader2 } from "lucide-react";
import { type FormEvent, Fragment, useEffect, useState } from "react";
import {
  cutoffPresets,
  DateRangePicker,
  monthPresets,
} from "@/components/date-range-picker";
import { PageHeaderAction } from "@/components/page-header-action";
import {
  fromManilaInput,
  manilaToday,
  toManilaInput,
} from "@/lib/attendance-time";
import { trpc } from "@/lib/trpc";
import { BiometricImportPanel } from "./biometric-import-panel";

type DTRRecord = inferRouterOutputs<AppRouter>["timekeeping"]["getDTR"][number];
type EmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
};
type Range = { employeeId: string; startDate: string; endDate: string };
const dayTypes = [
  "REGULAR_WORKDAY",
  "REST_DAY",
  "SPECIAL_NON_WORKING_HOLIDAY",
  "SPECIAL_WORKING_HOLIDAY",
  "REGULAR_HOLIDAY",
] as const;
const minuteFields = [
  {
    name: "actualWorkedMinutes",
    label: "Total worked minutes (including overtime)",
  },
  { name: "tardinessMinutes", label: "Tardiness minutes" },
  { name: "undertimeMinutes", label: "Undertime minutes" },
  { name: "overtimeMinutes", label: "Overtime minutes" },
  { name: "nightDiffMinutes", label: "Night differential minutes" },
] as const;

function date(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}
function punchTime(value: Date | string | null) {
  return value
    ? new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "Not recorded";
}

function formatMediumDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(new Date(value));
}

function hasMissingPunch(record: DTRRecord) {
  return (record.timeIn == null) !== (record.timeOut == null);
}

function attentionRecord(record: DTRRecord) {
  return (
    !record.isApproved || hasMissingPunch(record) || needsManualReview(record)
  );
}

function dayTypeBadgeVariant(
  dayType: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (dayType === "DOUBLE_HOLIDAY") return "destructive";
  if (dayType.includes("HOLIDAY")) return "default";
  if (dayType === "REST_DAY") return "secondary";
  return "outline";
}

function needsManualReview(record: DTRRecord) {
  return (
    record.dayType === "DOUBLE_HOLIDAY" ||
    !!(
      record.restDayOTMinutes ||
      record.specialHolidayMinutes ||
      record.regularHolidayMinutes
    )
  );
}

export function TimekeepingSection({
  employees,
  employeeListFailed,
  canImport = false,
  initialEmployeeId,
}: {
  employees: EmployeeOption[];
  employeeListFailed: boolean;
  canImport?: boolean;
  initialEmployeeId?: string;
}) {
  const today = manilaToday();
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? "");
  const [startDate, setStartDate] = useState(`${today.slice(0, 8)}01`);
  const [endDate, setEndDate] = useState(today);
  const [range, setRange] = useState<Range | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  // A deep-linked employee id that never appears in the loaded staff list
  // (foreign, deleted, or hand-typed) falls back to a blank picker instead
  // of a stuck selection. Manual picks always match the list, so they are
  // never cleared here.
  useEffect(() => {
    if (
      employeeId &&
      employees.length > 0 &&
      !employees.some((employee) => employee.id === employeeId)
    ) {
      setEmployeeId("");
    }
  }, [employeeId, employees]);
  const [editing, setEditing] = useState<{ record: DTRRecord | null } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [savedDate, setSavedDate] = useState<string | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const dtr = trpc.timekeeping.getDTR.useQuery(
    range ?? { employeeId: "", startDate: "", endDate: "" },
    { enabled: !!range, retry: false },
  );
  const loadedEmployee = employees.find(
    (employee) => employee.id === range?.employeeId,
  );
  const visibleRecords = reviewOnly
    ? (dtr.data ?? []).filter(attentionRecord)
    : (dtr.data ?? []);

  function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const difference = Date.parse(endDate) - Date.parse(startDate);
    if (
      !employeeId ||
      !Number.isFinite(difference) ||
      difference < 0 ||
      difference > 365 * 86_400_000
    ) {
      setFilterError(
        "Select an employee and an ordered date range of at most 366 calendar days.",
      );
      return;
    }
    setFilterError(null);
    setEditing(null);
    setReviewOnly(false);
    setSavedDate(null);
    const next = { employeeId, startDate, endDate };
    if (
      range?.employeeId === employeeId &&
      range.startDate === startDate &&
      range.endDate === endDate
    )
      void dtr.refetch();
    else setRange(next);
  }

  return (
    <>
      {canImport && (
        <PageHeaderAction>
          <Button
            type="button"
            variant="outline"
            aria-expanded={showImport}
            aria-controls="biometric-import-panel"
            disabled={saving}
            onClick={() => {
              setShowImport((value) => !value);
              setImportNotice(null);
            }}
          >
            {showImport ? "Close biometric import" : "Import biometrics"}
          </Button>
        </PageHeaderAction>
      )}
      <Card role="region" aria-label="Attendance and DTR">
        <CardContent className="space-y-6">
          {importNotice && (
            <p
              role="status"
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"
            >
              {importNotice}
            </p>
          )}
          {showImport && (
            <div id="biometric-import-panel">
              <BiometricImportPanel
                onSuccess={(notice) => {
                  setImportNotice(notice);
                  if (range) void dtr.refetch();
                }}
                onClose={() => setShowImport(false)}
              />
            </div>
          )}
          <form onSubmit={load}>
            <FieldSet disabled={saving}>
              <FieldLegend>Load employee DTR</FieldLegend>
              <Field>
                <FieldLabel htmlFor="dtr-employee">DTR employee</FieldLabel>
                <Select
                  items={employees.map((employee) => ({
                    value: employee.id,
                    label: `${employee.firstName} ${employee.lastName} · ${employee.employeeNumber}`,
                  }))}
                  value={employeeId}
                  onValueChange={(val) => setEmployeeId(val ?? "")}
                  required
                >
                  <SelectTrigger id="dtr-employee" className="w-full">
                    <SelectValue placeholder="Select an employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.firstName} {employee.lastName} ·{" "}
                          {employee.employeeNumber}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {employeeListFailed && (
                  <FieldDescription>
                    Employee choices could not be loaded. Use Retry in the
                    Employees section.
                  </FieldDescription>
                )}
              </Field>
              <DateRangePicker
                fromId="dtr-start"
                toId="dtr-end"
                fromLabel="DTR start date"
                toLabel="DTR end date"
                value={{ from: startDate, to: endDate }}
                onChange={(next) => {
                  setStartDate(next.from);
                  setEndDate(next.to);
                }}
                presets={[...cutoffPresets(today), ...monthPresets(today)]}
              />
              {filterError && <FieldError>{filterError}</FieldError>}
              <Button type="submit" disabled={saving || employeeListFailed}>
                Load DTR
              </Button>
            </FieldSet>
          </form>
          {savedDate && (
            <p role="status">
              Attendance for {savedDate} saved with a correction audit record.
            </p>
          )}
          {!range ? (
            <p>Select an employee and load a date range.</p>
          ) : dtr.isPending ? (
            <div role="status" className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                <span>Loading DTR records…</span>
              </div>
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex justify-between border-b pb-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex justify-between py-2 border-b last:border-0"
                  >
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3.5 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ) : dtr.data === undefined ? (
            <p role="alert">
              {dtr.error.data?.code === "NOT_FOUND"
                ? "Employee not found in this organization."
                : "Could not load DTR records."}{" "}
              <Button
                type="button"
                variant="outline"
                onClick={() => void dtr.refetch()}
              >
                Retry
              </Button>
            </p>
          ) : (
            <div className="space-y-4">
              {dtr.isError && (
                <p role="alert">
                  The DTR refresh failed. Previously loaded records and your
                  draft are still shown.{" "}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void dtr.refetch()}
                  >
                    Retry refresh
                  </Button>
                </p>
              )}
              <p className="break-words">
                {loadedEmployee
                  ? `${loadedEmployee.firstName} ${loadedEmployee.lastName}`
                  : "Selected employee"}{" "}
                · {range.startDate} to {range.endDate} · {dtr.data.length}{" "}
                recorded day(s)
              </p>
              <p className="text-sm text-muted-foreground">
                Corrections require a reason and cannot change a date covered by
                a non-cancelled regular payroll run. Existing payslips are never
                recalculated here.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={saving || !!editing}
                onClick={() => {
                  setEditing({ record: null });
                  setSavedDate(null);
                }}
              >
                Add attendance record
              </Button>
              {dtr.data.length === 0 ? (
                <Empty className="my-6 rounded-2xl border border-dashed border-border/80 p-12">
                  <EmptyMedia variant="icon">
                    <Clock className="size-5 text-muted-foreground" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>No DTR records</EmptyTitle>
                    <EmptyDescription>
                      No DTR records for the selected range. Missing dates still
                      require reconciliation.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="space-y-4">
                  <section
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                    aria-label="Attendance summary"
                  >
                    <Card className="space-y-1 p-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        Days logged
                      </p>
                      <p className="text-2xl font-bold">{dtr.data.length}</p>
                    </Card>
                    <Card className="space-y-1 p-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        Pending review
                      </p>
                      <p className="text-2xl font-bold">
                        {dtr.data.filter((record) => !record.isApproved).length}
                      </p>
                    </Card>
                    <Card className="space-y-1 p-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        Missing punches
                      </p>
                      <p className="text-2xl font-bold">
                        {dtr.data.filter(hasMissingPunch).length}
                      </p>
                    </Card>
                    <Card className="space-y-1 p-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        Overtime minutes
                      </p>
                      <p className="text-2xl font-bold">
                        {dtr.data.reduce(
                          (total, record) => total + record.overtimeMinutes,
                          0,
                        )}
                      </p>
                    </Card>
                  </section>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={reviewOnly ? "outline" : "default"}
                      aria-pressed={!reviewOnly}
                      onClick={() => setReviewOnly(false)}
                    >
                      All ({dtr.data.length})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={reviewOnly ? "default" : "outline"}
                      aria-pressed={reviewOnly}
                      onClick={() => setReviewOnly(true)}
                    >
                      Needs review ({dtr.data.filter(attentionRecord).length})
                    </Button>
                  </div>
                  {visibleRecords.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No records need review.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <Table aria-label="Daily time records">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Time in</TableHead>
                            <TableHead>Time out</TableHead>
                            <TableHead className="text-right">Worked</TableHead>
                            <TableHead className="text-right">Late</TableHead>
                            <TableHead className="text-right">OT</TableHead>
                            <TableHead>Day type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleRecords.map((record) => (
                            <Fragment key={record.id}>
                              <TableRow>
                                <TableCell className="font-medium whitespace-nowrap">
                                  {formatMediumDate(record.date)}
                                  <span className="sr-only">
                                    {date(record.date)}
                                  </span>
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {punchTime(record.timeIn)}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {punchTime(record.timeOut)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {record.actualWorkedMinutes}
                                </TableCell>
                                <TableCell className="text-right">
                                  {record.tardinessMinutes}
                                </TableCell>
                                <TableCell className="text-right">
                                  {record.overtimeMinutes}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={dayTypeBadgeVariant(
                                      record.dayType,
                                    )}
                                  >
                                    {record.dayType.replaceAll("_", " ")}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <span className="flex items-center gap-1.5">
                                    {attentionRecord(record) && (
                                      <span
                                        aria-hidden="true"
                                        className="size-2 shrink-0 rounded-full bg-amber-500"
                                      />
                                    )}
                                    <Badge
                                      variant={
                                        record.isApproved
                                          ? "default"
                                          : "secondary"
                                      }
                                    >
                                      {record.isApproved
                                        ? "Approved"
                                        : "Pending review"}
                                    </Badge>
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  {needsManualReview(record) ? (
                                    <span className="text-xs text-muted-foreground">
                                      Manual review
                                    </span>
                                  ) : (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={saving}
                                      onClick={() => {
                                        setEditing((current) =>
                                          current?.record?.id === record.id
                                            ? null
                                            : { record },
                                        );
                                        setSavedDate(null);
                                      }}
                                      aria-label={`Correct attendance on ${date(record.date)}`}
                                    >
                                      Correct
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                              {editing?.record?.id === record.id && (
                                <TableRow key={`${record.id}-editor`}>
                                  <TableCell colSpan={9}>
                                    <AttendanceEditor
                                      key={`${range.employeeId}:${editing.record?.id ?? "new"}`}
                                      range={range}
                                      record={editing.record}
                                      onBusyChange={setSaving}
                                      onCancel={() => setEditing(null)}
                                      onReload={() => {
                                        setEditing(null);
                                        void dtr.refetch();
                                      }}
                                      onSaved={(recordDate) => {
                                        setEditing(null);
                                        setSavedDate(recordDate);
                                      }}
                                    />
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {visibleRecords.some(needsManualReview) && (
                    <p className="text-sm text-muted-foreground">
                      Double holidays and legacy premium breakdowns require
                      manual reconciliation; this form cannot replace them.
                    </p>
                  )}
                </div>
              )}
              {editing && !editing.record && (
                <AttendanceEditor
                  key={`${range.employeeId}:new`}
                  range={range}
                  record={editing.record}
                  onBusyChange={setSaving}
                  onCancel={() => setEditing(null)}
                  onReload={() => {
                    setEditing(null);
                    void dtr.refetch();
                  }}
                  onSaved={(recordDate) => {
                    setEditing(null);
                    setSavedDate(recordDate);
                  }}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function AttendanceEditor({
  range,
  record,
  onBusyChange,
  onCancel,
  onReload,
  onSaved,
}: {
  range: Range;
  record: DTRRecord | null;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
  onReload: () => void;
  onSaved: (date: string) => void;
}) {
  // Refetches must not silently replace a draft's base version or field values.
  const [original] = useState(record);
  const [absent, setAbsent] = useState(original?.isAbsent ?? false);
  const [approved, setApproved] = useState(original?.isApproved ?? false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const correct = trpc.timekeeping.adjustAttendance.useMutation({
    onMutate: () => onBusyChange(true),
    onSettled: () => onBusyChange(false),
    onSuccess: (saved) => {
      void utils.timekeeping.getDTR.invalidate();
      void utils.timekeeping.listRecent.invalidate();
      onSaved(date(saved.date));
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (correct.isPending) return;
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const totals = Object.fromEntries(
      minuteFields.map((field) => [field.name, Number(text(field.name))]),
    ) as Record<(typeof minuteFields)[number]["name"], number>;
    if (
      minuteFields.some(
        (field) =>
          !text(field.name) ||
          !Number.isInteger(totals[field.name]) ||
          totals[field.name] < 0 ||
          totals[field.name] > 1440,
      )
    ) {
      setValidationError(
        "Enter whole-minute totals from 0 to 1440; total worked minutes includes overtime.",
      );
      return;
    }
    if (
      totals.overtimeMinutes > totals.actualWorkedMinutes ||
      totals.nightDiffMinutes > totals.actualWorkedMinutes
    ) {
      setValidationError(
        "Overtime and night differential cannot exceed total worked minutes.",
      );
      return;
    }
    let timeIn: string | null;
    let timeOut: string | null;
    try {
      timeIn = fromManilaInput(text("timeIn"));
      timeOut = fromManilaInput(text("timeOut"));
    } catch {
      setValidationError("Enter valid Manila punch dates and times.");
      return;
    }
    if ((timeIn === null) !== (timeOut === null)) {
      setValidationError(
        "Supply both punches or clear both; partial punches require reconciliation.",
      );
      return;
    }
    if (
      absent &&
      (Object.values(totals).some((value) => value !== 0) || timeIn || timeOut)
    ) {
      setValidationError(
        "An absent day cannot also contain punches or worked/deduction minutes.",
      );
      return;
    }
    if (timeIn && timeOut) {
      const duration = Date.parse(timeOut) - Date.parse(timeIn);
      if (
        duration <= 0 ||
        duration > 86_400_000 ||
        toManilaInput(timeIn).slice(0, 10) !== text("date") ||
        totals.actualWorkedMinutes > Math.floor(duration / 60_000)
      ) {
        setValidationError(
          "Time in must match the DTR date in Manila; time out must follow within 24 hours, and worked minutes cannot exceed that interval.",
        );
        return;
      }
    }
    if (text("correctionReason").length < 10) {
      setValidationError(
        "Provide a correction reason of at least 10 characters.",
      );
      return;
    }
    setValidationError(null);
    correct.mutate({
      employeeId: range.employeeId,
      date: text("date"),
      expectedUpdatedAt: original
        ? new Date(original.updatedAt).toISOString()
        : null,
      dayType: text("dayType") as (typeof dayTypes)[number],
      timeIn,
      timeOut,
      ...totals,
      isAbsent: absent,
      isApproved: approved,
      correctionReason: text("correctionReason"),
    });
  }

  return (
    <Card role="region" aria-label="Attendance correction">
      <CardHeader>
        <CardTitle>
          {original ? "Correct attendance" : "Add attendance record"}
        </CardTitle>
        <CardDescription>
          Manual, audited entry. Enter verified minute totals, not a presumed
          full shift. Blank punches clear both stored times. New entries start
          unapproved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <FieldSet disabled={correct.isPending}>
              <FieldLegend>Attendance values</FieldLegend>
              <Field>
                <FieldLabel htmlFor="attendance-date">
                  Attendance date
                </FieldLabel>
                <Input
                  id="attendance-date"
                  name="date"
                  type="date"
                  defaultValue={
                    original ? date(original.date) : range.startDate
                  }
                  min={range.startDate}
                  max={range.endDate}
                  readOnly={!!original}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="attendance-day-type">Day type</FieldLabel>
                <Select
                  items={dayTypes.map((type) => ({
                    value: type,
                    label: type.replaceAll("_", " "),
                  }))}
                  name="dayType"
                  defaultValue={original?.dayType ?? undefined}
                  required
                >
                  <SelectTrigger id="attendance-day-type" className="w-full">
                    <SelectValue placeholder="Select day type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {dayTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Combined holiday/rest-day classifications and double holidays
                  require manual review outside this form.
                </FieldDescription>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="attendance-time-in">
                    Time in (Asia/Manila)
                  </FieldLabel>
                  <Input
                    id="attendance-time-in"
                    name="timeIn"
                    type="datetime-local"
                    defaultValue={toManilaInput(original?.timeIn)}
                    step="0.001"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="attendance-time-out">
                    Time out (Asia/Manila)
                  </FieldLabel>
                  <Input
                    id="attendance-time-out"
                    name="timeOut"
                    type="datetime-local"
                    defaultValue={toManilaInput(original?.timeOut)}
                    step="0.001"
                  />
                </Field>
                {minuteFields.map((field) => (
                  <Field key={field.name}>
                    <FieldLabel htmlFor={`attendance-${field.name}`}>
                      {field.label}
                    </FieldLabel>
                    <Input
                      id={`attendance-${field.name}`}
                      name={field.name}
                      type="number"
                      min="0"
                      max="1440"
                      step="1"
                      defaultValue={
                        original
                          ? original[field.name]
                          : field.name === "actualWorkedMinutes"
                            ? ""
                            : 0
                      }
                      required
                    />
                  </Field>
                ))}
              </div>
              <Field orientation="horizontal">
                <Checkbox
                  id="attendance-absent"
                  checked={absent}
                  onCheckedChange={setAbsent}
                />
                <FieldLabel htmlFor="attendance-absent">Absent</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="attendance-approved"
                  checked={approved}
                  onCheckedChange={setApproved}
                />
                <FieldLabel htmlFor="attendance-approved">
                  Approve for payroll
                </FieldLabel>
              </Field>
              <FieldDescription>
                Approval confirms your review of the attendance values. It is
                not payroll approval or permission to modify processed payroll.
              </FieldDescription>
              <Field>
                <FieldLabel htmlFor="attendance-reason">
                  Correction reason
                </FieldLabel>
                <Input
                  id="attendance-reason"
                  name="correctionReason"
                  minLength={10}
                  maxLength={500}
                  required
                />
                <FieldDescription>
                  The reason, actor, and before/after values are recorded in the
                  audit log. Draft values are not saved to browser storage.
                </FieldDescription>
              </Field>
            </FieldSet>
            {validationError && <FieldError>{validationError}</FieldError>}
            {correct.isError && (
              <FieldError>
                {["CONFLICT", "NOT_FOUND", "UNPROCESSABLE_CONTENT"].includes(
                  correct.error.data?.code ?? "",
                )
                  ? correct.error.message
                  : correct.error.data?.code === "BAD_REQUEST"
                    ? "Attendance values were rejected. Check dates, punches, totals and reason."
                    : "Could not save attendance. Your entries have been kept; please retry."}
              </FieldError>
            )}
            {correct.error?.data?.code === "CONFLICT" && (
              <Button type="button" variant="outline" onClick={onReload}>
                Reload DTR and discard this draft
              </Button>
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={correct.isPending}>
                {correct.isPending ? "Saving attendance…" : "Save attendance"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={correct.isPending}
                onClick={onCancel}
              >
                Cancel attendance correction
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
