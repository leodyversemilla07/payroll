import { describe, expect, it } from "vitest";
import {
  calculate13thMonthBatch,
  calculateEmployee13thMonth,
  calculateMonthsWorkedInYear,
  formatDole13thMonthComplianceReport,
} from "../src/index";

describe("DOLE 13th Month Pay Batch & Compliance Engine", () => {
  it("Scenario 1: Full-year employee receives 1 full month basic pay (100% tax-exempt)", () => {
    const result = calculateEmployee13thMonth({
      employeeId: "emp-1",
      employeeNumber: "EMP-2026-001",
      fullName: "Juan Dela Cruz",
      monthlyBasicRateCents: 6500000n, // PHP 65,000.00
      hireDate: "2024-01-15",
      monthsWorkedInYear: 12,
      unpaidAbsenceDays: 0,
    });

    // 65,000 * 12 / 12 = PHP 65,000.00
    expect(result.thirteenthMonthPayCents).toBe(6500000n);
    expect(result.taxExemptPortionCents).toBe(6500000n);
    expect(result.taxableExcessCents).toBe(0n);
    expect(result.isProrated).toBe(false);
  });

  it("uses recorded basic earnings instead of projecting from the current monthly rate or deducting absences again", () => {
    const result = calculateEmployee13thMonth({
      employeeId: "emp-rate-change",
      employeeNumber: "EMP-2026-004",
      fullName: "Rate Change",
      monthlyBasicRateCents: 5000000n,
      hireDate: "2025-01-01",
      monthsWorkedInYear: 12,
      unpaidAbsenceDays: 5,
      actualBasicEarnedCents: 36000000n,
    });

    expect(result.totalBasicEarnedCents).toBe(36000000n);
    expect(result.thirteenthMonthPayCents).toBe(3000000n);
    expect(result.isProrated).toBe(true);
  });

  it("rejects negative actual basic earnings", () => {
    expect(() =>
      calculateEmployee13thMonth({
        employeeId: "emp-invalid",
        employeeNumber: "EMP-INVALID",
        fullName: "Invalid",
        monthlyBasicRateCents: 3000000n,
        hireDate: "2025-01-01",
        monthsWorkedInYear: 12,
        unpaidAbsenceDays: 0,
        actualBasicEarnedCents: -1n,
      }),
    ).toThrow(RangeError);
  });

  it("Scenario 2: Mid-year hire (worked 6 months) receives exact pro-rated 13th month", () => {
    const result = calculateEmployee13thMonth({
      employeeId: "emp-2",
      employeeNumber: "EMP-2026-002",
      fullName: "Maria Santos",
      monthlyBasicRateCents: 4500000n, // PHP 45,000.00
      hireDate: "2026-07-01",
      monthsWorkedInYear: 6,
      unpaidAbsenceDays: 0,
    });

    // 45,000 * 6 = 270,000 / 12 = PHP 22,500.00
    expect(result.thirteenthMonthPayCents).toBe(2250000n);
    expect(result.taxExemptPortionCents).toBe(2250000n);
    expect(result.taxableExcessCents).toBe(0n);
    expect(result.isProrated).toBe(true);
    expect(result.monthsWorked).toBe(6);
  });

  it("Scenario 3: Employee with 5 days unpaid absences (LWOP deduction)", () => {
    // Monthly: PHP 30,000, daily: (30,000 * 12) / 261 = 1,379.31
    const result = calculateEmployee13thMonth(
      {
        employeeId: "emp-3",
        employeeNumber: "EMP-2026-003",
        fullName: "Carlos Reyes",
        monthlyBasicRateCents: 3000000n,
        hireDate: "2025-03-01",
        monthsWorkedInYear: 12,
        unpaidAbsenceDays: 5,
      },
      137931n,
    );

    // Total basic earned: 360,000 - (5 * 1,379.31 = 6,896.55) = 353,103.45
    // 13th month: 353,103.45 / 12 = 29,425.28
    expect(result.isProrated).toBe(true);
    expect(result.thirteenthMonthPayCents).toBeLessThan(3000000n);
    expect(result.thirteenthMonthPayCents).toBe(2942528n);
  });

  it("Scenario 4: High-income employee with 13th month exceeding ₱90,000 TRAIN Law cap", () => {
    const result = calculateEmployee13thMonth({
      employeeId: "emp-exec",
      employeeNumber: "EMP-2026-EX1",
      fullName: "Gabriel Tan",
      monthlyBasicRateCents: 15000000n, // PHP 150,000.00
      hireDate: "2023-01-01",
      monthsWorkedInYear: 12,
      unpaidAbsenceDays: 0,
      otherTaxableBonusesCents: 2000000n, // Prior bonus of PHP 20,000
    });

    // 13th month = PHP 150,000.00
    // Remaining cap = 90,000 - 20,000 = 70,000
    // Exempt = 70,000, Taxable excess = 80,000
    expect(result.thirteenthMonthPayCents).toBe(15000000n);
    expect(result.taxExemptPortionCents).toBe(7000000n);
    expect(result.taxableExcessCents).toBe(8000000n);
  });

  it("Scenario 5: Batch processing and DOLE Compliance Report formatting", () => {
    const employees = [
      {
        employeeId: "emp-1",
        employeeNumber: "EMP-2026-001",
        fullName: "Juan Dela Cruz",
        monthlyBasicRateCents: 6500000n,
        hireDate: "2024-01-15",
        monthsWorkedInYear: 12,
        unpaidAbsenceDays: 0,
      },
      {
        employeeId: "emp-2",
        employeeNumber: "EMP-2026-002",
        fullName: "Maria Santos",
        monthlyBasicRateCents: 4500000n,
        hireDate: "2026-07-01",
        monthsWorkedInYear: 6,
        unpaidAbsenceDays: 0,
      },
    ];

    const batch = calculate13thMonthBatch(2026, employees);
    expect(batch.totalBenefitedEmployees).toBe(2);
    expect(batch.totalThirteenthMonthPayCents).toBe(6500000n + 2250000n);

    const report = formatDole13thMonthComplianceReport({
      taxYear: 2026,
      establishmentName: "Acme Philippines Technologies Inc.",
      registeredAddress: "Ayala Avenue, Makati City",
      natureOfBusiness: "Information Technology",
      contactPerson: "HR Director",
      contactNumber: "+63 2 8123 4567",
      batchResult: batch,
    });

    expect(report).toContain("DEPARTMENT OF LABOR AND EMPLOYMENT");
    expect(report).toContain("PRESIDENTIAL DECREE NO. 851");
    expect(report).toContain("Acme Philippines Technologies Inc.");
    expect(report).toContain("EMP-2026-001");
    expect(report).toContain("EMP-2026-002");
  });

  describe("months of service in a tax year", () => {
    it("credits a full 12 months for prior-year hires", () => {
      // Midday timestamps keep the calendar month stable in any timezone.
      expect(calculateMonthsWorkedInYear("2024-01-15T12:00:00", 2026)).toBe(12);
      expect(calculateMonthsWorkedInYear(new Date(2020, 5, 10), 2026)).toBe(12);
    });

    it("prorates same-year hires from the hire month", () => {
      expect(calculateMonthsWorkedInYear("2026-01-20T12:00:00", 2026)).toBe(12);
      expect(calculateMonthsWorkedInYear("2026-06-15T12:00:00", 2026)).toBe(7);
      expect(calculateMonthsWorkedInYear("2026-12-01T12:00:00", 2026)).toBe(1);
    });

    it("yields zero for future-dated hires and invalid dates", () => {
      expect(calculateMonthsWorkedInYear("2027-03-01T12:00:00", 2026)).toBe(0);
      expect(calculateMonthsWorkedInYear("not-a-date", 2026)).toBe(0);
    });
  });
});
