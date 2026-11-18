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
import type { ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { SourceDocuments } from "./source-documents";
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
          <WorkflowSection
            title="Source documents"
            description="Attach supporting BIR forms, receipts, or settlement proof."
            status={
              evidence.data.declaration ||
              evidence.data.previousEmployers.length > 0 ||
              evidence.data.monthlyRemittances.length > 0 ||
              evidence.data.settlement
                ? "Evidence attachments"
                : "Available after evidence"
            }
            open={Boolean(
              evidence.data.declaration ||
                evidence.data.previousEmployers.length > 0 ||
                evidence.data.monthlyRemittances.length > 0 ||
                evidence.data.settlement,
            )}
          >
            <SourceDocuments
              employeeId={employee.id}
              evidence={evidence.data}
            />
          </WorkflowSection>
          <WorkflowSection
            title="Prior-employer declaration"
            description="Record whether the employee had another employer this year."
            status={evidence.data.declaration ? "Recorded" : "Needs attention"}
            open={!evidence.data.declaration}
          >
            <DeclarationForms
              employeeId={employee.id}
              taxYear={taxYear}
              current={evidence.data.declaration}
            />
          </WorkflowSection>
          <WorkflowSection
            title="Previous-employer income"
            description="Transcribe prior-employer compensation and withholding."
            status={`${evidence.data.previousEmployers.length} recorded`}
          >
            <PreviousIncomeForms
              employeeId={employee.id}
              taxYear={taxYear}
              records={evidence.data.previousEmployers}
            />
          </WorkflowSection>
          <WorkflowSection
            title="Monthly tax remittance"
            description="Record monthly remittance references for reconciliation."
            status={`${evidence.data.monthlyRemittances.length} recorded`}
          >
            <RemittanceForms
              taxYear={taxYear}
              records={evidence.data.monthlyRemittances}
            />
          </WorkflowSection>
          <WorkflowSection
            title="2316 worksheet preview"
            description="Review the internal calculation before settlement or issuance."
            status="Preview"
          >
            <PreviewCard employeeId={employee.id} taxYear={taxYear} />
          </WorkflowSection>
          <WorkflowSection
            title="Year-end settlement"
            description="Post the deficiency withheld or refund actually paid."
            status={evidence.data.settlement ? "Posted" : "Not posted"}
          >
            <SettlementForms
              employeeId={employee.id}
              taxYear={taxYear}
              settlement={evidence.data.settlement}
            />
          </WorkflowSection>
        </>
      )}
    </div>
  );
}

function WorkflowSection({
  title,
  description,
  status,
  open = false,
  children,
}: {
  title: string;
  description: string;
  status: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={open}
      className="group rounded-xl border border-border bg-muted/5"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-semibold">{title}</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            {description}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground group-open:bg-primary/10 group-open:text-primary">
          {status}
        </span>
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
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
