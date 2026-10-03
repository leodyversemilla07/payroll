/**
 * DOLE Final Pay & Separation Clearance Engine
 * Development preview arithmetic, not policy/entitlement or payment approval.
 */

import { allocateNinetiethBucket } from "./other-benefits";
import { calculateSilCashConversion } from "./sil-conversion";
import { annualizeTax, reconcileTaxAdjustment } from "./withholding-tax";

export enum SeparationType {
  RESIGNATION = "RESIGNATION",
  REDUNDANCY = "REDUNDANCY", // 1 month pay per year of service (Art. 298)
  RETRENCHMENT = "RETRENCHMENT", // 0.5 month pay per year of service (Art. 298)
  CLOSURE_NON_BANKRUPT = "CLOSURE_NON_BANKRUPT", // 0.5 month pay per year of service (Art. 298)
  DISEASE = "DISEASE", // 0.5 month pay per year of service (Art. 299)
  RETIREMENT = "RETIREMENT", // RA 7641 (0.5 month + 5 days SIL + 1/12 13th month = 22.5 days per year)
}

export interface FinalPayCalculationInput {
  separationType: SeparationType;
  monthlyBasicRateCents: bigint;
  dailyRateCents: bigint;
  yearsOfService: number; // e.g. 3.5 years
  unpaidDaysWorkedInLastPeriod: number; // Days worked in cutoff prior to exit
  totalYtdBasicEarnedCents: bigint; // Jan 1 to Exit Date basic salary earned
  unusedLeaveDays: number; // SIL / VL balance
  priorMonetizedLeaveDaysInYear?: number; // Explicit history required when monetizing leave
  ytdTaxableCompensationCents: bigint;
  totalYtdTaxWithheldCents: bigint;
  settledTaxAdjustmentCents?: bigint; // Signed: deficiency withheld +, refund paid -
  thirteenthMonthAlreadyPaidCents?: bigint;
  ytdOtherBenefitsCents?: bigint; // Previous bonus and de minimis excess for the PHP 90k cap
  isMinimumWageEarner?: boolean;
  outstandingLoanBalanceCents: bigint; // Explicitly authorized deduction scenario, not merely a debt balance
  retireeAge?: number; // Age at separation; gates the RA 7641 tax exemption
  isRepeatRetirementClaim?: boolean; // RA 7641 exemption may be availed only once
  retirementBenefitTaxTreatment?: "EXEMPT" | "TAXABLE"; // Reviewed classification; no age-only inference
}

export interface FinalPayCalculationResult {
  separationType: SeparationType;
  // Earnings Components
  unpaidSalaryCents: bigint;
  proratedThirteenthMonthCents: bigint;
  monetizedLeaveCents: bigint;
  monetizedLeaveExemptCents: bigint;
  monetizedLeaveTaxableCents: bigint;
  separationPayCents: bigint; // Tax-exempt under NIRC Sec 32(B)(6)(b) if involuntary
  taxableSeparationPayCents: bigint;
  totalAnnualTaxableCompensationCents: bigint;
  totalAnnualTaxDueCents: bigint;
  annualTaxAdjustmentCents: bigint;
  settledTaxAdjustmentCents: bigint;
  taxAdjustmentCents: bigint; // Negative = Company REFUNDS tax to employee; Positive = Additional tax withheld
  grossFinalPayCents: bigint;
  // Deductions
  outstandingLoanDeductionsCents: bigint;
  finalWithholdingTaxDueCents: bigint;
  totalFinalDeductionsCents: bigint;
  // Net Settlement
  netFinalPayCents: bigint;
  signedNetFinalPayCents: bigint;
  unfundedDeductionsCents: bigint; // Shortfall remains for review; it was not collected
  isSeparationPayTaxExempt: boolean;
  remarks: string;
}

/**
 * Computes statutory separation pay based on DOLE Labor Code guidelines.
 */
