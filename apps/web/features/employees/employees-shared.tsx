"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import { manilaToday } from "@/lib/attendance-time";

export const EMPLOYMENT_TYPES = [
  "REGULAR",
  "PROBATIONARY",
  "CONTRACTUAL",
  "PROJECT_BASED",
  "PART_TIME",
].map((type) => ({ value: type, label: type.replaceAll("_", " ") }));

export const EMPLOYMENT_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_LEAVE", label: "On Leave" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "RESIGNED", label: "Resigned" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "RETIRED", label: "Retired" },
];

export const PAY_BASIS_ITEMS = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "DAILY", label: "Daily" },
  { value: "HOURLY", label: "Hourly" },
];

export type EmployeeData = NonNullable<
  inferRouterOutputs<AppRouter>["employees"]["getById"]
>;

export function pesos(value: bigint | number | string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value) / 100);
}

export function date(value: Date | string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-PH", {
        timeZone: "UTC",
        dateStyle: "medium",
      }).format(new Date(value))
    : "Not recorded";
}

export function masked(value: string | null | undefined) {
  return value ? `•••• ${value.slice(-4)}` : "Not recorded";
}
export interface TextFieldConfig {
  name: string;
  label: string;
  maxLength?: number;
  type?: string;
  captionLayout?: "label" | "dropdown" | "dropdown-months" | "dropdown-years";
  min?: string;
  max?: string;
}
export const todayIso = manilaToday();
