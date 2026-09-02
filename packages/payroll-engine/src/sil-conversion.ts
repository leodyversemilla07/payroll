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
  taxExemptDeMinimisCents: bigint; // Max 10 days cumulative per calendar year
  taxablePortionCents: bigint; // Excess over 10 days
  remarks: string;
}

/** Maximum tax-exempt monetized leave credits under BIR De Minimis rules */
export const BIR_MAX_TAX_EXEMPT_LEAVE_DAYS = 10;

/**
 * Calculates the cash monetization of unused Service Incentive Leave (SIL) or Vacation Leave.
 */
export function calculateSilCashConversion(input: SilConversionInput): SilConversionResult {
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
  const remainingExemptCapDays = Math.max(0, BIR_MAX_TAX_EXEMPT_LEAVE_DAYS - priorDays);

  const exemptDays = Math.min(input.unusedLeaveDays, remainingExemptCapDays);
  const taxableDays = Math.max(0, input.unusedLeaveDays - exemptDays);

  const exemptDaysScaled = BigInt(Math.round(exemptDays * 100));
  const taxableDaysScaled = BigInt(Math.round(taxableDays * 100));

  const taxExemptDeMinimisCents = (input.dailyRateCents * exemptDaysScaled) / 100n;
  const taxablePortionCents = (input.dailyRateCents * taxableDaysScaled) / 100n;

  let remarks = `Monetized ${input.unusedLeaveDays} day(s) at daily rate.`;
  if (taxableDays > 0) {
    remarks += ` ${exemptDays} day(s) tax-exempt De Minimis; ${taxableDays} day(s) excess over 10-day cap.`;
  } else {
    remarks += ` 100% tax-exempt under BIR 10-day De Minimis cap.`;
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
