// DTR dates and all editor punches use Asia/Manila, not the browser's timezone.
// The civil-date math lives in @workspace/payroll-engine/manila-date so the
// web portal and the API cannot drift apart.
import {
  manilaToday as engineManilaToday,
  MANILA_OFFSET_MS,
} from "@workspace/payroll-engine/manila-date";

export function toManilaInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Date(new Date(value).getTime() + MANILA_OFFSET_MS)
    .toISOString()
    .slice(0, 23);
}

export function fromManilaInput(value: string): string | null {
  return value ? new Date(`${value}+08:00`).toISOString() : null;
}

export function manilaToday(): string {
  return engineManilaToday();
}

export { manilaIsoDate } from "@workspace/payroll-engine/manila-date";
