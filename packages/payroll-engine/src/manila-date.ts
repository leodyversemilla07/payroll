/**
 * Civil-calendar helpers for the Philippines' statutory time zone.
 *
 * Documents, validations, and "current period" defaults in this domain must
 * use Asia/Manila (UTC+08:00) civil dates — never the server's local zone
 * and never UTC. PHP has observed no daylight-saving time since 1990, so
 * adding a fixed 8h offset to an instant and slicing the UTC ISO string is
 * not an approximation: it is the exact civil date, independent of the host
 * timezone.
 */
export const MANILA_OFFSET_MS = 8 * 3_600_000;

/** The civil 'YYYY-MM-DD' date on which `instant` falls in Asia/Manila. */
export function manilaIsoDate(instant: Date): string {
  return new Date(instant.getTime() + MANILA_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** Today's civil date in Asia/Manila, as of the moment of the call. */
export function manilaToday(): string {
  return manilaIsoDate(new Date());
}

/** The civil calendar year of `instant` in Asia/Manila. */
export function manilaYear(instant: Date = new Date()): number {
  return Number(manilaIsoDate(instant).slice(0, 4));
}
