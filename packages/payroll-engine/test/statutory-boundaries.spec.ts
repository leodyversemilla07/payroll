import { describe, expect, it } from "vitest";
import type { AttendanceSummary } from "../src/index.js";
import {
  annualizeTax,
  calculatePhilhealthContribution,
  calculatePhilippinePayroll,
  calculatePagibigContribution,
  calculateSssContribution,
  calculateWithholdingTax,
  CutoffType,
  DeMinimisCategory,
  evaluateAllowances,
  PayBasis,
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

    it("exempts minimum wage earners regardless of amounts", () => {
      const result = annualizeTax(999999999n, 12345n, true);
      expect(result.totalAnnualTaxDueCents).toBe(0n);
      expect(result.taxAdjustmentCents).toBe(-12345n);
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
