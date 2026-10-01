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
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select";
import { Separator } from "@workspace/ui/components/separator";
import { type FormEvent, useState } from "react";
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
          <p role="status">Loading review queue…</p>
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
                  className="h-auto w-full justify-start whitespace-normal p-3 text-left"
                  onClick={() => setEmployeeId(row.employeeId)}
                >
                  <strong>{row.name}</strong>
                  <span className="block text-sm text-slate-400">
                    {row.employeeNumber} · {statusLabel(row.status)}
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
            <NativeSelect
              id="tax-employee"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.currentTarget.value)}
              className="w-full"
            >
              <NativeSelectOption value="">
                Select an employee
              </NativeSelectOption>
              {employees.map((entry) => (
                <NativeSelectOption key={entry.id} value={entry.id}>
                  {entry.firstName} {entry.lastName} · {entry.employeeNumber}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {selected && taxYearValid && (
          <EmployeeTaxDetail
            key={`${selected.id}:${taxYear}`}
            employee={selected}
            taxYear={taxYear}
          />
        )}
      </CardContent>
    </Card>
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
        <p role="status">Loading tax evidence…</p>
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
    <div className="rounded border border-slate-700 p-4 text-sm">
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
      <p className="mt-1 text-slate-400">
        All references are self-reported and unverified.
      </p>
    </div>
  );
}

function useInvalidateEvidence() {
  const utils = trpc.useUtils();
  return () => {
    void utils.compliance.listYearEndReconciliations.invalidate();
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
  const [reviewerId, setReviewerId] = useState("");
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
      reviewerId,
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
                    reviewerId={reviewerId}
                    setReviewerId={setReviewerId}
                  />
                  <MutationError error={correct.error} />
                  {correctDone && <p role="status">Correction recorded.</p>}
                  <Field>
                    <Button type="submit" disabled={correct.isPending}>
                      {correct.isPending ? "Recording…" : "Record correction"}
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
  reviewerId,
  setReviewerId,
}: {
  idPrefix: string;
  reason: string;
  setReason: (value: string) => void;
  reviewerId: string;
  setReviewerId: (value: string) => void;
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
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-reviewer`}>
          Reviewer user ID (must differ from you)
        </FieldLabel>
        <Input
          id={`${idPrefix}-reviewer`}
          value={reviewerId}
          onChange={(event) => setReviewerId(event.currentTarget.value)}
          required
        />
        <FieldDescription>
          A second active staff user in your organization reviews the
          correction.
        </FieldDescription>
      </Field>
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
  const [reviewerId, setReviewerId] = useState("");
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
      reviewerId,
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
          <div key={target.id} className="rounded border border-slate-700 p-3">
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
                    reviewerId={reviewerId}
                    setReviewerId={setReviewerId}
                  />
                  <MutationError error={correct.error} />
                  {correctDone && <p role="status">Correction recorded.</p>}
                  <Field>
                    <Button type="submit" disabled={correct.isPending}>
                      {correct.isPending ? "Recording…" : "Record correction"}
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
  const [reviewerId, setReviewerId] = useState("");
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
      reviewerId,
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
          <div key={target.id} className="rounded border border-slate-700 p-3">
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
                    reviewerId={reviewerId}
                    setReviewerId={setReviewerId}
                  />
                  <MutationError error={correct.error} />
                  {correctDone && <p role="status">Correction recorded.</p>}
                  <Field>
                    <Button type="submit" disabled={correct.isPending}>
                      {correct.isPending ? "Recording…" : "Record correction"}
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

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>2316 worksheet preview</CardTitle>
        <CardDescription>
          Internal reconciliation worksheet, not an official BIR Form 2316.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
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
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-slate-700 p-3 text-xs">
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
            <p role="status">Loading issuance…</p>
          ) : issuance && issuance.status === "ISSUED" ? (
            <>
              <p>
                Issued {issuance.issuedAt ? fmtDate(issuance.issuedAt) : "—"} ·
                version {String(issuance.version ?? "?")} · statutory deadline{" "}
                {issuance.statutoryDeadline ?? "—"}
                {issuance.hadPriorEmployer
                  ? " · prior employer on file (no substituted-filing verdict)"
                  : ""}
              </p>
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
  const [reviewerId, setReviewerId] = useState("");
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
      reviewerId,
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
                      reviewerId={reviewerId}
                      setReviewerId={setReviewerId}
                    />
                    <MutationError error={correct.error} />
                    {correctDone && <p role="status">Correction recorded.</p>}
                    <Field>
                      <Button type="submit" disabled={correct.isPending}>
                        {correct.isPending ? "Recording…" : "Record correction"}
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
