"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { Archive, Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { downloadBase64File } from "@/lib/download-file";
import { trpc } from "@/lib/trpc";
import { RunLifecycleActions } from "./payroll-run-actions";

function pesos(cents: bigint | number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(cents) / 100);
}

function date(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(new Date(value));
}

export function PayrollRunsSection() {
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<string | null>(null);
  const [pdfStatusMessage, setPdfStatusMessage] = useState<string | null>(null);
  const [downloadingSlipId, setDownloadingSlipId] = useState<string | null>(
    null,
  );

  const utils = trpc.useUtils();
  const runs = trpc.payroll.listRuns.useQuery(undefined, { retry: false });
  const details = trpc.payroll.getRunDetails.useQuery(
    { runId: selectedRun ?? "" },
    { enabled: !!selectedRun, retry: false },
  );
  const slip = details.data?.payslips.find(
    (entry) => entry.id === selectedSlip,
  );

  const generateRunPdfs = trpc.payroll.generateRunPdfs.useMutation({
    onSuccess: (data) => {
      setPdfStatusMessage(
        `Successfully generated ${data.generated} of ${data.total} payslip PDFs.`,
      );
      setTimeout(() => setPdfStatusMessage(null), 5000);
    },
  });

  const downloadRunZip = trpc.payroll.downloadRunZip.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.dataBase64, data.fileName, "application/zip");
    },
  });

  const handleDownloadSinglePdf = async (payslipId: string) => {
    setDownloadingSlipId(payslipId);
    try {
      const data = await utils.payroll.downloadPayslip.fetch({ payslipId });
      downloadBase64File(data.dataBase64, data.fileName, "application/pdf");
    } finally {
      setDownloadingSlipId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card role="region" aria-label="Payroll runs">
        <CardHeader>
          <CardTitle>Payroll runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.isPending ? (
            <div role="status" className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                <span>Loading payroll runs…</span>
              </div>
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border p-3.5 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3.5 w-72 max-w-full" />
                  </div>
                ))}
              </div>
            </div>
          ) : runs.isError ? (
            <p role="alert">
              Could not load payroll runs.{" "}
              <Button
                type="button"
                variant="outline"
                onClick={() => void runs.refetch()}
              >
                Retry
              </Button>
            </p>
          ) : runs.data.length === 0 ? (
            <Empty className="my-6 rounded-2xl border border-dashed border-border/80 p-12">
              <EmptyMedia variant="icon">
                <FileText className="size-5 text-muted-foreground" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No payroll runs found</EmptyTitle>
                <EmptyDescription>
                  No payroll runs found. Trigger a new payroll run from the
                  Process Payroll workspace.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="space-y-2">
              {runs.data.map((run) => (
                <li key={run.id}>
                  <Button
                    type="button"
                    aria-pressed={selectedRun === run.id}
                    variant={selectedRun === run.id ? "secondary" : "outline"}
                    className="h-auto w-full flex-col items-start whitespace-normal p-3.5 text-left transition-all"
                    onClick={() => {
                      setSelectedRun(run.id);
                      setSelectedSlip(null);
                    }}
                  >
                    <div className="flex w-full flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm font-semibold text-foreground">
                        {date(run.paymentDate)}
                      </strong>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                          run.status === "DISBURSED" ||
                            run.status === "APPROVED"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : run.status === "AUDITED"
                              ? "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                              : "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300",
                        )}
                      >
                        {run.status}
                      </span>
                    </div>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {run.cutoffSequence.replaceAll("_", " ")} ·{" "}
                      {run._count.payslips} payslips ·{" "}
                      <span className="font-semibold text-foreground">
                        {pesos(run.totalNetCents)} net
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {selectedRun && (
        <Card role="region" aria-label="Run details">
          <CardHeader>
            <CardTitle>Run details</CardTitle>
          </CardHeader>
          <CardContent>
            {details.isPending ? (
              <div role="status" className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                  <span>Loading payslips…</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="rounded-lg border p-3 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  ))}
                </div>
              </div>
            ) : details.isError ? (
              <p role="alert">
                Could not load payslips.{" "}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void details.refetch()}
                >
                  Retry
                </Button>
              </p>
            ) : !details.data ? (
              <p>Run not found.</p>
            ) : (
              <>
                <p className="mb-4 text-muted-foreground">
                  {date(details.data.cutoffStartDate)} –{" "}
                  {date(details.data.cutoffEndDate)} · {details.data.status} ·
                  Gross {pesos(details.data.totalGrossCents)} · Net{" "}
                  {pesos(details.data.totalNetCents)}
                </p>
                <RunLifecycleActions
                  runId={details.data.id}
                  status={details.data.status}
                  clearSelection={() => {
                    setSelectedRun(null);
                    setSelectedSlip(null);
                  }}
                />
                <div className="my-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-3">
                  <span className="mr-2 text-xs font-semibold uppercase text-muted-foreground">
                    PDF Documents:
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!details.data?.id) return;
                      setPdfStatusMessage(null);
                      generateRunPdfs.mutate({ runId: details.data.id });
                    }}
                    disabled={generateRunPdfs.isPending}
                  >
                    {generateRunPdfs.isPending ? (
                      <>
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        Generating PDFs…
                      </>
                    ) : (
                      <>
                        <FileText className="mr-1.5 size-3.5" />
                        Generate All PDFs
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!details.data?.id) return;
                      downloadRunZip.mutate({ runId: details.data.id });
                    }}
                    disabled={
                      downloadRunZip.isPending ||
                      details.data.payslips.length === 0
                    }
                  >
                    {downloadRunZip.isPending ? (
                      <>
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        Packaging ZIP…
                      </>
                    ) : (
                      <>
                        <Archive className="mr-1.5 size-3.5" />
                        Download All (ZIP)
                      </>
                    )}
                  </Button>
                  {pdfStatusMessage && (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {pdfStatusMessage}
                    </span>
                  )}
                  {generateRunPdfs.isError && (
                    <span className="text-xs font-medium text-destructive">
                      {generateRunPdfs.error.message ||
                        "Failed to generate PDFs."}
                    </span>
                  )}
                  {downloadRunZip.isError && (
                    <span className="text-xs font-medium text-destructive">
                      {downloadRunZip.error.message ||
                        "Failed to download ZIP archive."}
                    </span>
                  )}
                </div>
                {details.data.payslips.length === 0 ? (
                  <Empty className="my-4 rounded-xl border border-dashed border-border/80 p-8">
                    <EmptyMedia variant="icon">
                      <FileText className="size-5 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyHeader>
                      <EmptyTitle>No payslips in this run</EmptyTitle>
                      <EmptyDescription>
                        No employee payslips were generated for this cutoff run.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <ul className="space-y-2">
                    {details.data.payslips.map((entry) => (
                      <li key={entry.id}>
                        <Button
                          type="button"
                          aria-pressed={selectedSlip === entry.id}
                          variant="outline"
                          className="h-auto w-full flex-col items-start whitespace-normal p-3 text-left"
                          onClick={() => setSelectedSlip(entry.id)}
                        >
                          <span className="max-w-full break-words">
                            {entry.employee.firstName} {entry.employee.lastName}{" "}
                            · {entry.employee.employeeNumber}
                          </span>
                          <span className="max-w-full break-words text-muted-foreground">
                            — {pesos(entry.netPayCents)} net
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {slip && (
                  <article
                    className="mt-6 rounded-lg border p-4"
                    aria-label="Payslip detail"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold">
                        Payslip · {slip.employee.firstName}{" "}
                        {slip.employee.lastName}
                      </h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadSinglePdf(slip.id)}
                        disabled={downloadingSlipId === slip.id}
                      >
                        {downloadingSlipId === slip.id ? (
                          <>
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                            Downloading…
                          </>
                        ) : (
                          <>
                            <Download className="mr-1.5 size-3.5" />
                            Download Payslip PDF
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="mb-2 text-sm text-muted-foreground">
                      Amounts in Philippine pesos. Password encrypted with
                      employee DOB (MMDDYYYY).
                    </p>
                    <Separator className="mb-4" />
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      {(
                        [
                          ["Basic pay", slip.basicPayCents],
                          [
                            "Paid leave (included in basic)",
                            slip.paidLeavePayCents,
                          ],
                          ["Overtime", slip.overtimePayCents],
                          ["Night differential", slip.nightDiffPayCents],
                          ["Holiday pay", slip.holidayPayCents],
                          ["Rest day pay", slip.restDayPayCents],
                          ["Taxable allowances", slip.taxableAllowancesCents],
                          [
                            "Non-taxable allowances",
                            slip.nonTaxableAllowancesCents,
                          ],
                          [
                            "13th month/bonus payout (included in gross)",
                            slip.bonusPaidCents,
                          ],
                          ["Gross pay", slip.grossPayCents],
                          ["Tardiness", slip.tardinessDeductionCents],
                          ["Undertime", slip.undertimeDeductionCents],
                          ["Absence", slip.absenceDeductionCents],
                          ["SSS (including WISP)", slip.sssEmployeeCents],
                          [
                            "WISP (included in SSS above)",
                            slip.sssWispEmployeeCents,
                          ],
                          ["PhilHealth", slip.philhealthEmployeeCents],
                          ["Pag-IBIG", slip.pagibigEmployeeCents],
                          ["Withholding tax", slip.withholdingTaxCents],
                          ["Loans", slip.loanDeductionsCents],
                          ["Other deductions", slip.otherDeductionsCents],
                          ["Total deductions", slip.totalDeductionsCents],
                          ["Net pay", slip.netPayCents],
                        ] as const
                      ).map(([label, amount]) => (
                        <div key={label} className="contents">
                          <dt>{label}</dt>
                          <dd className="text-right font-medium">
                            {pesos(amount)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
