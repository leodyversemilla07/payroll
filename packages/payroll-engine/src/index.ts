import { calculateDolePremiums, deriveRates } from "./dole-rates";
import { calculateSssContribution } from "./sss";
import { calculatePhilhealthContribution } from "./philhealth";
import { calculatePagibigContribution } from "./pagibig";
import { calculateWithholdingTax } from "./withholding-tax";
import { evaluateAllowances } from "./de-minimis";
import { calculateThirteenthMonthAccrual } from "./thirteenth-month";
import type {
  Centavos,
  PayrollCalculationInput,
  PayrollCalculationResult,
  StatutoryContributionResult,
} from "./types";
import { CutoffType } from "./types";

export * from "./types";
export * from "./dole-rates";
export * from "./sss";
export * from "./philhealth";
export * from "./pagibig";
export * from "./withholding-tax";
export * from "./de-minimis";
export * from "./thirteenth-month";
export * from "./biometrics";
export * from "./sil-conversion";
export * from "./final-pay";

/**
 * Master Philippine Payroll Calculation Engine
 * Pure, deterministic function computing a complete payslip with exact centavo precision.
 */
export function calculatePhilippinePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const { cutoffType, schedule, compensation, attendance, allowances, loans, otherDeductionsCents = 0n } = input;
  const isSemiMonthly = cutoffType !== CutoffType.MONTHLY_SINGLE;

  // 1. Derive Rates
  const { dailyRateCents, hourlyRateCents, minuteRateCents } = deriveRates(compensation);

  // 2. Base Period Pay
  const basicPayForPeriodCents = isSemiMonthly
    ? compensation.monthlyBasicRateCents / 2n
    : compensation.monthlyBasicRateCents;

  // 3. Timekeeping Deductions
  const tardinessDeductionCents = minuteRateCents * BigInt(attendance.tardinessMinutes);
  const undertimeDeductionCents = minuteRateCents * BigInt(attendance.undertimeMinutes);
  const absenceDeductionCents = dailyRateCents * BigInt(attendance.absentDays);

  const totalTimekeepingDeductions = tardinessDeductionCents + undertimeDeductionCents + absenceDeductionCents;
  const netBasicPayCents = basicPayForPeriodCents > totalTimekeepingDeductions
    ? basicPayForPeriodCents - totalTimekeepingDeductions
    : 0n;

  // 4. DOLE Premium Calculations (OT, NSD, Holidays, Rest Days)
  const dolePremiums = calculateDolePremiums(hourlyRateCents, attendance);

  // 5. Allowances & De Minimis Evaluation
  const evaluatedAllowances = evaluateAllowances(allowances, isSemiMonthly);

  // 6. Gross Pay Computation
  const grossPayCents = netBasicPayCents +
    dolePremiums.totalPremiumPayCents +
    evaluatedAllowances.taxableAllowancesCents +
    evaluatedAllowances.nonTaxableAllowancesCents;

  // 7. Full Monthly Statutory Contributions (Standard Monthly Tables)
  const fullMonthlySss = calculateSssContribution(compensation.monthlyBasicRateCents);
  const fullMonthlyPhilhealth = calculatePhilhealthContribution(compensation.monthlyBasicRateCents);
  const fullMonthlyPagibig = calculatePagibigContribution(
    compensation.monthlyBasicRateCents,
    compensation.customPagibigDeductionCents
  );

  // 8. Determine Statutory Deductions for Current Cutoff
  const sssContribution = resolveCutoffContribution(fullMonthlySss, schedule.deductSssIn, cutoffType);
  const philhealthContribution = resolveCutoffContribution(fullMonthlyPhilhealth, schedule.deductPhilhealthIn, cutoffType);
  const pagibigContribution = resolveCutoffContribution(fullMonthlyPagibig, schedule.deductPagibigIn, cutoffType);

  const totalStatutoryEmployeeCents = sssContribution.employeeShareCents +
    philhealthContribution.employeeShareCents +
    pagibigContribution.employeeShareCents;

  const totalStatutoryEmployerCents = sssContribution.employerShareCents +
    philhealthContribution.employerShareCents +
    pagibigContribution.employerShareCents;

  // 9. Withholding Tax Calculation
  // Taxable Base = (Gross Taxable Earnings) - (Employee Statutory Deductions)
  const grossTaxableEarnings = netBasicPayCents +
    dolePremiums.totalPremiumPayCents +
    evaluatedAllowances.taxableAllowancesCents;

  const taxableIncomeCents = grossTaxableEarnings > totalStatutoryEmployeeCents
    ? grossTaxableEarnings - totalStatutoryEmployeeCents
    : 0n;

  let withholdingTaxCents = 0n;
  const shouldDeductTax = shouldApplyCutoffDeduction(schedule.deductTaxIn, cutoffType);

  if (shouldDeductTax && !compensation.isMinimumWageEarner) {
    withholdingTaxCents = calculateWithholdingTax(
      taxableIncomeCents,
      isSemiMonthly,
      compensation.isMinimumWageEarner
    );
  }

  // 10. Loan Deductions
  let loanDeductionsCents = 0n;
  for (const loan of loans) {
    loanDeductionsCents += loan.amountCents;
  }

  // 11. Total Deductions & Net Pay
  const totalDeductionsCents = totalStatutoryEmployeeCents +
    withholdingTaxCents +
    loanDeductionsCents +
    otherDeductionsCents;

  const netPayCents = grossPayCents > totalDeductionsCents
    ? grossPayCents - totalDeductionsCents
    : 0n;

  // 12. 13th Month Accrual for this Period
  const thirteenthMonthAccrualCents = calculateThirteenthMonthAccrual(netBasicPayCents);

  return {
    dailyRateCents,
    hourlyRateCents,
    minuteRateCents,
    basicPayForPeriodCents,
    tardinessDeductionCents,
    undertimeDeductionCents,
    absenceDeductionCents,
    netBasicPayCents,
    overtimePayCents: dolePremiums.overtimePayCents,
    nightDiffPayCents: dolePremiums.nightDiffPayCents,
    holidayPayCents: dolePremiums.holidayPayCents,
    restDayPayCents: dolePremiums.restDayPayCents,
    totalPremiumPayCents: dolePremiums.totalPremiumPayCents,
    taxableAllowancesCents: evaluatedAllowances.taxableAllowancesCents,
    nonTaxableAllowancesCents: evaluatedAllowances.nonTaxableAllowancesCents,
    deMinimisExcessTaxableCents: evaluatedAllowances.deMinimisExcessTaxableCents,
    grossPayCents,
    sssContribution,
    philhealthContribution,
    pagibigContribution,
    totalStatutoryEmployeeCents,
    totalStatutoryEmployerCents,
    taxableIncomeCents,
    withholdingTaxCents,
    loanDeductionsCents,
    otherDeductionsCents,
    totalDeductionsCents,
    netPayCents,
    thirteenthMonthAccrualCents,
  };
}

