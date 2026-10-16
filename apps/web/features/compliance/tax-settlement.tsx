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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { type FormEvent, useState } from "react";
import { trpc } from "@/lib/trpc";
import { CorrectionFields } from "./tax-evidence-forms";
import {
  type EvidenceData,
  fmt,
  MutationError,
  statusLabel,
  useInvalidateEvidence,
} from "./year-end-tax-shared";

export function SettlementForms({
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
