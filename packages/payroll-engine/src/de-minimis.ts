import type { AllowanceInput, Centavos } from "./types";
import { DeMinimisCategory } from "./types";

/**
 * Statutory Monthly De Minimis Limits (in Centavos)
 */
export const MONTHLY_DE_MINIMIS_LIMITS: Record<DeMinimisCategory, Centavos> = {
  [DeMinimisCategory.RICE_SUBSIDY]: 200000n, // PHP 2,000 / month
  [DeMinimisCategory.UNIFORM_CLOTHING]: 50000n, // PHP 6,000 / yr = PHP 500 / month
  [DeMinimisCategory.MEDICAL_CASH_ALLOWANCE]: 25000n, // PHP 1,500 / sem = PHP 250 / month
  [DeMinimisCategory.LAUNDRY_ALLOWANCE]: 30000n, // PHP 300 / month
  [DeMinimisCategory.DAILY_MEAL_OVERTIME]: 20000n, // Typical 25% daily min wage cap
  [DeMinimisCategory.ACHIEVEMENT_AWARD]: 83333n, // PHP 10,000 / yr
  [DeMinimisCategory.GIFTS_CHRISTMAS_MAJOR]: 41666n, // PHP 5,000 / yr
  [DeMinimisCategory.OTHER]: 0n,
};

/**
 * Evaluates a list of employee allowances for a pay period.
 * Separates taxable allowances, non-taxable de minimis, and computes any excess that spills into taxable income.
 */
export function evaluateAllowances(
  allowances: AllowanceInput[],
  isSemiMonthly = true,
): {
  taxableAllowancesCents: Centavos;
  nonTaxableAllowancesCents: Centavos;
  deMinimisExcessTaxableCents: Centavos;
} {
  let taxableAllowancesCents = 0n;
  let nonTaxableAllowancesCents = 0n;
  let deMinimisExcessTaxableCents = 0n;

  for (const allowance of allowances) {
    if (allowance.isTaxable) {
      taxableAllowancesCents += allowance.amountCents;
    } else if (allowance.deMinimisCategory) {
      const monthlyLimit =
        MONTHLY_DE_MINIMIS_LIMITS[allowance.deMinimisCategory] || 0n;
      const periodLimit = isSemiMonthly ? monthlyLimit / 2n : monthlyLimit;

      if (allowance.amountCents <= periodLimit) {
        nonTaxableAllowancesCents += allowance.amountCents;
      } else {
        // Amount within limit is non-taxable; excess is taxable
        const exemptPart = periodLimit;
        const excessPart = allowance.amountCents - periodLimit;
        nonTaxableAllowancesCents += exemptPart;
        deMinimisExcessTaxableCents += excessPart;
        taxableAllowancesCents += excessPart;
      }
    } else {
      // General non-taxable fixed allowance
      nonTaxableAllowancesCents += allowance.amountCents;
    }
  }

  return {
    taxableAllowancesCents,
    nonTaxableAllowancesCents,
    deMinimisExcessTaxableCents,
  };
}
