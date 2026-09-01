import type { Centavos, StatutoryContributionResult } from "./types";

/**
 * PhilHealth Premium Calculator (5.0% total premium rate)
 * - Floor: PHP 10,000 (PHP 500 total, PHP 250 EE / PHP 250 ER)
 * - Ceiling: PHP 100,000 (PHP 5,000 total, PHP 2,500 EE / PHP 2,500 ER)
 * - Split: 50% Employee / 50% Employer
 */

export function calculatePhilhealthContribution(monthlySalaryCents: Centavos): StatutoryContributionResult {
  const salaryPesos = Number(monthlySalaryCents) / 100;

  // Clamp between floor and ceiling
  const baseSalary = Math.max(10000, Math.min(salaryPesos, 100000));
  
  const totalPremiumPesos = baseSalary * 0.05; // 5%
  const employeeSharePesos = totalPremiumPesos / 2; // 2.5%
  const employerSharePesos = totalPremiumPesos / 2; // 2.5%

  const employeeShareCents = BigInt(Math.round(employeeSharePesos * 100));
  const employerShareCents = BigInt(Math.round(employerSharePesos * 100));
  const totalCents = employeeShareCents + employerShareCents;

  return {
    employeeShareCents,
    employerShareCents,
    totalCents,
  };
}
