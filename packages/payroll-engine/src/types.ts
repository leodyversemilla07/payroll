/**
 * Philippine Payroll Domain Types & Interfaces
 * Monetary values are expressed as Centavos (BigInt) to ensure exact precision (e.g. PHP 100.50 = 10050n).
 */

export type Centavos = bigint;

export enum PayBasis {
  MONTHLY = "MONTHLY",
  DAILY = "DAILY",
  HOURLY = "HOURLY",
}

export enum WorkDayDivisor {
  SIX_DAYS_PER_WEEK = 313, // 313 days (Mon-Sat, excluding 52 Sundays)
  FIVE_DAYS_PER_WEEK = 261, // 261 days (Mon-Fri, excluding 104 Sat & Sun)
  CONTINUOUS_OPERATIONS = 365, // 365 days (Including all days)
}

export enum DayType {
  REGULAR_WORKDAY = "REGULAR_WORKDAY",
  REST_DAY = "REST_DAY",
  SPECIAL_NON_WORKING_HOLIDAY = "SPECIAL_NON_WORKING_HOLIDAY",
  SPECIAL_WORKING_HOLIDAY = "SPECIAL_WORKING_HOLIDAY",
  REGULAR_HOLIDAY = "REGULAR_HOLIDAY",
  DOUBLE_HOLIDAY = "DOUBLE_HOLIDAY",
}

// BIR de minimis ceilings per RR No. 2-98 as amended, latest by RR No. 29-2025
// (effective January 6, 2026). Amounts within a category ceiling are exempt
// from income and withholding tax; any excess spills into the PHP 90,000
// annual 13th-month-and-other-benefits bucket (TRAIN Law).
export enum DeMinimisCategory {
  RICE_SUBSIDY = "RICE_SUBSIDY", // Ceiling: PHP 2,500 / month
  UNIFORM_CLOTHING = "UNIFORM_CLOTHING", // Ceiling: PHP 8,000 / year
  MEDICAL_CASH_ALLOWANCE = "MEDICAL_CASH_ALLOWANCE", // Ceiling: PHP 2,000 / semester, dependents
  ACTUAL_MEDICAL_ASSISTANCE = "ACTUAL_MEDICAL_ASSISTANCE", // Ceiling: PHP 12,000 / year
  LAUNDRY_ALLOWANCE = "LAUNDRY_ALLOWANCE", // Ceiling: PHP 400 / month
  DAILY_MEAL_OVERTIME = "DAILY_MEAL_OVERTIME", // Ceiling: 30% of basic minimum wage per OT/night-shift day
  ACHIEVEMENT_AWARD = "ACHIEVEMENT_AWARD", // Ceiling: PHP 12,000 / year
  GIFTS_CHRISTMAS_MAJOR = "GIFTS_CHRISTMAS_MAJOR", // Ceiling: PHP 6,000 / year
  OTHER = "OTHER",
}

export interface AttendanceSummary {
  regularHoursWorked: number; // in hours (decimal or fractions)
  tardinessMinutes: number;
  undertimeMinutes: number;
  absentDays: number;

  // Overtime Hours
  regularOvertimeHours: number;
  restDayHours: number;
  restDayOvertimeHours: number;
  specialHolidayHours: number;
  specialHolidayOvertimeHours: number;
  specialHolidayRestDayHours: number;
  specialHolidayRestDayOvertimeHours: number;
  regularHolidayHours: number;
  regularHolidayOvertimeHours: number;
  regularHolidayUnworkedDays?: number;
  regularHolidayRestDayHours: number;
  regularHolidayRestDayOvertimeHours: number;

  // Night Shift Differential (10:00 PM to 6:00 AM)
  regularNightDiffHours: number;
  overtimeNightDiffHours: number;
  restDayNightDiffHours: number;
  holidayNightDiffHours: number;
}

export interface EmployeeCompensationProfile {
  payBasis: PayBasis;
  monthlyBasicRateCents: Centavos;
  dailyRateCents?: Centavos;
  hourlyRateCents?: Centavos;
  divisor: WorkDayDivisor;
  isMinimumWageEarner: boolean; // Exempt from BIR withholding tax under RA 9504 / TRAIN

