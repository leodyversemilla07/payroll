import { describe, expect, it } from "vitest";
import { calculateSilCashConversion } from "../src/index";

describe("DOLE Service Incentive Leave (SIL) & Monetization Engine", () => {
  it("should monetize standard 5 days of unused SIL as 100% tax-exempt De Minimis", () => {
    // Daily rate: PHP 1,000.00 (100,000 cents)
    const dailyRateCents = 100000n;
    const result = calculateSilCashConversion({
      dailyRateCents,
      unusedLeaveDays: 5,
    });

    // 5 days * 1,000 = PHP 5,000.00
    expect(result.totalMonetizedCashCents).toBe(500000n);
    expect(result.taxExemptDeMinimisCents).toBe(500000n);
    expect(result.taxablePortionCents).toBe(0n);
  });

  it("should clamp tax exemption to the BIR 12-day ceiling (RR 29-2025)", () => {
    // 15 days unused leave monetization, Daily rate: PHP 2,000.00 (200,000 cents)
    const dailyRateCents = 200000n;
    const result = calculateSilCashConversion({
      dailyRateCents,
      unusedLeaveDays: 15,
    });

    // Total: 15 * 2,000 = PHP 30,000.00
    expect(result.totalMonetizedCashCents).toBe(3000000n);
    // 12 days exempt: 12 * 2,000 = PHP 24,000.00
    expect(result.taxExemptDeMinimisCents).toBe(2400000n);
    // 3 days excess: 3 * 2,000 = PHP 6,000.00
    expect(result.taxablePortionCents).toBe(600000n);
  });

  it("should handle fractional leave balances accurately", () => {
    // 3.5 days unused, Daily rate: PHP 1,500.00
    const dailyRateCents = 150000n;
    const result = calculateSilCashConversion({
      dailyRateCents,
      unusedLeaveDays: 3.5,
    });

    // 3.5 * 1,500 = PHP 5,250.00 (525,000 cents)
    expect(result.totalMonetizedCashCents).toBe(525000n);
    expect(result.taxExemptDeMinimisCents).toBe(525000n);
    expect(result.taxablePortionCents).toBe(0n);
  });
});
