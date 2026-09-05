import type { Centavos, StatutoryContributionResult } from "./types";

/**
 * Pag-IBIG (HDMF) Contribution Calculator
 * - Monthly compensation <= PHP 1,500: 1% Employee, 2% Employer
 * - Monthly compensation > PHP 1,500: 2% Employee, 2% Employer
 * - Standard maximum monthly compensation base is PHP 10,000 (PHP 200 EE / PHP 200 ER = PHP 400 total).
 * - Allows voluntary / custom contribution overrides.
 */

export function calculatePagibigContribution(
  monthlySalaryCents: Centavos,
  customEmployeeDeductionCents?: Centavos,
): StatutoryContributionResult {
  if (customEmployeeDeductionCents && customEmployeeDeductionCents > 0n) {
    const employeeShareCents = customEmployeeDeductionCents;
    // Standard employer match up to statutory minimum (200 pesos = 20000 cents) or equal
    const employerShareCents = 20000n; // Standard match
    return {
      employeeShareCents,
      employerShareCents,
      totalCents: employeeShareCents + employerShareCents,
    };
  }

  const salaryPesos = Number(monthlySalaryCents) / 100;
  const cappedBase = Math.min(salaryPesos, 10000); // 10k standard base

  let employeeRate = 0.02;
  if (salaryPesos <= 1500) {
    employeeRate = 0.01;
  }
  const employerRate = 0.02;

  const employeeShareCents = BigInt(
    Math.round(cappedBase * employeeRate * 100),
  );
  const employerShareCents = BigInt(
    Math.round(cappedBase * employerRate * 100),
  );

  return {
    employeeShareCents,
    employerShareCents,
    totalCents: employeeShareCents + employerShareCents,
  };
}
