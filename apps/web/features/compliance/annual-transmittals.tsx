"use client";

import { Button } from "@workspace/ui/components/button";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Download, FileText, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { downloadTextFile } from "@/lib/download-file";
import { trpc } from "@/lib/trpc";
import { fmt, MutationError } from "./year-end-tax-shared";

export function AnnualComplianceTransmittals({ taxYear }: { taxYear: number }) {
  const [alphalistResult, setAlphalistResult] = useState<{
    summary: {
      totalEmployees: number;
      schedule71Count: number;
      schedule72Count: number;
      totalGrossCompensationCents: bigint | string | number;
      totalNonTaxableCents: bigint | string | number;
      totalTaxableCents: bigint | string | number;
      totalTaxDueCents: bigint | string | number;
      totalTaxWithheldCents: bigint | string | number;
      totalRefundCents: bigint | string | number;
      totalPayableCents: bigint | string | number;
    };
    filenameDat: string;
    contentDat: string;
    filenameCsv: string;
    contentCsv: string;
  } | null>(null);

  const export1604C = trpc.compliance.exportBir1604CAlphalist.useMutation({
    onSuccess: (data) => {
      setAlphalistResult(data as never);
    },
  });

  const [doleOpen, setDoleOpen] = useState(false);
  const [natureOfBusiness, setNatureOfBusiness] = useState(
    "Information Technology & Services",
  );
  const [contactPerson, setContactPerson] = useState("");
  const [contactNumber, setContactNumber] = useState("+63 2 8123 4567");
  const [contactTitle, setContactTitle] = useState("HR Director");
  const [doleNotice, setDoleNotice] = useState<string | null>(null);

  const exportDole = trpc.compliance.exportDole13thMonth.useMutation({
    onSuccess: (data) => {
      downloadTextFile(data.reportText, data.filename);
      setDoleNotice(
        `Generated DOLE report for ${data.batchResult.totalBenefitedEmployees} benefited employees. Download started automatically.`,
      );
    },
  });

  function handleExport1604C() {
    export1604C.mutate({ taxYear });
  }

  function handleExportDole(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDoleNotice(null);
    exportDole.mutate({
      taxYear,
      natureOfBusiness,
      contactPerson,
      contactNumber,
      contactTitle,
    });
  }

  return (
    <section
      aria-label="Statutory transmittal exports"
      className="space-y-4 rounded-xl border border-border p-4"
    >
      <div>
        <h3 className="font-semibold text-base">
          Government Transmittal Exports
        </h3>
        <p className="text-sm text-muted-foreground">
          Official statutory transmittals for tax year {taxYear}: BIR Form
          1604-C eFPS Alphalist (.DAT & CSV) and DOLE 13th-Month Pay compliance
          reports.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* BIR Form 1604-C Card */}
        <div className="flex flex-col justify-between rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
          <div>
            <h4 className="font-medium text-sm flex items-center gap-1.5">
              <FileText className="size-4 text-primary" />
              BIR Form 1604-C & Alphalist
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Generates the official Schedule 7.1 (Regular) and Schedule 7.2
              (Minimum Wage) Alphalist. Download the eFPS .DAT transmittal and
              multi-schedule audit CSV.
            </p>
          </div>

          <MutationError error={export1604C.error} />

          {alphalistResult && (
            <div className="rounded border bg-background p-2.5 text-xs space-y-1">
              <p className="font-medium">
                Alphalist Ready: {alphalistResult.summary.totalEmployees}{" "}
                employees ({alphalistResult.summary.schedule71Count} Regular,{" "}
                {alphalistResult.summary.schedule72Count} MWE)
              </p>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                <span>
                  Gross:{" "}
                  {fmt(alphalistResult.summary.totalGrossCompensationCents)}
                </span>
                <span>
                  Taxable: {fmt(alphalistResult.summary.totalTaxableCents)}
                </span>
                <span>
                  Tax Due: {fmt(alphalistResult.summary.totalTaxDueCents)}
                </span>
                <span>
                  Withheld: {fmt(alphalistResult.summary.totalTaxWithheldCents)}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={export1604C.isPending}
              onClick={handleExport1604C}
            >
              {export1604C.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Generating…
                </>
              ) : (
                "Generate 1604-C Alphalist"
              )}
            </Button>

            {alphalistResult && (
              <>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() =>
                    downloadTextFile(
                      alphalistResult.contentDat,
                      alphalistResult.filenameDat,
                    )
                  }
                >
                  <Download className="size-3.5 mr-1" />
                  eFPS .DAT
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadTextFile(
                      alphalistResult.contentCsv,
                      alphalistResult.filenameCsv,
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  <Download className="size-3.5 mr-1" />
                  Audit CSV
                </Button>
              </>
            )}
          </div>
        </div>

        {/* DOLE 13th Month Card */}
        <div className="flex flex-col justify-between rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
          <div>
            <h4 className="font-medium text-sm flex items-center gap-1.5">
              <FileText className="size-4 text-primary" />
              DOLE 13th-Month Pay Compliance
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Conforms to DOLE Bureau of Working Conditions (BWC) compliance
              report requirements under Presidential Decree No. 851.
            </p>
          </div>

          {doleNotice && (
            <p
              role="status"
              className="rounded border bg-background p-2 text-xs font-medium text-emerald-700 dark:text-emerald-400"
            >
              {doleNotice}
            </p>
          )}

          <MutationError error={exportDole.error} />

          {!doleOpen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDoleOpen(true)}
            >
              Configure & Export DOLE Report
            </Button>
          ) : (
            <form onSubmit={handleExportDole} className="space-y-2 text-xs">
              <Field>
                <FieldLabel htmlFor="dole-nature" className="text-xs">
                  Industry / Nature of Business
                </FieldLabel>
                <Input
                  id="dole-nature"
                  className="h-8 text-xs"
                  value={natureOfBusiness}
                  onChange={(e) => setNatureOfBusiness(e.target.value)}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field>
                  <FieldLabel htmlFor="dole-person" className="text-xs">
                    Contact Person
                  </FieldLabel>
                  <Input
                    id="dole-person"
                    className="h-8 text-xs"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="dole-number" className="text-xs">
                    Contact Number
                  </FieldLabel>
                  <Input
                    id="dole-number"
                    className="h-8 text-xs"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="dole-title" className="text-xs">
                  Position / Title
                </FieldLabel>
                <Input
                  id="dole-title"
                  className="h-8 text-xs"
                  value={contactTitle}
                  onChange={(e) => setContactTitle(e.target.value)}
                  required
                />
              </Field>
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={exportDole.isPending}>
                  {exportDole.isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                      Downloading…
                    </>
                  ) : (
                    "Download DOLE Report (.txt)"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDoleOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
