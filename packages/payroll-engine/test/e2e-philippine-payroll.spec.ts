import { describe, expect, it } from "vitest";
import {
  calculatePhilippinePayroll,
  annualizeTax,
  calculateThirteenthMonthPayout,
  CutoffType,
  PayBasis,
  WorkDayDivisor,
  DeMinimisCategory,
} from "../src/index";
import type { PayrollCalculationInput } from "../src/index";

describe("E2E Philippine Enterprise Payroll Lifecycle", () => {
  it("Scenario A: Minimum Wage Earner (MWE) with Holiday, Overtime, and Tax Exemption", () => {
    // Under DOLE & BIR rules: MWE is strictly exempt from income tax,
    // even with holiday pay, overtime, and night shift differential.
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
        monthlyBasicRateCents: 1540000n, // PHP 15,400.00 / mo
        divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
        isMinimumWageEarner: true,
      },
      attendance: {
        regularHoursWorked: 80,
        tardinessMinutes: 0,
        undertimeMinutes: 0,
        absentDays: 0,
        regularOvertimeHours: 10, // 10 hrs OT
        restDayHours: 0,
        restDayOvertimeHours: 0,
        specialHolidayHours: 0,
        specialHolidayOvertimeHours: 0,
        specialHolidayRestDayHours: 0,
        specialHolidayRestDayOvertimeHours: 0,
        regularHolidayHours: 8, // Worked on Regular Holiday (200%)
        regularHolidayOvertimeHours: 0,
        regularHolidayRestDayHours: 0,
        regularHolidayRestDayOvertimeHours: 0,
        regularNightDiffHours: 5, // 5 hrs Night Diff (10%)
        overtimeNightDiffHours: 0,
        restDayNightDiffHours: 0,
        holidayNightDiffHours: 0,
      },
      allowances: [
        {
          name: "Rice Subsidy",
          amountCents: 100000n, // PHP 1,000 / cutoff
          isTaxable: false,
          deMinimisCategory: DeMinimisCategory.RICE_SUBSIDY,
        },
      ],
      loans: [],
    };

    const result = calculatePhilippinePayroll(input);

    // 1. Basic Pay for 1st cutoff
    expect(result.basicPayForPeriodCents).toBe(770000n); // PHP 7,700.00

    // 2. Overtime & Holiday Pay
    expect(result.overtimePayCents).toBeGreaterThan(0n);
    expect(result.holidayPayCents).toBeGreaterThan(0n);
    expect(result.nightDiffPayCents).toBeGreaterThan(0n);

    // 3. Gross Pay
    expect(result.grossPayCents).toBeGreaterThan(result.basicPayForPeriodCents);

    // 4. Statutory Deductions
    expect(result.sssContribution.employeeShareCents).toBeGreaterThan(0n);
    expect(result.philhealthContribution.employeeShareCents).toBeGreaterThan(0n);
    expect(result.pagibigContribution.employeeShareCents).toBe(20000n); // ₱200 cap

    // 5. TAX EXEMPTION: Withholding tax MUST strictly be 0 for MWE
    expect(result.withholdingTaxCents).toBe(0n);

    // 6. Net Take-Home Pay
    expect(result.netPayCents).toBe(result.grossPayCents - result.totalDeductionsCents);
  });

  it("Scenario B: High-Income Executive with Statutory MSC Ceilings & Loans", () => {
    // Executive with PHP 120,000 monthly basic
    const input: PayrollCalculationInput = {
      cutoffType: CutoffType.SECOND_CUTOFF,
      schedule: {
        deductSssIn: "SECOND_CUTOFF",
        deductPhilhealthIn: "SECOND_CUTOFF",
        deductPagibigIn: "SECOND_CUTOFF",
        deductTaxIn: "SECOND_CUTOFF",
      },
      compensation: {
        payBasis: PayBasis.MONTHLY,
        monthlyBasicRateCents: 12000000n, // PHP 120,000.00 / mo
        divisor: WorkDayDivisor.FIVE_DAYS_PER_WEEK,
        isMinimumWageEarner: false,
      },
      attendance: {
        regularHoursWorked: 80,
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
      },
      allowances: [
        {
          name: "Rice Subsidy",
          amountCents: 100000n,
          isTaxable: false,
          deMinimisCategory: DeMinimisCategory.RICE_SUBSIDY,
        },
      ],
      loans: [
        {
          loanId: "sss-loan-001",
          name: "SSS Salary Loan",
          amountCents: 150000n, // PHP 1,500 amortization
        },
      ],
    };

    const result = calculatePhilippinePayroll(input);

    // Basic Pay: PHP 60,000 / cutoff
    expect(result.basicPayForPeriodCents).toBe(6000000n);

    // PhilHealth Ceiling: PHP 100,000 max base -> 5% = 5,000 total (2,500 EE / 2,500 ER)
    expect(result.philhealthContribution.employeeShareCents).toBe(250000n);
    expect(result.philhealthContribution.employerShareCents).toBe(250000n);

    // SSS Ceiling: PHP 35,000 max MSC -> Regular + WISP = 1,750 EE / 3,530 ER
    expect(result.sssContribution.employeeShareCents).toBe(175000n);
    expect(result.sssContribution.employerShareCents).toBe(353000n);

    // Pag-IBIG: Standard ₱200 cap
    expect(result.pagibigContribution.employeeShareCents).toBe(20000n);

    // Loan deduction applied
    expect(result.loanDeductionsCents).toBe(150000n);

    // Withholding Tax: Substantial due to high taxable compensation
    expect(result.withholdingTaxCents).toBeGreaterThan(500000n); // > ₱5,000

    // Net pay balanced
    expect(result.netPayCents).toBe(result.grossPayCents - result.totalDeductionsCents);
  });

  it("Scenario C: Year-End Tax Annualization & 13th Month Bonus Release", () => {
    // Total annual basic pay: PHP 720,000 (60k/mo)
    const annualBasicCents = 72000000n;
    const thirteenthMonth = calculateThirteenthMonthPayout(annualBasicCents, 0n);

    // 13th month = 720,000 / 12 = PHP 60,000
    expect(thirteenthMonth.thirteenthMonthPayCents).toBe(6000000n);
    // Under PHP 90,000 TRAIN cap, entire 60,000 is tax exempt!
    expect(thirteenthMonth.taxExemptPortionCents).toBe(6000000n);
    expect(thirteenthMonth.taxablePortionCents).toBe(0n);

    // Annual Tax Adjustment: Total annual taxable 650,000 PHP, Tax withheld: 80,000 PHP
    const annualTaxableCents = 65000000n;
    const totalTaxWithheldCents = 8000000n;

    const annualization = annualizeTax(annualTaxableCents, totalTaxWithheldCents);

    // 650,000 taxable:
    // Bracket: 400,000 to 800,000 -> 22,500 + 20% of excess over 400,000
    // Excess = 250,000 * 0.20 = 50,000. Total tax due = 72,500 PHP
    expect(annualization.totalAnnualTaxDueCents).toBe(7250000n);

    // Withheld was 80,000 PHP, so company owes employee a REFUND of 7,500 PHP (-750000 cents)
    expect(annualization.taxAdjustmentCents).toBe(-750000n);
  });
});
