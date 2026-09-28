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

function MutationError({ error }: { error: { message: string } | null }) {
  if (!error) return null;
  return <p role="alert">{error.message}</p>;
}

function useInvalidateRuns() {
  const utils = trpc.useUtils();
  return () => {
    void utils.payroll.listRuns.invalidate();
    void utils.payroll.getRunDetails.invalidate();
  };
}

export function TriggerRunForms() {
  const invalidate = useInvalidateRuns();
  const [sequence, setSequence] = useState("FIRST_CUTOFF");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [payment, setPayment] = useState("");
  const [done, setDone] = useState(false);
  const trigger = trpc.payroll.triggerRun.useMutation({
    onSuccess: () => {
      setDone(true);
      invalidate();
    },
  });
  const [monthStart, setMonthStart] = useState("");
  const [monthEnd, setMonthEnd] = useState("");
  const [monthPayment, setMonthPayment] = useState("");
  const [monthDone, setMonthDone] = useState(false);
  const triggerThirteenth = trpc.payroll.triggerThirteenthMonthRun.useMutation({
    onSuccess: () => {
      setMonthDone(true);
      invalidate();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    trigger.mutate({
      cutoffStartDate: start,
      cutoffEndDate: end,
      paymentDate: payment,
      cutoffSequence: sequence as "FIRST_CUTOFF" | "SECOND_CUTOFF",
    });
  }

  function submitThirteenth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMonthDone(false);
    triggerThirteenth.mutate({
      cutoffStartDate: monthStart,
      cutoffEndDate: monthEnd,
      paymentDate: monthPayment,
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card role="region" aria-label="Process payroll run">
        <CardHeader>
          <CardTitle>Process payroll run</CardTitle>
          <CardDescription>
            Runs a first- or second-cutoff calculation. Triggering is limited to
            payroll specialists and super admins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="run-cutoff">Cutoff</FieldLabel>
                <select
                  id="run-cutoff"
                  value={sequence}
                  onChange={(event) => setSequence(event.currentTarget.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 p-2"
                >
                  <option value="FIRST_CUTOFF">First cutoff</option>
                  <option value="SECOND_CUTOFF">Second cutoff</option>
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="run-cutoff-start">
                  Regular run cutoff start
                </FieldLabel>
                <Input
                  id="run-cutoff-start"
                  type="date"
                  value={start}
                  onChange={(event) => setStart(event.currentTarget.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="run-cutoff-end">
                  Regular run cutoff end
                </FieldLabel>
                <Input
                  id="run-cutoff-end"
                  type="date"
                  value={end}
                  onChange={(event) => setEnd(event.currentTarget.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="run-payment-date">
                  Regular run payment date
                </FieldLabel>
                <Input
                  id="run-payment-date"
                  type="date"
                  value={payment}
                  onChange={(event) => setPayment(event.currentTarget.value)}
                  required
                />
              </Field>
              <MutationError error={trigger.error} />
              {done && <p role="status">Run processed.</p>}
              <Field>
                <Button type="submit" disabled={trigger.isPending}>
                  {trigger.isPending ? "Processing…" : "Process regular run"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <Card role="region" aria-label="Process 13th-month run">
        <CardHeader>
          <CardTitle>Process 13th-month run</CardTitle>
          <CardDescription>
            Pays additional 13th-month entitlement earned since earlier
            disbursed special runs (true-up only).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitThirteenth}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="month-cutoff-start">
                  13th-month cutoff start
                </FieldLabel>
                <Input
                  id="month-cutoff-start"
                  type="date"
                  value={monthStart}
                  onChange={(event) => setMonthStart(event.currentTarget.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="month-cutoff-end">
                  13th-month cutoff end
                </FieldLabel>
                <Input
                  id="month-cutoff-end"
                  type="date"
                  value={monthEnd}
                  onChange={(event) => setMonthEnd(event.currentTarget.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="month-payment-date">
                  13th-month payment date
                </FieldLabel>
                <Input
                  id="month-payment-date"
                  type="date"
                  value={monthPayment}
                  onChange={(event) =>
                    setMonthPayment(event.currentTarget.value)
                  }
                  required
                />
              </Field>
              <MutationError error={triggerThirteenth.error} />
              {monthDone && <p role="status">13th-month run processed.</p>}
              <Field>
                <Button type="submit" disabled={triggerThirteenth.isPending}>
                  {triggerThirteenth.isPending
                    ? "Processing…"
                    : "Process 13th-month run"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

const CANCELLABLE = ["DRAFT", "PROCESSING", "AUDITED", "APPROVED"];

export function RunLifecycleActions({
  runId,
  status,
  clearSelection,
}: {
  runId: string;
  status: string;
  clearSelection: () => void;
}) {
  const invalidate = useInvalidateRuns();
  const [message, setMessage] = useState<string | null>(null);
  const [armCancel, setArmCancel] = useState(false);
  const approve = trpc.payroll.approveRun.useMutation({
    onSuccess: () => {
      setMessage("Run approved.");
      invalidate();
    },
  });
  const disburse = trpc.payroll.disburseRun.useMutation({
    onSuccess: () => {
      setMessage("Run disbursed.");
      invalidate();
    },
  });
  const cancel = trpc.payroll.cancelRun.useMutation({
    onSuccess: () => {
      setMessage("Run cancelled.");
      setArmCancel(false);
      clearSelection();
      invalidate();
    },
  });

  return (
    <section aria-label="Run lifecycle actions" className="mb-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "AUDITED" && (
          <Button
            type="button"
            disabled={approve.isPending}
            onClick={() => {
              setMessage(null);
              approve.mutate({ runId });
            }}
          >
            {approve.isPending ? "Approving…" : "Approve run"}
          </Button>
        )}
        {status === "APPROVED" && (
          <Button
            type="button"
            disabled={disburse.isPending}
            onClick={() => {
              setMessage(null);
              disburse.mutate({ runId });
            }}
          >
            {disburse.isPending ? "Disbursing…" : "Disburse run"}
          </Button>
        )}
        {CANCELLABLE.includes(status) &&
          (armCancel ? (
            <>
              <Button
                type="button"
                variant="destructive"
                disabled={cancel.isPending}
                onClick={() => {
                  setMessage(null);
                  cancel.mutate({ runId });
                }}
              >
                {cancel.isPending ? "Cancelling…" : "Confirm cancel"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setArmCancel(false)}
              >
                Keep run
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setArmCancel(true)}
            >
              Cancel run
            </Button>
          ))}
      </div>
      {status === "AUDITED" && (
        <p className="text-sm text-slate-400">
          Maker-checker: the approver must differ from the user who processed
          this run.
        </p>
      )}
      {status === "DISBURSED" && (
        <p className="text-sm text-slate-400">
          Disbursed runs cannot be cancelled. Disbursed money cannot be
          un-disbursed through this path.
        </p>
      )}
      <MutationError error={approve.error} />
      <MutationError error={disburse.error} />
      <MutationError error={cancel.error} />
      {message && <p role="status">{message}</p>}
      <FieldDescription>
        Approval is limited to super admins and HR admins; disbursed runs are
        the point of no return for cancellation.
      </FieldDescription>
    </section>
  );
}
