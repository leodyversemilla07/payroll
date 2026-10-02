import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, prisma } from '@workspace/db';
import {
  assertValidPayrollTransition,
  type PayrollRunAction,
  PayrollService,
} from './payroll.service';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: { $transaction: jest.fn() },
}));

describe('assertValidPayrollTransition', () => {
  it.each([
    ['AUDITED', 'APPROVE'],
    ['APPROVED', 'DISBURSE'],
    ['DRAFT', 'CANCEL'],
    ['PROCESSING', 'CANCEL'],
    ['AUDITED', 'CANCEL'],
    ['APPROVED', 'CANCEL'],
  ] as [string, PayrollRunAction][])('allows %s from %s', (status, action) => {
    expect(() => assertValidPayrollTransition(status, action)).not.toThrow();
  });

  it.each([
    ['DRAFT', 'APPROVE'],
    ['PROCESSING', 'APPROVE'],
    ['APPROVED', 'APPROVE'],
    ['DISBURSED', 'APPROVE'],
    ['AUDITED', 'DISBURSE'],
    ['DISBURSED', 'DISBURSE'],
    ['DRAFT', 'DISBURSE'],
    ['DISBURSED', 'CANCEL'],
  ] as [string, PayrollRunAction][])('rejects %s from %s', (status, action) => {
    expect(() => assertValidPayrollTransition(status, action)).toThrow(
      ConflictException,
    );
  });
});

describe('PayrollService atomic lifecycle transitions', () => {
  const audited = {
    id: 'run-1',
    organizationId: 'org-1',
    status: 'AUDITED',
    processedById: 'maker-1',
    approvedById: null,
  };
  const approval = {
    runId: 'run-1',
    organizationId: 'org-1',
    approvedById: 'checker-1',
  };
  const transaction = {
    payrollRun: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  const audit = jest.fn();
  const service = new PayrollService({} as never);

  beforeEach(() => {
    jest.resetAllMocks();
    transaction.payrollRun.findFirst.mockResolvedValue(audited);
    transaction.payrollRun.updateMany.mockResolvedValue({ count: 1 });
    transaction.payrollRun.findUniqueOrThrow.mockResolvedValue({
      ...audited,
      status: 'APPROVED',
      approvedById: 'checker-1',
      payslips: [],
    });
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (tx: unknown) => Promise<unknown>)(transaction),
      );
  });

  it('claims only an audited tenant run and audits through the same transaction', async () => {
    const result = await service.approvePayrollRun(approval, audit);
    expect(transaction.payrollRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        organizationId: 'org-1',
        status: 'AUDITED',
        processedById: 'maker-1',
      },
      data: { status: 'APPROVED', approvedById: 'checker-1' },
    });
    expect(audit).toHaveBeenCalledWith({
      previous: audited,
      run: result,
      transaction,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('rejects stale approval without auditing or overwriting the checker', async () => {
    transaction.payrollRun.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approvePayrollRun(approval, audit)).rejects.toThrow(
      ConflictException,
    );
    expect(transaction.payrollRun.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('retains maker-checker and tenant ownership checks', async () => {
    await expect(
      service.approvePayrollRun(
        { ...approval, approvedById: 'maker-1' },
        audit,
      ),
    ).rejects.toThrow(ForbiddenException);
    transaction.payrollRun.findFirst.mockResolvedValue(null);
    await expect(service.approvePayrollRun(approval, audit)).rejects.toThrow(
      NotFoundException,
    );
    expect(transaction.payrollRun.updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('does not swallow audit failures', async () => {
    audit.mockRejectedValue(new Error('Audit unavailable'));
    await expect(service.approvePayrollRun(approval, audit)).rejects.toThrow(
      'Audit unavailable',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('claims only an approved run for disbursement', async () => {
    const before = {
      ...audited,
      status: 'APPROVED',
      approvedById: 'checker-1',
    };
    transaction.payrollRun.findFirst.mockResolvedValue(before);
    transaction.payrollRun.findUniqueOrThrow.mockResolvedValue({
      ...before,
      status: 'DISBURSED',
      payslips: [],
    });
    const result = await service.disbursePayrollRun(approval, audit);
    expect(transaction.payrollRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', organizationId: 'org-1', status: 'APPROVED' },
      data: { status: 'DISBURSED' },
    });
    expect(audit).toHaveBeenCalledWith({
      previous: before,
      run: result,
      transaction,
    });
  });

  it('rejects stale disbursement without an audit', async () => {
    transaction.payrollRun.findFirst.mockResolvedValue({
      ...audited,
      status: 'APPROVED',
    });
    transaction.payrollRun.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.disbursePayrollRun(approval, audit)).rejects.toThrow(
      ConflictException,
    );
    expect(audit).not.toHaveBeenCalled();
  });

  it('retries serialization conflicts but rechecks the now-approved state', async () => {
    jest.mocked(prisma.$transaction).mockRejectedValueOnce({ code: 'P2034' });
    transaction.payrollRun.findFirst.mockResolvedValue({
      ...audited,
      status: 'APPROVED',
    });
    await expect(service.approvePayrollRun(approval, audit)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(audit).not.toHaveBeenCalled();
  });

  it('bounds serialization retries and returns a conflict', async () => {
    jest.mocked(prisma.$transaction).mockRejectedValue({ code: 'P2034' });
    await expect(service.approvePayrollRun(approval, audit)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
