"use client";

import { Button, buttonVariants } from "@workspace/ui/components/button";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Calendar, Sparkles } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { usePortalUser } from "@/components/payroll-portal";
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
  const { canTriggerPayroll } = usePortalUser();
  const invalidate = useInvalidateRuns();
  const [sequence, setSequence] = useState("FIRST_CUTOFF");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [payment, setPayment] = useState("");
  const [done, setDone] = useState(false);
  const cutoffAlerts = trpc.payroll.getCutoffAlerts.useQuery(undefined, {
    retry: false,
    enabled: canTriggerPayroll,
  });
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

  if (!canTriggerPayroll) {
    return (
      <Card role="region" aria-label="Process payroll run">
        <CardHeader>
          <CardTitle>Maker-Checker Separation of Duties</CardTitle>
          <CardDescription>
            Payroll calculation triggering is limited to Payroll Specialists and
            Super Admins.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            In accordance with Philippine statutory audit standards and
            maker-checker separation of duties, HR administrators review and
            approve payroll runs rather than initiating calculation execution.
          </p>
          <div className="pt-2">
            <Link
              href="/portal/payroll-runs"
              className={buttonVariants({ variant: "default" })}
            >
              Review Payroll Runs
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

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
    <div className="space-y-6">
      {cutoffAlerts.data && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="size-5 text-primary" />
                <CardTitle className="text-base">
                  Automated Cutoff Scheduler & Readiness
                </CardTitle>
              </div>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  cutoffAlerts.data.cutoff.isApproachingDeadline
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                }`}
              >
                {cutoffAlerts.data.cutoff.daysRemaining === 0
                  ? "Cutoff Closes Today"
                  : `${cutoffAlerts.data.cutoff.daysRemaining} days remaining`}
              </span>
            </div>
            <CardDescription>
              {cutoffAlerts.data.cutoff.sequence.replace("_", " ")}:{" "}
              {cutoffAlerts.data.cutoff.startDate} to{" "}
              {cutoffAlerts.data.cutoff.endDate} · Target Payment:{" "}
              {cutoffAlerts.data.cutoff.paymentDateTarget}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded border bg-background/80 p-2">
                <div className="text-muted-foreground">Active Staff</div>
                <div className="font-semibold text-sm">
                  {cutoffAlerts.data.attendanceSummary.totalActiveEmployees}
                </div>
              </div>
              <div className="rounded border bg-background/80 p-2">
                <div className="text-muted-foreground">Punches with Issues</div>
                <div className="font-semibold text-sm text-amber-600 dark:text-amber-400">
                  {cutoffAlerts.data.attendanceSummary.employeesWithAnomalies}
                </div>
              </div>
              <div className="rounded border bg-background/80 p-2">
                <div className="text-muted-foreground">Pending Leaves</div>
                <div className="font-semibold text-sm text-blue-600 dark:text-blue-400">
                  {cutoffAlerts.data.attendanceSummary.pendingLeaveRequests}
                </div>
              </div>
              <div className="rounded border bg-background/80 p-2">
                <div className="text-muted-foreground">Payroll Readiness</div>
                <div className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                  {cutoffAlerts.data.readinessPercentage}%
                </div>
              </div>
            </div>

            {cutoffAlerts.data.alerts.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground border-t pt-2">
                {cutoffAlerts.data.alerts.map((alert) => (
                  <li key={alert} className="flex items-start gap-1.5">
                    <span className="text-primary font-bold">•</span>
                    <span>{alert}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  if (!cutoffAlerts.data) return;
                  setSequence(cutoffAlerts.data.cutoff.sequence);
                  setStart(cutoffAlerts.data.cutoff.startDate);
                  setEnd(cutoffAlerts.data.cutoff.endDate);
                  setPayment(cutoffAlerts.data.cutoff.paymentDateTarget);
                }}
              >
                <Sparkles className="size-3.5 mr-1 text-primary" />
                Auto-fill Current Cutoff Dates
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card role="region" aria-label="Process payroll run">
          <CardHeader>
            <CardTitle>Process payroll run</CardTitle>
            <CardDescription>
              Runs a first- or second-cutoff calculation. Triggering is limited
              to payroll specialists and super admins.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="run-cutoff">Cutoff</FieldLabel>
                  <Select
                    items={[
                      { value: "FIRST_CUTOFF", label: "First cutoff" },
                      { value: "SECOND_CUTOFF", label: "Second cutoff" },
                    ]}
                    value={sequence}
                    onValueChange={(val) => {
                      if (val) setSequence(val);
                    }}
                  >
                    <SelectTrigger id="run-cutoff" className="w-full">
                      <SelectValue placeholder="Select cutoff" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="FIRST_CUTOFF">
                          First cutoff
                        </SelectItem>
                        <SelectItem value="SECOND_CUTOFF">
                          Second cutoff
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
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
                {done && (
                  <p role="status">
                    Run processed.{" "}
                    <Link
                      href="/portal/payroll-runs"
                      className="text-primary underline"
                    >
                      Review payroll runs
                    </Link>
                  </p>
                )}
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
                    onChange={(event) =>
                      setMonthStart(event.currentTarget.value)
                    }
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
                {monthDone && (
                  <p role="status">
                    13th-month run processed.{" "}
                    <Link
                      href="/portal/payroll-runs"
                      className="text-primary underline"
                    >
                      Review payroll runs
                    </Link>
                  </p>
                )}
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
  const { canApprovePayroll } = usePortalUser();
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
        {status === "AUDITED" &&
          (canApprovePayroll ? (
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
          ) : (
            <p className="self-center text-sm text-muted-foreground italic">
              Awaiting approval from an HR Admin or Super Admin.
            </p>
          ))}
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
        <p className="text-sm text-muted-foreground">
          Maker-checker: the approver must differ from the user who processed
          this run.
        </p>
      )}
      {status === "DISBURSED" && (
        <p className="text-sm text-muted-foreground">
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