export function calculateStatutorySeparationPay(
  type: SeparationType,
  monthlyBasicRateCents: bigint,
  dailyRateCents: bigint,
  yearsOfService: number,
  retireeAge?: number,
  isRepeatRetirementClaim?: boolean,
  retirementBenefitTaxTreatment?: "EXEMPT" | "TAXABLE",
): { separationPayCents: bigint; isTaxExempt: boolean } {
  if (
    !Object.values(SeparationType).includes(type) ||
    !Number.isFinite(yearsOfService) ||
    yearsOfService < 0 ||
    yearsOfService > 100 ||
    monthlyBasicRateCents < 0n ||
    dailyRateCents < 0n
  )
    throw new RangeError("Invalid separation type, rates or service years");
  // A fraction of at least 6 months is considered as one whole year per DOLE rules
  const roundedYears = BigInt(Math.max(1, Math.round(yearsOfService)));

  switch (type) {
    case SeparationType.REDUNDANCY: {
      // Art. 298: At least 1 month pay or 1 month pay for every year of service, whichever is higher
      const pay = monthlyBasicRateCents * roundedYears;
      return { separationPayCents: pay, isTaxExempt: true };
    }
    case SeparationType.RETRENCHMENT:
    case SeparationType.CLOSURE_NON_BANKRUPT:
    case SeparationType.DISEASE: {
      // Art. 298/299: 1 month pay or 0.5 month pay per year of service, whichever is higher
      const halfMonthPay = (monthlyBasicRateCents * roundedYears) / 2n;
      const pay =
        halfMonthPay > monthlyBasicRateCents
          ? halfMonthPay
          : monthlyBasicRateCents;
      return { separationPayCents: pay, isTaxExempt: true };
    }
    case SeparationType.RETIREMENT: {
      // RA 7641 covers employees with at least 5 years of service. Shorter
      // tenure carries no statutory retirement benefit (unless a CBA grants one).
      if (yearsOfService < 5) {
        return { separationPayCents: 0n, isTaxExempt: false };
      }
      // RA 7641: 0.5 month salary (15 days) + 5 days SIL + 1/12 of 13th month (2.5 days) = 22.5 days pay per year
      const daysPerYear = 22.5;
      const daysScaled = BigInt(Math.round(daysPerYear * 100));
      const payPerYear = (dailyRateCents * daysScaled) / 100n;
      const pay = payPerYear * roundedYears;
      // This models only the RA 7641 amount, not a qualified private plan.
      // Missing age/coverage or early retirement requires a different policy.
      if (
        retireeAge === undefined ||
        !Number.isInteger(retireeAge) ||
        retireeAge < 60 ||
        retireeAge > 120
      )
        throw new RangeError(
          "RA 7641 retirement preview requires a known age of at least 60; private-plan/early retirement requires manual review",
        );
      if (
        retirementBenefitTaxTreatment === "EXEMPT" &&
        isRepeatRetirementClaim !== false
      )
        throw new RangeError(
          "Retirement exemption needs explicitly reviewed claim history",
        );
      return {
        separationPayCents: pay,
        isTaxExempt: retirementBenefitTaxTreatment === "EXEMPT",
      };
    }
    default:
      // Voluntary resignation carries NO statutory separation pay unless in CBA/company policy
      return { separationPayCents: 0n, isTaxExempt: false };
  }
}

/**
 * Master Final Pay & Clearance Settlement Calculator
 */
