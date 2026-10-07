/**
 * BIR Form 1604-C & Alphalist Transmittal File Generator
 * Compliant with Bureau of Internal Revenue (BIR) RMO / RMC requirements
 * for the Annual Information Return of Income Taxes Withheld on Compensation
 * and Alphabetical List of Employees (Schedules 7.1 and 7.2).
 */

export interface Bir1604CEmployerProfile {
  tin: string;
  branchCode?: string;
  registeredName: string;
  registeredAddress: string;
  rdoCode: string;
}

export interface Bir1604CSchedule71Employee {
  sequenceNumber: number;
  employeeNumber: string;
  tin: string;
  branchCode?: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  region?: string;
  employmentStatus?: string;
  periodFrom: string; // YYYY-MM-DD
  periodTo: string; // YYYY-MM-DD
  grossCompensationCents: bigint;
  totalNonTaxableCents: bigint;
  statutoryContributionsCents: bigint;
  deMinimisCents: bigint;
  thirteenthMonthExemptCents: bigint;
  otherNonTaxableCents: bigint;
  totalTaxableCents: bigint;
  basicSalaryTaxableCents: bigint;
  thirteenthMonthTaxableCents: bigint;
  overtimeAndPremiumsTaxableCents: bigint;
  taxDueAnnualCents: bigint;
  taxWithheldPreviousEmployerCents: bigint;
  taxWithheldPresentEmployerCents: bigint;
  totalTaxWithheldCents: bigint;
  adjustmentCents: bigint;
  adjustmentType: "REFUND" | "PAYABLE" | "ZERO";
  substitutedFiling: boolean;
}

export interface Bir1604CSchedule72Employee {
  sequenceNumber: number;
  employeeNumber: string;
  tin: string;
  branchCode?: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  region?: string;
  periodFrom: string;
  periodTo: string;
  dailyRateCents?: bigint;
  grossCompensationCents: bigint;
  totalNonTaxableCents: bigint;
  basicMweCents: bigint;
  holidayPayMweCents: bigint;
  overtimePayMweCents: bigint;
  nightDiffMweCents: bigint;
  hazardPayMweCents: bigint;
  thirteenthMonthExemptCents: bigint;
  deMinimisCents: bigint;
  statutoryContributionsCents: bigint;
  otherNonTaxableCents: bigint;
  totalTaxableCents: bigint;
  taxDueAnnualCents: bigint;
  totalTaxWithheldCents: bigint;
  adjustmentCents: bigint;
  adjustmentType: "REFUND" | "PAYABLE" | "ZERO";
}

export interface Bir1604CAlphalistInput {
  taxYear: number;
  employer: Bir1604CEmployerProfile;
  schedule71: Bir1604CSchedule71Employee[];
  schedule72: Bir1604CSchedule72Employee[];
}

export interface Bir1604CAlphalistSummary {
  taxYear: number;
  totalEmployees: number;
  schedule71Count: number;
  schedule72Count: number;
  totalGrossCompensationCents: bigint;
  totalNonTaxableCents: bigint;
  totalTaxableCents: bigint;
  totalTaxDueCents: bigint;
  totalTaxWithheldCents: bigint;
  totalRefundCents: bigint;
  totalPayableCents: bigint;
}

function cleanTin(tin: string): string {
  return tin
    .replace(/[^0-9]/g, "")
    .padStart(9, "0")
    .slice(0, 12);
}

function formatCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  const pesos = abs / 100n;
  const rem = abs % 100n;
  return `${sign}${pesos.toString()}.${rem.toString().padStart(2, "0")}`;
}

function escapeCsvField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * Summarizes financial and head-count metrics across schedules.
 */
