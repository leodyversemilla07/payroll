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
  FieldSet,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select";
import { type FormEvent, useState } from "react";
import { trpc } from "@/lib/trpc";

type Balance = inferRouterOutputs<AppRouter>["leaves"]["getBalances"][number];
export function LeaveCreditTools({
  employeeId,
  year,
  balances,
  readFailed,
  canManage,
  disabled,
  onBusy,
  onEditing,
  onRecorded,
}: {
  employeeId: string;
  year: number;
  balances: Balance[] | undefined;
  readFailed: boolean;
  canManage: boolean;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onEditing: (editing: boolean) => void;
  onRecorded: (replayed: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<{ balance: Balance | null } | null>(
    null,
  );
  const [showHistory, setShowHistory] = useState(false);
  const utils = trpc.useUtils();
  function open(balance: Balance | null) {
    setEditor({ balance });
    onEditing(true);
  }
  function close() {
    setEditor(null);
    onEditing(false);
  }
  const selected = balances?.find((balance) => balance.id === selectedId);
  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="space-y-3">
          {!editor && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={disabled || balances === undefined || readFailed}
                onClick={() => open(null)}
              >
                Allocate leave credits
              </Button>
              {!!balances?.length && (
                <Field>
                  <FieldLabel htmlFor="credit-balance">
                    Recorded balance to adjust
                  </FieldLabel>
                  <NativeSelect
                    id="credit-balance"
                    className="w-full"
                    value={selectedId}
                    disabled={disabled}
                    onChange={(event) =>
                      setSelectedId(event.currentTarget.value)
                    }
                  >
                    <NativeSelectOption value="">
                      Select recorded type
                    </NativeSelectOption>
                    {balances.map((balance) => (
                      <NativeSelectOption key={balance.id} value={balance.id}>
                        {balance.leaveType}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled || !selected || readFailed}
                    onClick={() => {
                      if (selected) open(selected);
                    }}
                  >
                    Adjust recorded credits
                  </Button>
                </Field>
              )}
            </>
          )}
          {editor && (
            <CreditEditor
              employeeId={employeeId}
              year={year}
              balance={editor.balance}
              onBusy={onBusy}
              onCancel={close}
              onDiscard={() => {
                close();
                void utils.leaves.getBalances.invalidate();
              }}
              onRecorded={(replayed) => {
                close();
                onRecorded(replayed);
                void utils.leaves.getBalances.invalidate();
                void utils.leaves.listCreditChanges.invalidate();
              }}
            />
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Credit allocation and adjustments require HR/super-admin access and
          another administrator for your own employee balance.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        aria-expanded={showHistory}
        onClick={() => setShowHistory((value) => !value)}
      >
        {showHistory ? "Hide credit change history" : "Credit change history"}
      </Button>
      {showHistory && <CreditHistory employeeId={employeeId} year={year} />}
    </div>
  );
}

function CreditEditor({
  employeeId,
  year,
  balance,
  onBusy,
  onCancel,
  onDiscard,
  onRecorded,
}: {
  employeeId: string;
  year: number;
  balance: Balance | null;
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
  onDiscard: () => void;
  onRecorded: (replayed: boolean) => void;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [totalText, setTotalText] = useState(balance?.totalCredits ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const save = trpc.leaves.setCredits.useMutation({
    onMutate: () => onBusy(true),
    onSettled: () => onBusy(false),
    onSuccess: (result) => onRecorded(result.replayed),
  });
  const total = totalText.trim() ? Number(totalText) : Number.NaN;
  const used = Number(balance?.usedCredits ?? 0);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;
    const fields = new FormData(event.currentTarget);
    const leaveType =
      balance?.leaveType ?? String(fields.get("leaveType") ?? "").trim();
    const sourceReference = String(fields.get("sourceReference") ?? "").trim();
    const reason = String(fields.get("reason") ?? "").trim();
    if (
      !Number.isFinite(total) ||
      total < used ||
      total > 999.5 ||
      !Number.isInteger(total * 2) ||
      !leaveType ||
      sourceReference.length < 3 ||
      reason.length < 10
    ) {
      setValidationError(
        "Enter whole/half-day total credits at least equal to usage, a source reference and a 10–500-character reason.",
      );
      return;
    }
    setValidationError(null);
    save.mutate({
      operationId,
      employeeId,
      year,
      leaveType,
      totalCredits: total,
      expectedRevision: balance?.revision ?? null,
      sourceReference,
      reason,
    });
  }
  const code = save.error?.data?.code;
  const error = save.error
    ? ["CONFLICT", "NOT_FOUND", "FORBIDDEN", "UNPROCESSABLE_CONTENT"].includes(
        code ?? "",
      )
      ? save.error.message
      : code === "BAD_REQUEST"
        ? "Credit details were rejected. Check the amount, source reference and reason."
        : "Could not record leave credits. Your entries have been kept; retry the same operation if its outcome is uncertain."
    : null;
  return (
    <Card size="sm" role="region" aria-label="Leave credit editor">
      <CardHeader>
        <CardTitle role="heading" aria-level={3}>
          {balance
            ? "Adjust recorded leave credits"
            : "Allocate recorded leave credits"}
        </CardTitle>
        <CardDescription>
          {year} · this records a policy/source attestation, not independently
          verified statutory eligibility. No default credits, accrual or
          carryover are inferred. New allocations open with zero recorded usage;
          do not import prior/external usage with this form. Reconcile that
          usage manually first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <FieldSet disabled={save.isPending}>
              <Field>
                <FieldLabel htmlFor="credit-type">Credit leave type</FieldLabel>
                <Input
                  id="credit-type"
                  name="leaveType"
                  defaultValue={balance?.leaveType ?? ""}
                  readOnly={!!balance}
                  pattern={balance ? undefined : "[A-Z][A-Z0-9_]{0,49}"}
                  maxLength={50}
                  required
                />
                <FieldDescription>
                  New types use exact uppercase policy codes, such as SIL or
                  VACATION. Existing types cannot be renamed.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="credit-total">
                  Total credited days
                </FieldLabel>
                <Input
                  id="credit-total"
                  type="number"
                  min={used}
                  max={999.5}
                  step={0.5}
                  value={totalText}
                  onChange={(event) => setTotalText(event.currentTarget.value)}
                  required
                />
                <FieldDescription>
                  Enter the new total entitlement, not an increment. Used
                  credits remain {used}; they cannot be reset or refunded here.
                </FieldDescription>
              </Field>
              {Number.isFinite(total) && (
                <p>
                  Available after save: {total - used} day(s). The server checks
                  the loaded revision before recording.
                </p>
              )}
              <Field>
                <FieldLabel htmlFor="credit-source">
                  Credit source reference
                </FieldLabel>
                <Input
                  id="credit-source"
                  name="sourceReference"
                  minLength={3}
                  maxLength={200}
                  required
                />
                <FieldDescription>
                  Cite the policy/approval/eligibility evidence you reviewed. A
                  reference is not a stored or authenticated source document.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="credit-reason">
                  Credit adjustment reason
                </FieldLabel>
                <Input
                  id="credit-reason"
                  name="reason"
                  minLength={10}
                  maxLength={500}
                  required
                />
              </Field>
              <p className="text-sm text-muted-foreground">
                Review employee eligibility, holidays and company/statutory
                policy before saving. This does not reserve pending requests,
                approve leave, transfer money or rewrite processed payroll.
                Drafts are not stored in the browser.
              </p>
            </FieldSet>
            {validationError && <FieldError>{validationError}</FieldError>}
            {error && <FieldError>{error}</FieldError>}
            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={save.isPending || code === "CONFLICT"}
              >
                {save.isPending ? "Recording credits…" : "Record leave credits"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={onCancel}
              >
                Cancel credit editor
              </Button>
              {code === "CONFLICT" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={onDiscard}
                >
                  Discard draft and reload balances
                </Button>
              )}
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function CreditHistory({
  employeeId,
  year,
}: {
  employeeId: string;
  year: number;
}) {
  const history = trpc.leaves.listCreditChanges.useQuery(
    { employeeId, year },
    { retry: false },
  );
  return (
    <Card size="sm" role="region" aria-label="Leave credit history">
      <CardHeader>
        <CardTitle role="heading" aria-level={3}>
          Recorded credit changes
        </CardTitle>
        <CardDescription>
          Up to 100 latest allocation/adjustment attestations. Approval debits
          and cancellation refunds are audited separately. Legacy balances may
          predate this history; references and recorded amounts are not
          independent verification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {history.isPending ? (
          <p role="status">Loading credit history…</p>
        ) : history.data === undefined ? (
          <p role="alert">
            Could not load credit history.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => void history.refetch()}
            >
              Retry credit history
            </Button>
          </p>
        ) : (
          <>
            {history.isError && (
              <p role="alert">
                Credit history refresh failed; previously loaded changes are
                shown.{" "}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void history.refetch()}
                >
                  Retry credit history
                </Button>
              </p>
            )}
            {history.data.length === 0 ? (
              <p>No credit changes are recorded in this history.</p>
            ) : (
              <ul className="space-y-4">
                {history.data.map((change) => (
                  <li key={change.id} className="space-y-1 break-words">
                    <strong>
                      {change.balance.leaveType} · {change.kind}
                    </strong>
                    <p>
                      Total:{" "}
                      {change.previousTotalCredits ?? "No previous balance"} →{" "}
                      {change.totalCredits} · used at recording:{" "}
                      {change.usedCredits} · available after:{" "}
                      {change.availableBalance}
                    </p>
                    <p className="break-all">
                      Source reference: {change.sourceReference}
                    </p>
                    <p>Reason: {change.reason}</p>
                    <p className="break-all text-sm text-muted-foreground">
                      Actor: {change.actorId} ·{" "}
                      {new Date(change.createdAt).toISOString()} · revision{" "}
                      {change.revision}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
