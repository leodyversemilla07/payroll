// DTR dates and all editor punches use Asia/Manila, not the browser's timezone.
// The Philippines uses UTC+08:00 without daylight-saving transitions.
export function toManilaInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Date(new Date(value).getTime() + 8 * 3_600_000)
    .toISOString()
    .slice(0, 23);
}

export function fromManilaInput(value: string): string | null {
  return value ? new Date(`${value}+08:00`).toISOString() : null;
}

export function manilaToday(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}
