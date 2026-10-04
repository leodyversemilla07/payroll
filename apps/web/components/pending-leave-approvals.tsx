"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(new Date(value));
}

export function PendingLeaveApprovalsSection() {
  const utils = trpc.useUtils();
  const pending = trpc.leaves.listPendingRequests.useQuery(undefined, {
    retry: false,
  });

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const approve = trpc.leaves.approve.useMutation({
    onSuccess: () => {
      setActionError(null);
      void utils.leaves.listPendingRequests.invalidate();
      void utils.leaves.listRequests.invalidate();
      void utils.leaves.getBalances.invalidate();
      void utils.dashboard.getOverview.invalidate();
    },
    onError: (err) => {
      setActionError(err.message || "Failed to approve leave request.");
    },
  });

  const reject = trpc.leaves.reject.useMutation({
    onSuccess: () => {
      setRejectingId(null);
      setRejectReason("");
      setRejectError(null);
      setActionError(null);
      void utils.leaves.listPendingRequests.invalidate();
      void utils.leaves.listRequests.invalidate();
      void utils.leaves.getBalances.invalidate();
      void utils.dashboard.getOverview.invalidate();
    },
    onError: (err) => {
      setRejectError(err.message || "Failed to reject leave request.");
    },
  });

  const handleApprove = (requestId: string) => {
    setActionError(null);
    approve.mutate({ requestId });
  };

  const handleRejectSubmit = (e: React.FormEvent, requestId: string) => {
    e.preventDefault();
    if (rejectReason.trim().length < 10) {
      setRejectError("Rejection reason must be at least 10 characters.");
      return;
    }
    setRejectError(null);
    reject.mutate({ requestId, rejectionReason: rejectReason.trim() });
  };

  const pendingList = pending.data ?? [];

  return (
    <Card role="region" aria-label="Pending leave approvals">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-5 text-amber-600 dark:text-amber-400" />
              Pending Leave Approvals
            </CardTitle>
            <CardDescription>
              Review and decide on pending leave requests from your department
              or organization.
            </CardDescription>
          </div>
          {pendingList.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {pendingList.length} pending
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {actionError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {actionError}
          </p>
        )}

        {pending.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading pending leave requests…
          </p>
        ) : pending.isError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              Could not load pending requests.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void pending.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : pendingList.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No pending leave requests awaiting approval.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {pendingList.map((request) => (
              <div key={request.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {request.employee.firstName} {request.employee.lastName}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        ({request.employee.employeeNumber})
                      </span>
                      {request.employee.department && (
                        <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {request.employee.department.name}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {request.leaveType.replaceAll("_", " ")}
                      </span>
                      <span>·</span>
                      <span>
                        {formatDate(request.startDate)} to{" "}
                        {formatDate(request.endDate)}
                      </span>
                      <span>·</span>
                      <span className="font-semibold">
                        {request.daysCount}{" "}
                        {Number(request.daysCount) === 1 ? "day" : "days"}
                      </span>
                      <span>·</span>
                      <span
                        className={
                          request.isPaid
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-amber-700 dark:text-amber-400"
                        }
                      >
                        {request.isPaid ? "Paid" : "Unpaid"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      disabled={approve.isPending || reject.isPending}
                      onClick={() => handleApprove(request.id)}
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      aria-label={`Approve leave for ${request.employee.firstName} ${request.employee.lastName}`}
                    >
                      <CheckCircle2 className="size-4" />
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={approve.isPending || reject.isPending}
                      onClick={() => {
                        setRejectingId(
                          rejectingId === request.id ? null : request.id,
                        );
                        setRejectReason("");
                        setRejectError(null);
                      }}
                      className="gap-1 text-destructive hover:bg-destructive/10"
                      aria-label={`Reject leave for ${request.employee.firstName} ${request.employee.lastName}`}
                    >
                      <XCircle className="size-4" />
                      Reject
                    </Button>
                  </div>
                </div>

                <div className="rounded bg-muted/50 p-2 text-sm">
                  <span className="font-medium text-muted-foreground">
                    Reason:{" "}
                  </span>
                  <span className="text-foreground">{request.reason}</span>
                </div>

                {rejectingId === request.id && (
                  <form
                    onSubmit={(e) => handleRejectSubmit(e, request.id)}
                    className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-3"
                  >
                    <Field>
                      <FieldLabel className="text-xs font-medium text-destructive">
                        Reason for Rejection (min 10 characters)
                      </FieldLabel>
                      <Input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="State why this leave request is being rejected…"
                        className="text-sm"
                        autoFocus
                      />
                      {rejectError && <FieldError>{rejectError}</FieldError>}
                    </Field>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                          setRejectError(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        variant="destructive"
                        disabled={reject.isPending}
                      >
                        {reject.isPending ? "Rejecting…" : "Confirm Rejection"}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
