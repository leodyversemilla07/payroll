import { describe, expect, it } from "vitest";
import type {
  AttendanceSummary,
  PayrollCalculationInput,
} from "../src/index.js";
import {
  allocateNinetiethBucket,
  annualizeTax,
  CutoffType,
  calculateEmployee13thMonth,
  calculateFinalPay,
  calculateMealAllowanceCap,
  calculatePagibigContribution,
  calculatePhilhealthContribution,
  calculatePhilippinePayroll,
  calculateSssContribution,
  calculateStatutorySeparationPay,
  calculateWithholdingTax,
  DeMinimisCategory,
  evaluateAllowances,
  PayBasis,
  SeparationType,
  WorkDayDivisor,
} from "../src/index.js";

const EMPTY_ATTENDANCE: AttendanceSummary = {
  regularHoursWorked: 0,
  tardinessMinutes: 0,
  undertimeMinutes: 0,
  absentDays: 0,
  regularOvertimeHours: 0,
  restDayHours: 0,
  restDayOvertimeHours: 0,
  specialHolidayHours: 0,
  specialHolidayOvertimeHours: 0,
  specialHolidayRestDayHours: 0,
  specialHolidayRestDayOvertimeHours: 0,
  regularHolidayHours: 0,
  regularHolidayOvertimeHours: 0,
  regularHolidayRestDayHours: 0,
  regularHolidayRestDayOvertimeHours: 0,
  regularNightDiffHours: 0,
  overtimeNightDiffHours: 0,
  restDayNightDiffHours: 0,
  holidayNightDiffHours: 0,
};

