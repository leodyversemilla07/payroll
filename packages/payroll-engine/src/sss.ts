import type { Centavos, StatutoryContributionResult } from "./types";

/**
 * SSS (Social Security System) 2025/2026 Contribution Calculator
 * - Total regular rate: 15% (10% Employer, 5% Employee)
 * - Regular MSC Cap: PHP 20,000
 * - WISP (Mandatory Provident Fund) MSC: PHP 20,500 up to PHP 35,000
 * - EC (Employees' Compensation): PHP 10 (MSC <= 14,500) or PHP 30 (MSC > 14,500), paid solely by Employer.
 */

export function calculateSssContribution(monthlySalaryCents: Centavos): StatutoryContributionResult {
  const salaryPesos = Number(monthlySalaryCents) / 100;

  // 1. Determine Monthly Salary Credit (MSC)
  let msc = 5000;
  if (salaryPesos < 5250) {
    msc = 5000;
  } else if (salaryPesos >= 34750) {
    msc = 35000;
  } else {
    // Step bracket: in 500 Peso steps
    // e.g. 5,250 to 5,749.99 = 5,500 MSC
    const step = Math.floor((salaryPesos - 5250) / 500) + 1;
    msc = 5000 + step * 500;
    if (msc > 35000) msc = 35000;
  }

  // 2. Regular SSS MSC (Capped at 20,000)
  const regularMsc = Math.min(msc, 20000);
  const employeeRegularPesos = regularMsc * 0.05; // 5%
  const employerRegularPesos = regularMsc * 0.10; // 10%

  // 3. WISP (Mandatory Provident Fund for MSC > 20,000 up to 35,000)
  let wispMsc = 0;
  if (msc > 20000) {
    wispMsc = msc - 20000;
  }
  const wispEmployeePesos = wispMsc * 0.05;
  const wispEmployerPesos = wispMsc * 0.10;

  // 4. Employees' Compensation (EC) - Employer only
  const ecPesos = msc <= 14500 ? 10 : 30;

  // Convert to Centavos (BigInt)
  const employeeShareCents = BigInt(Math.round((employeeRegularPesos + wispEmployeePesos) * 100));
  const employerShareCents = BigInt(Math.round((employerRegularPesos + wispEmployerPesos + ecPesos) * 100));
  const ecShareCents = BigInt(ecPesos * 100);
  const wispEmployeeCents = BigInt(Math.round(wispEmployeePesos * 100));
  const wispEmployerCents = BigInt(Math.round(wispEmployerPesos * 100));
  const totalCents = employeeShareCents + employerShareCents;

  return {
    employeeShareCents,
    employerShareCents,
    ecShareCents,
    wispEmployeeCents,
    wispEmployerCents,
    totalCents,
  };
}
