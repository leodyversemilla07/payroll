import { buildSandboxDataset, fixtureId, sandboxSeedOptions } from './fixtures';

const organizationId = 'a532978f-c02b-427a-931a-606793ce1abe';
const environment = {
  NODE_ENV: 'test',
  PAYROLL_SANDBOX_SEED: '1',
  DATABASE_URL:
    'postgresql://postgres:synthetic@127.0.0.1:53500/payroll_browser?schema=public',
  PAYROLL_SANDBOX_ORGANIZATION_ID: organizationId,
};

describe('sandbox seed safety', () => {
  it('requires an explicit local synthetic target and defaults to 200 employees', () => {
    expect(sandboxSeedOptions(environment)).toEqual({
      organizationId,
      employeeCount: 200,
    });
  });

  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: undefined },
    { PAYROLL_SANDBOX_SEED: undefined },
    {
      DATABASE_URL:
        'postgresql://postgres:password@remote.example/payroll_browser',
    },
    { DATABASE_URL: 'postgresql://postgres:password@localhost/payroll' },
    {
      DATABASE_URL:
        'postgresql://postgres:password@localhost/payroll_browser?schema=live',
    },
    { DATABASE_URL: 'https://localhost/payroll_browser' },
    { PAYROLL_SANDBOX_ORGANIZATION_ID: undefined },
    { PAYROLL_SANDBOX_ORGANIZATION_ID: 'not-a-uuid' },
    { PAYROLL_SANDBOX_EMPLOYEES: '0' },
    { PAYROLL_SANDBOX_EMPLOYEES: '501' },
    { PAYROLL_SANDBOX_EMPLOYEES: '1.5' },
    { PAYROLL_SANDBOX_EMPLOYEES: '200oops' },
  ])(
    'rejects unsafe configuration %j before accessing PostgreSQL',
    (overrides) => {
      expect(() =>
        sandboxSeedOptions({ ...environment, ...overrides }),
      ).toThrow();
    },
  );

  it('uses stable, tenant-specific UUIDs', () => {
    expect(fixtureId(organizationId, 'employee:1')).toBe(
      fixtureId(organizationId, 'employee:1'),
    );
    expect(fixtureId(organizationId, 'employee:1')).not.toBe(
      fixtureId('another-tenant', 'employee:1'),
    );
    expect(fixtureId(organizationId, 'employee:1')).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  });
});

