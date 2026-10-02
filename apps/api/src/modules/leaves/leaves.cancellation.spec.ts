import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, prisma } from '@workspace/db';
import { type LeaveCancellationInput, LeavesService } from './leaves.service';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: { $transaction: jest.fn() },
}));
const input: LeaveCancellationInput = {
  requestId: 'request-1',
  organizationId: 'org-1',
  actorId: 'hr-1',
  expectedStatus: 'APPROVED',
  canWithdrawAny: true,
  reason: 'Approved schedule changed before processing',
};
const request = {
  id: 'request-1',
  employeeId: 'employee-1',
  leaveType: 'SIL',
  startDate: new Date('2029-01-08'),
  endDate: new Date('2029-01-08'),
  partialDate: null,
  daysCount: new Prisma.Decimal(1),
  isPaid: true,
  status: 'APPROVED',
  approvedById: 'original-approver',
  debitedBalanceId: 'balance-1',
  debitedDays: new Prisma.Decimal(1),
  cancelledFromStatus: null,
};
const balance = {
  id: 'balance-1',
  totalCredits: new Prisma.Decimal(5),
  usedCredits: new Prisma.Decimal(1),
  balance: new Prisma.Decimal(4),
  revision: 2,
};
describe('leave cancellation and original-debit credit restoration', () => {
  const service = new LeavesService();
  const audit = jest.fn();
  const tx = {
    leaveRequest: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    leaveBalance: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    payrollRun: { findFirst: jest.fn() },
  };
  beforeEach(() => {
    jest.resetAllMocks();
    tx.leaveRequest.findFirst.mockResolvedValue(request);
    tx.leaveRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.leaveRequest.findUniqueOrThrow.mockResolvedValue({
      ...request,
      status: 'CANCELLED',
      cancelledFromStatus: 'APPROVED',
      refundedDays: request.daysCount,
    });
    tx.leaveBalance.findFirst.mockResolvedValue(balance);
    tx.leaveBalance.updateMany.mockResolvedValue({ count: 1 });
    tx.leaveBalance.findUniqueOrThrow.mockResolvedValue({
      ...balance,
      usedCredits: new Prisma.Decimal(0),
      balance: new Prisma.Decimal(5),
      revision: 3,
    });
    tx.payrollRun.findFirst.mockResolvedValue(null);
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (transaction: unknown) => Promise<unknown>)(tx),
      );
  });
  it.each(['short', 'x'.repeat(501)])(
    'requires a bounded reason before opening any transaction',
    async (reason) => {
      await expect(
        service.cancelLeaveRequest({ ...input, reason }, audit),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it('does not cancel rejected leave or fabricate a refund', async () => {
    tx.leaveRequest.findFirst.mockResolvedValue({
      ...request,
      status: 'REJECTED',
    });
    await expect(
      service.cancelLeaveRequest(input, audit),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.leaveBalance.updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
  it('aborts a refund if the final request status compare-update loses', async () => {
    tx.leaveRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.cancelLeaveRequest(input, audit),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit).not.toHaveBeenCalled();
  });
  it('restores only the recorded debit, preserves approval trace and audits both snapshots atomically', async () => {
    const result = await service.cancelLeaveRequest(input, audit);
    expect(result).toMatchObject({
      newlyCancelled: true,
      request: {
        status: 'CANCELLED',
        approvedById: 'original-approver',
        refundedDays: new Prisma.Decimal(1),
      },
    });
    expect(tx.leaveBalance.updateMany).toHaveBeenCalledWith({
      where: {
        id: balance.id,
        employee: { organizationId: input.organizationId },
        revision: 2,
        usedCredits: { gte: request.debitedDays },
      },
      data: {
        usedCredits: { decrement: request.debitedDays },
        balance: { increment: request.debitedDays },
        revision: { increment: 1 },
      },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        previous: request,
        previousBalance: balance,
        balance: expect.objectContaining({ revision: 3 }),
        transaction: tx,
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('withdraws linked self pending leave without querying or changing balances', async () => {
    tx.leaveRequest.findFirst.mockResolvedValue({
      ...request,
      status: 'PENDING',
      debitedDays: null,
      debitedBalanceId: null,
    });
    await service.cancelLeaveRequest(
      {
        ...input,
        expectedStatus: 'PENDING',
        canWithdrawAny: false,
        actorEmployeeId: 'employee-1',
      },
      audit,
    );
    expect(tx.leaveBalance.findFirst).not.toHaveBeenCalled();
    expect(tx.leaveBalance.updateMany).not.toHaveBeenCalled();
    expect(tx.payrollRun.findFirst).not.toHaveBeenCalled();
    expect(tx.leaveRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'request-1', status: 'PENDING' },
        data: expect.objectContaining({
          cancelledFromStatus: 'PENDING',
          refundedDays: null,
        }),
      }),
    );
  });
  it('blocks employee withdrawal of another employee record', async () => {
    tx.leaveRequest.findFirst.mockResolvedValue({
      ...request,
      status: 'PENDING',
    });
    await expect(
      service.cancelLeaveRequest(
        {
          ...input,
          expectedStatus: 'PENDING',
          canWithdrawAny: false,
          actorEmployeeId: 'another-employee',
        },
        audit,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not turn a stale pending withdrawal into an approved credit refund', async () => {
    await expect(
      service.cancelLeaveRequest(
        { ...input, expectedStatus: 'PENDING' },
        audit,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.leaveBalance.updateMany).not.toHaveBeenCalled();
  });
  it('blocks linked administrator self reversal', async () => {
    await expect(
      service.cancelLeaveRequest(
        { ...input, actorEmployeeId: 'employee-1' },
        audit,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not refund or audit again on a matching cancelled replay', async () => {
    const cancelled = {
      ...request,
      status: 'CANCELLED',
      cancelledFromStatus: 'APPROVED',
      cancelledById: 'original-canceller',
      cancellationReason: 'Original cancellation reason',
    };
    tx.leaveRequest.findFirst.mockResolvedValue(cancelled);
    expect(await service.cancelLeaveRequest(input, audit)).toMatchObject({
      newlyCancelled: false,
      request: cancelled,
    });
    expect(tx.leaveBalance.updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    await expect(
      service.cancelLeaveRequest(
        { ...input, expectedStatus: 'PENDING' },
        audit,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('blocks cancellation for any non-cancelled regular cutoff', async () => {
    tx.payrollRun.findFirst.mockResolvedValue({ id: 'processed-run' });
    await expect(
      service.cancelLeaveRequest(input, audit),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payrollRun.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        cutoffSequence: { in: ['FIRST_CUTOFF', 'SECOND_CUTOFF'] },
        status: { not: 'CANCELLED' },
        cutoffStartDate: { lte: request.endDate },
        cutoffEndDate: { gte: request.startDate },
      },
      select: { id: true },
    });
    expect(tx.leaveBalance.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    { debitedBalanceId: null },
    { debitedDays: null },
    { debitedDays: new Prisma.Decimal(0.5) },
  ])('cannot guess a legacy or mismatched debit: %j', async (override) => {
    tx.leaveRequest.findFirst.mockResolvedValue({ ...request, ...override });
    await expect(
      service.cancelLeaveRequest(input, audit),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.leaveBalance.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {
      ...balance,
      usedCredits: new Prisma.Decimal(0),
      balance: new Prisma.Decimal(5),
    },
    { ...balance, balance: new Prisma.Decimal(6) },
  ])(
    'requires the original balance with consistent usage: %j',
    async (value) => {
      tx.leaveBalance.findFirst.mockResolvedValue(value);
      await expect(
        service.cancelLeaveRequest(input, audit),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    },
  );
  it('cancels approved unpaid leave without fabricating a financial refund', async () => {
    tx.leaveRequest.findFirst.mockResolvedValue({
      ...request,
      isPaid: false,
      debitedDays: null,
      debitedBalanceId: null,
    });
    await service.cancelLeaveRequest(input, audit);
    expect(tx.leaveBalance.updateMany).not.toHaveBeenCalled();
    expect(tx.leaveRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refundedDays: null }),
      }),
    );
  });
  it('rejects a changed balance or a failing audit instead of reporting successful restoration', async () => {
    tx.leaveBalance.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.cancelLeaveRequest(input, audit),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.leaveRequest.updateMany).not.toHaveBeenCalled();
    audit.mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(service.cancelLeaveRequest(input, audit)).rejects.toThrow(
      'Audit unavailable',
    );
  });
});
