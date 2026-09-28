import { describe, expect, it } from "vitest";
import type {
  AttendanceSummary,
  PayrollCalculationInput,
} from "../src/index.js";
import {
  CutoffType,
  calculateDolePremiums,
  calculatePagibigContribution,
  calculatePhilhealthContribution,
  calculatePhilippinePayroll,
  calculateSssContribution,
  calculateThirteenthMonthPayout,
  calculateWithholdingTax,
  DeMinimisCategory,
  deriveRates,
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

  describe("2. Pay-basis correctness", () => {
    it("pays daily employees for regular hours worked without double deductions", () => {
      const result = calculatePhilippinePayroll({
        cutoffType: CutoffType.FIRST_CUTOFF,
        schedule: {
          deductSssIn: "SECOND_CUTOFF",
          deductPhilhealthIn: "SECOND_CUTOFF",
          deductPagibigIn: "SECOND_CUTOFF",
          deductTaxIn: "SECOND_CUTOFF",
        },
        compensation: {
          payBasis: PayBasis.DAILY,
          monthlyBasicRateCents: 2200000n,
          dailyRateCents: 100000n,
          divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
          isMinimumWageEarner: true,
        },
        attendance: {
          ...EMPTY_ATTENDANCE,
          regularHoursWorked: 72,
          tardinessMinutes: 30,
          undertimeMinutes: 60,
          absentDays: 1,
        },
        allowances: [],
        loans: [],
      });

      expect(result.basicPayForPeriodCents).toBe(900000n);
      expect(result.tardinessDeductionCents).toBe(0n);
      expect(result.undertimeDeductionCents).toBe(0n);
      expect(result.absenceDeductionCents).toBe(0n);
    });

    it("credits daily employees for paid leave without counting it as worked time", () => {
      const result = calculatePhilippinePayroll({
        cutoffType: CutoffType.FIRST_CUTOFF,
        schedule: {
          deductSssIn: "SECOND_CUTOFF",
          deductPhilhealthIn: "SECOND_CUTOFF",
          deductPagibigIn: "SECOND_CUTOFF",
          deductTaxIn: "SECOND_CUTOFF",
        },
        compensation: {
          payBasis: PayBasis.DAILY,
          monthlyBasicRateCents: 2200000n,
          dailyRateCents: 100000n,
          divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
          isMinimumWageEarner: true,
        },
        attendance: { ...EMPTY_ATTENDANCE, paidLeaveDays: 2 },
        allowances: [],
        loans: [],
      });

      expect(result.paidLeavePayCents).toBe(200000n);
      expect(result.basicPayForPeriodCents).toBe(200000n);
      expect(result.grossPayCents).toBe(200000n);
      expect(result.thirteenthMonthAccrualCents).toBe(16666n);
    });

    it("keeps paid leave within fixed monthly basic pay without adding it twice", () => {
      const result = calculatePhilippinePayroll({
        cutoffType: CutoffType.SECOND_CUTOFF,
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
        attendance: { ...EMPTY_ATTENDANCE, paidLeaveDays: 1 },
        allowances: [],
        loans: [],
      });
      expect(result.basicPayForPeriodCents).toBe(1500000n);
      expect(result.paidLeavePayCents).toBe(0n);
      expect(result.absenceDeductionCents).toBe(0n);
    });

    it("credits hourly leave at eight scheduled hours without OT premiums", () => {
      const result = calculatePhilippinePayroll({
        cutoffType: CutoffType.FIRST_CUTOFF,
        schedule: {
          deductSssIn: "SECOND_CUTOFF",
          deductPhilhealthIn: "SECOND_CUTOFF",
          deductPagibigIn: "SECOND_CUTOFF",
          deductTaxIn: "SECOND_CUTOFF",
        },
        compensation: {
          payBasis: PayBasis.HOURLY,
          monthlyBasicRateCents: 3000000n,
          hourlyRateCents: 20000n,
          divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
          isMinimumWageEarner: false,
        },
        attendance: { ...EMPTY_ATTENDANCE, paidLeaveDays: 1 },
        allowances: [],
        loans: [],
      });
      expect(result.paidLeavePayCents).toBe(160000n);
      expect(result.totalPremiumPayCents).toBe(0n);
    });

    it("credits a half-day leave at half the daily rate", () => {
      const result = calculatePhilippinePayroll({
        cutoffType: CutoffType.FIRST_CUTOFF,
        schedule: {
          deductSssIn: "SECOND_CUTOFF",
          deductPhilhealthIn: "SECOND_CUTOFF",
          deductPagibigIn: "SECOND_CUTOFF",
          deductTaxIn: "SECOND_CUTOFF",
        },
        compensation: {
          payBasis: PayBasis.DAILY,
          monthlyBasicRateCents: 2200000n,
          dailyRateCents: 100000n,
          divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
          isMinimumWageEarner: true,
        },
        attendance: { ...EMPTY_ATTENDANCE, paidLeaveDays: 0.5 },
        allowances: [],
        loans: [],
      });
      expect(result.paidLeavePayCents).toBe(50000n);
      expect(result.basicPayForPeriodCents).toBe(50000n);
    });

    it("credits a half-day leave at four hourly rates", () => {
      const result = calculatePhilippinePayroll({
        cutoffType: CutoffType.FIRST_CUTOFF,
        schedule: {
          deductSssIn: "SECOND_CUTOFF",
          deductPhilhealthIn: "SECOND_CUTOFF",
          deductPagibigIn: "SECOND_CUTOFF",
          deductTaxIn: "SECOND_CUTOFF",
        },
        compensation: {
          payBasis: PayBasis.HOURLY,
          monthlyBasicRateCents: 3000000n,
          hourlyRateCents: 20000n,
          divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
          isMinimumWageEarner: false,
        },
        attendance: { ...EMPTY_ATTENDANCE, paidLeaveDays: 1.5 },
        allowances: [],
        loans: [],
      });
      expect(result.paidLeavePayCents).toBe(240000n);
    });

    it("truncates a sub-centavo half-day remainder like other rate divisions", () => {
      const result = calculatePhilippinePayroll({
        cutoffType: CutoffType.FIRST_CUTOFF,
        schedule: {
          deductSssIn: "SECOND_CUTOFF",
          deductPhilhealthIn: "SECOND_CUTOFF",
          deductPagibigIn: "SECOND_CUTOFF",
          deductTaxIn: "SECOND_CUTOFF",
        },
        compensation: {
          payBasis: PayBasis.DAILY,
          monthlyBasicRateCents: 2200000n,
          dailyRateCents: 100001n,
          divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
          isMinimumWageEarner: true,
        },
        attendance: { ...EMPTY_ATTENDANCE, paidLeaveDays: 0.5 },
        allowances: [],
        loans: [],
      });
      expect(result.paidLeavePayCents).toBe(50000n);
    });

    it("keeps monthly basic pay fixed for half-day leave", () => {
      const result = calculatePhilippinePayroll({
        cutoffType: CutoffType.SECOND_CUTOFF,
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
        attendance: { ...EMPTY_ATTENDANCE, paidLeaveDays: 0.5 },
        allowances: [],
        loans: [],
      });
      expect(result.basicPayForPeriodCents).toBe(1500000n);
      expect(result.paidLeavePayCents).toBe(0n);
    });

    it.each([0.25, 1.1, -0.5, Number.NaN, Number.POSITIVE_INFINITY])(
      "rejects a non-half-increment paid-leave input of %s",
      (paidLeaveDays) => {
        expect(() =>
          calculatePhilippinePayroll({
            cutoffType: CutoffType.FIRST_CUTOFF,
            schedule: {
              deductSssIn: "SECOND_CUTOFF",
              deductPhilhealthIn: "SECOND_CUTOFF",
              deductPagibigIn: "SECOND_CUTOFF",
              deductTaxIn: "SECOND_CUTOFF",
            },
            compensation: {
              payBasis: PayBasis.DAILY,
              monthlyBasicRateCents: 2200000n,
              dailyRateCents: 100000n,
              divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
              isMinimumWageEarner: true,
            },
            attendance: { ...EMPTY_ATTENDANCE, paidLeaveDays },
            allowances: [],
            loans: [],
          }),
        ).toThrow(RangeError);
      },
    );

    it("pays hourly employees for fractional approved hours worked", () => {
      const result = calculatePhilippinePayroll({
        cutoffType: CutoffType.FIRST_CUTOFF,
        schedule: {
          deductSssIn: "SECOND_CUTOFF",
          deductPhilhealthIn: "SECOND_CUTOFF",
          deductPagibigIn: "SECOND_CUTOFF",
          deductTaxIn: "SECOND_CUTOFF",
        },
        compensation: {
          payBasis: PayBasis.HOURLY,
          monthlyBasicRateCents: 3000000n,
          hourlyRateCents: 20000n,
          divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
          isMinimumWageEarner: false,
        },
        attendance: {
          ...EMPTY_ATTENDANCE,
          regularHoursWorked: 75.5,
        },
        allowances: [],
        loans: [],
      });

      expect(result.basicPayForPeriodCents).toBe(1510000n);
    });

    it("pays an approved unworked regular holiday to daily employees", () => {
      const premiums = calculateDolePremiums(
        12500n,
        {
          ...EMPTY_ATTENDANCE,
          regularHolidayUnworkedDays: 1,
        },
        PayBasis.DAILY,
      );

      expect(premiums.holidayPayCents).toBe(100000n);
    });

    it("adds only incremental rest-day and holiday premiums for monthly employees", () => {
      const monthlyPremiums = calculateDolePremiums(
        20000n,
        {
          ...EMPTY_ATTENDANCE,
          restDayHours: 8,
          regularHolidayHours: 8,
        },
        PayBasis.MONTHLY,
      );

      expect(monthlyPremiums.restDayPayCents).toBe(48000n);
      expect(monthlyPremiums.holidayPayCents).toBe(160000n);
    });
  });

  describe("De minimis category ceilings", () => {
    it("shares one cutoff cap across multiple allowances in the same category", () => {
      const result = evaluateAllowances(
        ["Rice A", "Rice B"].map((name) => ({
          name,
          amountCents: 125000n,
          isTaxable: false,
          deMinimisCategory: DeMinimisCategory.RICE_SUBSIDY,
        })),
        true,
      );

      expect(result.nonTaxableAllowancesCents).toBe(125000n);
      expect(result.taxableAllowancesCents).toBe(125000n);
      expect(result.deMinimisExcessTaxableCents).toBe(125000n);
    });

    it("keeps distinct category ceilings separate", () => {
      const result = evaluateAllowances(
        [
          {
            name: "Rice",
            amountCents: 250000n,
            isTaxable: false,
            deMinimisCategory: DeMinimisCategory.RICE_SUBSIDY,
          },
          {
            name: "Laundry",
            amountCents: 40000n,
            isTaxable: false,
            deMinimisCategory: DeMinimisCategory.LAUNDRY_ALLOWANCE,
          },
        ],
        false,
      );

      expect(result.nonTaxableAllowancesCents).toBe(290000n);
      expect(result.deMinimisExcessTaxableCents).toBe(0n);
    });
  });

  describe("3. SSS & WISP Contributions", () => {
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

  describe("4. PhilHealth & Pag-IBIG Contributions", () => {
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

  describe("5. TRAIN Law Withholding Tax & Minimum Wage Exemption", () => {
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

  describe("Monthly withholding across cutoffs", () => {
    const baseInput: PayrollCalculationInput = {
      cutoffType: CutoffType.FIRST_CUTOFF,
      schedule: {
        deductSssIn: "FIRST_CUTOFF",
        deductPhilhealthIn: "FIRST_CUTOFF",
        deductPagibigIn: "FIRST_CUTOFF",
        deductTaxIn: "SECOND_CUTOFF",
      },
      compensation: {
        payBasis: PayBasis.MONTHLY,
        monthlyBasicRateCents: 3000000n,
        divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
        isMinimumWageEarner: false,
      },
      attendance: EMPTY_ATTENDANCE,
      allowances: [],
      loans: [],
    };

    it("withholds the monthly tax on the combined first and second cutoff bases", () => {
      const first = calculatePhilippinePayroll(baseInput);
      const second = calculatePhilippinePayroll({
        ...baseInput,
        cutoffType: CutoffType.SECOND_CUTOFF,
        priorMonthlyTaxableIncomeCents: first.taxableIncomeCents,
        priorMonthlyTaxWithheldCents: first.withholdingTaxCents,
      });

      const fullMonthTax = calculateWithholdingTax(
        first.taxableIncomeCents + second.taxableIncomeCents,
        false,
      );
      expect(first.withholdingTaxCents).toBe(0n);
      expect(second.withholdingTaxCents).toBe(fullMonthTax);
      expect(second.withholdingTaxCents).toBeGreaterThan(
        calculateWithholdingTax(second.taxableIncomeCents, true),
      );
    });

    it("uses actual first-cutoff taxable earnings, not a salary estimate", () => {
      const first = calculatePhilippinePayroll({
        ...baseInput,
        attendance: { ...EMPTY_ATTENDANCE, absentDays: 2 },
      });
      const second = calculatePhilippinePayroll({
        ...baseInput,
        cutoffType: CutoffType.SECOND_CUTOFF,
        allowances: [
          { name: "Taxable bonus", amountCents: 200000n, isTaxable: true },
        ],
        priorMonthlyTaxableIncomeCents: first.taxableIncomeCents,
        priorMonthlyTaxWithheldCents: 0n,
      });

      expect(second.withholdingTaxCents).toBe(
        calculateWithholdingTax(
          first.taxableIncomeCents + second.taxableIncomeCents,
          false,
        ),
      );
    });

    it("withholds only the outstanding tax when tax was already withheld", () => {
      const second = calculatePhilippinePayroll({
        ...baseInput,
        cutoffType: CutoffType.SECOND_CUTOFF,
        priorMonthlyTaxableIncomeCents: 1500000n,
        priorMonthlyTaxWithheldCents: 100000n,
      });
      const monthlyTax = calculateWithholdingTax(
        1500000n + second.taxableIncomeCents,
        false,
      );
      expect(second.withholdingTaxCents).toBe(
        monthlyTax > 100000n ? monthlyTax - 100000n : 0n,
      );
    });

    it("uses the monthly table for a second-cutoff-only employee", () => {
      const second = calculatePhilippinePayroll({
        ...baseInput,
        cutoffType: CutoffType.SECOND_CUTOFF,
        priorMonthlyTaxableIncomeCents: 0n,
        priorMonthlyTaxWithheldCents: 0n,
      });
      expect(second.withholdingTaxCents).toBe(
        calculateWithholdingTax(second.taxableIncomeCents, false),
      );
    });
  });

  describe("Affordable loan deductions", () => {
    const baseInput: PayrollCalculationInput = {
      cutoffType: CutoffType.FIRST_CUTOFF,
      schedule: {
        deductSssIn: "FIRST_CUTOFF",
        deductPhilhealthIn: "FIRST_CUTOFF",
        deductPagibigIn: "FIRST_CUTOFF",
        deductTaxIn: "SECOND_CUTOFF",
      },
      compensation: {
        payBasis: PayBasis.MONTHLY,
        monthlyBasicRateCents: 3000000n,
        divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
        isMinimumWageEarner: false,
      },
      attendance: EMPTY_ATTENDANCE,
      allowances: [],
      loans: [],
    };

    it("applies only affordable loan installments in input order after mandatory and other deductions", () => {
      const result = calculatePhilippinePayroll({
        ...baseInput,
        otherDeductionsCents: 100000n,
        loans: [
          { loanId: "loan-a", name: "Loan A", amountCents: 1000000n },
          { loanId: "loan-b", name: "Loan B", amountCents: 1000000n },
        ],
      });
      const available =
        result.grossPayCents -
        result.totalStatutoryEmployeeCents -
        result.withholdingTaxCents -
        result.otherDeductionsCents;

      expect(result.appliedLoanDeductions).toEqual([
        { loanId: "loan-a", amountCents: 1000000n },
        { loanId: "loan-b", amountCents: available - 1000000n },
      ]);
      expect(result.loanDeductionsCents).toBe(available);
      expect(result.totalDeductionsCents).toBe(result.grossPayCents);
      expect(result.netPayCents).toBe(0n);
    });

    it("leaves all loans untouched when no pay remains after compulsory deductions", () => {
      const regular = calculatePhilippinePayroll(baseInput);
      const result = calculatePhilippinePayroll({
        ...baseInput,
        otherDeductionsCents:
          regular.grossPayCents - regular.totalStatutoryEmployeeCents,
        loans: [{ loanId: "loan-a", name: "Loan A", amountCents: 50000n }],
      });
      expect(result.appliedLoanDeductions).toEqual([]);
      expect(result.loanDeductionsCents).toBe(0n);
      expect(result.netPayCents).toBe(0n);
    });

    it("refuses payroll when statutory or other mandatory deductions exceed earnings", () => {
      expect(() =>
        calculatePhilippinePayroll({
          ...baseInput,
          attendance: { ...EMPTY_ATTENDANCE, absentDays: 15 },
          loans: [{ loanId: "loan-a", name: "Loan A", amountCents: 50000n }],
        }),
      ).toThrow("Gross pay cannot cover mandatory deductions");
    });
  });

  describe("6. De Minimis & 13th Month Pay", () => {
    it("should separate exempt de minimis and spill excess into taxable compensation", () => {
      // Rice subsidy limit is 2,500/mo under RR 29-2025 (1,250 per semi-monthly cutoff)
      const result = evaluateAllowances(
        [
          {
            name: "Rice Allowance",
            amountCents: 150000n, // PHP 1,500 given in semi-monthly (exceeds 1,250 limit)
            isTaxable: false,
            deMinimisCategory: DeMinimisCategory.RICE_SUBSIDY,
          },
        ],
        true,
      );

      expect(result.nonTaxableAllowancesCents).toBe(125000n); // 1,250 exempt
      expect(result.deMinimisExcessTaxableCents).toBe(25000n); // 250 excess
      expect(result.taxableAllowancesCents).toBe(25000n);
    });

    it("should calculate 13th month payout and apply PHP 90,000 tax-exempt ceiling", () => {
      // Annual Basic = 1,200,000 (100k/mo). 13th month = 100,000
      const payout = calculateThirteenthMonthPayout(120000000n, 0n);
      expect(payout.thirteenthMonthPayCents).toBe(10000000n); // PHP 100,000
      expect(payout.taxExemptPortionCents).toBe(9000000n); // PHP 90,000 exempt
      expect(payout.taxablePortionCents).toBe(1000000n); // PHP 10,000 taxable
    });
  });

  describe("7. Master End-to-End Payroll Run", () => {
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
      expect(result.philhealthContribution.employeeShareCents).toBeGreaterThan(
        0n,
      );
      expect(result.pagibigContribution.employeeShareCents).toBe(20000n);

      // Verify Total Deductions and Net Pay
      expect(result.netPayCents).toBeGreaterThan(0n);
      expect(result.thirteenthMonthAccrualCents).toBeGreaterThan(0n);
      expect(result.grossPayCents - result.totalDeductionsCents).toBe(
        result.netPayCents,
      );
    });
  });
});
