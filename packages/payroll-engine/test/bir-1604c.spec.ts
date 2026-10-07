import { describe, expect, it } from "vitest";
import {
  type Bir1604CAlphalistInput,
  formatBir1604CAlphalistCsv,
  formatBir1604CAlphalistDat,
  summarizeBir1604CAlphalist,
} from "../src/index";

describe("BIR Form 1604-C & Alphalist Transmittal Engine", () => {
  const sampleInput: Bir1604CAlphalistInput = {
    taxYear: 2026,
    employer: {
      tin: "123-456-789-000",
      branchCode: "0000",
      registeredName: "Acme Philippines Inc.",
      registeredAddress: "123 Ayala Avenue, Makati City",
      rdoCode: "047",
    },
    schedule71: [
      {
        sequenceNumber: 1,
        employeeNumber: "EMP-001",
        tin: "987-654-321-000",
        branchCode: "0000",
        lastName: "Dela Cruz",
        firstName: "Juan",
        middleName: "Santos",
        region: "NCR",
        employmentStatus: "REGULAR",
        periodFrom: "2026-01-01",
        periodTo: "2026-12-31",
        grossCompensationCents: 60000000n, // 600,000.00
        totalNonTaxableCents: 15000000n, // 150,000.00
        statutoryContributionsCents: 5000000n, // 50,000.00
        deMinimisCents: 2000000n, // 20,000.00
        thirteenthMonthExemptCents: 8000000n, // 80,000.00
        otherNonTaxableCents: 0n,
        totalTaxableCents: 45000000n, // 450,000.00
        basicSalaryTaxableCents: 45000000n,
        thirteenthMonthTaxableCents: 0n,
        overtimeAndPremiumsTaxableCents: 0n,
        taxDueAnnualCents: 4000000n, // 40,000.00
        taxWithheldPreviousEmployerCents: 0n,
        taxWithheldPresentEmployerCents: 4500000n, // 45,000.00
        totalTaxWithheldCents: 4500000n,
        adjustmentCents: 500000n, // 5,000.00 refund
        adjustmentType: "REFUND",
        substitutedFiling: true,
      },
      {
        sequenceNumber: 2,
        employeeNumber: "EMP-002",
        tin: "111-222-333-000",
        branchCode: "0000",
        lastName: "Reyes",
        firstName: "Maria",
        region: "NCR",
        employmentStatus: "REGULAR",
        periodFrom: "2026-01-01",
        periodTo: "2026-12-31",
        grossCompensationCents: 120000000n, // 1,200,000.00
        totalNonTaxableCents: 16000000n, // 160,000.00
        statutoryContributionsCents: 5000000n,
        deMinimisCents: 2000000n,
        thirteenthMonthExemptCents: 9000000n,
        otherNonTaxableCents: 0n,
        totalTaxableCents: 104000000n, // 1,040,000.00
        basicSalaryTaxableCents: 100000000n,
        thirteenthMonthTaxableCents: 4000000n,
        overtimeAndPremiumsTaxableCents: 0n,
        taxDueAnnualCents: 19500000n, // 195,000.00
        taxWithheldPreviousEmployerCents: 0n,
        taxWithheldPresentEmployerCents: 19000000n, // 190,000.00
        totalTaxWithheldCents: 19000000n,
        adjustmentCents: 500000n, // 5,000.00 tax still due
        adjustmentType: "PAYABLE",
        substitutedFiling: false,
      },
    ],
    schedule72: [
      {
        sequenceNumber: 3,
        employeeNumber: "EMP-MWE-01",
        tin: "444-555-666-000",
        branchCode: "0000",
        lastName: "Bautista",
        firstName: "Pedro",
        region: "NCR",
        periodFrom: "2026-01-01",
        periodTo: "2026-12-31",
        dailyRateCents: 61000n, // 610.00
        grossCompensationCents: 22000000n, // 220,000.00
        totalNonTaxableCents: 22000000n,
        basicMweCents: 19000000n,
        holidayPayMweCents: 1000000n,
        overtimePayMweCents: 1000000n,
        nightDiffMweCents: 0n,
        hazardPayMweCents: 0n,
        thirteenthMonthExemptCents: 1000000n,
        deMinimisCents: 0n,
        statutoryContributionsCents: 0n,
        otherNonTaxableCents: 0n,
        totalTaxableCents: 0n,
        taxDueAnnualCents: 0n,
        totalTaxWithheldCents: 0n,
        adjustmentCents: 0n,
        adjustmentType: "ZERO",
      },
    ],
  };

  it("summarizes financial totals and headcount across Schedule 7.1 and 7.2", () => {
    const summary = summarizeBir1604CAlphalist(sampleInput);

    expect(summary.totalEmployees).toBe(3);
    expect(summary.schedule71Count).toBe(2);
    expect(summary.schedule72Count).toBe(1);

    // Gross: 600k + 1,200k + 220k = 2,020,000.00 = 202,000,000 centavos
    expect(summary.totalGrossCompensationCents).toBe(202000000n);

    // Non-Taxable: 150k + 160k + 220k = 530,000.00 = 53,000,000 centavos
    expect(summary.totalNonTaxableCents).toBe(53000000n);

    // Taxable: 450k + 1,040k + 0 = 1,490,000.00 = 149,000,000 centavos
    expect(summary.totalTaxableCents).toBe(149000000n);

    // Tax Due: 40k + 195k = 235,000.00 = 23,500,000 centavos
    expect(summary.totalTaxDueCents).toBe(23500000n);

    // Tax Withheld: 45k + 190k = 235,000.00 = 23,500,000 centavos
    expect(summary.totalTaxWithheldCents).toBe(23500000n);

    // Refund: 5,000.00
    expect(summary.totalRefundCents).toBe(500000n);

    // Payable: 5,000.00
    expect(summary.totalPayableCents).toBe(500000n);
  });

  it("formats official BIR Alphalist .DAT transmittal records with CRLF", () => {
    const datContent = formatBir1604CAlphalistDat(sampleInput);

    // Must use Windows CRLF for BIR validation module
    expect(datContent).toContain("\r\n");

    const lines = datContent.trim().split("\r\n");
    expect(lines.length).toBe(5); // H1604C, 2x D7.1, 1x D7.2, C1604C

    // Header validation
    const header = lines[0] ?? "";
    expect(header).toBe(
      "H1604C,123456789000,0000,2026,Acme Philippines Inc.,123 Ayala Avenue Makati City,047",
    );

    // Detail 7.1 validation
    const d71_emp1 = lines[1] ?? "";
    expect(
      d71_emp1.startsWith(
        "D7.1,1,2026,123456789000,0000,987654321000,0000,Dela Cruz,Juan,Santos,NCR,REGULAR,2026-01-01,2026-12-31,600000.00,150000.00,50000.00,20000.00,80000.00,0.00,450000.00,450000.00,0.00,0.00,40000.00,0.00,45000.00,45000.00,5000.00,REFUND,YES",
      ),
    ).toBe(true);

    // Detail 7.2 validation (MWE)
    const d72_emp3 = lines[3] ?? "";
    expect(
      d72_emp3.startsWith(
        "D7.2,3,2026,123456789000,0000,444555666000,0000,Bautista,Pedro,,NCR,2026-01-01,2026-12-31,610.00,220000.00,220000.00",
      ),
    ).toBe(true);

    // Control record validation
    const control = lines[4] ?? "";
    expect(control).toBe(
      "C1604C,123456789000,0000,2026,3,2020000.00,530000.00,1490000.00,235000.00,235000.00,5000.00,5000.00",
    );
  });

  it("formats audit-ready multi-schedule CSV with headers and control totals", () => {
    const csvContent = formatBir1604CAlphalistCsv(sampleInput);

    expect(csvContent).toContain(
      "BIR FORM 1604-C ALPHALIST TRANSMITTAL REPORT",
    );
    expect(csvContent).toContain("Tax Year: 2026");
    expect(csvContent).toContain(
      "SCHEDULE 7.1: EMPLOYEES WHOSE COMPENSATION IS SUBJECT TO REGULAR WITHHOLDING TAX",
    );
    expect(csvContent).toContain("SCHEDULE 7.2: MINIMUM WAGE EARNERS (MWE)");
    expect(csvContent).toContain("CONTROL TOTALS");
    expect(csvContent).toContain("Total Employees,3");
    expect(csvContent).toContain("Total Gross Compensation,2020000.00");
  });
});
