/**
 * Internal BIR 2316 reconciliation worksheet, NOT a BIR Form 2316.
 * The official form has different fields/line numbers; this projection must
 * not be signed, filed or sent to an employee as a substitute for the form.
 */

import { manilaIsoDate } from "./manila-date";
import { formatCentavosGrouped } from "./money";
import { TAX_EXEMPT_BONUS_CEILING_CENTS } from "./thirteenth-month";
import { annualizeTax } from "./withholding-tax";

export interface Bir2316EmployeeProfile {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  tin: string;
  residentialAddress: string;
  dateOfBirth?: string;
  isMinimumWageEarner: boolean;
}

export interface Bir2316EmployerProfile {
  registeredName: string;
  tin: string;
  rdoCode: string;
  registeredAddress: string;
  zipCode?: string;
}

export interface Bir2316AnnualIncomeSummary {
  // Gross components
  totalBasicSalaryCents: bigint;
  totalOvertimePayCents: bigint;
  totalHolidayPayCents: bigint;
  totalNightDiffPayCents: bigint;
  totalDeMinimisBenefitsCents: bigint;
  totalThirteenthMonthAndBonusesCents: bigint;
  totalOtherTaxableAllowancesCents: bigint;

  // Statutory Deductions (Employee Share)
  totalSssEmployeeShareCents: bigint;
  totalPhilhealthEmployeeShareCents: bigint;
  totalPagibigEmployeeShareCents: bigint;

  // Tax Withheld to date
  totalTaxWithheldCents: bigint;
}

export interface Bir2316CertificateData {
  taxYear: number;
  employee: Bir2316EmployeeProfile;
  employer: Bir2316EmployerProfile;

  // Part IV-B: Non-Taxable / Exempt Compensation Income
  partIVB: {
    basicMweCents: bigint;
    holidayPayMweCents: bigint;
    overtimePayMweCents: bigint;
    nightDiffMweCents: bigint;
    hazardPayMweCents: bigint;
    thirteenthMonthExemptCents: bigint; // Up to 90,000 PHP
    deMinimisBenefitsCents: bigint;
    statutoryContributionsCents: bigint; // SSS (including WISP) + PhilHealth + Pag-IBIG
    otherNonTaxableCents: bigint;
    totalNonTaxableCompensationCents: bigint;
  };

  // Part IV-C: Taxable Compensation Income
  partIVC: {
    basicSalaryRegularCents: bigint;
    overtimePayTaxableCents: bigint;
    holidayPayTaxableCents: bigint;
    nightDiffTaxableCents: bigint;
    otherTaxableAllowancesCents: bigint;
    thirteenthMonthExcessTaxableCents: bigint; // Over 90,000 PHP
    totalTaxableCompensationCents: bigint;
  };

  // Part IV-A: Summary
  partIVA: {
    grossCompensationIncomeCents: bigint;
    totalNonTaxableCompensationCents: bigint;
    totalTaxableCompensationCents: bigint;
    taxDueAnnualCents: bigint;
    totalTaxWithheldCents: bigint;
    taxAdjustmentCents: bigint; // Negative = refund to review; positive = deficiency to review
    refundDueEmployeeCents: bigint;
    taxPayableByEmployeeCents: bigint;
  };

  isMwe: boolean;
  generatedDate: string;
}

/**
 * Computes a Form 2316-inspired internal breakdown with centavo totals.
 * It omits prior employer income/tax and is not a substitute for the BIR form.
 */
