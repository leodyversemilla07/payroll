/**
 * DOLE Final Pay & Separation Clearance Engine
 * Compliant with DOLE Labor Advisory No. 06, Series of 2020 & Labor Code Articles 298-299
 */

import { calculateSilCashConversion } from "./sil-conversion";
import { calculateThirteenthMonthPayout } from "./thirteenth-month";
import { annualizeTax } from "./withholding-tax";

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
  ytdTaxableCompensationCents: bigint;
  totalYtdTaxWithheldCents: bigint;
  outstandingLoanBalanceCents: bigint; // Company cash advances / loans
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
  taxAdjustmentCents: bigint; // Negative = Company REFUNDS tax to employee; Positive = Additional tax withheld
  grossFinalPayCents: bigint;
  // Deductions
  outstandingLoanDeductionsCents: bigint;
  finalWithholdingTaxDueCents: bigint;
  totalFinalDeductionsCents: bigint;
  // Net Settlement
  netFinalPayCents: bigint;
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
): { separationPayCents: bigint; isTaxExempt: boolean } {
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
      // RA 7641: 0.5 month salary (15 days) + 5 days SIL + 1/12 of 13th month (2.5 days) = 22.5 days pay per year
      const daysPerYear = 22.5;
      const daysScaled = BigInt(Math.round(daysPerYear * 100));
      const payPerYear = (dailyRateCents * daysScaled) / 100n;
      const pay = payPerYear * roundedYears;
      return { separationPayCents: pay, isTaxExempt: true };
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
  // 1. Unpaid salary for last period days worked
  const daysWorkedScaled = BigInt(
    Math.round(input.unpaidDaysWorkedInLastPeriod * 100),
  );
  const unpaidSalaryCents = (input.dailyRateCents * daysWorkedScaled) / 100n;

  // 2. Pro-rated 13th Month Pay (Total YTD Basic / 12)
  const thirteenthMonth = calculateThirteenthMonthPayout(
    input.totalYtdBasicEarnedCents,
    0n,
  );
  const proratedThirteenthMonthCents = thirteenthMonth.thirteenthMonthPayCents;

  // 3. Unused Leave Monetization (SIL / VL)
  const leaveCalc = calculateSilCashConversion({
    dailyRateCents: input.dailyRateCents,
    unusedLeaveDays: input.unusedLeaveDays,
  });

  // 4. Separation Pay
  const { separationPayCents, isTaxExempt } = calculateStatutorySeparationPay(
    input.separationType,
    input.monthlyBasicRateCents,
    input.dailyRateCents,
    input.yearsOfService,
  );

  // 5. Tax Annualization
  // Note: Separation pay from redundancy/retrenchment is 100% tax-exempt.
  // Taxable monetized leaves excess spills into taxable compensation.
  const adjustedYtdTaxableCents =
    input.ytdTaxableCompensationCents +
    unpaidSalaryCents +
    leaveCalc.taxablePortionCents +
    thirteenthMonth.taxablePortionCents;

  const annualization = annualizeTax(
    adjustedYtdTaxableCents,
    input.totalYtdTaxWithheldCents,
  );
  const taxAdjustmentCents = annualization.taxAdjustmentCents; // Negative = Refund due to employee

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

  if (netFinalPayCents < 0n) {
    netFinalPayCents = 0n;
  }

  const remarks =
    `Final Pay generated for ${input.separationType}. ` +
    (taxAdjustmentCents < 0n
      ? `Includes BIR Form 2316 tax refund of ${(Number(-taxAdjustmentCents) / 100).toFixed(2)} PHP.`
      : "");

  return {
    separationType: input.separationType,
    unpaidSalaryCents,
    proratedThirteenthMonthCents,
    monetizedLeaveCents: leaveCalc.totalMonetizedCashCents,
    monetizedLeaveExemptCents: leaveCalc.taxExemptDeMinimisCents,
    monetizedLeaveTaxableCents: leaveCalc.taxablePortionCents,
    separationPayCents,
    taxAdjustmentCents,
    grossFinalPayCents,
    outstandingLoanDeductionsCents,
    finalWithholdingTaxDueCents,
    totalFinalDeductionsCents,
    netFinalPayCents,
    isSeparationPayTaxExempt: isTaxExempt,
    remarks,
  };
}
