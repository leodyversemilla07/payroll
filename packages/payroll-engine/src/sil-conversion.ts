/**
 * Philippine DOLE Service Incentive Leave (SIL) & Monetization Engine
 * Compliant with DOLE Labor Code Article 95 & BIR Revenue Regulations (RR) No. 5-2011 / TRAIN Law
 */

export interface SilConversionInput {
  dailyRateCents: bigint;
  unusedLeaveDays: number; // e.g. 5.0, 10.0, 15.0
  priorMonetizedDaysInYear?: number; // Days already monetized earlier this year
}

export interface SilConversionResult {
  dailyRateCents: bigint;
  unusedLeaveDays: number;
  totalMonetizedCashCents: bigint;
  taxExemptDeMinimisCents: bigint; // Max 12 days cumulative per calendar year
  taxablePortionCents: bigint; // Excess over 12 days
  remarks: string;
}

/**
 * Maximum tax-exempt monetized private-sector vacation leave credits.
 * RR No. 11-2018 allowed 10 days; RR No. 29-2025 (effective 2026-01-06)
 * raised it to 12 days per calendar year.
 */
export const BIR_MAX_TAX_EXEMPT_LEAVE_DAYS = 12;

/**
 * Calculates the cash monetization of unused Service Incentive Leave (SIL) or Vacation Leave.
 */
export function calculateSilCashConversion(
  input: SilConversionInput,
): SilConversionResult {
  if (
    input.dailyRateCents < 0n ||
    [input.unusedLeaveDays, input.priorMonetizedDaysInYear ?? 0].some(
      (days) =>
        !Number.isFinite(days) ||
        days < 0 ||
        days > 366 ||
        !/^\d+(\.\d{1,2})?$/.test(String(days)),
    )
  )
    throw new RangeError(
      "Leave monetization requires valid non-negative rates and day counts with at most two decimals",
    );
  if (input.unusedLeaveDays <= 0 || input.dailyRateCents <= 0n) {
    return {
      dailyRateCents: input.dailyRateCents,
      unusedLeaveDays: 0,
      totalMonetizedCashCents: 0n,
      taxExemptDeMinimisCents: 0n,
      taxablePortionCents: 0n,
      remarks: "No leave days to monetize",
    };
  }

  // Multiply daily rate by days (scaled by 100 for fractional precision like 2.5 days)
  const daysScaled = BigInt(Math.round(input.unusedLeaveDays * 100));
  const totalMonetizedCashCents = (input.dailyRateCents * daysScaled) / 100n;

  const priorDays = input.priorMonetizedDaysInYear ?? 0;
  const remainingExemptCapDays = Math.max(
    0,
    BIR_MAX_TAX_EXEMPT_LEAVE_DAYS - priorDays,
  );

  const exemptDays = Math.min(input.unusedLeaveDays, remainingExemptCapDays);
  const taxableDays = Math.max(0, input.unusedLeaveDays - exemptDays);

  const exemptDaysScaled = BigInt(Math.round(exemptDays * 100));

  const taxExemptDeMinimisCents =
    (input.dailyRateCents * exemptDaysScaled) / 100n;
  // Rounding a fractional split independently can lose a centavo. Conserve
  // the total cash amount; the remaining centavo belongs to taxable excess.
  const taxablePortionCents = totalMonetizedCashCents - taxExemptDeMinimisCents;

  let remarks = `Monetized ${input.unusedLeaveDays} day(s) at daily rate.`;
  if (taxableDays > 0) {
    remarks += ` ${exemptDays} day(s) tax-exempt De Minimis; ${taxableDays} day(s) excess over 12-day cap.`;
  } else {
    remarks += ` 100% tax-exempt under BIR 12-day De Minimis cap.`;
  }

  return {
    dailyRateCents: input.dailyRateCents,
    unusedLeaveDays: input.unusedLeaveDays,
    totalMonetizedCashCents,
    taxExemptDeMinimisCents,
    taxablePortionCents,
    remarks,
  };
}
