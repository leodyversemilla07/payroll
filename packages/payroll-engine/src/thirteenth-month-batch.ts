/**
 * DOLE 13th Month Pay Batch Calculation & Annual Compliance Reporting Engine
 * Compliant with Presidential Decree No. 851 & DOLE Labor Advisory on 13th Month Pay
 */

import { TAX_EXEMPT_BONUS_CEILING_CENTS } from "./thirteenth-month";

export interface ThirteenthMonthEmployeeInput {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  monthlyBasicRateCents: bigint;
  hireDate: string; // YYYY-MM-DD
  monthsWorkedInYear: number; // 1 to 12
  unpaidAbsenceDays: number; // Leave Without Pay (LWOP) or absences
  otherTaxableBonusesCents?: bigint; // Performance bonuses, commissions
}

export interface ThirteenthMonthEmployeeResult {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  totalBasicEarnedCents: bigint;
  thirteenthMonthPayCents: bigint;
  taxExemptPortionCents: bigint;
  taxableExcessCents: bigint;
  isProrated: boolean;
  monthsWorked: number;
}

export interface ThirteenthMonthBatchResult {
  taxYear: number;
  totalBenefitedEmployees: number;
  totalThirteenthMonthPayCents: bigint;
  totalTaxExemptCents: bigint;
  totalTaxableExcessCents: bigint;
  employeeResults: ThirteenthMonthEmployeeResult[];
}

export interface DoleComplianceReportInput {
  taxYear: number;
  establishmentName: string;
  registeredAddress: string;
  natureOfBusiness: string;
  contactPerson: string;
  contactNumber: string;
  contactTitle?: string;
  batchResult: ThirteenthMonthBatchResult;
  // Labor Code managerial employees are outside PD 851 coverage and are
  // listed in the report for transparency instead of the benefit ledger.
  excludedManagerialCount?: number;
}

/**
 * Whole months of service in a tax year from a hire date, for 13th-month
 * proration. Same rule the DOLE report uses: a full 12 when hired in a
 * prior year, otherwise 12 minus the hire month (minimum 1); future-dated
 * hires yield 0.
 */
export function calculateMonthsWorkedInYear(
  hireDate: Date | string,
  taxYear: number,
): number {
  const hired = typeof hireDate === "string" ? new Date(hireDate) : hireDate;
  if (Number.isNaN(hired.getTime())) return 0;
  const hireYear = hired.getFullYear();
  if (hireYear > taxYear) return 0;
  if (hireYear === taxYear) return Math.max(1, 12 - hired.getMonth());
  return 12;
}

/**
 * Computes individual 13th-month pay based on DOLE PD 851:
 * 13th Month Pay = Total Basic Salary Earned in the Calendar Year / 12
 */
export function calculateEmployee13thMonth(
  emp: ThirteenthMonthEmployeeInput,
  dailyRateCents?: bigint,
): ThirteenthMonthEmployeeResult {
  // PD 851 covers rank-and-file employees with at least one month of service
  // in the calendar year. Shorter tenure carries no 13th-month entitlement.
  if (emp.monthsWorkedInYear < 1) {
    return {
      employeeId: emp.employeeId,
      employeeNumber: emp.employeeNumber,
      fullName: emp.fullName,
      totalBasicEarnedCents: 0n,
      thirteenthMonthPayCents: 0n,
      taxExemptPortionCents: 0n,
      taxableExcessCents: 0n,
      isProrated: true,
      monthsWorked: 0,
    };
  }

  // 1. Calculate base basic salary earned
  const months = Math.min(12, Math.max(1, emp.monthsWorkedInYear));
  const baseEarned = emp.monthlyBasicRateCents * BigInt(months);

  // 2. Deduct unpaid absences / LWOP
  // If daily rate is not provided, estimate from monthly / 21.75
  const daily = dailyRateCents ?? (emp.monthlyBasicRateCents * 12n) / 261n;
  const absenceDeduction =
    (daily * BigInt(Math.round(emp.unpaidAbsenceDays * 100))) / 100n;
  const netBasicEarned =
    baseEarned > absenceDeduction ? baseEarned - absenceDeduction : 0n;

  // 3. 13th Month Pay = Net Basic Earned / 12
  const thirteenthMonthPayCents = netBasicEarned / 12n;

  // 4. Tax exemption evaluation (TRAIN Law ₱90,000 ceiling)
  const priorBonuses = emp.otherTaxableBonusesCents ?? 0n;
  const remainingExemptCap =
    TAX_EXEMPT_BONUS_CEILING_CENTS > priorBonuses
      ? TAX_EXEMPT_BONUS_CEILING_CENTS - priorBonuses
      : 0n;

  let taxExemptPortionCents = 0n;
  let taxableExcessCents = 0n;

  if (thirteenthMonthPayCents <= remainingExemptCap) {
    taxExemptPortionCents = thirteenthMonthPayCents;
    taxableExcessCents = 0n;
  } else {
    taxExemptPortionCents = remainingExemptCap;
    taxableExcessCents = thirteenthMonthPayCents - remainingExemptCap;
  }

  return {
    employeeId: emp.employeeId,
    employeeNumber: emp.employeeNumber,
    fullName: emp.fullName,
    totalBasicEarnedCents: netBasicEarned,
    thirteenthMonthPayCents,
    taxExemptPortionCents,
    taxableExcessCents,
    isProrated: months < 12 || emp.unpaidAbsenceDays > 0,
    monthsWorked: months,
  };
}

