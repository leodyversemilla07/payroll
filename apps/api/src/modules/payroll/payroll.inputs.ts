import { UnprocessableEntityException } from '@nestjs/common';
import type {
  EmployeeAllowance,
  EmployeeLoan,
  PayrollRun,
} from '@workspace/db';
import {
  type AllowanceInput,
  DeMinimisCategory,
} from '@workspace/payroll-engine';

type RegularCutoff = Pick<
  PayrollRun,
  'cutoffStartDate' | 'cutoffEndDate' | 'cutoffSequence'
>;
type PayrollAllowance = Pick<
  EmployeeAllowance,
  'name' | 'type' | 'deMinimisCategory' | 'amountCents' | 'frequency'
>;
type PayrollLoan = Pick<
  EmployeeLoan,
  'id' | 'amortizationCents' | 'balanceCents' | 'startDate' | 'endDate'
>;

export function isStandardRegularCutoff(cutoff: RegularCutoff): boolean {
  const {
    cutoffStartDate: start,
    cutoffEndDate: end,
    cutoffSequence: sequence,
  } = cutoff;
  if (
    sequence === 'SPECIAL_RUN' ||
    start.getUTCFullYear() !== end.getUTCFullYear() ||
    start.getUTCMonth() !== end.getUTCMonth()
  )
    return false;
  const monthEndDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return (
    start.getUTCDate() === (sequence === 'FIRST_CUTOFF' ? 1 : 16) &&
    end.getUTCDate() === (sequence === 'FIRST_CUTOFF' ? 15 : monthEndDay)
  );
}

/** Resolve configured amounts into period grants before tax classification. */
export function resolveCutoffAllowances(
  allowances: readonly PayrollAllowance[],
  employeeNumber: string,
  hireDate: Date,
  cutoff: RegularCutoff,
): AllowanceInput[] {
  return allowances.map((allowance) => {
    const fail = (message: string): never => {
      throw new UnprocessableEntityException(
        `Employee ${employeeNumber}, allowance ${allowance.name}: ${message}`,
      );
    };
    if (allowance.amountCents < 0n)
      fail('allowance amounts must not be negative');
    let amountCents: bigint;
    switch (allowance.frequency) {
      case 'PER_CUTOFF':
        amountCents = allowance.amountCents;
        break;
      case 'MONTHLY': {
        if (
          !isStandardRegularCutoff(cutoff) ||
          civilDate(hireDate) > cutoff.cutoffStartDate.getTime()
        ) {
          fail(
            'monthly allowances require a full standard cutoff and employment from its start; partial-period allowance proration requires an approved policy',
          );
        }
        // Exactly conserve the configured monthly amount, including odd cents.
        const firstShare = allowance.amountCents / 2n;
        amountCents =
          cutoff.cutoffSequence === 'FIRST_CUTOFF'
            ? firstShare
            : allowance.amountCents - firstShare;
        break;
      }
      default:
        return fail(
          `unsupported frequency "${allowance.frequency}"; use MONTHLY or PER_CUTOFF`,
        );
    }
    if (allowance.type === 'DE_MINIMIS' && !allowance.deMinimisCategory)
      fail('a de minimis category is required');
    if (allowance.type !== 'DE_MINIMIS' && allowance.deMinimisCategory)
      fail(
        'a de minimis category may only be used with a de minimis allowance',
      );
    return {
      name: allowance.name,
      amountCents,
      isTaxable: allowance.type === 'TAXABLE',
      deMinimisCategory:
        allowance.type === 'DE_MINIMIS' && allowance.deMinimisCategory
          ? DeMinimisCategory[allowance.deMinimisCategory]
          : undefined,
    };
  });
}

/** Loan repayment windows are inclusive civil dates evaluated at cutoff end. */
export function selectCutoffLoans<T extends PayrollLoan>(
  loans: readonly T[],
  employeeNumber: string,
  cutoffEndDate: Date,
): T[] {
  const cutoffEnd = civilDate(cutoffEndDate);
  return loans.filter((loan) => {
    const start = civilDate(loan.startDate);
    const end = loan.endDate ? civilDate(loan.endDate) : null;
    if (
      !Number.isFinite(start) ||
      (end !== null && (!Number.isFinite(end) || end < start))
    ) {
      throw new UnprocessableEntityException(
        `Employee ${employeeNumber}, loan ${loan.id}: repayment dates are invalid or end before the start date`,
      );
    }
    if (loan.balanceCents < 0n || loan.amortizationCents <= 0n) {
      throw new UnprocessableEntityException(
        `Employee ${employeeNumber}, loan ${loan.id}: balance must not be negative and amortization must be positive`,
      );
    }
    // Do not silently collect past a configured end date or mark an unpaid
    // loan settled: its outstanding balance remains available for review.
    return (
      loan.balanceCents > 0n &&
      start <= cutoffEnd &&
      (end === null || end >= cutoffEnd)
    );
  });
}

function civilDate(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
