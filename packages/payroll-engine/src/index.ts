import { evaluateAllowances } from "./de-minimis";
import { calculateDolePremiums, deriveRates } from "./dole-rates";
import { allocateNinetiethBucket } from "./other-benefits";
import { calculatePagibigContribution } from "./pagibig";
import { calculatePhilhealthContribution } from "./philhealth";
import { calculateSssContribution } from "./sss";
import { calculateThirteenthMonthAccrual } from "./thirteenth-month";
import type {
  PayrollCalculationInput,
  PayrollCalculationResult,
  StatutoryContributionResult,
} from "./types";
import { CutoffType, PayBasis } from "./types";
import { calculateWithholdingTax } from "./withholding-tax";

export * from "./biometrics";
export * from "./bir-2316";
export * from "./de-minimis";
export * from "./dole-rates";
export * from "./final-pay";
export * from "./other-benefits";
export * from "./pagibig";
export * from "./philhealth";
export * from "./sil-conversion";
export * from "./sss";
export * from "./thirteenth-month";
export * from "./thirteenth-month-batch";
export * from "./types";
export * from "./withholding-tax";

/**
 * Master Philippine Payroll Calculation Engine
 * Pure, deterministic function computing a complete payslip with exact centavo precision.
 */
export function calculatePhilippinePayroll(
  input: PayrollCalculationInput,
): PayrollCalculationResult {
  const {
    cutoffType,
    schedule,
    compensation,
    attendance,
    allowances,
    loans,
    otherDeductionsCents = 0n,
    ytdOtherBenefitsCents,
    periodBonusesCents = 0n,
  } = input;
  const isSemiMonthly = cutoffType !== CutoffType.MONTHLY_SINGLE;

  // 1. Derive Rates
  const { dailyRateCents, hourlyRateCents, minuteRateCents } =
    deriveRates(compensation);

  // 2. Base Period Pay
  // Monthly employees receive their fixed period salary and explicit
  // timekeeping deductions. Daily/hourly employees are paid only for approved
  // regular minutes worked, so applying those deductions again would double
  // deduct tardiness, undertime, and absences.
  const isMonthly = compensation.payBasis === PayBasis.MONTHLY;
  const basicPayForPeriodCents = isMonthly
    ? isSemiMonthly
      ? compensation.monthlyBasicRateCents / 2n
      : compensation.monthlyBasicRateCents
    : calculateWorkedPay(hourlyRateCents, attendance.regularHoursWorked);

  // 3. Timekeeping Deductions
  const tardinessDeductionCents = isMonthly
    ? minuteRateCents * BigInt(attendance.tardinessMinutes)
    : 0n;
  const undertimeDeductionCents = isMonthly
    ? minuteRateCents * BigInt(attendance.undertimeMinutes)
    : 0n;
  const absenceDeductionCents = isMonthly
    ? dailyRateCents * BigInt(attendance.absentDays)
    : 0n;

  const totalTimekeepingDeductions =
    tardinessDeductionCents + undertimeDeductionCents + absenceDeductionCents;
  const netBasicPayCents =
    basicPayForPeriodCents > totalTimekeepingDeductions
      ? basicPayForPeriodCents - totalTimekeepingDeductions
      : 0n;

  // 4. DOLE Premium Calculations (OT, NSD, Holidays, Rest Days)
  const dolePremiums = calculateDolePremiums(
    hourlyRateCents,
    attendance,
    compensation.payBasis,
  );

  // 5. Allowances & De Minimis Evaluation
  const evaluatedAllowances = evaluateAllowances(allowances, isSemiMonthly);

  // 5b. PHP 90,000 annual other-benefits bucket (TRAIN). This period's de
  // minimis excess plus any 13th-month/bonus payouts consume the remaining
  // cap; only the overflow stays taxable. Active only when the caller
  // supplies YTD usage — otherwise the excess remains fully taxable, exactly
  // as before, for callers without YTD tracking (e.g. the interactive demo).
  const periodExcessCents = evaluatedAllowances.deMinimisExcessTaxableCents;
  let taxableAllowancesCents = evaluatedAllowances.taxableAllowancesCents;
  let nonTaxableAllowancesCents =
    evaluatedAllowances.nonTaxableAllowancesCents;
  let ytdOtherBenefitsTotalCents = periodExcessCents + periodBonusesCents;
  if (ytdOtherBenefitsCents !== undefined) {
    const bucket = allocateNinetiethBucket({
      ytdUsedCents: ytdOtherBenefitsCents,
      periodBonusesCents,
      periodDeMinimisExcessCents: periodExcessCents,
    });
    taxableAllowancesCents =
      evaluatedAllowances.taxableAllowancesCents -
      periodExcessCents +
      bucket.taxableCents;
    nonTaxableAllowancesCents =
      evaluatedAllowances.nonTaxableAllowancesCents + bucket.exemptCents;
    ytdOtherBenefitsTotalCents = bucket.totalUsedCents;
  }

  // 6. Gross Pay Computation
  const grossPayCents =
    netBasicPayCents +
    dolePremiums.totalPremiumPayCents +
    taxableAllowancesCents +
    nonTaxableAllowancesCents;

  // 7. Full Monthly Statutory Contributions (Standard Monthly Tables)
  const fullMonthlySss = calculateSssContribution(
    compensation.monthlyBasicRateCents,
  );
  const fullMonthlyPhilhealth = calculatePhilhealthContribution(
    compensation.monthlyBasicRateCents,
  );
  const fullMonthlyPagibig = calculatePagibigContribution(
    compensation.monthlyBasicRateCents,
    compensation.customPagibigDeductionCents,
  );

  // 8. Determine Statutory Deductions for Current Cutoff
  const sssContribution = resolveCutoffContribution(
    fullMonthlySss,
    schedule.deductSssIn,
    cutoffType,
  );
  const philhealthContribution = resolveCutoffContribution(
    fullMonthlyPhilhealth,
    schedule.deductPhilhealthIn,
    cutoffType,
  );
  const pagibigContribution = resolveCutoffContribution(
    fullMonthlyPagibig,
    schedule.deductPagibigIn,
    cutoffType,
  );

  const totalStatutoryEmployeeCents =
    sssContribution.employeeShareCents +
    philhealthContribution.employeeShareCents +
    pagibigContribution.employeeShareCents;

  const totalStatutoryEmployerCents =
    sssContribution.employerShareCents +
    philhealthContribution.employerShareCents +
    pagibigContribution.employerShareCents;

  // 9. Withholding Tax Calculation
  // Taxable Base = (Gross Taxable Earnings) - (Employee Statutory Deductions)
  const grossTaxableEarnings =
    netBasicPayCents +
    dolePremiums.totalPremiumPayCents +
    taxableAllowancesCents;

  const taxableIncomeCents =
    grossTaxableEarnings > totalStatutoryEmployeeCents
      ? grossTaxableEarnings - totalStatutoryEmployeeCents
      : 0n;

  let withholdingTaxCents = 0n;
  const shouldDeductTax = shouldApplyCutoffDeduction(
    schedule.deductTaxIn,
    cutoffType,
  );

  if (shouldDeductTax && !compensation.isMinimumWageEarner) {
    withholdingTaxCents = calculateWithholdingTax(
      taxableIncomeCents,
      isSemiMonthly,
      compensation.isMinimumWageEarner,
    );
  }

  // 10. Loan Deductions
  let loanDeductionsCents = 0n;
  for (const loan of loans) {
    loanDeductionsCents += loan.amountCents;
  }

  // 11. Total Deductions & Net Pay
  const totalDeductionsCents =
    totalStatutoryEmployeeCents +
    withholdingTaxCents +
    loanDeductionsCents +
    otherDeductionsCents;

  const netPayCents =
    grossPayCents > totalDeductionsCents
      ? grossPayCents - totalDeductionsCents
      : 0n;

  // 12. 13th Month Accrual for this Period
  const thirteenthMonthAccrualCents =
    calculateThirteenthMonthAccrual(netBasicPayCents);

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
    taxableAllowancesCents,
    nonTaxableAllowancesCents,
    deMinimisExcessTaxableCents: periodExcessCents,
    ytdOtherBenefitsTotalCents,
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

function calculateWorkedPay(
  hourlyRateCents: bigint,
  hoursWorked: number,
): bigint {
  if (!Number.isFinite(hoursWorked) || hoursWorked <= 0) return 0n;

  const minutesWorked = BigInt(Math.round(hoursWorked * 60));
  return (hourlyRateCents * minutesWorked) / 60n;
}

// Helpers for scheduling deductions across cutoffs
function resolveCutoffContribution(
  monthly: StatutoryContributionResult,
  setting: "FIRST_CUTOFF" | "SECOND_CUTOFF" | "SPLIT_EQUAL" | "MONTHLY_SINGLE",
  cutoffType: CutoffType,
): StatutoryContributionResult {
  if (
    cutoffType === CutoffType.MONTHLY_SINGLE ||
    setting === "MONTHLY_SINGLE"
  ) {
    return monthly;
  }

  if (setting === "SPLIT_EQUAL") {
    return {
      employeeShareCents: monthly.employeeShareCents / 2n,
      employerShareCents: monthly.employerShareCents / 2n,
      ecShareCents: monthly.ecShareCents ? monthly.ecShareCents / 2n : 0n,
      wispEmployeeCents: monthly.wispEmployeeCents
        ? monthly.wispEmployeeCents / 2n
        : 0n,
      wispEmployerCents: monthly.wispEmployerCents
        ? monthly.wispEmployerCents / 2n
        : 0n,
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
  cutoffType: CutoffType,
): boolean {
  if (
    cutoffType === CutoffType.MONTHLY_SINGLE ||
    setting === "MONTHLY_SINGLE" ||
    setting === "SPLIT_EQUAL"
  ) {
    return true;
  }
  if (setting === "FIRST_CUTOFF" && cutoffType === CutoffType.FIRST_CUTOFF)
    return true;
  if (setting === "SECOND_CUTOFF" && cutoffType === CutoffType.SECOND_CUTOFF)
    return true;
  return false;
}