  // Custom Overrides (Optional)
  customSssDeductionCents?: Centavos;
  customPhilhealthDeductionCents?: Centavos;
  customPagibigDeductionCents?: Centavos;
}

export interface AllowanceInput {
  name: string;
  amountCents: Centavos;
  isTaxable: boolean;
  deMinimisCategory?: DeMinimisCategory;
}

export interface LoanDeductionInput {
  loanId: string;
  name: string;
  amountCents: Centavos;
}

export enum CutoffType {
  FIRST_CUTOFF = "FIRST_CUTOFF", // 1st - 15th
  SECOND_CUTOFF = "SECOND_CUTOFF", // 16th - 30th/31st
  MONTHLY_SINGLE = "MONTHLY_SINGLE",
}

export interface StatutoryDeductionSchedule {
  deductSssIn:
    | "FIRST_CUTOFF"
    | "SECOND_CUTOFF"
    | "SPLIT_EQUAL"
    | "MONTHLY_SINGLE";
  deductPhilhealthIn:
    | "FIRST_CUTOFF"
    | "SECOND_CUTOFF"
    | "SPLIT_EQUAL"
    | "MONTHLY_SINGLE";
  deductPagibigIn:
    | "FIRST_CUTOFF"
    | "SECOND_CUTOFF"
    | "SPLIT_EQUAL"
    | "MONTHLY_SINGLE";
  deductTaxIn:
    | "FIRST_CUTOFF"
    | "SECOND_CUTOFF"
    | "SPLIT_EQUAL"
    | "MONTHLY_SINGLE";
}

export interface PayrollCalculationInput {
  cutoffType: CutoffType;
  schedule: StatutoryDeductionSchedule;
  compensation: EmployeeCompensationProfile;
  attendance: AttendanceSummary;
  allowances: AllowanceInput[];
  loans: LoanDeductionInput[];
  otherDeductionsCents?: Centavos;
  ytdTaxableCompensationCents?: Centavos;
  ytdTaxWithheldCents?: Centavos;
}

export interface StatutoryContributionResult {
  employeeShareCents: Centavos;
  employerShareCents: Centavos;
  ecShareCents?: Centavos; // Employees' Compensation (SSS)
  wispEmployeeCents?: Centavos; // Mandatory Provident Fund (SSS)
  wispEmployerCents?: Centavos;
  totalCents: Centavos;
}

export interface PayrollCalculationResult {
  // Rates Derived
  dailyRateCents: Centavos;
  hourlyRateCents: Centavos;
  minuteRateCents: Centavos;

  // Basic Pay & Time Adjustments
  basicPayForPeriodCents: Centavos;
  tardinessDeductionCents: Centavos;
  undertimeDeductionCents: Centavos;
  absenceDeductionCents: Centavos;
  netBasicPayCents: Centavos;

  // Premium Earnings
  overtimePayCents: Centavos;
  nightDiffPayCents: Centavos;
  holidayPayCents: Centavos;
  restDayPayCents: Centavos;
  totalPremiumPayCents: Centavos;

  // Allowances & De Minimis
  taxableAllowancesCents: Centavos;
  nonTaxableAllowancesCents: Centavos;
  deMinimisExcessTaxableCents: Centavos;

  // Gross Compensation
  grossPayCents: Centavos;

  // Statutory Deductions (Employee Share deducted this cutoff)
  sssContribution: StatutoryContributionResult;
  philhealthContribution: StatutoryContributionResult;
  pagibigContribution: StatutoryContributionResult;
  totalStatutoryEmployeeCents: Centavos;
  totalStatutoryEmployerCents: Centavos;

  // Tax Computations
  taxableIncomeCents: Centavos;
  withholdingTaxCents: Centavos;

  // Other Deductions
  loanDeductionsCents: Centavos;
  otherDeductionsCents: Centavos;
  totalDeductionsCents: Centavos;

  // Final Net Pay & Accrual
  netPayCents: Centavos;
  thirteenthMonthAccrualCents: Centavos;
}