describe("Statutory boundary conditions", () => {
  describe("SSS monthly salary credit steps", () => {
    it("keeps the minimum MSC of PHP 5,000 just below the first step", () => {
      const sss = calculateSssContribution(524999n); // PHP 5,249.99
      expect(sss.employeeShareCents).toBe(25000n); // 5% of 5,000
      expect(sss.employerShareCents).toBe(51000n); // 10% of 5,000 + PHP 10 EC
      expect(sss.ecShareCents).toBe(1000n);
      expect(sss.wispEmployeeCents).toBe(0n);
    });

    it("steps up to PHP 5,500 MSC at exactly PHP 5,250", () => {
      const sss = calculateSssContribution(525000n); // PHP 5,250.00
      expect(sss.employeeShareCents).toBe(27500n); // 5% of 5,500
      expect(sss.employerShareCents).toBe(56000n); // 10% of 5,500 + PHP 10 EC
      expect(sss.ecShareCents).toBe(1000n);
    });
  });

  describe("SSS Employees' Compensation threshold", () => {
    it("charges PHP 10 EC at MSC PHP 14,500", () => {
      const sss = calculateSssContribution(1450000n); // PHP 14,500 -> MSC 14,500
      expect(sss.employeeShareCents).toBe(72500n);
      expect(sss.employerShareCents).toBe(146000n); // 1,450 + 10 EC
      expect(sss.ecShareCents).toBe(1000n);
    });

    it("charges PHP 30 EC once MSC passes PHP 14,500", () => {
      const sss = calculateSssContribution(1475000n); // PHP 14,750 -> MSC 15,000
      expect(sss.employeeShareCents).toBe(75000n);
      expect(sss.employerShareCents).toBe(153000n); // 1,500 + 30 EC
      expect(sss.ecShareCents).toBe(3000n);
    });
  });

  describe("SSS WISP onset above the PHP 20,000 regular cap", () => {
    it("applies no WISP at exactly MSC PHP 20,000", () => {
      const sss = calculateSssContribution(2000000n); // PHP 20,000 -> MSC 20,000
      expect(sss.wispEmployeeCents).toBe(0n);
      expect(sss.wispEmployerCents).toBe(0n);
    });

    it("starts WISP on the first peso above MSC PHP 20,000", () => {
      const sss = calculateSssContribution(2050000n); // PHP 20,500 -> MSC 20,500
      // Regular 20,000: EE 1,000 / ER 2,000. WISP 500: EE 25 / ER 50. EC 30.
      expect(sss.employeeShareCents).toBe(102500n);
      expect(sss.employerShareCents).toBe(208000n);
      expect(sss.wispEmployeeCents).toBe(2500n);
      expect(sss.wispEmployerCents).toBe(5000n);
      expect(sss.ecShareCents).toBe(3000n);
      expect(sss.totalCents).toBe(310500n);
    });
  });

  describe("PhilHealth floor and ceiling", () => {
    it("computes exactly at the PHP 10,000 floor", () => {
      const ph = calculatePhilhealthContribution(1000000n);
      expect(ph.employeeShareCents).toBe(25000n);
      expect(ph.employerShareCents).toBe(25000n);
      expect(ph.totalCents).toBe(50000n);
    });

    it("computes exactly at the PHP 100,000 ceiling", () => {
      const ph = calculatePhilhealthContribution(10000000n);
      expect(ph.employeeShareCents).toBe(250000n);
      expect(ph.employerShareCents).toBe(250000n);
      expect(ph.totalCents).toBe(500000n);
    });
  });

  describe("Pag-IBIG rate threshold and base cap", () => {
    it("charges 1% employee share at exactly PHP 1,500", () => {
      const pagibig = calculatePagibigContribution(150000n);
      expect(pagibig.employeeShareCents).toBe(1500n);
      expect(pagibig.employerShareCents).toBe(3000n);
      expect(pagibig.totalCents).toBe(4500n);
    });

    it("charges 2% employee share one peso above PHP 1,500", () => {
      const pagibig = calculatePagibigContribution(150100n);
      expect(pagibig.employeeShareCents).toBe(3002n);
      expect(pagibig.employerShareCents).toBe(3002n);
    });

    it("holds contributions flat at and above the PHP 10,000 base cap", () => {
      const atCap = calculatePagibigContribution(1000000n);
      const aboveCap = calculatePagibigContribution(1000100n);
      expect(atCap.employeeShareCents).toBe(20000n);
      expect(atCap.employerShareCents).toBe(20000n);
      expect(aboveCap).toEqual(atCap);
    });
  });

  describe("Withholding tax bracket edges", () => {
    it("charges zero at exactly PHP 10,417 semi-monthly and 15 centavos one peso above", () => {
      expect(calculateWithholdingTax(1041700n, true, false)).toBe(0n);
      expect(calculateWithholdingTax(1041800n, true, false)).toBe(15n);
    });

    it("charges zero at exactly PHP 20,833 monthly and 15 centavos one peso above", () => {
      expect(calculateWithholdingTax(2083300n, false, false)).toBe(0n);
      expect(calculateWithholdingTax(2083400n, false, false)).toBe(15n);
    });

    it("charges zero on zero taxable compensation", () => {
      expect(calculateWithholdingTax(0n, true, false)).toBe(0n);
    });
  });

  describe("Annual tax adjustment at the PHP 250,000 exemption", () => {
    it("owes nothing and refunds everything withheld at exactly PHP 250,000", () => {
      const result = annualizeTax(25000000n, 500000n, false);
      expect(result.totalAnnualTaxDueCents).toBe(0n);
      expect(result.taxAdjustmentCents).toBe(-500000n);
    });

    it("starts the 15% bracket one peso above PHP 250,000", () => {
      const result = annualizeTax(25000100n, 0n, false);
      expect(result.totalAnnualTaxDueCents).toBe(15n);
      expect(result.taxAdjustmentCents).toBe(15n);
    });

    it("blocks unclassified MWE taxable income instead of applying a blanket exemption", () => {
      expect(() => annualizeTax(999999999n, 12345n, true)).toThrow(
        "manual tax review",
      );
      expect(annualizeTax(0n, 12345n, true).taxAdjustmentCents).toBe(-12345n);
    });
  });

  describe("De minimis OTHER category", () => {
    it("treats the zero-limit OTHER category as fully taxable excess", () => {
      const result = evaluateAllowances(
        [
          {
            name: "Unclassified benefit",
            amountCents: 50000n,
            isTaxable: false,
            deMinimisCategory: DeMinimisCategory.OTHER,
          },
        ],
        true,
      );
      expect(result.nonTaxableAllowancesCents).toBe(0n);
      expect(result.deMinimisExcessTaxableCents).toBe(50000n);
      expect(result.taxableAllowancesCents).toBe(50000n);
    });
  });

  describe("overtime meal allowance cap", () => {
    it("caps meals at 30% of the regional minimum wage per OT day", () => {
      // NCR PHP 755/day x 5 OT days x 30% = PHP 1,132.50.
      expect(calculateMealAllowanceCap(75500n, 5)).toBe(113250n);
      expect(calculateMealAllowanceCap(75500n, 0)).toBe(0n);
      expect(calculateMealAllowanceCap(75500n, -2)).toBe(0n);
      expect(calculateMealAllowanceCap(0n, 5)).toBe(0n);
      // Fractional days floor to whole days actually worked.
      expect(calculateMealAllowanceCap(75500n, 2.9)).toBe(45300n);
    });
  });

  describe("RR 29-2025 de minimis ceilings", () => {
    it("exempts rice subsidy up to PHP 2,500 per month", () => {
      // PHP 3,000 semi-monthly rice grant against a PHP 1,250 cutoff limit.
      const result = evaluateAllowances(
        [
          {
            name: "Rice Subsidy",
            amountCents: 300000n,
            isTaxable: false,
            deMinimisCategory: DeMinimisCategory.RICE_SUBSIDY,
          },
        ],
        true,
      );
      expect(result.nonTaxableAllowancesCents).toBe(125000n);
      expect(result.deMinimisExcessTaxableCents).toBe(175000n);
      expect(result.taxableAllowancesCents).toBe(175000n);
    });

    it("caps uniform allowance at PHP 8,000 per year", () => {
      // PHP 8,000 annual grant against a PHP 4,000 cutoff limit.
      const result = evaluateAllowances(
        [
          {
            name: "Uniform Allowance",
            amountCents: 800000n,
            isTaxable: false,
            deMinimisCategory: DeMinimisCategory.UNIFORM_CLOTHING,
          },
        ],
        true,
      );
      expect(result.nonTaxableAllowancesCents).toBe(33333n);
      expect(result.deMinimisExcessTaxableCents).toBe(766667n);
    });
  });

  describe("RA 7641 retirement eligibility", () => {
    const dailyRateCents = 200000n; // PHP 2,000.00 / day

    it("grants no statutory benefit below 5 years of service", () => {
      const separation = calculateStatutorySeparationPay(
        SeparationType.RETIREMENT,
        5000000n,
        dailyRateCents,
        4.0,
        61,
      );
      expect(separation.separationPayCents).toBe(0n);
      expect(separation.isTaxExempt).toBe(false);
    });

    it("does not round a 6-month fraction into the five-year eligibility minimum", () => {
      const separation = calculateStatutorySeparationPay(
        SeparationType.RETIREMENT,
        5000000n,
        dailyRateCents,
        4.5,
        60,
      );
      expect(separation.separationPayCents).toBe(0n);
      expect(separation.isTaxExempt).toBe(false);
    });

    it("taxes the benefit when claimed a second time", () => {
      const separation = calculateStatutorySeparationPay(
        SeparationType.RETIREMENT,
        5000000n,
        dailyRateCents,
        10.0,
        65,
        true,
      );
      expect(separation.separationPayCents).toBe(45000000n);
      expect(separation.isTaxExempt).toBe(false);
    });

    it("blocks early retirement rather than guessing private-plan coverage or tax treatment", () => {
      expect(() =>
        calculateStatutorySeparationPay(
          SeparationType.RETIREMENT,
          5000000n,
          dailyRateCents,
          10,
          55,
        ),
      ).toThrow("manual review");
    });

    it("explains ineligibility in the final-pay remarks", () => {
      const result = calculateFinalPay({
        separationType: SeparationType.RETIREMENT,
        monthlyBasicRateCents: 5000000n,
        dailyRateCents,
        yearsOfService: 3.0,
        unpaidDaysWorkedInLastPeriod: 0,
        totalYtdBasicEarnedCents: 30000000n,
        unusedLeaveDays: 0,
        ytdTaxableCompensationCents: 30000000n,
        totalYtdTaxWithheldCents: 2000000n,
        outstandingLoanBalanceCents: 0n,
        retireeAge: 62,
      });
      expect(result.separationPayCents).toBe(0n);
      expect(result.remarks).toContain("at least 5 years");
    });
  });

  describe("PHP 90,000 other-benefits bucket", () => {
    // PHP 30,000/mo, first cutoff, all statutory deducted in FIRST_CUTOFF.
    // Rice grant PHP 3,000 semi-monthly: PHP 1,250 within-limit exempt,
    // PHP 1,750 excess joining the bucket.
    function bucketInput(
      ytdOtherBenefitsCents?: bigint,
      periodBonusesCents?: bigint,
    ): PayrollCalculationInput {
      return {
        cutoffType: CutoffType.FIRST_CUTOFF,
        schedule: {
          deductSssIn: "FIRST_CUTOFF",
          deductPhilhealthIn: "FIRST_CUTOFF",
          deductPagibigIn: "FIRST_CUTOFF",
          deductTaxIn: "FIRST_CUTOFF",
        },
        compensation: {
          payBasis: PayBasis.MONTHLY,
          monthlyBasicRateCents: 3000000n,
          divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
          isMinimumWageEarner: false,
        },
        attendance: { ...EMPTY_ATTENDANCE },
        allowances: [
          {
            name: "Rice Subsidy",
            amountCents: 300000n,
            isTaxable: false,
            deMinimisCategory: DeMinimisCategory.RICE_SUBSIDY,
          },
        ],
        loans: [],
        ytdOtherBenefitsCents,
        periodBonusesCents,
      };
    }

    it("keeps excess fully taxable without YTD history (legacy)", () => {
      const result = calculatePhilippinePayroll(bucketInput());
      expect(result.deMinimisExcessTaxableCents).toBe(175000n);
      expect(result.taxableAllowancesCents).toBe(175000n);
      expect(result.nonTaxableAllowancesCents).toBe(125000n);
      expect(result.ytdOtherBenefitsTotalCents).toBe(175000n);
      // Taxable income PHP 14,300 -> (14,300 - 10,417) x 15% = PHP 582.45.
      expect(result.withholdingTaxCents).toBe(58245n);
    });

    it("exempts excess within remaining cap when history is empty", () => {
      const result = calculatePhilippinePayroll(bucketInput(0n));
      expect(result.deMinimisExcessTaxableCents).toBe(175000n);
      expect(result.taxableAllowancesCents).toBe(0n);
      expect(result.nonTaxableAllowancesCents).toBe(300000n);
      expect(result.ytdOtherBenefitsTotalCents).toBe(175000n);
      // Taxable income PHP 12,550 -> (12,550 - 10,417) x 15% = PHP 319.95.
      expect(result.withholdingTaxCents).toBe(31995n);
    });

    it("splits excess at the cap boundary", () => {
      const result = calculatePhilippinePayroll(bucketInput(8900000n));
      // PHP 1,000 of cap left: PHP 1,000 exempt, PHP 750 taxable.
      expect(result.taxableAllowancesCents).toBe(75000n);
      expect(result.nonTaxableAllowancesCents).toBe(225000n);
      expect(result.ytdOtherBenefitsTotalCents).toBe(9075000n);
      // Taxable income PHP 13,300 -> (13,300 - 10,417) x 15% = PHP 432.45.
      expect(result.withholdingTaxCents).toBe(43245n);
    });

    it("taxes all excess once the cap is exhausted", () => {
      const legacy = calculatePhilippinePayroll(bucketInput());
      const result = calculatePhilippinePayroll(bucketInput(9000000n));
      expect(result.taxableAllowancesCents).toBe(legacy.taxableAllowancesCents);
      expect(result.withholdingTaxCents).toBe(legacy.withholdingTaxCents);
      expect(result.ytdOtherBenefitsTotalCents).toBe(9175000n);
    });

    it("routes current-period bonuses through the same bucket", () => {
      const result = calculatePhilippinePayroll(bucketInput(0n, 5000000n));
      // PHP 50,000 bonus + PHP 1,750 excess = PHP 51,750, all within cap.
      expect(result.taxableAllowancesCents).toBe(0n);
      expect(result.nonTaxableAllowancesCents).toBe(5300000n);
      expect(result.grossPayCents).toBe(1500000n + 5300000n);
      expect(result.ytdOtherBenefitsTotalCents).toBe(5175000n);
    });

    it("allocates the bucket directly", () => {
      expect(
        allocateNinetiethBucket({
          ytdUsedCents: 8900000n,
          periodBonusesCents: 50000n,
          periodDeMinimisExcessCents: 175000n,
        }),
      ).toEqual({
        exemptCents: 100000n,
        taxableCents: 125000n,
        totalUsedCents: 9125000n,
      });
      // Negative history clamps to zero instead of granting extra room.
      expect(allocateNinetiethBucket({ ytdUsedCents: -5n })).toEqual({
        exemptCents: 0n,
        taxableCents: 0n,
        totalUsedCents: 0n,
      });
    });
  });

  describe("PD 851 one-month service minimum", () => {
    it("grants no 13th-month pay below one month of service", () => {
      const result = calculateEmployee13thMonth({
        employeeId: "emp-1",
        employeeNumber: "EMP-1",
        fullName: "Short Timer",
        monthlyBasicRateCents: 3000000n,
        hireDate: "2026-12-20",
        monthsWorkedInYear: 0,
        unpaidAbsenceDays: 0,
      });
      expect(result.thirteenthMonthPayCents).toBe(0n);
      expect(result.monthsWorked).toBe(0);
    });
  });

  describe("SPLIT_EQUAL cutoff scheduling", () => {
    it("halves monthly contributions per cutoff, truncating odd centavos", () => {
      // PHP 33,334 salary: SSS EE 1,675.00, PhilHealth EE 833.35, Pag-IBIG EE 200.00.
      const result = calculatePhilippinePayroll({
        cutoffType: CutoffType.FIRST_CUTOFF,
        schedule: {
          deductSssIn: "SPLIT_EQUAL",
          deductPhilhealthIn: "SPLIT_EQUAL",
          deductPagibigIn: "SPLIT_EQUAL",
          deductTaxIn: "SPLIT_EQUAL",
        },
        compensation: {
          payBasis: PayBasis.MONTHLY,
          monthlyBasicRateCents: 3333400n,
          divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
          isMinimumWageEarner: false,
        },
        attendance: { ...EMPTY_ATTENDANCE },
        allowances: [],
        loans: [],
      });

      expect(result.sssContribution.employeeShareCents).toBe(83750n);
      // 83,335 / 2 truncates the half centavo; the two cutoffs sum to
      // 83,334, leaving a one-centavo monthly reconciliation gap.
      expect(result.philhealthContribution.employeeShareCents).toBe(41667n);
      expect(result.pagibigContribution.employeeShareCents).toBe(10000n);
      expect(result.totalStatutoryEmployeeCents).toBe(135417n);
    });
  });
});