export function calculateFinalPay(
  input: FinalPayCalculationInput,
): FinalPayCalculationResult {
  const amounts = [
    input.monthlyBasicRateCents,
    input.dailyRateCents,
    input.totalYtdBasicEarnedCents,
    input.ytdTaxableCompensationCents,
    input.totalYtdTaxWithheldCents,
    input.outstandingLoanBalanceCents,
    input.thirteenthMonthAlreadyPaidCents ?? 0n,
    input.ytdOtherBenefitsCents ?? 0n,
  ];
  if (amounts.some((amount) => amount < 0n))
    throw new RangeError("Final-pay amounts cannot be negative");
  for (const days of [
    input.unpaidDaysWorkedInLastPeriod,
    input.unusedLeaveDays,
    input.priorMonetizedLeaveDaysInYear ?? 0,
  ]) {
    if (
      !Number.isFinite(days) ||
      days < 0 ||
      days > 366 ||
      !/^\d+(\.\d{1,2})?$/.test(String(days))
    )
      throw new RangeError(
        "Final-pay day counts must be non-negative, at most 366, and have at most two decimals",
      );
  }
  if (
    input.unusedLeaveDays > 0 &&
    input.priorMonetizedLeaveDaysInYear === undefined
  )
    throw new RangeError(
      "Leave monetization requires explicit prior monetized days; do not assume the annual exemption cap is unused",
    );
  // 1. Unpaid salary for last period days worked
  const daysWorkedScaled = BigInt(
    Math.round(input.unpaidDaysWorkedInLastPeriod * 100),
  );
  const unpaidSalaryCents = (input.dailyRateCents * daysWorkedScaled) / 100n;

  // 2. 13th-month balance due: include final unpaid salary and credit any
  // bonus already disbursed. Never repay an earlier annual release.
  const earnedBasicCents = input.totalYtdBasicEarnedCents + unpaidSalaryCents;
  const entitlementCents = earnedBasicCents / 12n;
  const alreadyPaidCents = input.thirteenthMonthAlreadyPaidCents ?? 0n;
  const proratedThirteenthMonthCents =
    entitlementCents > alreadyPaidCents
      ? entitlementCents - alreadyPaidCents
      : 0n;
  const thirteenthMonthBucket = allocateNinetiethBucket({
    ytdUsedCents: input.ytdOtherBenefitsCents ?? alreadyPaidCents,
    periodBonusesCents: proratedThirteenthMonthCents,
  });

  // 3. Unused Leave Monetization (SIL / VL)
  const leaveCalc = calculateSilCashConversion({
    dailyRateCents: input.dailyRateCents,
    unusedLeaveDays: input.unusedLeaveDays,
    priorMonetizedDaysInYear: input.priorMonetizedLeaveDaysInYear,
  });

  // 4. Separation Pay
  const { separationPayCents, isTaxExempt } = calculateStatutorySeparationPay(
    input.separationType,
    input.monthlyBasicRateCents,
    input.dailyRateCents,
    input.yearsOfService,
    input.retireeAge,
    input.isRepeatRetirementClaim,
    input.retirementBenefitTaxTreatment,
  );
  if (
    input.separationType === SeparationType.RETIREMENT &&
    separationPayCents > 0n &&
    input.retirementBenefitTaxTreatment === undefined
  )
    throw new RangeError(
      "Retirement benefit tax treatment must be reviewed explicitly",
    );
  const taxableSeparationPayCents = isTaxExempt ? 0n : separationPayCents;

  // 5. Tax Annualization
  // Note: Separation pay from redundancy/retrenchment is 100% tax-exempt.
  // Taxable monetized leaves excess spills into taxable compensation.
  const adjustedYtdTaxableCents =
    input.ytdTaxableCompensationCents +
    unpaidSalaryCents +
    leaveCalc.taxablePortionCents +
    thirteenthMonthBucket.taxableCents +
    taxableSeparationPayCents;

  const annualization = annualizeTax(
    adjustedYtdTaxableCents,
    input.totalYtdTaxWithheldCents,
    input.isMinimumWageEarner ?? false,
  );
  const settledTaxAdjustmentCents = input.settledTaxAdjustmentCents ?? 0n;
  const { remainingDifferenceCents: taxAdjustmentCents } =
    reconcileTaxAdjustment(
      annualization.taxAdjustmentCents,
      settledTaxAdjustmentCents,
    );

  // 6. Gross Settlement
  const grossFinalPayCents =
    unpaidSalaryCents +
    proratedThirteenthMonthCents +
    leaveCalc.totalMonetizedCashCents +
    separationPayCents;

  // 7. Deductions
  let finalWithholdingTaxDueCents = 0n;
  if (taxAdjustmentCents > 0n) {
    // Employee owes additional tax
    finalWithholdingTaxDueCents = taxAdjustmentCents;
  }

  const outstandingLoanDeductionsCents = input.outstandingLoanBalanceCents;
  const totalFinalDeductionsCents =
    finalWithholdingTaxDueCents + outstandingLoanDeductionsCents;

  // 8. Net Settlement (Add tax refund if taxAdjustmentCents < 0n)
  let netFinalPayCents = grossFinalPayCents - totalFinalDeductionsCents;
  if (taxAdjustmentCents < 0n) {
    // Refund tax to employee!
    const refundAmountCents = -taxAdjustmentCents;
    netFinalPayCents += refundAmountCents;
  }

  const signedNetFinalPayCents = netFinalPayCents;
  const unfundedDeductionsCents =
    netFinalPayCents < 0n ? -netFinalPayCents : 0n;
  if (netFinalPayCents < 0n) netFinalPayCents = 0n;

  const retirementIneligible =
    input.separationType === SeparationType.RETIREMENT &&
    separationPayCents === 0n;

  const remarks =
    `Final-pay preview for ${input.separationType}; no payment, withholding or loan collection was posted. ` +
    (retirementIneligible
      ? "No statutory retirement benefit: RA 7641 requires at least 5 years of service. "
      : "") +
    (taxAdjustmentCents < 0n
      ? "Includes a remaining tax refund to review, not an issued BIR form or proof of payment. "
      : "") +
    (unfundedDeductionsCents > 0n
      ? "Available final pay cannot cover the proposed deductions; the unfunded balance remains for review."
      : "");

  return {
    separationType: input.separationType,
    unpaidSalaryCents,
    proratedThirteenthMonthCents,
    monetizedLeaveCents: leaveCalc.totalMonetizedCashCents,
    monetizedLeaveExemptCents: leaveCalc.taxExemptDeMinimisCents,
    monetizedLeaveTaxableCents: leaveCalc.taxablePortionCents,
    separationPayCents,
    taxableSeparationPayCents,
    totalAnnualTaxableCompensationCents: adjustedYtdTaxableCents,
    totalAnnualTaxDueCents: annualization.totalAnnualTaxDueCents,
    annualTaxAdjustmentCents: annualization.taxAdjustmentCents,
    settledTaxAdjustmentCents,
    taxAdjustmentCents,
    grossFinalPayCents,
    outstandingLoanDeductionsCents,
    finalWithholdingTaxDueCents,
    totalFinalDeductionsCents,
    netFinalPayCents,
    signedNetFinalPayCents,
    unfundedDeductionsCents,
    isSeparationPayTaxExempt: isTaxExempt,
    remarks,
  };
}
