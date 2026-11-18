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
import { FileText, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
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
  const [queueSearch, setQueueSearch] = useState("");
  const selected = employees.find((entry) => entry.id === employeeId) ?? null;
  const queue = trpc.compliance.listYearEndReconciliations.useQuery(
    { taxYear },
    { enabled: taxYearValid, retry: false },
  );
  const rows = queue.data?.rows ?? [];
  const filteredRows = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      `${row.name} ${row.employeeNumber} ${statusLabel(row.status)}`
        .toLowerCase()
        .includes(query),
    );
  }, [queueSearch, rows]);

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
          <div className="grid gap-6 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.8fr)]">
            <section
              aria-label="Tax reconciliation queue"
              className="min-w-0 space-y-3 rounded-xl border border-border bg-muted/10 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Review queue</h3>
                  <p className="text-xs text-muted-foreground">
                    {filteredRows.length} of {rows.length} employees
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {taxYear}
                </span>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input
                  aria-label="Search tax queue"
                  placeholder="Search name or employee number"
                  value={queueSearch}
                  onChange={(event) =>
                    setQueueSearch(event.currentTarget.value)
                  }
                  className="pl-8"
                />
              </div>
              <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-border/70">
                {filteredRows.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    No employees match your search.
                  </p>
                ) : (
                  <ul className="space-y-1 p-1">
                    {filteredRows.map((row) => (
                      <li key={row.employeeId}>
                        <Button
                          type="button"
                          aria-pressed={employeeId === row.employeeId}
                          variant={
                            employeeId === row.employeeId
                              ? "secondary"
                              : "ghost"
                          }
                          className="h-auto w-full flex-col items-start whitespace-normal p-3 text-left"
                          onClick={() => setEmployeeId(row.employeeId)}
                        >
                          <strong className="max-w-full break-words">
                            {row.name}
                          </strong>
                          <span className="max-w-full break-words text-xs text-muted-foreground">
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
              </div>
            </section>
            <section
              aria-label="Selected employee tax workspace"
              className="min-w-0"
            >
              <Field>
                <FieldLabel htmlFor="tax-employee">
                  Selected employee
                </FieldLabel>
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
              {selected && taxYearValid ? (
                <EmployeeTaxDetail
                  key={`${selected.id}:${taxYear}`}
                  employee={selected}
                  taxYear={taxYear}
                />
              ) : (
                <Empty className="mt-4 min-h-56 border rounded-lg">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FileText className="size-6 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>Select an employee to begin review.</EmptyTitle>
                    <EmptyDescription>
                      Choose a row from the queue or use the selector above to
                      open the tax workspace.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </section>
          </div>
        )}
        {taxYearValid && <AnnualComplianceTransmittals taxYear={taxYear} />}
        {taxYearValid && <TaxCorrectionQueue taxYear={taxYear} />}
      </CardContent>
    </Card>
  );
}
