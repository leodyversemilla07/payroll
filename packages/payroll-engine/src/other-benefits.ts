import { TAX_EXEMPT_BONUS_CEILING_CENTS } from "./thirteenth-month";
import type { Centavos } from "./types";

/**
 * PHP 90,000 Annual Other-Benefits Bucket (TRAIN Law)
 *
 * The first PHP 90,000 per calendar year of combined 13th-month pay,
 * bonuses, and de minimis excess is tax-exempt; only the overflow is
 * taxable compensation. Within-limit de minimis amounts never enter this
 * bucket. Callers track year-to-date usage (13th-month payouts + bonuses +
 * de minimis excess already counted) and pass it in; the allocator prices
 * only the current period's additions against the remaining cap.
 */
export interface NinetiethBucketInput {
  /** 13th-month + bonus + de minimis excess already counted this year. */
  ytdUsedCents: Centavos;
  /** 13th-month/bonus payouts this period joining the bucket. */
  periodBonusesCents?: Centavos;
  /** De minimis excess this period joining the bucket. */
  periodDeMinimisExcessCents?: Centavos;
}

export interface NinetiethBucketResult {
  /** Current-period additions absorbed by the remaining cap. */
  exemptCents: Centavos;
  /** Current-period additions overflowing the cap (taxable). */
  taxableCents: Centavos;
  /** Year-to-date usage after this period (persist for the next run). */
  totalUsedCents: Centavos;
}

export function allocateNinetiethBucket(
  input: NinetiethBucketInput,
): NinetiethBucketResult {
  const ytdUsed =
    input.ytdUsedCents > 0n ? input.ytdUsedCents : 0n;
  const additions =
    (input.periodBonusesCents ?? 0n) +
    (input.periodDeMinimisExcessCents ?? 0n);
  const remaining =
    TAX_EXEMPT_BONUS_CEILING_CENTS > ytdUsed
      ? TAX_EXEMPT_BONUS_CEILING_CENTS - ytdUsed
      : 0n;
  const exemptCents =
    additions < remaining ? additions : remaining;
  const taxableCents = additions - exemptCents;

  return {
    exemptCents,
    taxableCents,
    totalUsedCents: ytdUsed + additions,
  };
}
