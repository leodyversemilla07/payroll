import type { AllowanceInput, Centavos } from "./types";
import { DeMinimisCategory } from "./types";

/**
 * Statutory Monthly De Minimis Limits (in Centavos)
 * Per RR No. 2-98 as amended, latest by RR No. 29-2025 (effective 2026-01-06).
 * Annual ceilings are spread evenly across 12 months for per-period checks;
 * year-end settlement must reconcile against the annual cap. Within-limit
 * amounts are exempt and do NOT count toward the PHP 90,000 bonus ceiling;
 * only the excess spills into that bucket.
 */
export const MONTHLY_DE_MINIMIS_LIMITS: Record<DeMinimisCategory, Centavos> = {
  [DeMinimisCategory.RICE_SUBSIDY]: 250000n, // PHP 2,500 / month
  [DeMinimisCategory.UNIFORM_CLOTHING]: 66666n, // PHP 8,000 / yr
  [DeMinimisCategory.MEDICAL_CASH_ALLOWANCE]: 33333n, // PHP 2,000 / semester, dependents
  [DeMinimisCategory.ACTUAL_MEDICAL_ASSISTANCE]: 100000n, // PHP 12,000 / yr
  [DeMinimisCategory.LAUNDRY_ALLOWANCE]: 40000n, // PHP 400 / month
  // Meal allowance is capped per OT/night-shift day at 30% of the regional
  // basic minimum wage (e.g. PHP 226.50/day at the NCR PHP 755 minimum).
  // Callers must pre-cap per-incident amounts; this monthly entry is only a
  // fallback guard, not a substitute for the per-day rule.
  [DeMinimisCategory.DAILY_MEAL_OVERTIME]: 20000n,
  [DeMinimisCategory.ACHIEVEMENT_AWARD]: 100000n, // PHP 12,000 / yr
  [DeMinimisCategory.GIFTS_CHRISTMAS_MAJOR]: 50000n, // PHP 6,000 / yr
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
