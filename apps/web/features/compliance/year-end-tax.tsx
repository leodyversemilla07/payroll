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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AnnualComplianceTransmittals } from "./annual-transmittals";
import { TaxCorrectionQueue } from "./tax-corrections";
import { EmployeeTaxDetail } from "./tax-detail";
import {
  big,
  fmt,
  statusLabel,
  type YearEndEmployeeOption,
} from "./year-end-tax-shared";

export type { YearEndEmployeeOption } from "./year-end-tax-shared";

export function YearEndTaxSection({
  employees,
}: {
  employees: YearEndEmployeeOption[];
}) {
  const currentYear = new Date().getFullYear();
  const [taxYearText, setTaxYearText] = useState(String(currentYear));
  const taxYear = Number(taxYearText);
  const taxYearValid =
    Number.isInteger(taxYear) && taxYear >= 2023 && taxYear <= 2100;
  const [employeeId, setEmployeeId] = useState("");
  const selected = employees.find((entry) => entry.id === employeeId) ?? null;
  const queue = trpc.compliance.listYearEndReconciliations.useQuery(
    { taxYear },
    { enabled: taxYearValid, retry: false },
  );
  const rows = queue.data?.rows ?? [];

  return (
    <Card role="region" aria-label="Year-end tax">
      <CardHeader>
        <CardTitle>Year-end tax</CardTitle>
        <CardDescription>
          Review queue, prior-employer evidence, 2316 worksheet preview and
          settlement. Worksheets are internal only, never official BIR forms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Field>
          <FieldLabel htmlFor="tax-year">Tax year</FieldLabel>
          <Input
            id="tax-year"
            name="taxYear"
            type="number"
            min={2023}
            max={2100}
            value={taxYearText}
            onChange={(event) => setTaxYearText(event.currentTarget.value)}
            required
          />
        </Field>
        {!taxYearValid ? (
          <p role="alert">Enter a tax year from 2023 to 2100.</p>
        ) : queue.isPending ? (
          <div
            role="status"
            className="flex items-center gap-2 py-3 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin text-primary shrink-0" />
            <span>Loading review queue…</span>
          </div>
        ) : queue.isError ? (
          <p role="alert">
            Could not load the review queue.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => void queue.refetch()}
            >
              Retry
            </Button>
          </p>
        ) : rows.length === 0 ? (
          <Empty className="py-6 border rounded-lg">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText className="size-6 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle>No reconciliation rows for {taxYear}.</EmptyTitle>
              <EmptyDescription>
                Annualized reconciliation records will appear once payroll runs
                are finalized for this calendar year.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.employeeId}>
                <Button
                  type="button"
                  aria-pressed={employeeId === row.employeeId}
                  variant="outline"
                  className="h-auto w-full flex-col items-start whitespace-normal p-3 text-left"
                  onClick={() => setEmployeeId(row.employeeId)}
                >
                  <strong className="max-w-full break-words">{row.name}</strong>
                  <span className="max-w-full break-words text-sm text-muted-foreground">
                    {row.employeeNumber} · {statusLabel(row.status)}
                    {row.issuanceFreshness &&
                      ` · certificate ${row.issuanceFreshness.toLowerCase()}`}
                    {row.unsettledDifferenceCents != null &&
                    big(row.unsettledDifferenceCents) !== 0n
                      ? ` · ${fmt(row.unsettledDifferenceCents)}`
                      : ""}
                    {row.status === "SETTLED" ? " · settled" : ""}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Field>
            <FieldLabel htmlFor="tax-employee">Employee</FieldLabel>
            <Select
              items={[
                { value: "NONE", label: "Select an employee" },
                ...employees.map((entry) => ({
                  value: entry.id,
                  label: `${entry.firstName} ${entry.lastName} · ${entry.employeeNumber}`,
                })),
              ]}
              value={employeeId || "NONE"}
              onValueChange={(val) =>
                setEmployeeId(val === "NONE" ? "" : (val ?? ""))
              }
            >
              <SelectTrigger id="tax-employee" className="w-full">
                <SelectValue placeholder="Select an employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="NONE">Select an employee</SelectItem>
                  {employees.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.firstName} {entry.lastName} ·{" "}
                      {entry.employeeNumber}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {selected && taxYearValid && (
          <EmployeeTaxDetail
            key={`${selected.id}:${taxYear}`}
            employee={selected}
            taxYear={taxYear}
          />
        )}
        {taxYearValid && <AnnualComplianceTransmittals taxYear={taxYear} />}
        {taxYearValid && <TaxCorrectionQueue taxYear={taxYear} />}
      </CardContent>
    </Card>
  );
}
