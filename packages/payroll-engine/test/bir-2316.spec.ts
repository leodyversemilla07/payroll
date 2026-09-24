import { describe, expect, it } from "vitest";
import {
  formatBir2316TextDocument,
  generateBir2316Certificate,
} from "../src/index";

describe("BIR Form 2316 Certificate Generation Engine", () => {
  const mockEmployer = {
    registeredName: "Acme Philippines Technologies Inc.",
    tin: "123-456-789-000",
    rdoCode: "047",
    registeredAddress: "Ayala Avenue, Makati City, Metro Manila",
    zipCode: "1226",
  };

  it("Scenario 1: Regular Salaried Employee with Overtime & 13th Month Pay within 90k ceiling", () => {
    const mockEmployee = {
      employeeNumber: "EMP-2026-001",
      firstName: "Juan",
      lastName: "Dela Cruz",
      tin: "987-654-321-000",
      residentialAddress: "Quezon City, Philippines",
      isMinimumWageEarner: false,
    };

    const cert = generateBir2316Certificate(2026, mockEmployee, mockEmployer, {
      totalBasicSalaryCents: 60000000n, // PHP 600,000.00
      totalOvertimePayCents: 3000000n, // PHP 30,000.00
      totalHolidayPayCents: 0n,
      totalNightDiffPayCents: 0n,
      totalDeMinimisBenefitsCents: 2400000n, // PHP 24,000.00
      totalThirteenthMonthAndBonusesCents: 5000000n, // PHP 50,000.00 (within 90k)
      totalOtherTaxableAllowancesCents: 0n,
      totalSssEmployeeShareCents: 2100000n, // PHP 21,000.00
      totalPhilhealthEmployeeShareCents: 1500000n, // PHP 15,000.00
      totalPagibigEmployeeShareCents: 240000n, // PHP 2,400.00
      totalTaxWithheldCents: 6500000n, // PHP 65,000.00 withheld YTD
    });

    // Part IV-B checks
    expect(cert.partIVB.basicMweCents).toBe(0n);
    expect(cert.partIVB.thirteenthMonthExemptCents).toBe(5000000n);
    expect(cert.partIVB.deMinimisBenefitsCents).toBe(2400000n);
    expect(cert.partIVB.statutoryContributionsCents).toBe(
      2100000n + 1500000n + 240000n,
    ); // PHP 38,400.00
    expect(cert.partIVB.totalNonTaxableCompensationCents).toBe(
      5000000n + 2400000n + 3840000n,
    );

    // Part IV-C checks
    expect(cert.partIVC.basicSalaryRegularCents).toBe(60000000n - 3840000n);
    expect(cert.partIVC.overtimePayTaxableCents).toBe(3000000n);
    expect(cert.partIVC.thirteenthMonthExcessTaxableCents).toBe(0n);
    expect(cert.partIVC.totalTaxableCompensationCents).toBe(
      63000000n - 3840000n,
    );

    // Part IV-A summary checks
    expect(cert.partIVA.grossCompensationIncomeCents).toBe(
      60000000n + 3000000n + 2400000n + 5000000n,
    );
    expect(cert.partIVA.taxDueAnnualCents).toBeGreaterThan(0n);

    // Document text generation
    const textDoc = formatBir2316TextDocument(cert);
    expect(textDoc).toContain("BIR FORM 2316");
    expect(textDoc).toContain("Dela Cruz, Juan");
    expect(textDoc).toContain("Acme Philippines Technologies Inc.");
  });

  it("Scenario 2: Minimum Wage Earner (MWE) - 100% Tax-Exempt Status", () => {
    const mweEmployee = {
      employeeNumber: "EMP-2026-004",
      firstName: "Ana",
      lastName: "Gomez",
      tin: "456-789-012-000",
      residentialAddress: "Pasig City, Philippines",
      isMinimumWageEarner: true,
    };

    const cert = generateBir2316Certificate(2026, mweEmployee, mockEmployer, {
      totalBasicSalaryCents: 18480000n, // PHP 184,800.00
      totalOvertimePayCents: 1500000n, // PHP 15,000.00
      totalHolidayPayCents: 1000000n, // PHP 10,000.00
      totalNightDiffPayCents: 500000n, // PHP 5,000.00
      totalDeMinimisBenefitsCents: 1200000n,
      totalThirteenthMonthAndBonusesCents: 1540000n,
      totalOtherTaxableAllowancesCents: 0n,
      totalSssEmployeeShareCents: 840000n,
      totalPhilhealthEmployeeShareCents: 462000n,
      totalPagibigEmployeeShareCents: 240000n,
      totalTaxWithheldCents: 0n,
    });

    // MWE: All basic, overtime, holiday, night diff must be in Part IV-B
    expect(cert.isMwe).toBe(true);
    expect(cert.partIVB.basicMweCents).toBe(18480000n - 1542000n);
    expect(cert.partIVB.overtimePayMweCents).toBe(1500000n);
    expect(cert.partIVB.holidayPayMweCents).toBe(1000000n);
    expect(cert.partIVB.nightDiffMweCents).toBe(500000n);

    // MWE: Part IV-C Taxable MUST BE exactly 0
    expect(cert.partIVC.totalTaxableCompensationCents).toBe(0n);
    expect(cert.partIVA.taxDueAnnualCents).toBe(0n);
    expect(cert.partIVA.taxAdjustmentCents).toBe(0n);
    expect(cert.partIVA.grossCompensationIncomeCents).toBe(
      18480000n + 1500000n + 1000000n + 500000n + 1200000n + 1540000n,
    );
  });

  it("Scenario 3: Executive with 13th Month + Performance Bonus exceeding ₱90,000 Cap", () => {
    const execEmployee = {
      employeeNumber: "EMP-2026-EX1",
      firstName: "Gabriel",
      lastName: "Tan",
      tin: "111-222-333-000",
      residentialAddress: "BGC, Taguig City",
      isMinimumWageEarner: false,
    };

    const cert = generateBir2316Certificate(2026, execEmployee, mockEmployer, {
      totalBasicSalaryCents: 120000000n, // PHP 1,200,000.00
      totalOvertimePayCents: 0n,
      totalHolidayPayCents: 0n,
      totalNightDiffPayCents: 0n,
      totalDeMinimisBenefitsCents: 2400000n,
      totalThirteenthMonthAndBonusesCents: 15000000n, // PHP 150,000.00 (Exceeds 90k by 60k)
      totalOtherTaxableAllowancesCents: 0n,
      totalSssEmployeeShareCents: 2100000n,
      totalPhilhealthEmployeeShareCents: 3000000n,
      totalPagibigEmployeeShareCents: 240000n,
      totalTaxWithheldCents: 20000000n,
    });

    // 90,000 in exempt, 60,000 in taxable
    expect(cert.partIVB.thirteenthMonthExemptCents).toBe(9000000n); // Exactly PHP 90,000
    expect(cert.partIVC.thirteenthMonthExcessTaxableCents).toBe(6000000n); // PHP 60,000 excess
    expect(cert.partIVC.totalTaxableCompensationCents).toBe(
      120000000n + 6000000n - 5340000n,
    );
    expect(cert.partIVA.grossCompensationIncomeCents).toBe(
      120000000n + 15000000n + 2400000n,
    );
  });
});
