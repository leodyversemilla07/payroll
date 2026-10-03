import { describe, expect, it } from "vitest";
import {
  annualizeTax,
  calculateFinalPay,
  calculateSilCashConversion,
  calculateStatutorySeparationPay,
  calculateWithholdingTax,
  SeparationType,
} from "../src/index";

const base = {
  separationType: SeparationType.RESIGNATION,
  monthlyBasicRateCents: 3000000n,
  dailyRateCents: 100001n,
  yearsOfService: 5,
  unpaidDaysWorkedInLastPeriod: 0,
  totalYtdBasicEarnedCents: 12000000n,
  unusedLeaveDays: 0,
  ytdTaxableCompensationCents: 12000000n,
  totalYtdTaxWithheldCents: 10000n,
  outstandingLoanBalanceCents: 0n,
};
describe("Final-pay development preview safety", () => {
  it("requires explicit prior monetization rather than assuming the exemption is unused", () => {
    expect(() => calculateFinalPay({ ...base, unusedLeaveDays: 1 })).toThrow(
      "explicit prior",
    );
  });
  it("conserves fractional leave cash across the annual exemption boundary", () => {
    const result = calculateFinalPay({
      ...base,
      unusedLeaveDays: 1,
      priorMonetizedLeaveDaysInYear: 11.5,
    });
    expect(result.monetizedLeaveCents).toBe(100001n);
    expect(result.monetizedLeaveExemptCents).toBe(50000n);
    expect(result.monetizedLeaveTaxableCents).toBe(50001n);
  });
  it("accepts genuine two-decimal day counts despite binary floating-point representation", () => {
    const result = calculateFinalPay({
      ...base,
      unpaidDaysWorkedInLastPeriod: 1.1,
      unusedLeaveDays: 1.1,
      priorMonetizedLeaveDaysInYear: 0,
    });
    expect(result.unpaidSalaryCents).toBe(110001n);
    expect(result.monetizedLeaveCents).toBe(110001n);
    expect(
      calculateSilCashConversion({
        dailyRateCents: 100001n,
        unusedLeaveDays: 1.1,
      }).totalMonetizedCashCents,
    ).toBe(110001n);
  });
  it.each([-1, 366.5, 1.001, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects unsupported day count %s",
    (days) => {
      expect(() =>
        calculateFinalPay({
          ...base,
          unusedLeaveDays: days,
          priorMonetizedLeaveDaysInYear: 0,
        }),
      ).toThrow(RangeError);
      expect(() =>
        calculateSilCashConversion({
          dailyRateCents: 100001n,
          unusedLeaveDays: days,
        }),
      ).toThrow(RangeError);
    },
  );
  it("does not refund a tax settlement a second time", () => {
    const result = calculateFinalPay({
      ...base,
      settledTaxAdjustmentCents: -10000n,
    });
    expect(result.annualTaxAdjustmentCents).toBe(-10000n);
    expect(result.taxAdjustmentCents).toBe(0n);
    expect(result.netFinalPayCents).toBe(result.grossFinalPayCents);
  });
  it("keeps a signed shortfall instead of reporting proposed debt as collected", () => {
    const result = calculateFinalPay({
      ...base,
      outstandingLoanBalanceCents: 2000000n,
    });
    expect(result.signedNetFinalPayCents).toBe(-990000n);
    expect(result.unfundedDeductionsCents).toBe(990000n);
    expect(result.netFinalPayCents).toBe(0n);
    expect(result.remarks).toContain("no payment");
  });
  it("requires reviewed retirement classification and explicitly first-time history for exemption", () => {
    const input = {
      ...base,
      separationType: SeparationType.RETIREMENT,
      retireeAge: 60,
    };
    expect(() => calculateFinalPay(input)).toThrow("reviewed explicitly");
    expect(() =>
      calculateFinalPay({ ...input, retirementBenefitTaxTreatment: "EXEMPT" }),
    ).toThrow("claim history");
    expect(() =>
      calculateFinalPay({
        ...input,
        retirementBenefitTaxTreatment: "EXEMPT",
        isRepeatRetirementClaim: true,
      }),
    ).toThrow("claim history");
    expect(
      calculateFinalPay({
        ...input,
        retirementBenefitTaxTreatment: "EXEMPT",
        isRepeatRetirementClaim: false,
      }).taxableSeparationPayCents,
    ).toBe(0n);
    const taxable = calculateFinalPay({
      ...input,
      retirementBenefitTaxTreatment: "TAXABLE",
      isRepeatRetirementClaim: true,
    });
    expect(taxable.taxableSeparationPayCents).toBe(taxable.separationPayCents);
    expect(taxable.totalAnnualTaxableCompensationCents).toBe(
      base.ytdTaxableCompensationCents + taxable.separationPayCents,
    );
  });
  it.each([4.5, 4.99, 4.999999])(
    "does not round %s service years into statutory retirement eligibility",
    (years) => {
      expect(
        calculateStatutorySeparationPay(
          SeparationType.RETIREMENT,
          3000000n,
          100001n,
          years,
          60,
        ).separationPayCents,
      ).toBe(0n);
    },
  );
  it.each([undefined, 59, Number.NaN])(
    "does not infer coverage from age %s",
    (age) => {
      expect(() =>
        calculateStatutorySeparationPay(
          SeparationType.RETIREMENT,
          3000000n,
          100001n,
          5,
          age,
        ),
      ).toThrow("manual review");
    },
  );
  it("refuses MWE taxable extras and negative annual inputs", () => {
    expect(() => annualizeTax(1n, 0n, true)).toThrow("manual tax review");
    expect(() => annualizeTax(-1n, 0n)).toThrow(RangeError);
    expect(() => annualizeTax(0n, -1n)).toThrow(RangeError);
  });
});

describe("Integer-only periodic withholding", () => {
  it.each([
    [true, 1041710n],
    [false, 2083310n],
  ] as const)(
    "rounds an exact half-tax-cent up (semi-monthly=%s)",
    (semi, amount) => {
      expect(calculateWithholdingTax(amount, semi)).toBe(2n);
    },
  );
  it.each([
    [true, 33333300n, 9177070n],
    [false, 66666700n, 18354180n],
  ] as const)(
    "preserves exact high-value centavos (semi-monthly=%s)",
    (semi, floor, fixed) => {
      const amount = 12345678901234567n;
      expect(calculateWithholdingTax(amount, semi)).toBe(
        fixed + ((amount - floor) * 35n + 50n) / 100n,
      );
    },
  );
  it.each([
    [true, 1666700n, 93750n],
    [true, 3333300n, 427070n],
    [true, 8333300n, 1677070n],
    [true, 33333300n, 9177070n],
    [false, 3333300n, 187500n],
    [false, 6666700n, 854180n],
    [false, 16666700n, 3354180n],
    [false, 66666700n, 18354180n],
  ] as const)(
    "preserves the configured bracket edge %s %s",
    (semi, amount, expected) => {
      expect(calculateWithholdingTax(amount, semi)).toBe(expected);
      expect(calculateWithholdingTax(amount + 1n, semi)).toBe(expected);
    },
  );
});