export function summarizeBir1604CAlphalist(
  input: Bir1604CAlphalistInput,
): Bir1604CAlphalistSummary {
  let totalGrossCompensationCents = 0n;
  let totalNonTaxableCents = 0n;
  let totalTaxableCents = 0n;
  let totalTaxDueCents = 0n;
  let totalTaxWithheldCents = 0n;
  let totalRefundCents = 0n;
  let totalPayableCents = 0n;

  for (const emp of input.schedule71) {
    totalGrossCompensationCents += emp.grossCompensationCents;
    totalNonTaxableCents += emp.totalNonTaxableCents;
    totalTaxableCents += emp.totalTaxableCents;
    totalTaxDueCents += emp.taxDueAnnualCents;
    totalTaxWithheldCents += emp.totalTaxWithheldCents;
    if (emp.adjustmentType === "REFUND") {
      totalRefundCents += emp.adjustmentCents;
    } else if (emp.adjustmentType === "PAYABLE") {
      totalPayableCents += emp.adjustmentCents;
    }
  }

  for (const emp of input.schedule72) {
    totalGrossCompensationCents += emp.grossCompensationCents;
    totalNonTaxableCents += emp.totalNonTaxableCents;
    totalTaxableCents += emp.totalTaxableCents;
    totalTaxDueCents += emp.taxDueAnnualCents;
    totalTaxWithheldCents += emp.totalTaxWithheldCents;
    if (emp.adjustmentType === "REFUND") {
      totalRefundCents += emp.adjustmentCents;
    } else if (emp.adjustmentType === "PAYABLE") {
      totalPayableCents += emp.adjustmentCents;
    }
  }

  return {
    taxYear: input.taxYear,
    totalEmployees: input.schedule71.length + input.schedule72.length,
    schedule71Count: input.schedule71.length,
    schedule72Count: input.schedule72.length,
    totalGrossCompensationCents,
    totalNonTaxableCents,
    totalTaxableCents,
    totalTaxDueCents,
    totalTaxWithheldCents,
    totalRefundCents,
    totalPayableCents,
  };
}

/**
 * Formats official BIR Alphalist .DAT format for eFPS & Data Entry Module.
 * Line endings are CRLF (\r\n) per BIR transmittal specification.
 */
