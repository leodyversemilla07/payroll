"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { useWorkspaceUser } from "@/components/user-context";
import { trpc } from "@/lib/trpc";
import { MutationError, useInvalidateEvidence } from "./year-end-tax-shared";

export function TaxCorrectionQueue({ taxYear }: { taxYear: number }) {
  const pending = trpc.compliance.listTaxCorrections.useQuery(
    { taxYear },
    { retry: false },
  );
  const { user } = useWorkspaceUser();
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
        <Empty className="py-6 border rounded-lg">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>No pending corrections.</EmptyTitle>
            <EmptyDescription>
              All filed tax adjustment and reconciliation requests have been
              reviewed.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
