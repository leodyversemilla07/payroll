import type { Centavos } from "./types";

/**
 * BIR TRAIN Law Revised Withholding Tax Tables (Effective 2023 onwards)
 */

interface TaxBracket {
  minPesos: number;
  maxPesos: number;
  baseTaxPesos: number;
  excessRate: number;
}

const SEMI_MONTHLY_BRACKETS: TaxBracket[] = [
  { minPesos: 0, maxPesos: 10417, baseTaxPesos: 0, excessRate: 0 },
  { minPesos: 10417, maxPesos: 16667, baseTaxPesos: 0, excessRate: 0.15 },
  { minPesos: 16667, maxPesos: 33333, baseTaxPesos: 937.5, excessRate: 0.2 },
  { minPesos: 33333, maxPesos: 83333, baseTaxPesos: 4270.7, excessRate: 0.25 },
  { minPesos: 83333, maxPesos: 333333, baseTaxPesos: 16770.7, excessRate: 0.3 },
  {
    minPesos: 333333,
    maxPesos: Number.POSITIVE_INFINITY,
    baseTaxPesos: 91770.7,
    excessRate: 0.35,
  },
];

const MONTHLY_BRACKETS: TaxBracket[] = [
  { minPesos: 0, maxPesos: 20833, baseTaxPesos: 0, excessRate: 0 },
  { minPesos: 20833, maxPesos: 33333, baseTaxPesos: 0, excessRate: 0.15 },
  { minPesos: 33333, maxPesos: 66667, baseTaxPesos: 1875.0, excessRate: 0.2 },
  { minPesos: 66667, maxPesos: 166667, baseTaxPesos: 8541.8, excessRate: 0.25 },
  {
    minPesos: 166667,
    maxPesos: 666667,
    baseTaxPesos: 33541.8,
    excessRate: 0.3,
  },
  {
    minPesos: 666667,
    maxPesos: Number.POSITIVE_INFINITY,
    baseTaxPesos: 183541.8,
    excessRate: 0.35,
  },
];

/**
 * Calculates withholding tax for a given taxable compensation amount.
 * @param taxableCompensationCents Taxable amount in Centavos
 * @param isSemiMonthly Whether this is a semi-monthly or full monthly run
 * @param isMinimumWageEarner Minimum wage earners are exempt from withholding tax
 */
export function calculateWithholdingTax(
  taxableCompensationCents: Centavos,
  isSemiMonthly = true,
  isMinimumWageEarner = false,
): Centavos {
  if (isMinimumWageEarner || taxableCompensationCents <= 0n) {
    return 0n;
  }

  const taxablePesos = Number(taxableCompensationCents) / 100;
  const brackets = isSemiMonthly ? SEMI_MONTHLY_BRACKETS : MONTHLY_BRACKETS;

  for (const bracket of brackets) {
    if (taxablePesos >= bracket.minPesos && taxablePesos <= bracket.maxPesos) {
      const excess = taxablePesos - bracket.minPesos;
      const taxPesos = bracket.baseTaxPesos + excess * bracket.excessRate;
      return BigInt(Math.round(taxPesos * 100));
    }
  }

  // Both statutory bracket tables are non-empty.
  const topBracket = brackets.at(-1);
  if (!topBracket) return 0n;

  const excess = taxablePesos - topBracket.minPesos;
  const taxPesos = topBracket.baseTaxPesos + excess * topBracket.excessRate;
  return BigInt(Math.round(taxPesos * 100));
}

/**
 * Annual Tax Adjustment / Annualization
 * Computes total annual tax due and tax refund/deficiency.
 */
export function annualizeTax(
  totalAnnualTaxableCents: Centavos,
  totalTaxWithheldCents: Centavos,
  isMinimumWageEarner = false,
): {
  totalAnnualTaxDueCents: Centavos;
  taxAdjustmentCents: Centavos; // Positive = Deficiency (employee owes), Negative = Refund (employee gets back)
} {
  if (isMinimumWageEarner || totalAnnualTaxableCents <= 25000000n) {
    // Under 250,000 PHP annual taxable = 0 tax
    return {
      totalAnnualTaxDueCents: 0n,
      taxAdjustmentCents: -totalTaxWithheldCents, // Refund everything withheld
    };
  }

  const taxablePesos = Number(totalAnnualTaxableCents) / 100;
  let taxDuePesos = 0;

  if (taxablePesos <= 250000) {
    taxDuePesos = 0;
  } else if (taxablePesos <= 400000) {
    taxDuePesos = (taxablePesos - 250000) * 0.15;
  } else if (taxablePesos <= 800000) {
    taxDuePesos = 22500 + (taxablePesos - 400000) * 0.2;
  } else if (taxablePesos <= 2000000) {
    taxDuePesos = 102500 + (taxablePesos - 800000) * 0.25;
  } else if (taxablePesos <= 8000000) {
    taxDuePesos = 402500 + (taxablePesos - 2000000) * 0.3;
  } else {
    taxDuePesos = 2202500 + (taxablePesos - 8000000) * 0.35;
  }

  const totalAnnualTaxDueCents = BigInt(Math.round(taxDuePesos * 100));
  const taxAdjustmentCents = totalAnnualTaxDueCents - totalTaxWithheldCents;

  return {
    totalAnnualTaxDueCents,
    taxAdjustmentCents,
  };
}