export function generateBir2316Certificate(
  taxYear: number,
  employee: Bir2316EmployeeProfile,
  employer: Bir2316EmployerProfile,
  income: Bir2316AnnualIncomeSummary,
): Bir2316CertificateData {
  const isMwe = employee.isMinimumWageEarner;

  // 1. Mandatory Statutory Contributions (Employee Share)
  const statutoryContributionsCents =
    income.totalSssEmployeeShareCents +
    income.totalPhilhealthEmployeeShareCents +
    income.totalPagibigEmployeeShareCents;

  // 2. 13th Month & Other Bonuses (TRAIN Law 90,000 PHP Cap)
  const thirteenthMonthExemptCents =
    income.totalThirteenthMonthAndBonusesCents > TAX_EXEMPT_BONUS_CEILING_CENTS
      ? TAX_EXEMPT_BONUS_CEILING_CENTS
      : income.totalThirteenthMonthAndBonusesCents;

  const thirteenthMonthExcessTaxableCents =
    income.totalThirteenthMonthAndBonusesCents > TAX_EXEMPT_BONUS_CEILING_CENTS
      ? income.totalThirteenthMonthAndBonusesCents -
        TAX_EXEMPT_BONUS_CEILING_CENTS
      : 0n;
  // MWE statutory wages are exempt, but other taxable benefits are not.
  // Without separate benefit classification this worksheet must not discard
  // taxable compensation by treating the entire person as exempt.
  if (
    isMwe &&
    (income.totalOtherTaxableAllowancesCents > 0n ||
      thirteenthMonthExcessTaxableCents > 0n)
  ) {
    throw new RangeError("MWE taxable benefits require manual tax review");
  }

  // 3. Evaluate Part IV-B (Non-Taxable) and Part IV-C (Taxable)
  let basicMweCents = 0n;
  let holidayPayMweCents = 0n;
  let overtimePayMweCents = 0n;
  let nightDiffMweCents = 0n;
  const hazardPayMweCents = 0n;

  let basicSalaryRegularCents = 0n;
  let overtimePayTaxableCents = 0n;
  let holidayPayTaxableCents = 0n;
  let nightDiffTaxableCents = 0n;

  // Employee statutory contributions are part of gross compensation, not
  // additional earnings. Allocate them against wage components before
  // reporting them separately on line 40 to avoid double-counting gross pay
  // and over-reporting taxable income. Basic salary normally covers them;
  // any remainder moves through the other wage components.
  let remainingContributionCents = statutoryContributionsCents;
  const netOfContribution = (amountCents: bigint): bigint => {
    const applied =
      amountCents < remainingContributionCents
        ? amountCents
        : remainingContributionCents;
    remainingContributionCents -= applied;
    return amountCents - applied;
  };
  const netBasic = netOfContribution(income.totalBasicSalaryCents);
  const netOvertime = netOfContribution(income.totalOvertimePayCents);
  const netHoliday = netOfContribution(income.totalHolidayPayCents);
  const netNightDiff = netOfContribution(income.totalNightDiffPayCents);
  const netOtherTaxable = netOfContribution(
    income.totalOtherTaxableAllowancesCents,
  );
  if (remainingContributionCents > 0n) {
    throw new RangeError(
      "Statutory contributions exceed recorded taxable earnings",
    );
  }

  if (isMwe) {
    // Under Section 24(A)(2) of Tax Code (RA 9504 / TRAIN), MWEs are exempt from income tax
    // on their basic pay, holiday, OT, and night diff.
    basicMweCents = netBasic;
    holidayPayMweCents = netHoliday;
    overtimePayMweCents = netOvertime;
    nightDiffMweCents = netNightDiff;
  } else {
    basicSalaryRegularCents = netBasic;
    overtimePayTaxableCents = netOvertime;
    holidayPayTaxableCents = netHoliday;
    nightDiffTaxableCents = netNightDiff;
  }

  const deMinimisBenefitsCents = income.totalDeMinimisBenefitsCents;
  const otherNonTaxableCents = 0n;

  const totalNonTaxableCompensationCents =
    basicMweCents +
    holidayPayMweCents +
    overtimePayMweCents +
    nightDiffMweCents +
    hazardPayMweCents +
    thirteenthMonthExemptCents +
    deMinimisBenefitsCents +
    statutoryContributionsCents +
    otherNonTaxableCents;

  const totalTaxableCompensationCents = isMwe
    ? 0n // Supported MWE inputs here contain only exempt compensation
    : basicSalaryRegularCents +
      overtimePayTaxableCents +
      holidayPayTaxableCents +
      nightDiffTaxableCents +
      netOtherTaxable +
      thirteenthMonthExcessTaxableCents;

  const grossCompensationIncomeCents =
    totalNonTaxableCompensationCents + totalTaxableCompensationCents;

  // 4. Annual Tax Due Computation & Annualization (Graduated Table under TRAIN Law)
  const { totalAnnualTaxDueCents: taxDueAnnualCents, taxAdjustmentCents } =
    annualizeTax(
      totalTaxableCompensationCents,
      income.totalTaxWithheldCents,
      isMwe,
    );

  const refundDueEmployeeCents =
    taxAdjustmentCents < 0n ? -taxAdjustmentCents : 0n;
  const taxPayableByEmployeeCents =
    taxAdjustmentCents > 0n ? taxAdjustmentCents : 0n;

  return {
    taxYear,
    employee,
    employer,
    partIVB: {
      basicMweCents,
      holidayPayMweCents,
      overtimePayMweCents,
      nightDiffMweCents,
      hazardPayMweCents,
      thirteenthMonthExemptCents,
      deMinimisBenefitsCents,
      statutoryContributionsCents,
      otherNonTaxableCents,
      totalNonTaxableCompensationCents,
    },
    partIVC: {
      basicSalaryRegularCents,
      overtimePayTaxableCents,
      holidayPayTaxableCents,
      nightDiffTaxableCents,
      otherTaxableAllowancesCents: netOtherTaxable,
      thirteenthMonthExcessTaxableCents,
      totalTaxableCompensationCents,
    },
    partIVA: {
      grossCompensationIncomeCents,
      totalNonTaxableCompensationCents,
      totalTaxableCompensationCents,
      taxDueAnnualCents,
      totalTaxWithheldCents: income.totalTaxWithheldCents,
      taxAdjustmentCents,
      refundDueEmployeeCents,
      taxPayableByEmployeeCents,
    },
    isMwe,
    // Worksheet metadata drifts if left to the host zone; anchor it to the
    // Manila civil date on which the worksheet is generated.
    generatedDate: manilaIsoDate(new Date()),
  };
}

