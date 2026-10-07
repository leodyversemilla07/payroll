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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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
import { Separator } from "@workspace/ui/components/separator";
import { Download, FileText, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { usePortalUser } from "@/components/payroll-portal";
import { downloadBase64File, downloadTextFile } from "@/lib/download-file";
import { trpc } from "@/lib/trpc";

export interface YearEndEmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  employmentStatus: string;
}

type Cents = bigint | number | string | null | undefined;

function big(value: Cents): bigint | null {
  if (value === null || value === undefined) return null;
  try {
    return typeof value === "bigint" ? value : BigInt(value);
  } catch {
    return null;
  }
}

function fmt(value: Cents): string {
  const cents = big(value);
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(cents) / 100);
}

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(new Date(value));
}

function toCentsString(pesosText: string): string | null {
  const trimmed = pesosText.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return BigInt(Math.round(amount * 100)).toString();
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function MutationError({ error }: { error: { message: string } | null }) {
  if (!error) return null;
  return <p role="alert">{error.message}</p>;
}

export function YearEndTaxSection({
  employees,
}: {
  employees: YearEndEmployeeOption[];
}) {
  const currentYear = new Date().getFullYear();
  const [taxYearText, setTaxYearText] = useState(String(currentYear));
  const taxYear = Number(taxYearText);
  const taxYearValid =
    Number.isInteger(taxYear) && taxYear >= 2023 && taxYear <= 2100;
  const [employeeId, setEmployeeId] = useState("");
  const selected = employees.find((entry) => entry.id === employeeId) ?? null;
  const queue = trpc.compliance.listYearEndReconciliations.useQuery(
    { taxYear },
    { enabled: taxYearValid, retry: false },
  );
  const rows = queue.data?.rows ?? [];

  return (
    <Card role="region" aria-label="Year-end tax">
      <CardHeader>
        <CardTitle>Year-end tax</CardTitle>
        <CardDescription>
          Review queue, prior-employer evidence, 2316 worksheet preview and
          settlement. Worksheets are internal only, never official BIR forms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Field>
          <FieldLabel htmlFor="tax-year">Tax year</FieldLabel>
          <Input
            id="tax-year"
            name="taxYear"
            type="number"
            min={2023}
            max={2100}
            value={taxYearText}
            onChange={(event) => setTaxYearText(event.currentTarget.value)}
            required
          />
        </Field>
        {!taxYearValid ? (
          <p role="alert">Enter a tax year from 2023 to 2100.</p>
        ) : queue.isPending ? (
          <div
            role="status"
            className="flex items-center gap-2 py-3 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin text-primary shrink-0" />
            <span>Loading review queue…</span>
          </div>
        ) : queue.isError ? (
          <p role="alert">
            Could not load the review queue.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => void queue.refetch()}
            >
              Retry
            </Button>
          </p>
        ) : rows.length === 0 ? (
          <p>No reconciliation rows for {taxYear}.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.employeeId}>
                <Button
                  type="button"
                  aria-pressed={employeeId === row.employeeId}
                  variant="outline"
                  className="h-auto w-full flex-col items-start whitespace-normal p-3 text-left"
                  onClick={() => setEmployeeId(row.employeeId)}
                >
                  <strong className="max-w-full break-words">{row.name}</strong>
                  <span className="max-w-full break-words text-sm text-muted-foreground">
                    {row.employeeNumber} · {statusLabel(row.status)}
                    {row.issuanceFreshness &&
                      ` · certificate ${row.issuanceFreshness.toLowerCase()}`}
                    {row.unsettledDifferenceCents != null &&
                    big(row.unsettledDifferenceCents) !== 0n
                      ? ` · ${fmt(row.unsettledDifferenceCents)}`
                      : ""}
                    {row.status === "SETTLED" ? " · settled" : ""}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Field>
            <FieldLabel htmlFor="tax-employee">Employee</FieldLabel>
            <Select
              items={[
                { value: "NONE", label: "Select an employee" },
                ...employees.map((entry) => ({
                  value: entry.id,
                  label: `${entry.firstName} ${entry.lastName} · ${entry.employeeNumber}`,
                })),
              ]}
              value={employeeId || "NONE"}
              onValueChange={(val) =>
                setEmployeeId(val === "NONE" ? "" : (val ?? ""))
              }
            >
              <SelectTrigger id="tax-employee" className="w-full">
                <SelectValue placeholder="Select an employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="NONE">Select an employee</SelectItem>
                  {employees.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.firstName} {entry.lastName} ·{" "}
                      {entry.employeeNumber}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {selected && taxYearValid && (
          <EmployeeTaxDetail
            key={`${selected.id}:${taxYear}`}
            employee={selected}
            taxYear={taxYear}
          />
        )}
        {taxYearValid && <AnnualComplianceTransmittals taxYear={taxYear} />}
        {taxYearValid && <TaxCorrectionQueue taxYear={taxYear} />}
      </CardContent>
    </Card>
  );
}

function AnnualComplianceTransmittals({ taxYear }: { taxYear: number }) {
  const [alphalistResult, setAlphalistResult] = useState<{
    summary: {
      totalEmployees: number;
      schedule71Count: number;
      schedule72Count: number;
      totalGrossCompensationCents: bigint | string | number;
      totalNonTaxableCents: bigint | string | number;
      totalTaxableCents: bigint | string | number;
      totalTaxDueCents: bigint | string | number;
      totalTaxWithheldCents: bigint | string | number;
      totalRefundCents: bigint | string | number;
      totalPayableCents: bigint | string | number;
    };
    filenameDat: string;
    contentDat: string;
    filenameCsv: string;
    contentCsv: string;
  } | null>(null);

  const export1604C = trpc.compliance.exportBir1604CAlphalist.useMutation({
    onSuccess: (data) => {
      setAlphalistResult(data as never);
    },
  });

  const [doleOpen, setDoleOpen] = useState(false);
  const [natureOfBusiness, setNatureOfBusiness] = useState(
    "Information Technology & Services",
  );
  const [contactPerson, setContactPerson] = useState("");
  const [contactNumber, setContactNumber] = useState("+63 2 8123 4567");
  const [contactTitle, setContactTitle] = useState("HR Director");
  const [doleNotice, setDoleNotice] = useState<string | null>(null);

  const exportDole = trpc.compliance.exportDole13thMonth.useMutation({
    onSuccess: (data) => {
      downloadTextFile(data.reportText, data.filename);
      setDoleNotice(
        `Generated DOLE report for ${data.batchResult.totalBenefitedEmployees} benefited employees. Download started automatically.`,
      );
    },
  });

  function handleExport1604C() {
    export1604C.mutate({ taxYear });
  }

  function handleExportDole(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDoleNotice(null);
    exportDole.mutate({
      taxYear,
      natureOfBusiness,
      contactPerson,
      contactNumber,
      contactTitle,
    });
  }

  return (
    <section
      aria-label="Statutory transmittal exports"
      className="space-y-4 rounded-xl border border-border p-4"
    >
      <div>
        <h3 className="font-semibold text-base">
          Government Transmittal Exports
        </h3>
        <p className="text-sm text-muted-foreground">
          Official statutory transmittals for tax year {taxYear}: BIR Form
          1604-C eFPS Alphalist (.DAT & CSV) and DOLE 13th-Month Pay compliance
          reports.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* BIR Form 1604-C Card */}
        <div className="flex flex-col justify-between rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
          <div>
            <h4 className="font-medium text-sm flex items-center gap-1.5">
              <FileText className="size-4 text-primary" />
              BIR Form 1604-C & Alphalist
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Generates the official Schedule 7.1 (Regular) and Schedule 7.2
              (Minimum Wage) Alphalist. Download the eFPS .DAT transmittal and
              multi-schedule audit CSV.
            </p>
          </div>

          <MutationError error={export1604C.error} />

          {alphalistResult && (
            <div className="rounded border bg-background p-2.5 text-xs space-y-1">
              <p className="font-medium">
                Alphalist Ready: {alphalistResult.summary.totalEmployees}{" "}
                employees ({alphalistResult.summary.schedule71Count} Regular,{" "}
                {alphalistResult.summary.schedule72Count} MWE)
              </p>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                <span>
                  Gross:{" "}
                  {fmt(alphalistResult.summary.totalGrossCompensationCents)}
                </span>
                <span>
                  Taxable: {fmt(alphalistResult.summary.totalTaxableCents)}
                </span>
                <span>
                  Tax Due: {fmt(alphalistResult.summary.totalTaxDueCents)}
                </span>
                <span>
                  Withheld: {fmt(alphalistResult.summary.totalTaxWithheldCents)}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={export1604C.isPending}
              onClick={handleExport1604C}
            >
              {export1604C.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Generating…
                </>
              ) : (
                "Generate 1604-C Alphalist"
              )}
            </Button>

            {alphalistResult && (
              <>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() =>
                    downloadTextFile(
                      alphalistResult.contentDat,
                      alphalistResult.filenameDat,
                    )
                  }
                >
                  <Download className="size-3.5 mr-1" />
                  eFPS .DAT
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadTextFile(
                      alphalistResult.contentCsv,
                      alphalistResult.filenameCsv,
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  <Download className="size-3.5 mr-1" />
                  Audit CSV
                </Button>
              </>
            )}
          </div>
        </div>

        {/* DOLE 13th Month Card */}
        <div className="flex flex-col justify-between rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
          <div>
            <h4 className="font-medium text-sm flex items-center gap-1.5">
              <FileText className="size-4 text-primary" />
              DOLE 13th-Month Pay Compliance
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Conforms to DOLE Bureau of Working Conditions (BWC) compliance
              report requirements under Presidential Decree No. 851.
            </p>
          </div>

          {doleNotice && (
            <p
              role="status"
              className="rounded border bg-background p-2 text-xs font-medium text-emerald-700 dark:text-emerald-400"
            >
              {doleNotice}
            </p>
          )}

          <MutationError error={exportDole.error} />

          {!doleOpen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDoleOpen(true)}
            >
              Configure & Export DOLE Report
            </Button>
          ) : (
            <form onSubmit={handleExportDole} className="space-y-2 text-xs">
              <Field>
                <FieldLabel htmlFor="dole-nature" className="text-xs">
                  Industry / Nature of Business
                </FieldLabel>
                <Input
                  id="dole-nature"
                  className="h-8 text-xs"
                  value={natureOfBusiness}
                  onChange={(e) => setNatureOfBusiness(e.target.value)}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field>
                  <FieldLabel htmlFor="dole-person" className="text-xs">
                    Contact Person
                  </FieldLabel>
                  <Input
                    id="dole-person"
                    className="h-8 text-xs"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="dole-number" className="text-xs">
                    Contact Number
                  </FieldLabel>
                  <Input
                    id="dole-number"
                    className="h-8 text-xs"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="dole-title" className="text-xs">
                  Position / Title
                </FieldLabel>
                <Input
                  id="dole-title"
                  className="h-8 text-xs"
                  value={contactTitle}
                  onChange={(e) => setContactTitle(e.target.value)}
                  required
                />
              </Field>
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={exportDole.isPending}>
                  {exportDole.isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                      Downloading…
                    </>
                  ) : (
                    "Download DOLE Report (.txt)"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDoleOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function TaxCorrectionQueue({ taxYear }: { taxYear: number }) {
  const pending = trpc.compliance.listTaxCorrections.useQuery(
    { taxYear },
    { retry: false },
  );
  const { user } = usePortalUser();
  const invalidate = useInvalidateEvidence();
  const [notice, setNotice] = useState("");
  const review = trpc.compliance.reviewTaxCorrection.useMutation({
    onSuccess: (record) => {
      setNotice(
        record.status === "APPROVED"
          ? "Correction approved and new evidence version published."
          : "Correction rejected; effective evidence is unchanged.",
      );
      invalidate();
    },
  });
  const canReview = user.role === "SUPER_ADMIN" || user.role === "HR_ADMIN";
  return (
    <section
      aria-label="Tax correction review"
      className="space-y-3 rounded-xl border border-border p-4"
    >
      <h3 className="font-semibold">Pending tax corrections</h3>
      <p className="text-sm text-muted-foreground">
        Only a different signed-in HR/admin can approve or reject. Pending
        proposals do not affect payroll or tax evidence. Showing up to 100
        oldest requests.
      </p>
      {notice && <p role="status">{notice}</p>}
      <MutationError error={review.error} />
      {pending.isPending ? (
        <div
          role="status"
          className="flex items-center gap-2 py-3 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin text-primary shrink-0" />
          <span>Loading corrections…</span>
        </div>
      ) : pending.isError ? (
        <p role="alert">
          Could not load corrections.{" "}
          <Button variant="outline" onClick={() => void pending.refetch()}>
            Retry
          </Button>
        </p>
      ) : !pending.data?.length ? (
        <p className="text-sm">No pending corrections.</p>
      ) : (
        pending.data.map((request) => (
          <TaxCorrectionReview
            key={request.id}
            request={request}
            own={request.requestedById === user.id}
            canReview={canReview}
            busy={review.isPending}
            submit={(decision, reviewReason) =>
              review.mutate({ id: request.id, decision, reviewReason })
            }
          />
        ))
      )}
    </section>
  );
}

function TaxCorrectionReview({
  request,
  own,
  canReview,
  busy,
  submit,
}: {
  request: {
    id: string;
    kind: string;
    requestedById: string;
    payload: unknown;
    originalEvidence: unknown;
    settlementPreview?: unknown;
  };
  own: boolean;
  canReview: boolean;
  busy: boolean;
  submit: (decision: "APPROVE" | "REJECT", reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <section
      aria-label={`Correction ${request.id}`}
      className="space-y-3 rounded-xl border border-border p-3 text-sm"
    >
      <h4 className="font-semibold">
        {request.kind.replaceAll("_", " ")} · requested by{" "}
        {request.requestedById}
      </h4>
      <details>
        <summary className="cursor-pointer">
          Compare recorded evidence and proposed values
        </summary>
        <p className="mt-2 font-medium">Recorded evidence</p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
          {JSON.stringify(request.originalEvidence, null, 2)}
        </pre>
        <p className="mt-2 font-medium">
          Proposed values (amounts are decimal centavo strings)
        </p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
          {JSON.stringify(request.payload, null, 2)}
        </pre>
        {!!request.settlementPreview && (
          <>
            <p className="mt-2 font-medium">
              Live settlement difference (centavos; approval rejects changed
              sources)
            </p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
              {JSON.stringify(request.settlementPreview, null, 2)}
            </pre>
          </>
        )}
      </details>
      {own ? (
        <p>
          You requested this correction. A different HR/admin must review it.
        </p>
      ) : !canReview ? (
        <p>HR/admin review is required.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit("APPROVE", reason);
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`review-${request.id}`}>
                Review reason (10–500 characters)
              </FieldLabel>
              <Input
                id={`review-${request.id}`}
                required
                minLength={10}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                Approve correction
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  busy ||
                  reason.trim().length < 10 ||
                  reason.trim().length > 500
                }
                onClick={() => submit("REJECT", reason)}
              >
                Reject correction
              </Button>
            </div>
          </FieldGroup>
        </form>
      )}
    </section>
  );
}

function EmployeeTaxDetail({
  employee,
  taxYear,
}: {
  employee: YearEndEmployeeOption;
  taxYear: number;
}) {
  const evidence = trpc.compliance.getTaxEvidence.useQuery(
    { employeeId: employee.id, taxYear },
    { retry: false },
  );

  return (
    <div className="space-y-6">
      <Separator />
      <h3 className="text-lg font-semibold">
        {employee.firstName} {employee.lastName} · {taxYear}
      </h3>
      {evidence.isPending ? (
        <div
          role="status"
          className="flex items-center gap-2 py-3 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin text-primary shrink-0" />
          <span>Loading tax evidence…</span>
        </div>
      ) : evidence.isError ? (
        <p role="alert">
          Could not load tax evidence.{" "}
          <Button
            type="button"
            variant="outline"
            onClick={() => void evidence.refetch()}
          >
            Retry
          </Button>
        </p>
      ) : !evidence.data ? (
        <p>No tax evidence found.</p>
      ) : (
        <>
          <EvidenceSummary evidence={evidence.data} />
          <DeclarationForms
            employeeId={employee.id}
            taxYear={taxYear}
            current={evidence.data.declaration}
          />
          <PreviousIncomeForms
            employeeId={employee.id}
            taxYear={taxYear}
            records={evidence.data.previousEmployers}
          />
          <RemittanceForms
            taxYear={taxYear}
            records={evidence.data.monthlyRemittances}
          />
          <PreviewCard employeeId={employee.id} taxYear={taxYear} />
          <SettlementForms
            employeeId={employee.id}
            taxYear={taxYear}
            settlement={evidence.data.settlement}
          />
        </>
      )}
    </div>
  );
}

interface EvidenceData {
  declaration: {
    id: string;
    hasPriorEmployer: boolean;
    sourceReference: string;
    version?: number;
  } | null;
  previousEmployers: {
    id: string;
    employerName: string;
    employerTin: string;
    periodStart: Date | string;
    periodEnd: Date | string;
    grossCompensationCents: Cents;
    taxableCompensationCents: Cents;
    taxWithheldCents: Cents;
    documentReference: string;
    version?: number;
  }[];
  monthlyRemittances: {
    id: string;
    month: number;
    remittedCents: Cents;
    documentReference: string;
    version?: number;
  }[];
  settlement: {
    id: string;
    settlementType: string;
    settledCents: Cents;
    settlementDate: Date | string;
    documentReference: string;
    version?: number;
  } | null;
}

function EvidenceSummary({ evidence }: { evidence: EvidenceData }) {
  return (
    <div className="rounded-xl border border-border p-4 text-sm">
      <h4 className="mb-2 font-semibold">Recorded evidence</h4>
      <p>
        Prior-employer declaration:{" "}
        {evidence.declaration
          ? `${evidence.declaration.hasPriorEmployer ? "has prior employer" : "no prior employer"} · ${evidence.declaration.sourceReference}`
          : "missing"}
      </p>
      <p>Previous-employer documents: {evidence.previousEmployers.length}</p>
      <ul className="ml-4 list-disc">
        {evidence.previousEmployers.map((record) => (
          <li key={record.id}>
            {record.employerName} · {fmtDate(record.periodStart)} –{" "}
            {fmtDate(record.periodEnd)} · taxable{" "}
            {fmt(record.taxableCompensationCents)} · withheld{" "}
            {fmt(record.taxWithheldCents)}
          </li>
        ))}
      </ul>
      <p>Monthly remittance references: {evidence.monthlyRemittances.length}</p>
      <p>
        Settlement:{" "}
        {evidence.settlement
          ? `${statusLabel(evidence.settlement.settlementType)} ${fmt(evidence.settlement.settledCents)}`
          : "none"}
      </p>
      <p className="mt-1 text-muted-foreground">
        All references are self-reported and unverified.
      </p>
    </div>
  );
}

function useInvalidateEvidence() {
  const utils = trpc.useUtils();
  return () => {
    void utils.compliance.listYearEndReconciliations.invalidate();
    void utils.compliance.listTaxCorrections.invalidate();
    void utils.compliance.getBir2316Issuance.invalidate();
    void utils.compliance.getTaxEvidence.invalidate();
  };
}

function DeclarationForms({
  employeeId,
  taxYear,
  current,
}: {
  employeeId: string;
  taxYear: number;
  current: EvidenceData["declaration"];
}) {
  const invalidate = useInvalidateEvidence();
  const [hasPriorEmployer, setHasPriorEmployer] = useState(false);
  const [sourceReference, setSourceReference] = useState("");
  const [done, setDone] = useState(false);
  const record = trpc.compliance.recordPriorEmployerDeclaration.useMutation({
    onSuccess: () => {
      setDone(true);
      setSourceReference("");
      invalidate();
    },
  });
  const [showCorrect, setShowCorrect] = useState(false);
  const [correctHasPrior, setCorrectHasPrior] = useState(false);
  const [correctReference, setCorrectReference] = useState("");
  const [reason, setReason] = useState("");
  const [correctDone, setCorrectDone] = useState(false);
  const correct = trpc.compliance.correctPriorEmployerDeclaration.useMutation({
    onSuccess: () => {
      setCorrectDone(true);
      invalidate();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    record.mutate({ employeeId, taxYear, hasPriorEmployer, sourceReference });
  }

  function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCorrectDone(false);
    correct.mutate({
      employeeId,
      taxYear,
      hasPriorEmployer: correctHasPrior,
      sourceReference: correctReference,
      correctionReason: reason,
    });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Prior-employer declaration</CardTitle>
        <CardDescription>
          HR only. Current:{" "}
          {current
            ? `${current.hasPriorEmployer ? "has prior employer" : "no prior employer"}`
            : "none recorded"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field orientation="horizontal">
              <Checkbox
                id="declaration-has-prior"
                checked={hasPriorEmployer}
                onCheckedChange={setHasPriorEmployer}
              />
              <FieldLabel htmlFor="declaration-has-prior">
                Has prior employer this year
              </FieldLabel>
            </Field>
            <Field>
              <FieldLabel htmlFor="declaration-reference">
                Source reference
              </FieldLabel>
              <Input
                id="declaration-reference"
                value={sourceReference}
                onChange={(event) =>
                  setSourceReference(event.currentTarget.value)
                }
                maxLength={160}
                required
              />
            </Field>
            <MutationError error={record.error} />
            {done && <p role="status">Declaration recorded.</p>}
            <Field>
              <Button type="submit" disabled={record.isPending}>
                {record.isPending ? "Recording…" : "Record declaration"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
        {current && (
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCorrect((value) => !value)}
            >
              {showCorrect ? "Hide correction" : "Correct declaration"}
            </Button>
            {showCorrect && (
              <form onSubmit={submitCorrection} className="mt-3">
                <FieldGroup>
                  <Field orientation="horizontal">
                    <Checkbox
                      id="declaration-correct-has-prior"
                      checked={correctHasPrior}
                      onCheckedChange={setCorrectHasPrior}
                    />
                    <FieldLabel htmlFor="declaration-correct-has-prior">
                      Has prior employer this year
                    </FieldLabel>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="declaration-correct-reference">
                      Source reference
                    </FieldLabel>
                    <Input
                      id="declaration-correct-reference"
                      value={correctReference}
                      onChange={(event) =>
                        setCorrectReference(event.currentTarget.value)
                      }
                      maxLength={160}
                      required
                    />
                  </Field>
                  <CorrectionFields
                    idPrefix="declaration-correct"
                    reason={reason}
                    setReason={setReason}
                  />
                  <MutationError error={correct.error} />
                  {correctDone && (
                    <p role="status">
                      Correction requested; awaiting a different signed-in
                      HR/admin.
                    </p>
                  )}
                  <Field>
                    <Button type="submit" disabled={correct.isPending}>
                      {correct.isPending ? "Submitting…" : "Request correction"}
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CorrectionFields({
  idPrefix,
  reason,
  setReason,
}: {
  idPrefix: string;
  reason: string;
  setReason: (value: string) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-reason`}>
          Correction reason (10–500 characters)
        </FieldLabel>
        <Input
          id={`${idPrefix}-reason`}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          minLength={10}
          maxLength={500}
          required
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        This proposal does not change effective evidence. A different signed-in
        HR/admin must review it before a new version is published.
      </p>
    </>
  );
}

function PreviousIncomeForms({
  employeeId,
  taxYear,
  records,
}: {
  employeeId: string;
  taxYear: number;
  records: EvidenceData["previousEmployers"];
}) {
  const invalidate = useInvalidateEvidence();
  const [employerName, setEmployerName] = useState("");
  const [employerTin, setEmployerTin] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [gross, setGross] = useState("");
  const [taxable, setTaxable] = useState("");
  const [withheld, setWithheld] = useState("");
  const [documentReference, setDocumentReference] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const record = trpc.compliance.recordPreviousEmployerIncome.useMutation({
    onSuccess: () => {
      setDone(true);
      invalidate();
    },
  });
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctEmployerName, setCorrectEmployerName] = useState("");
  const [correctGross, setCorrectGross] = useState("");
  const [correctTaxable, setCorrectTaxable] = useState("");
  const [correctWithheld, setCorrectWithheld] = useState("");
  const [correctReference, setCorrectReference] = useState("");
  const [reason, setReason] = useState("");
  const [correctDone, setCorrectDone] = useState(false);
  const correct = trpc.compliance.correctPreviousEmployerIncome.useMutation({
    onSuccess: () => {
      setCorrectDone(true);
      setCorrectingId(null);
      invalidate();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    const grossCents = toCentsString(gross);
    const taxableCents = toCentsString(taxable);
    const withheldCents = toCentsString(withheld);
    if (
      !grossCents ||
      !taxableCents ||
      !withheldCents ||
      !periodStart ||
      !periodEnd
    ) {
      setFormError("Enter valid non-negative peso amounts and both dates.");
      return;
    }
    setFormError(null);
    record.mutate({
      employeeId,
      taxYear,
      employerName,
      employerTin,
      periodStart,
      periodEnd,
      grossCompensationCents: grossCents,
      taxableCompensationCents: taxableCents,
      taxWithheldCents: withheldCents,
      documentReference,
    });
  }

  function submitCorrection(
    event: FormEvent<HTMLFormElement>,
    target: EvidenceData["previousEmployers"][number],
  ) {
    event.preventDefault();
    setCorrectDone(false);
    const grossCents = toCentsString(correctGross);
    const taxableCents = toCentsString(correctTaxable);
    const withheldCents = toCentsString(correctWithheld);
    if (!grossCents || !taxableCents || !withheldCents) {
      setFormError("Enter valid non-negative peso amounts.");
      return;
    }
    setFormError(null);
    correct.mutate({
      employeeId,
      taxYear,
      employerName: correctEmployerName,
      employerTin: target.employerTin,
      periodStart: new Date(target.periodStart).toISOString().slice(0, 10),
      periodEnd: new Date(target.periodEnd).toISOString().slice(0, 10),
      grossCompensationCents: grossCents,
      taxableCompensationCents: taxableCents,
      taxWithheldCents: withheldCents,
      documentReference: correctReference,
      correctionReason: reason,
    });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Previous-employer income</CardTitle>
        <CardDescription>
          HR only. Transcribed 2316 figures, self-reported and unverified ·{" "}
          {records.length} recorded
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="prior-employer-name">
                Employer name
              </FieldLabel>
              <Input
                id="prior-employer-name"
                value={employerName}
                onChange={(event) => setEmployerName(event.currentTarget.value)}
                maxLength={200}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prior-employer-tin">Employer TIN</FieldLabel>
              <Input
                id="prior-employer-tin"
                value={employerTin}
                onChange={(event) => setEmployerTin(event.currentTarget.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prior-period-start">Period start</FieldLabel>
              <Input
                id="prior-period-start"
                type="date"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.currentTarget.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prior-period-end">Period end</FieldLabel>
              <Input
                id="prior-period-end"
                type="date"
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.currentTarget.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prior-gross">Gross pay (₱)</FieldLabel>
              <Input
                id="prior-gross"
                inputMode="decimal"
                value={gross}
                onChange={(event) => setGross(event.currentTarget.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prior-taxable">Taxable pay (₱)</FieldLabel>
              <Input
                id="prior-taxable"
                inputMode="decimal"
                value={taxable}
                onChange={(event) => setTaxable(event.currentTarget.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prior-withheld">Tax withheld (₱)</FieldLabel>
              <Input
                id="prior-withheld"
                inputMode="decimal"
                value={withheld}
                onChange={(event) => setWithheld(event.currentTarget.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prior-reference">
                Document reference
              </FieldLabel>
              <Input
                id="prior-reference"
                value={documentReference}
                onChange={(event) =>
                  setDocumentReference(event.currentTarget.value)
                }
                maxLength={160}
                required
              />
            </Field>
            {formError && <p role="alert">{formError}</p>}
            <MutationError error={record.error} />
            {done && <p role="status">Previous-employer income recorded.</p>}
            <Field>
              <Button type="submit" disabled={record.isPending}>
                {record.isPending ? "Recording…" : "Record income"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
        {records.map((target) => (
          <div key={target.id} className="rounded-xl border border-border p-3">
            <p className="text-sm">
              {target.employerName} · taxable{" "}
              {fmt(target.taxableCompensationCents)}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={() => {
                setCorrectingId(correctingId === target.id ? null : target.id);
                setCorrectEmployerName(target.employerName);
                setCorrectReference(target.documentReference);
              }}
            >
              {correctingId === target.id
                ? "Hide correction"
                : "Correct figures"}
            </Button>
            {correctingId === target.id && (
              <form
                onSubmit={(event) => submitCorrection(event, target)}
                className="mt-3"
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor={`prior-correct-name-${target.id}`}>
                      Employer name
                    </FieldLabel>
                    <Input
                      id={`prior-correct-name-${target.id}`}
                      value={correctEmployerName}
                      onChange={(event) =>
                        setCorrectEmployerName(event.currentTarget.value)
                      }
                      maxLength={200}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`prior-correct-gross-${target.id}`}>
                      Gross pay (₱)
                    </FieldLabel>
                    <Input
                      id={`prior-correct-gross-${target.id}`}
                      inputMode="decimal"
                      value={correctGross}
                      onChange={(event) =>
                        setCorrectGross(event.currentTarget.value)
                      }
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`prior-correct-taxable-${target.id}`}>
                      Taxable pay (₱)
                    </FieldLabel>
                    <Input
                      id={`prior-correct-taxable-${target.id}`}
                      inputMode="decimal"
                      value={correctTaxable}
                      onChange={(event) =>
                        setCorrectTaxable(event.currentTarget.value)
                      }
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`prior-correct-withheld-${target.id}`}>
                      Tax withheld (₱)
                    </FieldLabel>
                    <Input
                      id={`prior-correct-withheld-${target.id}`}
                      inputMode="decimal"
                      value={correctWithheld}
                      onChange={(event) =>
                        setCorrectWithheld(event.currentTarget.value)
                      }
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel
                      htmlFor={`prior-correct-reference-${target.id}`}
                    >
                      Document reference
                    </FieldLabel>
                    <Input
                      id={`prior-correct-reference-${target.id}`}
                      value={correctReference}
                      onChange={(event) =>
                        setCorrectReference(event.currentTarget.value)
                      }
                      maxLength={160}
                      required
                    />
                  </Field>
                  <CorrectionFields
                    idPrefix={`prior-correct-${target.id}`}
                    reason={reason}
                    setReason={setReason}
                  />
                  <MutationError error={correct.error} />
                  {correctDone && (
                    <p role="status">
                      Correction requested; awaiting a different signed-in
                      HR/admin.
                    </p>
                  )}
                  <Field>
                    <Button type="submit" disabled={correct.isPending}>
                      {correct.isPending ? "Submitting…" : "Request correction"}
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RemittanceForms({
  taxYear,
  records,
}: {
  taxYear: number;
  records: EvidenceData["monthlyRemittances"];
}) {
  const invalidate = useInvalidateEvidence();
  const [monthText, setMonthText] = useState("12");
  const [remitted, setRemitted] = useState("");
  const [documentReference, setDocumentReference] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const record = trpc.compliance.recordMonthlyTaxRemittance.useMutation({
    onSuccess: () => {
      setDone(true);
      invalidate();
    },
  });
  const [correctingMonth, setCorrectingMonth] = useState<number | null>(null);
  const [correctRemitted, setCorrectRemitted] = useState("");
  const [correctReference, setCorrectReference] = useState("");
  const [reason, setReason] = useState("");
  const [correctDone, setCorrectDone] = useState(false);
  const correct = trpc.compliance.correctMonthlyTaxRemittance.useMutation({
    onSuccess: () => {
      setCorrectDone(true);
      setCorrectingMonth(null);
      invalidate();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    const month = Number(monthText);
    const remittedCents = toCentsString(remitted);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !remittedCents) {
      setFormError("Enter a month from 1 to 12 and a valid peso amount.");
      return;
    }
    setFormError(null);
    record.mutate({
      taxYear,
      month,
      remittedCents,
      documentReference,
    });
  }

  function submitCorrection(event: FormEvent<HTMLFormElement>, month: number) {
    event.preventDefault();
    setCorrectDone(false);
    const remittedCents = toCentsString(correctRemitted);
    if (!remittedCents) {
      setFormError("Enter a valid peso amount.");
      return;
    }
    setFormError(null);
    correct.mutate({
      taxYear,
      month,
      remittedCents,
      documentReference: correctReference,
      correctionReason: reason,
    });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Monthly tax remittance</CardTitle>
        <CardDescription>
          HR only. Self-reported references, not proof of BIR filing ·{" "}
          {records.length} recorded
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="remittance-month">Month (1–12)</FieldLabel>
              <Input
                id="remittance-month"
                type="number"
                min={1}
                max={12}
                value={monthText}
                onChange={(event) => setMonthText(event.currentTarget.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="remittance-amount">Remitted (₱)</FieldLabel>
              <Input
                id="remittance-amount"
                inputMode="decimal"
                value={remitted}
                onChange={(event) => setRemitted(event.currentTarget.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="remittance-reference">
                Document reference
              </FieldLabel>
              <Input
                id="remittance-reference"
                value={documentReference}
                onChange={(event) =>
                  setDocumentReference(event.currentTarget.value)
                }
                maxLength={160}
                required
              />
            </Field>
            {formError && <p role="alert">{formError}</p>}
            <MutationError error={record.error} />
            {done && <p role="status">Remittance reference recorded.</p>}
            <Field>
              <Button type="submit" disabled={record.isPending}>
                {record.isPending ? "Recording…" : "Record remittance"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
        {records.map((target) => (
          <div key={target.id} className="rounded-xl border border-border p-3">
            <p className="text-sm">
              Month {target.month} · {fmt(target.remittedCents)} ·{" "}
              {target.documentReference}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={() => {
                setCorrectingMonth(
                  correctingMonth === target.month ? null : target.month,
                );
                setCorrectReference(target.documentReference);
              }}
            >
              {correctingMonth === target.month
                ? "Hide correction"
                : "Correct reference"}
            </Button>
            {correctingMonth === target.month && (
              <form
                onSubmit={(event) => submitCorrection(event, target.month)}
                className="mt-3"
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel
                      htmlFor={`remittance-correct-amount-${target.month}`}
                    >
                      Remitted (₱)
                    </FieldLabel>
                    <Input
                      id={`remittance-correct-amount-${target.month}`}
                      inputMode="decimal"
                      value={correctRemitted}
                      onChange={(event) =>
                        setCorrectRemitted(event.currentTarget.value)
                      }
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel
                      htmlFor={`remittance-correct-reference-${target.month}`}
                    >
                      Document reference
                    </FieldLabel>
                    <Input
                      id={`remittance-correct-reference-${target.month}`}
                      value={correctReference}
                      onChange={(event) =>
                        setCorrectReference(event.currentTarget.value)
                      }
                      maxLength={160}
                      required
                    />
                  </Field>
                  <CorrectionFields
                    idPrefix={`remittance-correct-${target.month}`}
                    reason={reason}
                    setReason={setReason}
                  />
                  <MutationError error={correct.error} />
                  {correctDone && (
                    <p role="status">
                      Correction requested; awaiting a different signed-in
                      HR/admin.
                    </p>
                  )}
                  <Field>
                    <Button type="submit" disabled={correct.isPending}>
                      {correct.isPending ? "Submitting…" : "Request correction"}
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PreviewCard({
  employeeId,
  taxYear,
}: {
  employeeId: string;
  taxYear: number;
}) {
  const [done, setDone] = useState(false);
  const preview = trpc.compliance.previewBir2316Reconciliation.useMutation({
    onSuccess: () => setDone(true),
  });
  const result = preview.data;
  const utils = trpc.useUtils();
  const issuanceQuery = trpc.compliance.getBir2316Issuance.useQuery(
    { employeeId, taxYear },
    { retry: false },
  );
  const issuance = issuanceQuery.data ?? null;
  const [issued, setIssued] = useState(false);
  const issue = trpc.compliance.issueBir2316.useMutation({
    onSuccess: () => {
      setIssued(true);
      setVoided(false);
      void utils.compliance.getBir2316Issuance.invalidate();
      void utils.compliance.listYearEndReconciliations.invalidate();
    },
  });
  const [voidReason, setVoidReason] = useState("");
  const [voided, setVoided] = useState(false);
  const voidIssuance = trpc.compliance.voidBir2316Issuance.useMutation({
    onSuccess: () => {
      setVoided(true);
      setIssued(false);
      void utils.compliance.getBir2316Issuance.invalidate();
      void utils.compliance.listYearEndReconciliations.invalidate();
    },
  });
  const remaining = result ? big(result.remainingDifferenceCents) : null;

  function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVoided(false);
    voidIssuance.mutate({ employeeId, taxYear, voidReason });
  }

  const [downloadingPdf, setDownloadingPdf] = useState<
    "draft" | "official" | null
  >(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownloadPdf(isPreview: boolean) {
    try {
      setDownloadingPdf(isPreview ? "draft" : "official");
      setDownloadError(null);
      const data = await utils.compliance.downloadBir2316Pdf.fetch({
        employeeId,
        taxYear,
        isPreview,
      });
      downloadBase64File(data.dataBase64, data.fileName, "application/pdf");
    } catch (err) {
      setDownloadError(
        err instanceof Error
          ? err.message
          : "Failed to generate BIR Form 2316 PDF.",
      );
    } finally {
      setDownloadingPdf(null);
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>2316 worksheet preview</CardTitle>
        <CardDescription>
          Internal reconciliation worksheet, not an official BIR Form 2316.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={preview.isPending}
            onClick={() => {
              setDone(false);
              preview.mutate({ employeeId, taxYear });
            }}
          >
            {preview.isPending ? "Previewing…" : "Preview worksheet"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={downloadingPdf === "draft"}
            onClick={() => void handleDownloadPdf(true)}
          >
            {downloadingPdf === "draft" ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Generating draft PDF…
              </>
            ) : (
              <>
                <Download className="mr-2 size-4" />
                Download BIR 2316 PDF (Draft)
              </>
            )}
          </Button>
        </div>
        {downloadError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {downloadError}
          </p>
        )}
        <MutationError error={preview.error} />
        {done && result && (
          <div className="space-y-2 text-sm">
            <p>
              Status:{" "}
              <strong>
                {statusLabel(
                  result.isSettled ? "SETTLED" : result.reconciliationStatus,
                )}
              </strong>
            </p>
            <p>
              Tax due {fmt(result.certificate.partIVA.taxDueAnnualCents)} ·
              withheld {fmt(result.certificate.partIVA.totalTaxWithheldCents)} ·
              remaining {fmt(result.remainingDifferenceCents)}
            </p>
            {result.priorEmployerTotals && (
              <p>
                Prior employers: {result.priorEmployerTotals.employerCount} ·
                taxable {fmt(result.priorEmployerTotals.taxableCents)}
              </p>
            )}
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-border p-3 text-xs">
              {result.formattedDocument}
            </pre>
            {remaining !== null && remaining !== 0n && (
              <p>
                Settle the remaining {fmt(remaining)} before a certificate can
                be issued.
              </p>
            )}
          </div>
        )}
        <Separator />
        <section
          aria-label="Certificate issuance"
          className="space-y-3 text-sm"
        >
          <h4 className="font-semibold">Certificate issuance (HR only)</h4>
          {issued && <p role="status">Certificate issued.</p>}
          {voided && <p role="status">Certificate voided.</p>}
          {issuanceQuery.isPending ? (
            <div
              role="status"
              className="flex items-center gap-2 py-3 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin text-primary shrink-0" />
              <span>Loading issuance…</span>
            </div>
          ) : issuanceQuery.isError ? (
            <p role="alert">
              Could not verify certificate issuance.{" "}
              <Button
                type="button"
                variant="outline"
                onClick={() => void issuanceQuery.refetch()}
              >
                Retry
              </Button>
            </p>
          ) : issuance && issuance.status === "ISSUED" ? (
            <>
              {issuance.freshness !== "CURRENT" && (
                <p role="alert" className="text-destructive">
                  Certificate{" "}
                  {issuance.freshness === "STALE"
                    ? "is stale"
                    : "cannot be verified"}
                  .{" "}
                  {issuance.freshnessReason ??
                    "Review, void and re-issue after checking the source evidence."}
                </p>
              )}
              <p>
                Issued {issuance.issuedAt ? fmtDate(issuance.issuedAt) : "—"} ·
                version {String(issuance.version ?? "?")} · statutory deadline{" "}
                {issuance.statutoryDeadline ?? "—"}
                {issuance.hadPriorEmployer
                  ? " · prior employer on file (no substituted-filing verdict)"
                  : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
                <Button
                  type="button"
                  disabled={downloadingPdf === "official"}
                  onClick={() => void handleDownloadPdf(false)}
                >
                  {downloadingPdf === "official" ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Generating official PDF…
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 size-4" />
                      Download Official BIR 2316 PDF
                    </>
                  )}
                </Button>
              </div>
              <form onSubmit={submitVoid}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="issuance-void-reason">
                      Void reason (10–500 characters)
                    </FieldLabel>
                    <Input
                      id="issuance-void-reason"
                      value={voidReason}
                      onChange={(event) =>
                        setVoidReason(event.currentTarget.value)
                      }
                      minLength={10}
                      maxLength={500}
                      required
                    />
                  </Field>
                  <MutationError error={voidIssuance.error} />
                  <Field>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={voidIssuance.isPending}
                    >
                      {voidIssuance.isPending ? "Voiding…" : "Void certificate"}
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
            </>
          ) : (
            <>
              <MutationError error={issue.error} />
              <Button
                type="button"
                disabled={
                  issue.isPending || remaining === null || remaining !== 0n
                }
                onClick={() => {
                  setIssued(false);
                  issue.mutate({ employeeId, taxYear });
                }}
              >
                {issue.isPending ? "Issuing…" : "Issue certificate"}
              </Button>
              <FieldDescription>
                Allowed only for a conclusive, fully-settled reconciliation;
                figures are frozen into the issuance record.
              </FieldDescription>
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function SettlementForms({
  employeeId,
  taxYear,
  settlement,
}: {
  employeeId: string;
  taxYear: number;
  settlement: EvidenceData["settlement"];
}) {
  const invalidate = useInvalidateEvidence();
  const [settlementDate, setSettlementDate] = useState(`${taxYear}-12-15`);
  const [documentReference, setDocumentReference] = useState("");
  const [done, setDone] = useState(false);
  const record = trpc.compliance.recordYearEndSettlement.useMutation({
    onSuccess: () => {
      setDone(true);
      invalidate();
    },
  });
  const [showCorrect, setShowCorrect] = useState(false);
  const [correctDate, setCorrectDate] = useState(`${taxYear}-12-20`);
  const [correctReference, setCorrectReference] = useState("");
  const [reason, setReason] = useState("");
  const [correctDone, setCorrectDone] = useState(false);
  const correct = trpc.compliance.correctYearEndSettlement.useMutation({
    onSuccess: () => {
      setCorrectDone(true);
      invalidate();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    record.mutate({
      employeeId,
      taxYear,
      settlementDate,
      documentReference,
    });
  }

  function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCorrectDone(false);
    correct.mutate({
      employeeId,
      taxYear,
      settlementDate: correctDate,
      documentReference: correctReference,
      correctionReason: reason,
    });
  }

  return (
    <section aria-label="Settlement">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Year-end settlement</CardTitle>
          <CardDescription>
            Posts the computed difference as actually withheld or paid. Current:{" "}
            {settlement
              ? `${statusLabel(settlement.settlementType)} ${fmt(settlement.settledCents)}`
              : "none posted"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="settlement-date">
                  Settlement date
                </FieldLabel>
                <Input
                  id="settlement-date"
                  type="date"
                  value={settlementDate}
                  onChange={(event) =>
                    setSettlementDate(event.currentTarget.value)
                  }
                  required
                />
                <FieldDescription>
                  December for active staff; termination-month pay for separated
                  staff.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="settlement-reference">
                  Document reference
                </FieldLabel>
                <Input
                  id="settlement-reference"
                  value={documentReference}
                  onChange={(event) =>
                    setDocumentReference(event.currentTarget.value)
                  }
                  maxLength={160}
                  required
                />
              </Field>
              <MutationError error={record.error} />
              {done && <p role="status">Settlement posted.</p>}
              <Field>
                <Button type="submit" disabled={record.isPending}>
                  {record.isPending ? "Posting…" : "Post settlement"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
          {settlement && (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCorrect((value) => !value)}
              >
                {showCorrect ? "Hide correction" : "Correct settlement"}
              </Button>
              {showCorrect && (
                <form onSubmit={submitCorrection} className="mt-3">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="settlement-correct-date">
                        Settlement date
                      </FieldLabel>
                      <Input
                        id="settlement-correct-date"
                        type="date"
                        value={correctDate}
                        onChange={(event) =>
                          setCorrectDate(event.currentTarget.value)
                        }
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="settlement-correct-reference">
                        Document reference
                      </FieldLabel>
                      <Input
                        id="settlement-correct-reference"
                        value={correctReference}
                        onChange={(event) =>
                          setCorrectReference(event.currentTarget.value)
                        }
                        maxLength={160}
                        required
                      />
                    </Field>
                    <CorrectionFields
                      idPrefix="settlement-correct"
                      reason={reason}
                      setReason={setReason}
                    />
                    <MutationError error={correct.error} />
                    {correctDone && (
                      <p role="status">
                        Correction requested; awaiting a different signed-in
                        HR/admin.
                      </p>
                    )}
                    <Field>
                      <Button type="submit" disabled={correct.isPending}>
                        {correct.isPending
                          ? "Submitting…"
                          : "Request correction"}
                      </Button>
                    </Field>
                  </FieldGroup>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
