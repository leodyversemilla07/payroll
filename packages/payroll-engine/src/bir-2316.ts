/**
 * BIR Form 2316: Certificate of Compensation Payment / Tax Withheld
 * Compliant with Republic Act No. 10963 (TRAIN Law) & BIR Revenue Regulations No. 11-2018
 */

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
    basicMweCents: bigint; // Line 33
    holidayPayMweCents: bigint; // Line 34
    overtimePayMweCents: bigint; // Line 35
    nightDiffMweCents: bigint; // Line 36
    hazardPayMweCents: bigint; // Line 37
    thirteenthMonthExemptCents: bigint; // Line 38 (Up to 90,000 PHP)
    deMinimisBenefitsCents: bigint; // Line 39
    statutoryContributionsCents: bigint; // Line 40 (SSS + PhilHealth + Pag-IBIG)
    otherNonTaxableCents: bigint; // Line 41
    totalNonTaxableCompensationCents: bigint; // Line 42
  };

  // Part IV-C: Taxable Compensation Income
  partIVC: {
    basicSalaryRegularCents: bigint; // Line 43
    overtimePayTaxableCents: bigint; // Line 44
    holidayPayTaxableCents: bigint; // Line 45
    nightDiffTaxableCents: bigint; // Line 46
    otherTaxableAllowancesCents: bigint; // Line 47
    thirteenthMonthExcessTaxableCents: bigint; // Line 48 (Over 90,000 PHP)
    totalTaxableCompensationCents: bigint; // Line 49
  };

  // Part IV-A: Summary
  partIVA: {
    grossCompensationIncomeCents: bigint; // Line 25
    totalNonTaxableCompensationCents: bigint; // Line 26
    totalTaxableCompensationCents: bigint; // Line 27
    taxDueAnnualCents: bigint; // Line 30
    totalTaxWithheldCents: bigint; // Line 31
    taxAdjustmentCents: bigint; // Line 32 (Negative = Refund; Positive = Deficiency)
    refundDueEmployeeCents: bigint;
    taxPayableByEmployeeCents: bigint;
  };

  isMwe: boolean;
  generatedDate: string;
}

/**
 * Computes official BIR Form 2316 Certificate data with exact centavo breakdown.
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

  if (isMwe) {
    // Under Section 24(A)(2) of Tax Code (RA 9504 / TRAIN), MWEs are exempt from income tax
    // on their basic pay, holiday, OT, and night diff.
    basicMweCents = income.totalBasicSalaryCents;
    holidayPayMweCents = income.totalHolidayPayCents;
    overtimePayMweCents = income.totalOvertimePayCents;
    nightDiffMweCents = income.totalNightDiffPayCents;
  } else {
    basicSalaryRegularCents = income.totalBasicSalaryCents;
    overtimePayTaxableCents = income.totalOvertimePayCents;
    holidayPayTaxableCents = income.totalHolidayPayCents;
    nightDiffTaxableCents = income.totalNightDiffPayCents;
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
    ? 0n // MWE is 100% tax-exempt
    : basicSalaryRegularCents +
      overtimePayTaxableCents +
      holidayPayTaxableCents +
      nightDiffTaxableCents +
      income.totalOtherTaxableAllowancesCents +
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
      otherTaxableAllowancesCents: income.totalOtherTaxableAllowancesCents,
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
    generatedDate: new Date().toISOString(),
  };
}

/**
 * Formats a clean, text-based official BIR Form 2316 Certificate string.
 */