/**
 * Formats a review-only worksheet. No official form numbers or certification.
 */
export function formatBir2316TextDocument(
  cert: Bir2316CertificateData,
): string {
  const f = (cents: bigint) => formatCentavosGrouped(cents);

  return [
    "==========================================================================================",
    "                    INTERNAL TAX RECONCILIATION WORKSHEET (NOT BIR FORM 2316)             ",
    "                 DO NOT FILE, SIGN, OR ISSUE AS AN OFFICIAL CERTIFICATE                 ",
    `                                    TAXABLE YEAR: ${cert.taxYear}                         `,
    "==========================================================================================",
    "PART I: EMPLOYEE INFORMATION",
    `  Employee Name: ${cert.employee.lastName}, ${cert.employee.firstName} ${cert.employee.middleName || ""}`,
    `  TIN: ${cert.employee.tin}`,
    `  Registered Address: ${cert.employee.residentialAddress}`,
    `  Minimum Wage Earner (MWE): ${cert.isMwe ? "YES (EXEMPT)" : "NO"}`,
    "------------------------------------------------------------------------------------------",
    "PART II: EMPLOYER INFORMATION (PRESENT)",
    `  Employer Name: ${cert.employer.registeredName}`,
    `  Employer TIN: ${cert.employer.tin} | RDO Code: ${cert.employer.rdoCode}`,
    `  Registered Address: ${cert.employer.registeredAddress}`,
    "==========================================================================================",
    "SUMMARY OF COMPENSATION & TAX (INTERNAL, NOT OFFICIAL FORM LINE NUMBERS)",
    `  Gross Compensation Income ................................. PHP ${f(cert.partIVA.grossCompensationIncomeCents).padStart(14)}`,
    `  Total Non-Taxable/Exempt Compensation ......... PHP ${f(cert.partIVA.totalNonTaxableCompensationCents).padStart(14)}`,
    `  Total Taxable Compensation Income ............. PHP ${f(cert.partIVA.totalTaxableCompensationCents).padStart(14)}`,
    `  Calculated Annual Tax Due ................ PHP ${f(cert.partIVA.taxDueAnnualCents).padStart(14)}`,
    `  Recorded Payslip Tax Withheld (not independently remittance-verified) ...... PHP ${f(cert.partIVA.totalTaxWithheldCents).padStart(14)}`,
    `  Unsettled Difference (annual due minus recorded withholding):`,
    cert.partIVA.refundDueEmployeeCents > 0n
      ? `           REFUND TO REVIEW (NOT EVIDENCE OF PAYMENT) ........................ PHP ${f(cert.partIVA.refundDueEmployeeCents).padStart(14)}`
      : cert.partIVA.taxPayableByEmployeeCents > 0n
        ? `           DEFICIENCY TO REVIEW (NOT YET COLLECTED) ................... PHP ${f(cert.partIVA.taxPayableByEmployeeCents).padStart(14)}`
        : `           TAX BALANCE EQUALIZED (PHP 0.00 ADJUSTMENT)`,
    "------------------------------------------------------------------------------------------",
    "NON-TAXABLE / EXEMPT COMPENSATION BREAKDOWN",
    `  Basic Pay (Minimum Wage Earner) ........................... PHP ${f(cert.partIVB.basicMweCents).padStart(14)}`,
    `  Holiday Pay (MWE) ......................................... PHP ${f(cert.partIVB.holidayPayMweCents).padStart(14)}`,
    `  Overtime Pay (MWE) ........................................ PHP ${f(cert.partIVB.overtimePayMweCents).padStart(14)}`,
    `  Night Shift Differential (MWE) ............................ PHP ${f(cert.partIVB.nightDiffMweCents).padStart(14)}`,
    `  13th Month Pay & Other Benefits (Max ₱90,000) ............. PHP ${f(cert.partIVB.thirteenthMonthExemptCents).padStart(14)}`,
    `  De Minimis Benefits ....................................... PHP ${f(cert.partIVB.deMinimisBenefitsCents).padStart(14)}`,
    `  SSS, PhilHealth, & Pag-IBIG Contributions (EE Share) ...... PHP ${f(cert.partIVB.statutoryContributionsCents).padStart(14)}`,
    `  TOTAL NON-TAXABLE / EXEMPT COMPENSATION ................... PHP ${f(cert.partIVB.totalNonTaxableCompensationCents).padStart(14)}`,
    "------------------------------------------------------------------------------------------",
    "TAXABLE COMPENSATION BREAKDOWN",
    `  Basic Salary (Regular Employees) .......................... PHP ${f(cert.partIVC.basicSalaryRegularCents).padStart(14)}`,
    `  Overtime Pay (Taxable) .................................... PHP ${f(cert.partIVC.overtimePayTaxableCents).padStart(14)}`,
    `  Holiday Pay (Taxable) ..................................... PHP ${f(cert.partIVC.holidayPayTaxableCents).padStart(14)}`,
    `  Night Shift Differential (Taxable) ........................ PHP ${f(cert.partIVC.nightDiffTaxableCents).padStart(14)}`,
    `  Other Taxable Allowances / Benefits ....................... PHP ${f(cert.partIVC.otherTaxableAllowancesCents).padStart(14)}`,
    `  13th Month Pay & Other Benefits in Excess of ₱90k ......... PHP ${f(cert.partIVC.thirteenthMonthExcessTaxableCents).padStart(14)}`,
    `  TOTAL TAXABLE COMPENSATION INCOME ......................... PHP ${f(cert.partIVC.totalTaxableCompensationCents).padStart(14)}`,
    "==========================================================================================",
    "REVIEW REQUIRED: reconcile prior employers, monthly remittances, year-end settlement,",
    "benefit classifications and BIR's current 2316 layout before any official issuance.",
  ].join("\r\n");
}
