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
import { Separator } from "@workspace/ui/components/separator";
import { Download, FileText, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { downloadBase64File } from "@/lib/download-file";
import { trpc } from "@/lib/trpc";
import {
  big,
  fmt,
  fmtDate,
  MutationError,
  statusLabel,
} from "./year-end-tax-shared";

export function PreviewCard({
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