export function formatBir2316TextDocument(
  cert: Bir2316CertificateData,
): string {
  const f = (cents: bigint) =>
    (Number(cents) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 });

  return [
    "==========================================================================================",
    "              BUREAU OF INTERNAL REVENUE - CERTIFICATE OF COMPENSATION PAYMENT            ",
    "                               TAX WITHHELD (BIR FORM 2316)                              ",
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
    "PART IV-A: SUMMARY OF COMPENSATION & TAX",
    `  Line 25: Gross Compensation Income ................................. PHP ${f(cert.partIVA.grossCompensationIncomeCents).padStart(14)}`,
    `  Line 26: Total Non-Taxable/Exempt Compensation (Part IV-B) ......... PHP ${f(cert.partIVA.totalNonTaxableCompensationCents).padStart(14)}`,
    `  Line 27: Total Taxable Compensation Income (Part IV-C) ............. PHP ${f(cert.partIVA.totalTaxableCompensationCents).padStart(14)}`,
    `  Line 30: Annual Tax Due (TRAIN Law Graduated Rates) ................ PHP ${f(cert.partIVA.taxDueAnnualCents).padStart(14)}`,
    `  Line 31: Total Amount of Taxes Withheld from Present Employer ...... PHP ${f(cert.partIVA.totalTaxWithheldCents).padStart(14)}`,
    `  Line 32: Year-End Tax Adjustment:`,
    cert.partIVA.refundDueEmployeeCents > 0n
      ? `           OVERWITHHELD TAX REFUNDED TO EMPLOYEE ..................... PHP ${f(cert.partIVA.refundDueEmployeeCents).padStart(14)}`
      : cert.partIVA.taxPayableByEmployeeCents > 0n
        ? `           AMOUNT OF TAX STILL PAYABLE BY EMPLOYEE ................... PHP ${f(cert.partIVA.taxPayableByEmployeeCents).padStart(14)}`
        : `           TAX BALANCE EQUALIZED (PHP 0.00 ADJUSTMENT)`,
    "------------------------------------------------------------------------------------------",
    "PART IV-B: DETAILS OF NON-TAXABLE / EXEMPT COMPENSATION INCOME",
    `  Line 33: Basic Pay (Minimum Wage Earner) ........................... PHP ${f(cert.partIVB.basicMweCents).padStart(14)}`,
    `  Line 34: Holiday Pay (MWE) ......................................... PHP ${f(cert.partIVB.holidayPayMweCents).padStart(14)}`,
    `  Line 35: Overtime Pay (MWE) ........................................ PHP ${f(cert.partIVB.overtimePayMweCents).padStart(14)}`,
    `  Line 36: Night Shift Differential (MWE) ............................ PHP ${f(cert.partIVB.nightDiffMweCents).padStart(14)}`,
    `  Line 38: 13th Month Pay & Other Benefits (Max ₱90,000) ............. PHP ${f(cert.partIVB.thirteenthMonthExemptCents).padStart(14)}`,
    `  Line 39: De Minimis Benefits ....................................... PHP ${f(cert.partIVB.deMinimisBenefitsCents).padStart(14)}`,
    `  Line 40: SSS, PhilHealth, & Pag-IBIG Contributions (EE Share) ...... PHP ${f(cert.partIVB.statutoryContributionsCents).padStart(14)}`,
    `  Line 42: TOTAL NON-TAXABLE / EXEMPT COMPENSATION ................... PHP ${f(cert.partIVB.totalNonTaxableCompensationCents).padStart(14)}`,
    "------------------------------------------------------------------------------------------",
    "PART IV-C: DETAILS OF TAXABLE COMPENSATION INCOME",
    `  Line 43: Basic Salary (Regular Employees) .......................... PHP ${f(cert.partIVC.basicSalaryRegularCents).padStart(14)}`,
    `  Line 44: Overtime Pay (Taxable) .................................... PHP ${f(cert.partIVC.overtimePayTaxableCents).padStart(14)}`,
    `  Line 45: Holiday Pay (Taxable) ..................................... PHP ${f(cert.partIVC.holidayPayTaxableCents).padStart(14)}`,
    `  Line 46: Night Shift Differential (Taxable) ........................ PHP ${f(cert.partIVC.nightDiffTaxableCents).padStart(14)}`,
    `  Line 47: Other Taxable Allowances / Benefits ....................... PHP ${f(cert.partIVC.otherTaxableAllowancesCents).padStart(14)}`,
    `  Line 48: 13th Month Pay & Other Benefits in Excess of ₱90k ......... PHP ${f(cert.partIVC.thirteenthMonthExcessTaxableCents).padStart(14)}`,
    `  Line 49: TOTAL TAXABLE COMPENSATION INCOME ......................... PHP ${f(cert.partIVC.totalTaxableCompensationCents).padStart(14)}`,
    "==========================================================================================",
    "CONFORME & CERTIFICATION:",
    "I declare under the penalties of perjury that this certificate has been made in good",
    "faith, verified by me, and to the best of my knowledge and belief, is true and correct.",
    "",
    "Employer Authorized Representative: _______________________ Date: ________________",
    "Employee Signature:                _______________________ Date: ________________",
  ].join("\r\n");
}
