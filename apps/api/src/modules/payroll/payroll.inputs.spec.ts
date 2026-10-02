import type { EmployeeLoan } from '@workspace/db';
import { evaluateAllowances } from '@workspace/payroll-engine';
import {
  isStandardRegularCutoff,
  resolveCutoffAllowances,
  selectCutoffLoans,
} from './payroll.inputs';

const first = {
  cutoffStartDate: new Date('2026-09-01'),
  cutoffEndDate: new Date('2026-09-15'),
  cutoffSequence: 'FIRST_CUTOFF' as const,
};
const second = {
  cutoffStartDate: new Date('2026-09-16'),
  cutoffEndDate: new Date('2026-09-30'),
  cutoffSequence: 'SECOND_CUTOFF' as const,
};
const hireDate = new Date('2025-01-01');
type Allowance = Parameters<typeof resolveCutoffAllowances>[0][number];
function allowance(overrides: Partial<Allowance> = {}): Allowance {
  return {
    name: 'Transport',
    type: 'TAXABLE',
    deMinimisCategory: null,
    amountCents: 100001n,
    frequency: 'MONTHLY',
    ...overrides,
  };
}
function resolve(
  rows: Allowance[],
  cutoff: Parameters<typeof resolveCutoffAllowances>[3] = first,
  hire = hireDate,
) {
  return resolveCutoffAllowances(rows, 'EMP-1', hire, cutoff);
}

describe('configured allowance frequency', () => {
  it.each(['TAXABLE', 'NON_TAXABLE_FIXED', 'DE_MINIMIS'] as const)(
    'splits monthly %s amounts without losing an odd centavo',
    (type) => {
      const rows = [
        allowance({
          type,
          deMinimisCategory: type === 'DE_MINIMIS' ? 'RICE_SUBSIDY' : null,
        }),
      ];
      const firstAmount = resolve(rows, first)[0]?.amountCents;
      const secondAmount = resolve(rows, second)[0]?.amountCents;
      expect(firstAmount).toBe(50000n);
      expect(secondAmount).toBe(50001n);
      expect((firstAmount ?? 0n) + (secondAmount ?? 0n)).toBe(
        rows[0]?.amountCents,
      );
      expect(rows[0]?.amountCents).toBe(100001n);
    },
  );

  it.each([0n, 1n, 2n, 999n, 9007199254740993n])(
    'conserves exact monthly amounts of %s centavos',
    (amountCents) => {
      const rows = [allowance({ amountCents })];
      expect(
        (resolve(rows)[0]?.amountCents ?? 0n) +
          (resolve(rows, second)[0]?.amountCents ?? 0n),
      ).toBe(amountCents);
    },
  );

  it('pays the full per-cutoff amount in both cutoffs', () => {
    const rows = [allowance({ frequency: 'PER_CUTOFF' })];
    expect(resolve(rows)[0]?.amountCents).toBe(100001n);
    expect(resolve(rows, second)[0]?.amountCents).toBe(100001n);
  });

  it('splits before applying shared per-category de minimis ceilings', () => {
    const rows = [
      allowance({
        type: 'DE_MINIMIS',
        deMinimisCategory: 'RICE_SUBSIDY',
        amountCents: 200000n,
      }),
      allowance({
        name: 'Extra rice',
        type: 'DE_MINIMIS',
        deMinimisCategory: 'RICE_SUBSIDY',
        amountCents: 50001n,
      }),
    ];
    expect(evaluateAllowances(resolve(rows))).toEqual({
      taxableAllowancesCents: 0n,
      nonTaxableAllowancesCents: 125000n,
      deMinimisExcessTaxableCents: 0n,
    });
    expect(evaluateAllowances(resolve(rows, second))).toEqual({
      taxableAllowancesCents: 1n,
      nonTaxableAllowancesCents: 125000n,
      deMinimisExcessTaxableCents: 1n,
    });
  });

  it.each(['ANNUAL', 'monthly', '', 'WEEKLY'])(
    'rejects unsupported frequency "%s"',
    (frequency) => {
      expect(() => resolve([allowance({ frequency })])).toThrow(
        'Employee EMP-1, allowance Transport: unsupported frequency',
      );
    },
  );

  it('rejects a negative amount', () => {
    expect(() => resolve([allowance({ amountCents: -1n })])).toThrow(
      'must not be negative',
    );
  });

  it('requires an explicit category for de minimis allowances', () => {
    expect(() => resolve([allowance({ type: 'DE_MINIMIS' })])).toThrow(
      'de minimis category is required',
    );
  });

  it('blocks inconsistent category/type configuration instead of reclassifying it', () => {
    expect(() =>
      resolve([
        allowance({ type: 'NON_TAXABLE_FIXED', deMinimisCategory: 'OTHER' }),
      ]),
    ).toThrow(
      'a de minimis category may only be used with a de minimis allowance',
    );
  });

  it('blocks monthly allowance proration for a mid-cutoff hire', () => {
    expect(() => resolve([allowance()], first, new Date('2026-09-02'))).toThrow(
      'partial-period allowance proration requires an approved policy',
    );
  });

  it('accepts employment from the cutoff start civil date', () => {
    expect(
      resolve([allowance()], first, new Date('2026-09-01T18:00:00Z'))[0]
        ?.amountCents,
    ).toBe(50000n);
  });

  it('blocks a custom period for monthly allowances but honors per-cutoff grants', () => {
    const custom = { ...first, cutoffStartDate: new Date('2026-09-02') };
    expect(() => resolve([allowance()], custom)).toThrow(
      'full standard cutoff',
    );
    expect(
      resolve([allowance({ frequency: 'PER_CUTOFF' })], custom)[0]?.amountCents,
    ).toBe(100001n);
  });
});

