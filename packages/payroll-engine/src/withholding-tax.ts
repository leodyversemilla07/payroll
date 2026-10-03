import type { Centavos } from "./types";

/**
 * BIR TRAIN Law Revised Withholding Tax Tables (Effective 2023 onwards)
 */

interface TaxBracket {
  ceiling: bigint | null;
  floor: bigint;
  fixed: bigint;
  percent: bigint;
}

const SEMI_MONTHLY_BRACKETS: TaxBracket[] = [
  { ceiling: 1041700n, floor: 0n, fixed: 0n, percent: 0n },
  { ceiling: 1666700n, floor: 1041700n, fixed: 0n, percent: 15n },
  { ceiling: 3333300n, floor: 1666700n, fixed: 93750n, percent: 20n },
  { ceiling: 8333300n, floor: 3333300n, fixed: 427070n, percent: 25n },
  { ceiling: 33333300n, floor: 8333300n, fixed: 1677070n, percent: 30n },
  { ceiling: null, floor: 33333300n, fixed: 9177070n, percent: 35n },
];

const MONTHLY_BRACKETS: TaxBracket[] = [
  { ceiling: 2083300n, floor: 0n, fixed: 0n, percent: 0n },
  { ceiling: 3333300n, floor: 2083300n, fixed: 0n, percent: 15n },
  { ceiling: 6666700n, floor: 3333300n, fixed: 187500n, percent: 20n },
  { ceiling: 16666700n, floor: 6666700n, fixed: 854180n, percent: 25n },
  { ceiling: 66666700n, floor: 16666700n, fixed: 3354180n, percent: 30n },
  { ceiling: null, floor: 66666700n, fixed: 18354180n, percent: 35n },
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
  // Full exemption for minimum wage earners, matching industry practice and
  // the RA 9504 exemption's intent. A strict reading of RR 8-2018 exempts
  // only statutory minimum wage plus holiday, overtime, night differential,
  // and hazard pay (leaving some non-SMW allowances arguably taxable);
  // over-withholding from minimum-wage earners is the worse failure mode,
  // so the exemption is applied to the whole withholding base instead.
  if (isMinimumWageEarner || taxableCompensationCents <= 0n) {
    return 0n;
  }

  const brackets = isSemiMonthly ? SEMI_MONTHLY_BRACKETS : MONTHLY_BRACKETS;
  const bracket = brackets.find(
    (entry) =>
      entry.ceiling === null || taxableCompensationCents <= entry.ceiling,
  );
  if (!bracket) throw new RangeError("Withholding table is incomplete");
  // Centavos stay BigInt throughout. Round fractional tax centavos once,
  // half up; floating-point pesos can move an exact half-cent below the tie.
  return (
    bracket.fixed +
    ((taxableCompensationCents - bracket.floor) * bracket.percent + 50n) / 100n
  );
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
  if (totalAnnualTaxableCents < 0n || totalTaxWithheldCents < 0n) {
    throw new RangeError(
      "Annual taxable income and withholding cannot be negative",
    );
  }
  if (isMinimumWageEarner && totalAnnualTaxableCents > 0n) {
    throw new RangeError(
      "MWE taxable compensation requires manual tax review; classify exempt wages separately",
    );
  }
  if (totalAnnualTaxableCents <= 25000000n) {
    // Under 250,000 PHP annual taxable = 0 tax
    return {
      totalAnnualTaxDueCents: 0n,
      taxAdjustmentCents: -totalTaxWithheldCents, // Refund everything withheld
    };
  }

  // Exact 2023-onwards graduated table; round only the fractional tax centavo
  // half up. Never convert cumulative centavos to a floating-point peso value.
  const brackets = [
    { ceiling: 40000000n, floor: 25000000n, fixed: 0n, percent: 15n },
    { ceiling: 80000000n, floor: 40000000n, fixed: 2250000n, percent: 20n },
    { ceiling: 200000000n, floor: 80000000n, fixed: 10250000n, percent: 25n },
    { ceiling: 800000000n, floor: 200000000n, fixed: 40250000n, percent: 30n },
  ];
  const bracket = brackets.find(
    (entry) => totalAnnualTaxableCents <= entry.ceiling,
  ) ?? { floor: 800000000n, fixed: 220250000n, percent: 35n };
  const totalAnnualTaxDueCents =
    bracket.fixed +
    ((totalAnnualTaxableCents - bracket.floor) * bracket.percent + 50n) / 100n;
  const taxAdjustmentCents = totalAnnualTaxDueCents - totalTaxWithheldCents;

  return {
    totalAnnualTaxDueCents,
    taxAdjustmentCents,
  };
}

/** A recorded settlement is a signed attestation, not extra payslip withholding. */
export function reconcileTaxAdjustment(
  annualAdjustmentCents: bigint,
  settledAdjustmentCents = 0n,
  hasRecordedSettlement = false,
) {
  const remainingDifferenceCents =
    annualAdjustmentCents - settledAdjustmentCents;
  const isSettled = hasRecordedSettlement && remainingDifferenceCents === 0n;
  const reconciliationStatus = isSettled
    ? ("SETTLED" as const)
    : remainingDifferenceCents === 0n
      ? ("BALANCED" as const)
      : remainingDifferenceCents > 0n
        ? ("DEFICIENCY_REVIEW" as const)
        : ("REFUND_REVIEW" as const);
  return { remainingDifferenceCents, isSettled, reconciliationStatus };
}
