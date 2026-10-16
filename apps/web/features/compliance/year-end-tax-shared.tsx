"use client";

import { trpc } from "@/lib/trpc";

export interface YearEndEmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  employmentStatus: string;
}

export type Cents = bigint | number | string | null | undefined;

export function big(value: Cents): bigint | null {
  if (value === null || value === undefined) return null;
  try {
    return typeof value === "bigint" ? value : BigInt(value);
  } catch {
    return null;
  }
}

export function fmt(value: Cents): string {
  const cents = big(value);
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(cents) / 100);
}

export function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(new Date(value));
}

export function toCentsString(pesosText: string): string | null {
  const trimmed = pesosText.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return BigInt(Math.round(amount * 100)).toString();
}

export function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function MutationError({
  error,
}: {
  error: { message: string } | null;
}) {
  if (!error) return null;
  return <p role="alert">{error.message}</p>;
}
export interface EvidenceData {
  declaration: {
    id: string;
    hasPriorEmployer: boolean;
    sourceReference: string;
    version?: number;
  } | null;
  previousEmployers: {
    id: string;
    employerName: string;
    employerTin: string;
    periodStart: Date | string;
    periodEnd: Date | string;
    grossCompensationCents: Cents;
    taxableCompensationCents: Cents;
    taxWithheldCents: Cents;
    documentReference: string;
    version?: number;
  }[];
  monthlyRemittances: {
    id: string;
    month: number;
    remittedCents: Cents;
    documentReference: string;
    version?: number;
  }[];
  settlement: {
    id: string;
    settlementType: string;
    settledCents: Cents;
    settlementDate: Date | string;
    documentReference: string;
    version?: number;
  } | null;
}
export function useInvalidateEvidence() {
  const utils = trpc.useUtils();
  return () => {
    void utils.compliance.listYearEndReconciliations.invalidate();
    void utils.compliance.listTaxCorrections.invalidate();
    void utils.compliance.getBir2316Issuance.invalidate();
    void utils.compliance.getTaxEvidence.invalidate();
  };
}
