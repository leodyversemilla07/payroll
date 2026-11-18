"use client";

import { Button } from "@workspace/ui/components/button";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { FileCheck2, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { type EvidenceData, MutationError } from "./year-end-tax-shared";

type DocumentTarget = {
  entityType:
    | "PriorEmployerDeclaration"
    | "PreviousEmployerIncome"
    | "MonthlyTaxRemittanceEvidence"
    | "YearEndTaxSettlement";
  entityId: string;
  label: string;
};

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read the selected document."));
        return;
      }
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () =>
      reject(new Error("Could not read the selected document."));
    reader.readAsDataURL(file);
  });
}

export function SourceDocuments({
  employeeId,
  evidence,
}: {
  employeeId: string;
  evidence: EvidenceData;
}) {
  const targets = useMemo<DocumentTarget[]>(() => {
    const result: DocumentTarget[] = [];
    if (evidence.declaration) {
      result.push({
        entityType: "PriorEmployerDeclaration",
        entityId: evidence.declaration.id,
        label: "Prior-employer declaration",
      });
    }
    for (const record of evidence.previousEmployers) {
      result.push({
        entityType: "PreviousEmployerIncome",
        entityId: record.id,
        label: `Previous employer: ${record.employerName}`,
      });
    }
    for (const record of evidence.monthlyRemittances) {
      result.push({
        entityType: "MonthlyTaxRemittanceEvidence",
        entityId: record.id,
        label: `Monthly remittance: ${record.month}`,
      });
    }
    if (evidence.settlement) {
      result.push({
        entityType: "YearEndTaxSettlement",
        entityId: evidence.settlement.id,
        label: "Year-end settlement",
      });
    }
    return result;
  }, [evidence]);
  const [targetKey, setTargetKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const target = targets.find(
    (entry) => `${entry.entityType}:${entry.entityId}` === targetKey,
  );
  const documents = trpc.compliance.listComplianceDocuments.useQuery(
    target
      ? { entityType: target.entityType, entityId: target.entityId }
      : { entityType: "none", entityId: employeeId },
    { enabled: !!target, retry: false },
  );
  const utils = trpc.useUtils();
  const upload = trpc.compliance.uploadComplianceDocument.useMutation({
    onSuccess: () => {
      setFile(null);
      setNotice("Source document uploaded and fingerprinted.");
      if (target) {
        void utils.compliance.listComplianceDocuments.invalidate({
          entityType: target.entityType,
          entityId: target.entityId,
        });
      }
    },
  });

  return (
    <section
      aria-label="Compliance source documents"
      className="space-y-3 rounded-xl border border-border p-4"
    >
      <div>
        <h4 className="font-semibold">Verified source documents</h4>
        <p className="text-sm text-muted-foreground">
          Attach the supporting BIR form, receipt, or settlement proof to the
          recorded evidence. References alone remain unverified.
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor="source-document-target">
          Evidence record
        </FieldLabel>
        <select
          id="source-document-target"
          className="h-8 w-full rounded-2xl border border-transparent bg-input/50 px-2.5 text-sm"
          value={targetKey}
          onChange={(event) => {
            setTargetKey(event.currentTarget.value);
            setNotice("");
          }}
        >
          <option value="">Select an evidence record</option>
          {targets.map((entry) => (
            <option
              key={`${entry.entityType}:${entry.entityId}`}
              value={`${entry.entityType}:${entry.entityId}`}
            >
              {entry.label}
            </option>
          ))}
        </select>
      </Field>
      {target && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!file) return;
            try {
              await upload.mutateAsync({
                ...target,
                employeeId,
                originalName: file.name,
                contentType: file.type as
                  | "application/pdf"
                  | "image/jpeg"
                  | "image/png",
                dataBase64: await readAsBase64(file),
              });
            } catch {
              // The mutation error is rendered below.
            }
          }}
        >
          <Field className="min-w-60 flex-1">
            <FieldLabel htmlFor="source-document-file">
              PDF, JPEG, or PNG (max 10 MiB)
            </FieldLabel>
            <Input
              id="source-document-file"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(event) =>
                setFile(event.currentTarget.files?.[0] ?? null)
              }
            />
          </Field>
          <Button type="submit" disabled={!file || upload.isPending}>
            {upload.isPending && <Loader2 className="size-4 animate-spin" />}
            Upload document
          </Button>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      <MutationError error={upload.error} />
      {documents.isError && (
        <p role="alert">Could not load attached documents.</p>
      )}
      {documents.isPending && target && (
        <Loader2 className="size-4 animate-spin" />
      )}
      {documents.data && documents.data.length > 0 && (
        <ul className="space-y-2 text-sm">
          {documents.data.map((document) => (
            <li
              key={document.id}
              className="flex items-center gap-2 rounded-lg bg-muted/40 p-2"
            >
              <FileCheck2 className="size-4 text-primary" />
              <span className="min-w-0 flex-1 truncate">
                {document.originalName}
              </span>
              <span className="text-muted-foreground">
                {document.sha256.slice(0, 12)}…
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