/**
 * Computes batch 13th-month pay across all active employees in an organization.
 */
export function calculate13thMonthBatch(
  taxYear: number,
  employees: ThirteenthMonthEmployeeInput[],
): ThirteenthMonthBatchResult {
  const results: ThirteenthMonthEmployeeResult[] = employees.map((emp) =>
    calculateEmployee13thMonth(emp),
  );

  const totalBenefitedEmployees = results.length;
  const totalThirteenthMonthPayCents = results.reduce(
    (sum, r) => sum + r.thirteenthMonthPayCents,
    0n,
  );
  const totalTaxExemptCents = results.reduce(
    (sum, r) => sum + r.taxExemptPortionCents,
    0n,
  );
  const totalTaxableExcessCents = results.reduce(
    (sum, r) => sum + r.taxableExcessCents,
    0n,
  );

  return {
    taxYear,
    totalBenefitedEmployees,
    totalThirteenthMonthPayCents,
    totalTaxExemptCents,
    totalTaxableExcessCents,
    employeeResults: results,
  };
}

/**
 * Formats official DOLE 13th Month Pay Annual Compliance Report string.
 * Conforms to DOLE Bureau of Working Conditions (BWC) ERS requirements under PD 851.
 */
export function formatDole13thMonthComplianceReport(
  input: DoleComplianceReportInput,
): string {
  const f = (cents: bigint) =>
    (Number(cents) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 });

  return [
    "==========================================================================================",
    "                   DEPARTMENT OF LABOR AND EMPLOYMENT (DOLE)                              ",
    "               REPORT ON COMPLIANCE WITH PRESIDENTIAL DECREE NO. 851                     ",
    `                          ANNUAL 13TH MONTH PAY REPORT - YEAR ${input.taxYear}            `,
    "==========================================================================================",
    "PART I: ESTABLISHMENT INFORMATION",
    `  Name of Establishment: ${input.establishmentName}`,
    `  Principal Business Address: ${input.registeredAddress}`,
    `  Nature of Business / Industry: ${input.natureOfBusiness}`,
    `  Contact Person: ${input.contactPerson} (${input.contactNumber})`,
    "------------------------------------------------------------------------------------------",
    "PART II: SUMMARY OF 13TH MONTH BENEFIT DISTRIBUTION",
    `  Total Employees Covered & Benefited: ${input.batchResult.totalBenefitedEmployees}`,
    `  Managerial Employees Excluded (PD 851 covers rank-and-file only): ${input.excludedManagerialCount ?? 0}`,
    `  Total 13th Month Pay Payout Granted: PHP ${f(input.batchResult.totalThirteenthMonthPayCents)}`,
    `  Total Tax-Exempt Benefits (≤₱90,000): PHP ${f(input.batchResult.totalTaxExemptCents)}`,
    `  Total Taxable Benefits (>₱90,000):   PHP ${f(input.batchResult.totalTaxableExcessCents)}`,
    `  Mandated Statutory Release Date: On or before December 24, ${input.taxYear}`,
    "==========================================================================================",
    "PART III: EMPLOYEE BENEFIT LEDGER",
    "Employee ID | Employee Name             | Basic Earned (PHP) | 13th Month Pay (PHP) | Status",
    "------------------------------------------------------------------------------------------",
    ...input.batchResult.employeeResults.map(
      (r) =>
        `${r.employeeNumber.padEnd(11)} | ${r.fullName.padEnd(25)} | ${f(r.totalBasicEarnedCents).padStart(18)} | ${f(r.thirteenthMonthPayCents).padStart(20)} | ${r.isProrated ? "Pro-rated" : "Full (12m)"}`,
    ),
    "==========================================================================================",
    "EMPLOYER CERTIFICATION:",
    "I hereby certify under oath that the above information is true and correct in accordance",
    "with the provisions of Presidential Decree No. 851 and its implementing guidelines.",
    "",
    `Authorized Representative: ${input.contactPerson}          Date: ${new Date().toISOString().slice(0, 10)}`,
    `Position / Title: ${input.contactTitle ?? "Not provided"}`,
  ].join("\r\n");
}
