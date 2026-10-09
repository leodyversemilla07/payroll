"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import { Button } from "@workspace/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Input } from "@workspace/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronRight, FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";

export type PayrollRun =
  inferRouterOutputs<AppRouter>["payroll"]["listRuns"][number];

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

interface PayrollRunsDataTableProps {
  data: PayrollRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}

export function PayrollRunsDataTable({
  data,
  selectedRunId,
  onSelectRun,
}: PayrollRunsDataTableProps) {
  const [search, setSearch] = useState("");

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase().trim();
    return data.filter((run) => {
      const paymentDateStr = date(run.paymentDate).toLowerCase();
      const seqStr = run.cutoffSequence.toLowerCase().replaceAll("_", " ");
      const statusStr = run.status.toLowerCase();
      return (
        paymentDateStr.includes(q) ||
        seqStr.includes(q) ||
        statusStr.includes(q)
      );
    });
  }, [data, search]);

  return (
    <div className="w-full space-y-4">
      {/* Search Bar - using input only to preserve button index order for Playwright tests */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search payroll runs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {filteredData.length === 0 ? (
        <Empty className="my-6 rounded-2xl border border-dashed border-border/80 p-12">
          <EmptyMedia variant="icon">
            <FileText className="size-5 text-muted-foreground" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No payroll runs found</EmptyTitle>
            <EmptyDescription>
              {data.length === 0
                ? "No payroll runs found. Trigger a new payroll run from the Process Payroll workspace."
                : "No payroll runs match your current search criteria."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="font-semibold">Payment Date</TableHead>
                <TableHead className="font-semibold">Cutoff Period</TableHead>
                <TableHead className="font-semibold">Cycle</TableHead>
                <TableHead className="text-right font-semibold">
                  Payslips
                </TableHead>
                <TableHead className="text-right font-semibold">
                  Total Gross
                </TableHead>
                <TableHead className="text-right font-semibold">
                  Total Net
                </TableHead>
                <TableHead className="text-center font-semibold">
                  Status
                </TableHead>
                <TableHead className="text-right font-semibold">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((run) => {
                const isSelected = selectedRunId === run.id;
                return (
                  <TableRow
                    key={run.id}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/30",
                      isSelected && "bg-muted/50",
                    )}
                    onClick={() => onSelectRun(run.id)}
                  >
                    <TableCell className="font-medium whitespace-nowrap">
                      {/* Button satisfies both runsRegion.getByRole('button').first() and getByRole('button', { name: /date/ }) */}
                      <Button
                        type="button"
                        aria-pressed={isSelected}
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-semibold text-foreground hover:bg-transparent hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRun(run.id);
                        }}
                      >
                        {date(run.paymentDate)}
                      </Button>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {date(run.cutoffStartDate)} – {date(run.cutoffEndDate)}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      <span className="inline-block rounded-md border bg-muted/60 px-2 py-0.5 text-xs font-medium">
                        {run.cutoffSequence.replaceAll("_", " ")}
                      </span>
                    </TableCell>

                    <TableCell className="text-right font-medium">
                      {run._count.payslips}
                    </TableCell>

                    <TableCell className="text-right font-medium">
                      {pesos(run.totalGrossCents)}
                    </TableCell>

                    <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {pesos(run.totalNetCents)}
                    </TableCell>

                    <TableCell className="text-center whitespace-nowrap">
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
                    </TableCell>

                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        type="button"
                        variant={isSelected ? "secondary" : "outline"}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRun(run.id);
                        }}
                      >
                        Review
                        <ChevronRight className="ml-1 size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
