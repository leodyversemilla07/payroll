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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import type { FormEvent } from "react";
import { trpc } from "@/lib/trpc";

type Leave = inferRouterOutputs<AppRouter>["leaves"]["listRequests"][number];
export function LeaveCancellationForm({
  request,
  onBusy,
  onClose,
  onDone,
}: {
  request: Leave;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const withdraw = trpc.leaves.withdraw.useMutation({
    onMutate: () => onBusy(true),
    onSettled: () => onBusy(false),
    onSuccess: onDone,
  });
  const cancel = trpc.leaves.cancelApproved.useMutation({
    onMutate: () => onBusy(true),
    onSettled: () => onBusy(false),
    onSuccess: onDone,
  });
  const pending = withdraw.isPending || cancel.isPending;
  const isWithdrawal = request.status === "PENDING";
  const error = withdraw.error ?? cancel.error;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const input = {
      requestId: request.id,
      reason: String(
        new FormData(event.currentTarget).get("reason") ?? "",
      ).trim(),
    };
    if (isWithdrawal) withdraw.mutate(input);
    else cancel.mutate(input);
  }
  return (
    <Card size="sm" role="region" aria-label="Leave cancellation">
      <CardHeader>
        <CardTitle role="heading" aria-level={3}>
          {isWithdrawal ? "Withdraw pending leave" : "Reverse approved leave"}
        </CardTitle>
        <CardDescription>
          {new Date(request.startDate).toISOString().slice(0, 10)} to{" "}
          {new Date(request.endDate).toISOString().slice(0, 10)} ·{" "}
          {request.daysCount} day(s) · {request.isPaid ? "Paid" : "Unpaid"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <p className="break-words">Request reason: {request.reason}</p>
            <p>
              {isWithdrawal
                ? "Withdrawal applies only while the request is pending and never changes leave credits. If another user approves it first, withdrawal is blocked."
                : "Approved cancellation requires HR/admin review and dates outside every non-cancelled regular payroll cutoff. Paid credits can be restored only against the original recorded debit, once. Legacy or inconsistent debits require manual reconciliation."}
            </p>
            <p className="text-sm text-muted-foreground">
              Cancellation preserves approval history, does not rewrite payslips
              or change DTRs, and does not infer worked time or absence.
              Reconcile attendance before future payroll.
            </p>
            <Field>
              <FieldLabel htmlFor="leave-cancellation-reason">
                Cancellation reason
              </FieldLabel>
              <Input
                id="leave-cancellation-reason"
                name="reason"
                minLength={10}
                maxLength={500}
                disabled={pending}
                required
              />
              <FieldDescription>
                10–500 characters. The reason, actor and any credit restoration
                are audited atomically. Drafts are not stored in the browser.
              </FieldDescription>
            </Field>
            {error && (
              <FieldError>
                {[
                  "CONFLICT",
                  "NOT_FOUND",
                  "FORBIDDEN",
                  "UNPROCESSABLE_CONTENT",
                ].includes(error.data?.code ?? "")
                  ? error.message
                  : "Could not cancel leave. Your reason has been kept; retry if the outcome is uncertain."}
              </FieldError>
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Cancelling leave…"
                  : isWithdrawal
                    ? "Confirm withdrawal"
                    : "Confirm approved reversal"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onClose}
              >
                {error?.data?.code === "CONFLICT"
                  ? "Close and reload requests"
                  : "Close cancellation"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
