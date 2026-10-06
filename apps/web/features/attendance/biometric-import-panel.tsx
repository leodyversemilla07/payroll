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
import { AlertTriangle, CheckCircle2, FileText, Upload, X } from "lucide-react";
import { type ChangeEvent, type DragEvent, useState } from "react";
import { trpc } from "@/lib/trpc";

type ImportResult =
  inferRouterOutputs<AppRouter>["timekeeping"]["importBiometricsCsv"];

interface BiometricImportPanelProps {
  onSuccess?: (summary: string) => void;
  onClose?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatPunch(value: Date | string | null | undefined): string {
  if (!value) return "Missing";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function BiometricImportPanel({
  onSuccess,
  onClose,
}: BiometricImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewRows, setPreviewRows] = useState<
    Array<{ rowNum: number; cols: string[] }>
  >([]);
  const [totalLineCount, setTotalLineCount] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const importMutation = trpc.timekeeping.importBiometricsCsv.useMutation({
    onSuccess: (data) => {
      setImportResult(data);
      setImportError(null);
      void utils.timekeeping.getDTR.invalidate();
      void utils.timekeeping.listRecent.invalidate();
      const message = `Biometric import completed: ${data.daysImported} day(s) imported from ${data.totalPunchesParsed} punches.`;
      onSuccess?.(message);
    },
    onError: (err) => {
      if (
        err.data?.code === "UNPROCESSABLE_CONTENT" ||
        err.data?.code === "CONFLICT"
      ) {
        setImportError(err.message);
      } else {
        setImportError(
          err.message ||
            "Failed to process biometrics CSV. Please verify file format and retry.",
        );
      }
    },
  });

  async function processSelectedFile(selected: File) {
    setImportError(null);
    setImportResult(null);

    // 10MB limit
    if (selected.size > 10 * 1024 * 1024) {
      setFileError("File exceeds the maximum size limit of 10MB.");
      setFile(null);
      setFileText("");
      setPreviewRows([]);
      setTotalLineCount(0);
      return;
    }

    if (
      !selected.name.toLowerCase().endsWith(".csv") &&
      selected.type !== "text/csv" &&
      selected.type !== "text/plain" &&
      selected.type !== ""
    ) {
      setFileError("Please upload a valid .csv file.");
      setFile(null);
      setFileText("");
      setPreviewRows([]);
      setTotalLineCount(0);
      return;
    }

    try {
      const text = await selected.text();
      const trimmed = text.trim();
      if (!trimmed) {
        setFileError("The selected CSV file is empty.");
        setFile(null);
        setFileText("");
        setPreviewRows([]);
        setTotalLineCount(0);
        return;
      }

      const rawLines = trimmed
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (rawLines.length === 0) {
        setFileError("The selected CSV file contains no punch records.");
        setFile(null);
        setFileText("");
        setPreviewRows([]);
        setTotalLineCount(0);
        return;
      }

      const rows = rawLines.slice(0, 10).map((line, idx) => ({
        rowNum: idx + 1,
        cols: line.split(",").map((col) => col.replace(/["']/g, "").trim()),
      }));

      setFile(selected);
      setFileText(text);
      setFileError(null);
      setPreviewRows(rows);
      setTotalLineCount(rawLines.length);
    } catch {
      setFileError("Could not read the selected file. Please retry.");
      setFile(null);
      setFileText("");
      setPreviewRows([]);
      setTotalLineCount(0);
    }
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      void processSelectedFile(selected);
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      void processSelectedFile(dropped);
    }
  }

  function handleReset() {
    setFile(null);
    setFileText("");
    setFileError(null);
    setPreviewRows([]);
    setTotalLineCount(0);
    setImportResult(null);
    setImportError(null);
  }

  function handleUpload() {
    if (!fileText || importMutation.isPending) return;
    importMutation.mutate({ csvContent: fileText });
  }

  const affectedEmployeesCount = importResult
    ? new Set(importResult.details.map((d) => d.employeeNumber)).size
    : 0;

  const anomalousDays = importResult
    ? importResult.details.filter(
        (day) => day.hasMissingPunch || day.remarks.length > 0,
      )
    : [];

  return (
    <Card
      role="region"
      aria-label="Biometric CSV import"
      className="border-primary/20 bg-muted/20"
    >
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <CardTitle className="text-lg">Biometric Punch Log Import</CardTitle>
          <CardDescription>
            Import attendance punch logs (.csv up to 10MB). Punch times are
            recorded and interpreted in Asia/Manila (UTC+08:00).
          </CardDescription>
        </div>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Close biometric import panel"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!file && !importResult && (
          <div className="space-y-4">
            <section
              aria-label="CSV file drop zone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                isDragging
                  ? "border-primary bg-primary/10"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
            >
              <Upload
                className="mb-3 size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm font-medium">
                Drag and drop your biometric CSV file here, or{" "}
                <label
                  htmlFor="biometric-csv-upload"
                  className="cursor-pointer text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  browse files
                </label>
              </p>
              <input
                id="biometric-csv-upload"
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={handleFileInput}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Supported formats: CSV with employee ID, timestamp/date/time,
                and punch type (up to 10MB).
              </p>
            </section>

            {fileError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {fileError}
              </p>
            )}

            <div className="rounded-lg border bg-background/50 p-4 text-xs text-muted-foreground space-y-1.5">
              <p className="font-semibold text-foreground">
                Expected CSV Formats:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <code>Employee_ID, Timestamp, Punch_Type</code> (e.g.{" "}
                  <code>EMP-001, 2026-09-21T08:00:00Z, CHECK_IN</code>)
                </li>
                <li>
                  <code>Employee_ID, Date, Time, Punch_Type</code> (e.g.{" "}
                  <code>EMP-001, 2026-09-21, 08:00:00, CHECK_IN</code>)
                </li>
                <li>
                  Punch types: <code>CHECK_IN</code> (or 1),{" "}
                  <code>CHECK_OUT</code> (or 2), or <code>AUTO</code>.
                </li>
              </ul>
              <p className="pt-1 text-amber-700 dark:text-amber-300">
                Notice: Imported records start unapproved. HR must review punch
                anomalies and confirm shifts before payroll approval.
              </p>
            </div>
          </div>
        )}

        {file && !importResult && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText
                  className="size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)} · {totalLineCount} row(s)
                    detected
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={importMutation.isPending}
                onClick={handleReset}
              >
                Change file
              </Button>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  File Preview (First 10 Rows)
                </span>
                <span>
                  Showing {Math.min(10, previewRows.length)} of {totalLineCount}{" "}
                  rows
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border bg-background">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50 font-medium text-muted-foreground">
                      <th className="p-2">#</th>
                      <th className="p-2">Col 1 (Employee)</th>
                      <th className="p-2">Col 2 (Timestamp / Date)</th>
                      <th className="p-2">Col 3 (Type / Time)</th>
                      <th className="p-2">Col 4 (Type)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono">
                    {previewRows.map((row) => (
                      <tr key={row.rowNum} className="hover:bg-muted/20">
                        <td className="p-2 text-muted-foreground font-sans">
                          {row.rowNum}
                        </td>
                        <td className="p-2">{row.cols[0] ?? "—"}</td>
                        <td className="p-2">{row.cols[1] ?? "—"}</td>
                        <td className="p-2">{row.cols[2] ?? "—"}</td>
                        <td className="p-2">{row.cols[3] ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {importError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {importError}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                disabled={importMutation.isPending}
                onClick={handleUpload}
              >
                {importMutation.isPending
                  ? "Processing biometrics…"
                  : "Upload and Process"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={importMutation.isPending}
                onClick={handleReset}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {importResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
              <p role="status" className="text-sm font-medium">
                Biometric import complete: {importResult.daysImported} daily
                time record(s) imported from {importResult.totalPunchesParsed}{" "}
                punches.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card size="sm">
                <CardHeader className="pb-1">
                  <CardDescription className="text-xs">
                    Punches Parsed
                  </CardDescription>
                  <CardTitle className="text-xl">
                    {importResult.totalPunchesParsed}
                  </CardTitle>
                </CardHeader>
              </Card>

              <Card size="sm">
                <CardHeader className="pb-1">
                  <CardDescription className="text-xs">
                    Days Imported
                  </CardDescription>
                  <CardTitle className="text-xl">
                    {importResult.daysImported}
                  </CardTitle>
                </CardHeader>
              </Card>

              <Card size="sm">
                <CardHeader className="pb-1">
                  <CardDescription className="text-xs">
                    Employees Affected
                  </CardDescription>
                  <CardTitle className="text-xl">
                    {affectedEmployeesCount}
                  </CardTitle>
                </CardHeader>
              </Card>

              <Card size="sm">
                <CardHeader className="pb-1">
                  <CardDescription className="text-xs">
                    Anomalies Detected
                  </CardDescription>
                  <CardTitle
                    className={`text-xl ${
                      importResult.anomaliesDetected > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {importResult.anomaliesDetected}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            {anomalousDays.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <AlertTriangle
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-xs font-semibold">
                    Anomalies Requiring Review ({anomalousDays.length})
                  </span>
                </div>
                <div className="overflow-x-auto rounded-lg border bg-background">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50 font-medium text-muted-foreground">
                        <th className="p-2">Employee #</th>
                        <th className="p-2">Date</th>
                        <th className="p-2">Time In (Manila)</th>
                        <th className="p-2">Time Out (Manila)</th>
                        <th className="p-2">Issues / Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {anomalousDays.map((day) => (
                        <tr
                          key={`${day.employeeNumber}-${day.dateStr}`}
                          className="hover:bg-muted/20"
                        >
                          <td className="p-2 font-mono font-medium">
                            {day.employeeNumber}
                          </td>
                          <td className="p-2">{day.dateStr}</td>
                          <td className="p-2">{formatPunch(day.timeIn)}</td>
                          <td className="p-2">{formatPunch(day.timeOut)}</td>
                          <td className="p-2 text-amber-700 dark:text-amber-400 font-medium">
                            {day.remarks.length > 0
                              ? day.remarks.join("; ")
                              : day.hasMissingPunch
                                ? "Missing punch in or out"
                                : "Review required"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Records with missing punches or anomalies have been imported
                  as unapproved. Review and correct each record in the DTR table
                  before payroll approval.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleReset}>
                Import another CSV
              </Button>
              {onClose && (
                <Button type="button" onClick={onClose}>
                  Done
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
