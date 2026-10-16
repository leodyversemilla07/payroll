"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Separator } from "@workspace/ui/components/separator";
import { FileText, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  DeclarationForms,
  PreviousIncomeForms,
  RemittanceForms,
} from "./tax-evidence-forms";
import { PreviewCard } from "./tax-preview";
import { SettlementForms } from "./tax-settlement";
import {
  type EvidenceData,
  fmt,
  fmtDate,
  statusLabel,
  type YearEndEmployeeOption,
} from "./year-end-tax-shared";

export function EmployeeTaxDetail({
  employee,
  taxYear,
}: {
  employee: YearEndEmployeeOption;
  taxYear: number;
}) {
  const evidence = trpc.compliance.getTaxEvidence.useQuery(
    { employeeId: employee.id, taxYear },
    { retry: false },
  );

  return (
    <div className="space-y-6">
      <Separator />
      <h3 className="text-lg font-semibold">
        {employee.firstName} {employee.lastName} · {taxYear}
      </h3>
      {evidence.isPending ? (
        <div
          role="status"
          className="flex items-center gap-2 py-3 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin text-primary shrink-0" />
          <span>Loading tax evidence…</span>
        </div>
      ) : evidence.isError ? (
        <p role="alert">
          Could not load tax evidence.{" "}
          <Button
            type="button"
            variant="outline"
            onClick={() => void evidence.refetch()}
          >
            Retry
          </Button>
        </p>
      ) : !evidence.data ? (
        <Empty className="py-6 border rounded-lg">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>No tax evidence found.</EmptyTitle>
            <EmptyDescription>
              Previous employer BIR 2316 forms and remittance receipts have not
              been submitted for this tax year.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <EvidenceSummary evidence={evidence.data} />
          <DeclarationForms
            employeeId={employee.id}
            taxYear={taxYear}
            current={evidence.data.declaration}
          />
          <PreviousIncomeForms
            employeeId={employee.id}
            taxYear={taxYear}
            records={evidence.data.previousEmployers}
          />
          <RemittanceForms
            taxYear={taxYear}
            records={evidence.data.monthlyRemittances}
          />
          <PreviewCard employeeId={employee.id} taxYear={taxYear} />
          <SettlementForms
            employeeId={employee.id}
            taxYear={taxYear}
            settlement={evidence.data.settlement}
          />
        </>
      )}
    </div>
  );
}
function EvidenceSummary({ evidence }: { evidence: EvidenceData }) {
  return (
    <div className="rounded-xl border border-border p-4 text-sm">
      <h4 className="mb-2 font-semibold">Recorded evidence</h4>
      <p>
        Prior-employer declaration:{" "}
        {evidence.declaration
          ? `${evidence.declaration.hasPriorEmployer ? "has prior employer" : "no prior employer"} · ${evidence.declaration.sourceReference}`
          : "missing"}
      </p>
      <p>Previous-employer documents: {evidence.previousEmployers.length}</p>
      <ul className="ml-4 list-disc">
        {evidence.previousEmployers.map((record) => (
          <li key={record.id}>
            {record.employerName} · {fmtDate(record.periodStart)} –{" "}
            {fmtDate(record.periodEnd)} · taxable{" "}
            {fmt(record.taxableCompensationCents)} · withheld{" "}
            {fmt(record.taxWithheldCents)}
          </li>
        ))}
      </ul>
      <p>Monthly remittance references: {evidence.monthlyRemittances.length}</p>
      <p>
        Settlement:{" "}
        {evidence.settlement
          ? `${statusLabel(evidence.settlement.settlementType)} ${fmt(evidence.settlement.settledCents)}`
          : "none"}
      </p>
      <p className="mt-1 text-muted-foreground">
        All references are self-reported and unverified.
      </p>
    </div>
  );
}
