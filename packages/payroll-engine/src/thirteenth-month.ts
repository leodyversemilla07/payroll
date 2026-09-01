import type { Centavos } from "./types";

/**
 * Statutory 13th Month & Bonus Tax Exemption Ceiling under TRAIN Law
 * PHP 90,000.00 = 9,000,000 Centavos
 */
export const TAX_EXEMPT_BONUS_CEILING_CENTS: Centavos = 9000000n;

/**
 * Calculates 13th-month pay accrual for a given pay period.
 * Accrual = Net basic pay earned for the period / 12
 */
export function calculateThirteenthMonthAccrual(netBasicPayCents: Centavos): Centavos {
  if (netBasicPayCents <= 0n) return 0n;
  return netBasicPayCents / 12n;
}

/**
 * Computes 13th Month release payout and taxability against the PHP 90k exemption cap.
 */
export function calculateThirteenthMonthPayout(
  totalAnnualBasicEarnedCents: Centavos,
  otherBonusesReceivedCents = 0n
): {
  thirteenthMonthPayCents: Centavos;
  taxExemptPortionCents: Centavos;
  taxablePortionCents: Centavos;
} {
  const thirteenthMonthPayCents = totalAnnualBasicEarnedCents / 12n;
  const remainingExemptCap = TAX_EXEMPT_BONUS_CEILING_CENTS > otherBonusesReceivedCents
    ? TAX_EXEMPT_BONUS_CEILING_CENTS - otherBonusesReceivedCents
    : 0n;

  if (thirteenthMonthPayCents <= remainingExemptCap) {
    return {
      thirteenthMonthPayCents,
      taxExemptPortionCents: thirteenthMonthPayCents,
      taxablePortionCents: 0n,
    };
  }

  const taxExemptPortionCents = remainingExemptCap;
  const taxablePortionCents = thirteenthMonthPayCents - remainingExemptCap;

  return {
    thirteenthMonthPayCents,
    taxExemptPortionCents,
    taxablePortionCents,
  };
}