type Loan = Pick<
  EmployeeLoan,
  'id' | 'amortizationCents' | 'balanceCents' | 'startDate' | 'endDate'
>;
function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-1',
    balanceCents: 200000n,
    amortizationCents: 50000n,
    startDate: new Date('2026-09-01'),
    endDate: null,
    ...overrides,
  };
}
function eligible(row: Loan) {
  return selectCutoffLoans([row], 'EMP-1', first.cutoffEndDate);
}

describe('cutoff-end loan eligibility', () => {
  it.each(['2026-09-01', '2026-09-10', '2026-09-15T23:59:59Z'])(
    'includes loans starting on %s',
    (start) => {
      expect(eligible(loan({ startDate: new Date(start) }))).toHaveLength(1);
    },
  );
  it.each(['2026-09-16', '2026-10-01'])(
    'excludes loans starting on %s even if payroll is paid later',
    (start) => {
      expect(eligible(loan({ startDate: new Date(start) }))).toEqual([]);
    },
  );
  it.each(['2026-09-15', '2026-09-30T16:00:00Z'])(
    'includes an inclusive end date of %s',
    (end) => {
      expect(eligible(loan({ endDate: new Date(end) }))).toHaveLength(1);
    },
  );
  it('leaves an expired outstanding balance untouched', () => {
    const row = loan({ endDate: new Date('2026-09-14T23:59:59Z') });
    expect(eligible(row)).toEqual([]);
    expect(row.balanceCents).toBe(200000n);
  });
  it('does not select a zero-balance active loan', () => {
    expect(eligible(loan({ balanceCents: 0n }))).toEqual([]);
  });
  it.each([
    { endDate: new Date('2026-08-31') },
    { startDate: new Date('invalid') },
    { endDate: new Date('invalid') },
  ])('rejects invalid or inverted repayment dates %s', (overrides) => {
    expect(() => eligible(loan(overrides))).toThrow(
      'Employee EMP-1, loan loan-1: repayment dates',
    );
  });
  it.each([
    { balanceCents: -1n },
    { amortizationCents: 0n },
    { amortizationCents: -1n },
  ])('rejects invalid loan amounts %s', (overrides) => {
    expect(() => eligible(loan(overrides))).toThrow(
      'balance must not be negative and amortization must be positive',
    );
  });
});

describe('standard monthly cutoff recognition', () => {
  it.each(['2026-02-28', '2028-02-29', '2026-04-30', '2026-07-31'])(
    'supports the full second cutoff ending %s',
    (end) => {
      expect(
        isStandardRegularCutoff({
          ...second,
          cutoffStartDate: new Date(`${end.slice(0, 7)}-16`),
          cutoffEndDate: new Date(end),
        }),
      ).toBe(true);
    },
  );
  it('rejects a cross-month or special cutoff', () => {
    expect(
      isStandardRegularCutoff({
        ...first,
        cutoffEndDate: new Date('2026-10-15'),
      }),
    ).toBe(false);
    expect(
      isStandardRegularCutoff({ ...first, cutoffSequence: 'SPECIAL_RUN' }),
    ).toBe(false);
  });
});
