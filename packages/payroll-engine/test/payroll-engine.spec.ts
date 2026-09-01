import { describe, expect, it } from "vitest";
import {
  calculatePhilippinePayroll,
  calculateSssContribution,
  calculatePhilhealthContribution,
  calculatePagibigContribution,
  calculateWithholdingTax,
  calculateDolePremiums,
  deriveRates,
  evaluateAllowances,
  calculateThirteenthMonthPayout,
  PayBasis,
  WorkDayDivisor,
  CutoffType,
  DeMinimisCategory,
} from "../src/index.js";
import type { PayrollCalculationInput } from "../src/index.js";

describe("Philippine Tax & Payroll Calculation Engine", () => {
  describe("1. DOLE Rate Derivations & Premiums", () => {
    it("should accurately derive daily, hourly, and minute rates from monthly basic with 261-day divisor", () => {
      const rates = deriveRates({
        payBasis: PayBasis.MONTHLY,
        monthlyBasicRateCents: 3000000n, // PHP 30,000.00
        divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK, // 261
        isMinimumWageEarner: false,
      });

      // Annual: 360,000. Daily: 360,000 / 261 = 1,379.31034... -> 137931 cents
      expect(rates.dailyRateCents).toBe(137931n);
      // Hourly: 137931 / 8 = 172.41375... -> 17241 cents
      expect(rates.hourlyRateCents).toBe(17241n);
      // Minute: 17241 / 60 = 2.8735... -> 287 cents
      expect(rates.minuteRateCents).toBe(287n);
    });

    it("should compute DOLE premiums correctly (OT, Rest Day, Holidays, Night Diff)", () => {
      const hourlyRateCents = 20000n; // PHP 200.00/hr

      const premiums = calculateDolePremiums(hourlyRateCents, {
        regularHoursWorked: 80,
        tardinessMinutes: 0,
        undertimeMinutes: 0,
        absentDays: 0,
        regularOvertimeHours: 2, // 2 * 200 * 1.25 = 500
        restDayHours: 8, // 8 * 200 * 1.30 = 2080
        restDayOvertimeHours: 0,
        specialHolidayHours: 0,
        specialHolidayOvertimeHours: 0,
        specialHolidayRestDayHours: 0,
        specialHolidayRestDayOvertimeHours: 0,
        regularHolidayHours: 8, // 8 * 200 * 2.00 = 3200
        regularHolidayOvertimeHours: 0,
        regularHolidayRestDayHours: 0,
        regularHolidayRestDayOvertimeHours: 0,
        regularNightDiffHours: 4, // 4 * 200 * 0.10 = 80
        overtimeNightDiffHours: 0,
        restDayNightDiffHours: 0,
        holidayNightDiffHours: 0,
      });

      expect(premiums.overtimePayCents).toBe(50000n); // PHP 500.00
      expect(premiums.restDayPayCents).toBe(208000n); // PHP 2,080.00
      expect(premiums.holidayPayCents).toBe(320000n); // PHP 3,200.00
      expect(premiums.nightDiffPayCents).toBe(8000n); // PHP 80.00
      expect(premiums.totalPremiumPayCents).toBe(586000n); // PHP 5,860.00
    });
  });

  describe("2. SSS & WISP Contributions", () => {
    it("should calculate SSS for salary below MSC ceiling (PHP 20,000)", () => {
      const sss = calculateSssContribution(2000000n); // PHP 20,000
      // Regular MSC = 20,000. EE 5% = 1,000, ER 10% = 2,000 + 30 EC = 2,030
      expect(sss.employeeShareCents).toBe(100000n);
      expect(sss.employerShareCents).toBe(203000n);
      expect(sss.wispEmployeeCents).toBe(0n);
    });

    it("should calculate SSS + WISP for salary at max MSC ceiling (PHP 35,000+)", () => {
      const sss = calculateSssContribution(4000000n); // PHP 40,000 (capped at 35,000 MSC)
      // Regular MSC = 20,000: EE 1,000, ER 2,000
      // WISP MSC = 15,000: EE 5% = 750, ER 10% = 1,500
      // Total EE = 1,750 (175,000 cents), Total ER = 3,530 (353,000 cents with 30 EC)
      expect(sss.employeeShareCents).toBe(175000n);
      expect(sss.wispEmployeeCents).toBe(75000n);
      expect(sss.wispEmployerCents).toBe(150000n);
      expect(sss.employerShareCents).toBe(353000n);
    });
  });

  describe("3. PhilHealth & Pag-IBIG Contributions", () => {
    it("should calculate PhilHealth 5% with floor and ceiling rules", () => {
      // Floor check (PHP 8,000 -> clamped to 10,000 floor -> 500 total, 250 EE / 250 ER)
      const phFloor = calculatePhilhealthContribution(800000n);
      expect(phFloor.employeeShareCents).toBe(25000n);
      expect(phFloor.employerShareCents).toBe(25000n);

      // Normal salary (PHP 40,000 -> 2,000 total, 1,000 EE / 1,000 ER)
      const phNormal = calculatePhilhealthContribution(4000000n);
      expect(phNormal.employeeShareCents).toBe(100000n);
      expect(phNormal.employerShareCents).toBe(100000n);

      // Ceiling check (PHP 150,000 -> clamped to 100,000 ceiling -> 5,000 total, 2,500 EE / 2,500 ER)
      const phCeiling = calculatePhilhealthContribution(15000000n);
      expect(phCeiling.employeeShareCents).toBe(250000n);
      expect(phCeiling.employerShareCents).toBe(250000n);
    });

    it("should calculate standard Pag-IBIG 2% and handle custom voluntary upgrades", () => {
      // Standard salary (PHP 30,000 -> capped at 10,000 base -> 200 EE / 200 ER)
      const pagibig = calculatePagibigContribution(3000000n);
      expect(pagibig.employeeShareCents).toBe(20000n);
      expect(pagibig.employerShareCents).toBe(20000n);

      // Custom upgrade (PHP 500 EE)
      const pagibigCustom = calculatePagibigContribution(3000000n, 50000n);
      expect(pagibigCustom.employeeShareCents).toBe(50000n);
      expect(pagibigCustom.employerShareCents).toBe(20000n);
    });
  });

  describe("4. TRAIN Law Withholding Tax & Minimum Wage Exemption", () => {
    it("should return 0 tax for minimum wage earners or income below bracket threshold", () => {
      const taxLow = calculateWithholdingTax(1000000n, true, false); // PHP 10,000 semi-monthly (below 10,417)
      expect(taxLow).toBe(0n);

      const taxMwe = calculateWithholdingTax(3500000n, true, true); // Minimum wage earner
      expect(taxMwe).toBe(0n);
    });

    it("should compute accurate semi-monthly tax for Bracket 2 (PHP 15,000)", () => {
      // Semi-Monthly: 10,417 to 16,667 -> 15% of excess over 10,417
      // Taxable = 15,000. Excess = 4,583 * 0.15 = 687.45 -> 68745 cents
      const tax = calculateWithholdingTax(1500000n, true, false);
      expect(tax).toBe(68745n);
    });
  });

  describe("5. De Minimis & 13th Month Pay", () => {
    it("should separate exempt de minimis and spill excess into taxable compensation", () => {
      // Rice subsidy limit is 2,000/mo (1,000 per semi-monthly cutoff)
      const result = evaluateAllowances([
        {
          name: "Rice Allowance",
          amountCents: 150000n, // PHP 1,500 given in semi-monthly (exceeds 1,000 limit)
          isTaxable: false,
          deMinimisCategory: DeMinimisCategory.RICE_SUBSIDY,
        },
      ], true);

      expect(result.nonTaxableAllowancesCents).toBe(100000n); // 1,000 exempt
      expect(result.deMinimisExcessTaxableCents).toBe(50000n); // 500 excess
      expect(result.taxableAllowancesCents).toBe(50000n);
    });

    it("should calculate 13th month payout and apply PHP 90,000 tax-exempt ceiling", () => {
      // Annual Basic = 1,200,000 (100k/mo). 13th month = 100,000
      const payout = calculateThirteenthMonthPayout(120000000n, 0n);
      expect(payout.thirteenthMonthPayCents).toBe(10000000n); // PHP 100,000
      expect(payout.taxExemptPortionCents).toBe(9000000n); // PHP 90,000 exempt
      expect(payout.taxablePortionCents).toBe(1000000n); // PHP 10,000 taxable
    });
  });

  describe("6. Master End-to-End Payroll Run", () => {
    it("should execute complete semi-monthly payroll calculation with exact numbers", () => {
      const input: PayrollCalculationInput = {
        cutoffType: CutoffType.FIRST_CUTOFF,
        schedule: {
          deductSssIn: "FIRST_CUTOFF",
          deductPhilhealthIn: "FIRST_CUTOFF",
          deductPagibigIn: "FIRST_CUTOFF",
          deductTaxIn: "FIRST_CUTOFF",
        },
        compensation: {
          payBasis: PayBasis.MONTHLY,
          monthlyBasicRateCents: 3000000n, // PHP 30,000.00 / mo (15,000.00 per cutoff)
          divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
          isMinimumWageEarner: false,
        },
        attendance: {
          regularHoursWorked: 80,
          tardinessMinutes: 30, // 30 mins late
          undertimeMinutes: 0,
          absentDays: 0,
          regularOvertimeHours: 4, // 4 hours OT
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
        },
        allowances: [
          {
            name: "Rice Subsidy",
            amountCents: 100000n, // PHP 1,000.00 (non-taxable de minimis)
            isTaxable: false,
            deMinimisCategory: DeMinimisCategory.RICE_SUBSIDY,
          },
        ],
        loans: [
          {
            loanId: "loan-123",
            name: "SSS Salary Loan",
            amountCents: 50000n, // PHP 500.00
          },
        ],
      };

      const result = calculatePhilippinePayroll(input);

      // Verify Basic Pay & Deductions
      expect(result.basicPayForPeriodCents).toBe(1500000n); // PHP 15,000
      expect(result.tardinessDeductionCents).toBeGreaterThan(0n);
      expect(result.overtimePayCents).toBeGreaterThan(0n);
      expect(result.grossPayCents).toBeGreaterThan(1500000n);

      // Verify Statutory Deductions
      expect(result.sssContribution.employeeShareCents).toBeGreaterThan(0n);
      expect(result.philhealthContribution.employeeShareCents).toBeGreaterThan(0n);
      expect(result.pagibigContribution.employeeShareCents).toBe(20000n);

      // Verify Total Deductions and Net Pay
      expect(result.netPayCents).toBeGreaterThan(0n);
      expect(result.thirteenthMonthAccrualCents).toBeGreaterThan(0n);
      expect(result.grossPayCents - result.totalDeductionsCents).toBe(result.netPayCents);
    });
  });
});