// Helpers for scheduling deductions across cutoffs
function resolveCutoffContribution(
  monthly: StatutoryContributionResult,
  setting: "FIRST_CUTOFF" | "SECOND_CUTOFF" | "SPLIT_EQUAL" | "MONTHLY_SINGLE",
  cutoffType: CutoffType
): StatutoryContributionResult {
  if (cutoffType === CutoffType.MONTHLY_SINGLE || setting === "MONTHLY_SINGLE") {
    return monthly;
  }

  if (setting === "SPLIT_EQUAL") {
    return {
      employeeShareCents: monthly.employeeShareCents / 2n,
      employerShareCents: monthly.employerShareCents / 2n,
      ecShareCents: monthly.ecShareCents ? monthly.ecShareCents / 2n : 0n,
      wispEmployeeCents: monthly.wispEmployeeCents ? monthly.wispEmployeeCents / 2n : 0n,
      wispEmployerCents: monthly.wispEmployerCents ? monthly.wispEmployerCents / 2n : 0n,
      totalCents: monthly.totalCents / 2n,
    };
  }

  if (setting === "FIRST_CUTOFF" && cutoffType === CutoffType.FIRST_CUTOFF) {
    return monthly;
  }

  if (setting === "SECOND_CUTOFF" && cutoffType === CutoffType.SECOND_CUTOFF) {
    return monthly;
  }

  // Not scheduled in this cutoff
  return {
    employeeShareCents: 0n,
    employerShareCents: 0n,
    ecShareCents: 0n,
    wispEmployeeCents: 0n,
    wispEmployerCents: 0n,
    totalCents: 0n,
  };
}

function shouldApplyCutoffDeduction(
  setting: "FIRST_CUTOFF" | "SECOND_CUTOFF" | "SPLIT_EQUAL" | "MONTHLY_SINGLE",
  cutoffType: CutoffType
): boolean {
  if (cutoffType === CutoffType.MONTHLY_SINGLE || setting === "MONTHLY_SINGLE" || setting === "SPLIT_EQUAL") {
    return true;
  }
  if (setting === "FIRST_CUTOFF" && cutoffType === CutoffType.FIRST_CUTOFF) return true;
  if (setting === "SECOND_CUTOFF" && cutoffType === CutoffType.SECOND_CUTOFF) return true;
  return false;
}
