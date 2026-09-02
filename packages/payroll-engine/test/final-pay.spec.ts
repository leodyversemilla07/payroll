import { describe, expect, it } from "vitest";
import {
  calculateFinalPay,
  calculateStatutorySeparationPay,
  SeparationType,
} from "../src/index";

describe("DOLE Final Pay & Separation Settlement Engine", () => {
  it("Scenario 1: Voluntary Resignation with pro-rated 13th month, unused leaves, and loan balance", () => {
    // Employee resigns on August 31 (8 months served in year)
    // Monthly salary: PHP 50,000.00 (5,000,000 cents), Daily rate: PHP 2,298.85 (229,885 cents)
    const result = calculateFinalPay({
      separationType: SeparationType.RESIGNATION,
      monthlyBasicRateCents: 5000000n,
      dailyRateCents: 229885n,
      yearsOfService: 2.0,
      unpaidDaysWorkedInLastPeriod: 5, // 5 days worked in final cutoff
      totalYtdBasicEarnedCents: 40000000n, // 50,000 * 8 months = PHP 400,000.00
      unusedLeaveDays: 6, // 6 days unused SIL/VL
      ytdTaxableCompensationCents: 38000000n,
      totalYtdTaxWithheldCents: 3000000n,
      outstandingLoanBalanceCents: 500000n, // PHP 5,000.00 company advance
    });

    // 1. Resignation carries 0 statutory separation pay
    expect(result.separationPayCents).toBe(0n);

    // 2. Unpaid salary: 5 days * 2,298.85 = PHP 11,494.25
    expect(result.unpaidSalaryCents).toBe(1149425n);

    // 3. Pro-rated 13th month: 400,000 / 12 = PHP 33,333.33
    expect(result.proratedThirteenthMonthCents).toBe(3333333n);

    // 4. Monetized leave: 6 days * 2,298.85 = PHP 13,793.10 (100% tax-exempt under 10-day cap)
    expect(result.monetizedLeaveCents).toBe(1379310n);
    expect(result.monetizedLeaveExemptCents).toBe(1379310n);
    expect(result.monetizedLeaveTaxableCents).toBe(0n);

    // 5. Outstanding loan deducted
    expect(result.outstandingLoanDeductionsCents).toBe(500000n);

    // 6. Gross & Net settlement verified
    expect(result.grossFinalPayCents).toBe(
      result.unpaidSalaryCents + result.proratedThirteenthMonthCents + result.monetizedLeaveCents
    );
    expect(result.netFinalPayCents).toBeGreaterThan(0n);
  });

  it("Scenario 2: Involuntary Separation due to Redundancy (1 month per year of service)", () => {
    // 3 years of service at PHP 60,000 / month
    const separation = calculateStatutorySeparationPay(
      SeparationType.REDUNDANCY,
      6000000n,
      275862n,
      3.0
    );

    // 3 years * 60,000 = PHP 180,000.00 (18,000,000 cents)
    expect(separation.separationPayCents).toBe(18000000n);
    // Mandatory tax-exempt under Philippine Tax Code Sec 32(B)(6)(b)
    expect(separation.isTaxExempt).toBe(true);
  });

  it("Scenario 3: Retrenchment to prevent business losses (0.5 month per year of service)", () => {
    // 4 years of service at PHP 40,000 / month
    const separation = calculateStatutorySeparationPay(
      SeparationType.RETRENCHMENT,
      4000000n,
      183908n,
      4.0
    );

    // 4 years * 0.5 month = 2 months * 40,000 = PHP 80,000.00
    expect(separation.separationPayCents).toBe(8000000n);
    expect(separation.isTaxExempt).toBe(true);
  });
});