export function formatBir1604CAlphalistDat(
  input: Bir1604CAlphalistInput,
): string {
  const summary = summarizeBir1604CAlphalist(input);
  const employerTin = cleanTin(input.employer.tin);
  const branchCode = (input.employer.branchCode ?? "0000").padStart(4, "0");
  const rdoCode = input.employer.rdoCode.padStart(3, "0");

  const lines: string[] = [];

  // Header Record: H1604C
  // H1604C,TIN,BRANCH,TAX_YEAR,EMPLOYER_NAME,REGISTERED_ADDRESS,RDO
  lines.push(
    [
      "H1604C",
      employerTin,
      branchCode,
      input.taxYear.toString(),
      input.employer.registeredName.replace(/,/g, "").trim(),
      input.employer.registeredAddress.replace(/,/g, "").trim(),
      rdoCode,
    ].join(","),
  );

  // Schedule 7.1 Detail Records
  for (const emp of input.schedule71) {
    const empTin = cleanTin(emp.tin);
    const empBranch = (emp.branchCode ?? "0000").padStart(4, "0");
    lines.push(
      [
        "D7.1",
        emp.sequenceNumber.toString(),
        input.taxYear.toString(),
        employerTin,
        branchCode,
        empTin,
        empBranch,
        emp.lastName.replace(/,/g, " ").trim(),
        emp.firstName.replace(/,/g, " ").trim(),
        (emp.middleName ?? "").replace(/,/g, " ").trim(),
        emp.region ?? "NCR",
        emp.employmentStatus ?? "REGULAR",
        emp.periodFrom,
        emp.periodTo,
        formatCents(emp.grossCompensationCents),
        formatCents(emp.totalNonTaxableCents),
        formatCents(emp.statutoryContributionsCents),
        formatCents(emp.deMinimisCents),
        formatCents(emp.thirteenthMonthExemptCents),
        formatCents(emp.otherNonTaxableCents),
        formatCents(emp.totalTaxableCents),
        formatCents(emp.basicSalaryTaxableCents),
        formatCents(emp.thirteenthMonthTaxableCents),
        formatCents(emp.overtimeAndPremiumsTaxableCents),
        formatCents(emp.taxDueAnnualCents),
        formatCents(emp.taxWithheldPreviousEmployerCents),
        formatCents(emp.taxWithheldPresentEmployerCents),
        formatCents(emp.totalTaxWithheldCents),
        formatCents(emp.adjustmentCents),
        emp.adjustmentType,
        emp.substitutedFiling ? "YES" : "NO",
      ].join(","),
    );
  }

  // Schedule 7.2 Detail Records (Minimum Wage Earners)
  for (const emp of input.schedule72) {
    const empTin = cleanTin(emp.tin);
    const empBranch = (emp.branchCode ?? "0000").padStart(4, "0");
    lines.push(
      [
        "D7.2",
        emp.sequenceNumber.toString(),
        input.taxYear.toString(),
        employerTin,
        branchCode,
        empTin,
        empBranch,
        emp.lastName.replace(/,/g, " ").trim(),
        emp.firstName.replace(/,/g, " ").trim(),
        (emp.middleName ?? "").replace(/,/g, " ").trim(),
        emp.region ?? "NCR",
        emp.periodFrom,
        emp.periodTo,
        formatCents(emp.dailyRateCents ?? 0n),
        formatCents(emp.grossCompensationCents),
        formatCents(emp.totalNonTaxableCents),
        formatCents(emp.basicMweCents),
        formatCents(emp.holidayPayMweCents),
        formatCents(emp.overtimePayMweCents),
        formatCents(emp.nightDiffMweCents),
        formatCents(emp.hazardPayMweCents),
        formatCents(emp.thirteenthMonthExemptCents),
        formatCents(emp.deMinimisCents),
        formatCents(emp.statutoryContributionsCents),
        formatCents(emp.otherNonTaxableCents),
        formatCents(emp.totalTaxableCents),
        formatCents(emp.taxDueAnnualCents),
        formatCents(emp.totalTaxWithheldCents),
        formatCents(emp.adjustmentCents),
        emp.adjustmentType,
      ].join(","),
    );
  }

  // Control Total Record: C1604C
  lines.push(
    [
      "C1604C",
      employerTin,
      branchCode,
      input.taxYear.toString(),
      summary.totalEmployees.toString(),
      formatCents(summary.totalGrossCompensationCents),
      formatCents(summary.totalNonTaxableCents),
      formatCents(summary.totalTaxableCents),
      formatCents(summary.totalTaxDueCents),
      formatCents(summary.totalTaxWithheldCents),
      formatCents(summary.totalRefundCents),
      formatCents(summary.totalPayableCents),
    ].join(","),
  );

  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Formats audit-ready multi-schedule CSV for internal accounting review.
 */
export function formatBir1604CAlphalistCsv(
  input: Bir1604CAlphalistInput,
): string {
  const summary = summarizeBir1604CAlphalist(input);
  const rows: string[] = [];

  rows.push("BIR FORM 1604-C ALPHALIST TRANSMITTAL REPORT");
  rows.push(`Tax Year: ${input.taxYear}`);
  rows.push(`Employer Name: ${escapeCsvField(input.employer.registeredName)}`);
  rows.push(`Employer TIN: ${input.employer.tin}`);
  rows.push(`RDO Code: ${input.employer.rdoCode}`);
  rows.push(`Address: ${escapeCsvField(input.employer.registeredAddress)}`);
  rows.push("");

  // Schedule 7.1 Table
  rows.push(
    "SCHEDULE 7.1: EMPLOYEES WHOSE COMPENSATION IS SUBJECT TO REGULAR WITHHOLDING TAX",
  );
  rows.push(
    [
      "Seq",
      "Employee Number",
      "TIN",
      "Employee Name",
      "Region",
      "Status",
      "From",
      "To",
      "Gross Comp",
      "Non-Taxable Comp",
      "Statutory Contrib",
      "De Minimis",
      "Exempt 13th/Bonus",
      "Taxable Comp",
      "Tax Due",
      "Tax Withheld Prev",
      "Tax Withheld Pres",
      "Total Tax Withheld",
      "Adjustment Amount",
      "Adjustment Type",
      "Substituted Filing",
    ]
      .map(escapeCsvField)
      .join(","),
  );

  for (const emp of input.schedule71) {
    const fullName =
      `${emp.lastName}, ${emp.firstName} ${emp.middleName ?? ""}`.trim();
    rows.push(
      [
        emp.sequenceNumber.toString(),
        emp.employeeNumber,
        emp.tin,
        fullName,
        emp.region ?? "NCR",
        emp.employmentStatus ?? "REGULAR",
        emp.periodFrom,
        emp.periodTo,
        formatCents(emp.grossCompensationCents),
        formatCents(emp.totalNonTaxableCents),
        formatCents(emp.statutoryContributionsCents),
        formatCents(emp.deMinimisCents),
        formatCents(emp.thirteenthMonthExemptCents),
        formatCents(emp.totalTaxableCents),
        formatCents(emp.taxDueAnnualCents),
        formatCents(emp.taxWithheldPreviousEmployerCents),
        formatCents(emp.taxWithheldPresentEmployerCents),
        formatCents(emp.totalTaxWithheldCents),
        formatCents(emp.adjustmentCents),
        emp.adjustmentType,
        emp.substitutedFiling ? "YES" : "NO",
      ]
        .map((f) => escapeCsvField(String(f)))
        .join(","),
    );
  }

  rows.push("");

  // Schedule 7.2 Table
  rows.push("SCHEDULE 7.2: MINIMUM WAGE EARNERS (MWE)");
  rows.push(
    [
      "Seq",
      "Employee Number",
      "TIN",
      "Employee Name",
      "Region",
      "From",
      "To",
      "Daily Rate",
      "Gross Comp",
      "Non-Taxable Basic",
      "Holiday Pay",
      "Overtime Pay",
      "Night Diff",
      "Statutory Contrib",
      "De Minimis",
      "Exempt 13th/Bonus",
      "Taxable Comp",
      "Tax Due",
      "Tax Withheld",
      "Adjustment Amount",
      "Adjustment Type",
    ]
      .map(escapeCsvField)
      .join(","),
  );

  for (const emp of input.schedule72) {
    const fullName =
      `${emp.lastName}, ${emp.firstName} ${emp.middleName ?? ""}`.trim();
    rows.push(
      [
        emp.sequenceNumber.toString(),
        emp.employeeNumber,
        emp.tin,
        fullName,
        emp.region ?? "NCR",
        emp.periodFrom,
        emp.periodTo,
        formatCents(emp.dailyRateCents ?? 0n),
        formatCents(emp.grossCompensationCents),
        formatCents(emp.basicMweCents),
        formatCents(emp.holidayPayMweCents),
        formatCents(emp.overtimePayMweCents),
        formatCents(emp.nightDiffMweCents),
        formatCents(emp.statutoryContributionsCents),
        formatCents(emp.deMinimisCents),
        formatCents(emp.thirteenthMonthExemptCents),
        formatCents(emp.totalTaxableCents),
        formatCents(emp.taxDueAnnualCents),
        formatCents(emp.totalTaxWithheldCents),
        formatCents(emp.adjustmentCents),
        emp.adjustmentType,
      ]
        .map((f) => escapeCsvField(String(f)))
        .join(","),
    );
  }

  rows.push("");
  rows.push("CONTROL TOTALS");
  rows.push(`Total Employees,${summary.totalEmployees}`);
  rows.push(
    `Total Gross Compensation,${formatCents(summary.totalGrossCompensationCents)}`,
  );
  rows.push(
    `Total Non-Taxable Compensation,${formatCents(summary.totalNonTaxableCents)}`,
  );
  rows.push(
    `Total Taxable Compensation,${formatCents(summary.totalTaxableCents)}`,
  );
  rows.push(`Total Tax Due,${formatCents(summary.totalTaxDueCents)}`);
  rows.push(`Total Tax Withheld,${formatCents(summary.totalTaxWithheldCents)}`);
  rows.push(`Total Refund,${formatCents(summary.totalRefundCents)}`);
  rows.push(`Total Payable,${formatCents(summary.totalPayableCents)}`);

  return rows.join("\r\n");
}
