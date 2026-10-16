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
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { type FormEvent, useState } from "react";
import { manilaIsoDate } from "@/lib/attendance-time";
import { trpc } from "@/lib/trpc";
import {
  type EvidenceData,
  fmt,
  MutationError,
  toCentsString,
  useInvalidateEvidence,
} from "./year-end-tax-shared";

export function DeclarationForms({
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

export function CorrectionFields({
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

export function PreviousIncomeForms({
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
      periodStart: manilaIsoDate(new Date(target.periodStart)),
      periodEnd: manilaIsoDate(new Date(target.periodEnd)),
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

export function RemittanceForms({
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