describe('synthetic sandbox fixtures', () => {
  const data = buildSandboxDataset({
    organizationId,
    employeeCount: 20,
    adminId: 'checker',
    adminEmail: 'admin@sandbox.test',
    makerId: 'maker',
  });

  it('includes nine months of runs and varied persisted records without creating accounts or bank batches', () => {
    expect(data.employees).toHaveLength(20);
    expect(data.runs).toHaveLength(18);
    expect(data.payslips).toHaveLength(360);
    expect(data.attendance.length).toBeGreaterThan(3800);
    expect(data.balances).toHaveLength(60);
    expect(data.leaves).toHaveLength(120);
    expect(data.loans).toHaveLength(5);
    expect(new Set(data.leaves.map((row) => row.status))).toEqual(
      new Set(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']),
    );
    expect(new Set(data.employees.map((row) => row.payBasis))).toEqual(
      new Set(['MONTHLY', 'DAILY', 'HOURLY']),
    );
    expect(
      data.employees.every((row) => row.email.endsWith('@sandbox.test')),
    ).toBe(true);
    expect(data.audits.every((row) => row.action === 'SANDBOX_SEED')).toBe(
      true,
    );
  });

  it('uses complete weekday DTRs, Manila punches and explicit full/half-day leave work', () => {
    for (const row of data.attendance) {
      expect([0, 6]).not.toContain((row.date as Date).getUTCDay());
      expect(row.actualWorkedMinutes).toBeGreaterThanOrEqual(
        row.overtimeMinutes ?? 0,
      );
      expect(row.actualWorkedMinutes).toBeGreaterThanOrEqual(
        row.nightDiffMinutes ?? 0,
      );
      if (row.timeIn && row.timeOut) {
        const elapsed =
          ((row.timeOut as Date).getTime() - (row.timeIn as Date).getTime()) /
          60000;
        expect(elapsed - Number(row.actualWorkedMinutes)).toBe(
          row.actualWorkedMinutes === 240 ? 0 : 60,
        );
      }
    }
    const halfDay = data.leaves.find(
      (row) => row.status === 'APPROVED' && row.partialDate,
    );
    if (!halfDay?.partialDate)
      throw new Error('Missing synthetic half-day leave');
    const dtr = data.attendance.find(
      (row) =>
        row.employeeId === halfDay.employeeId &&
        (row.date as Date).getTime() ===
          (halfDay.partialDate as Date).getTime(),
    );
    expect(dtr?.actualWorkedMinutes).toBe(240);
    expect(dtr?.undertimeMinutes).toBe(0);
    if (!dtr?.timeIn) throw new Error('Missing synthetic half-day attendance');
    expect((dtr.timeIn as Date).getUTCHours()).toBe(1);
  });

  it('matches payslip totals, run aggregates and distinct maker/checker provenance', () => {
    for (const slip of data.payslips) {
      expect(
        BigInt(slip.grossPayCents) - BigInt(slip.totalDeductionsCents),
      ).toBe(slip.netPayCents);
      expect(BigInt(slip.netPayCents)).toBeGreaterThan(0n);
    }
    for (const run of data.runs) {
      const slips = data.payslips.filter((row) => row.payrollRunId === run.id);
      expect(slips).toHaveLength(20);
      expect(
        slips.reduce((sum, row) => sum + BigInt(row.grossPayCents), 0n),
      ).toBe(run.totalGrossCents);
      expect(
        slips.reduce((sum, row) => sum + BigInt(row.netPayCents), 0n),
      ).toBe(run.totalNetCents);
      expect(
        slips.reduce((sum, row) => sum + BigInt(row.totalDeductionsCents), 0n),
      ).toBe(run.totalDeductionsCents);
      if (run.approvedById)
        expect(run.approvedById).not.toBe(run.processedById);
    }
  });

  it('reconciles every loan deduction to its ledger and remaining principal', () => {
    for (const loan of data.loans) {
      const payments = data.payments.filter((row) => row.loanId === loan.id);
      const paid = payments.reduce(
        (sum, row) => sum + BigInt(row.amountPaidCents),
        0n,
      );
      expect(BigInt(loan.totalAmountCents) - paid).toBe(loan.balanceCents);
      let remaining = BigInt(loan.totalAmountCents);
      for (const payment of payments) {
        remaining -= BigInt(payment.amountPaidCents);
        expect(payment.balanceAfterCents).toBe(remaining);
        const slip = data.payslips.find((row) => row.id === payment.payslipId);
        expect(slip?.loanDeductionsCents).toBe(payment.amountPaidCents);
      }
    }
  });

  it('balances recorded leave credits/debits/refunds and labels tax evidence unverified', () => {
    for (const balance of data.balances) {
      const requests = data.leaves.filter(
        (row) => row.debitedBalanceId === balance.id,
      );
      const used = requests.reduce(
        (sum, row) =>
          sum + Number(row.debitedDays ?? 0) - Number(row.refundedDays ?? 0),
        0,
      );
      expect(Number(balance.usedCredits)).toBe(used);
      expect(Number(balance.totalCredits) - used).toBe(Number(balance.balance));
    }
    for (const remittance of data.remittances) {
      const runIds = data.runs
        .filter(
          (run) =>
            run.status === 'DISBURSED' &&
            (run.cutoffStartDate as Date).getUTCMonth() + 1 ===
              remittance.month,
        )
        .map((run) => run.id);
      const withheld = data.payslips
        .filter((row) => runIds.includes(row.payrollRunId))
        .reduce((sum, row) => sum + BigInt(row.withholdingTaxCents ?? 0), 0n);
      expect(remittance.remittedCents).toBe(withheld);
      expect(remittance.documentReference).toContain('SYNTHETIC-NOT-FILED');
    }
  });
});
