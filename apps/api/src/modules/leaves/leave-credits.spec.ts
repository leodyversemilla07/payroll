import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, prisma } from '@workspace/db';
import {
  type LeaveCreditInput,
  setEmployeeLeaveCredits,
} from './leave-credits';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: { $transaction: jest.fn() },
}));
const input: LeaveCreditInput = {
  operationId: 'operation-1',
  employeeId: 'employee-1',
  organizationId: 'org-1',
  leaveType: 'SIL',
  year: 2026,
  totalCredits: 5,
  expectedRevision: null,
  actorId: 'hr-1',
  sourceReference: 'POLICY-2026-01',
  reason: 'Reviewed source and employee eligibility',
};
const balance = {
  id: 'balance-1',
  employeeId: 'employee-1',
  leaveType: 'SIL',
  year: 2026,
  totalCredits: new Prisma.Decimal(5),
  usedCredits: new Prisma.Decimal(1.5),
  balance: new Prisma.Decimal(3.5),
  revision: 3,
};
describe('leave credit allocation and adjustment safety', () => {
  const tx = {
    employee: { findFirst: jest.fn() },
    leaveRequest: { findFirst: jest.fn() },
    leaveBalance: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    leaveCreditChange: { findFirst: jest.fn(), create: jest.fn() },
  };
  const audit = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    tx.employee.findFirst.mockResolvedValue({ id: input.employeeId });
    tx.leaveBalance.findFirst.mockResolvedValue(null);
    tx.leaveRequest.findFirst.mockResolvedValue(null);
    tx.leaveCreditChange.findFirst.mockResolvedValue(null);
    tx.leaveBalance.create.mockImplementation(async ({ data }) => ({
      ...balance,
      ...data,
    }));
    tx.leaveBalance.updateMany.mockResolvedValue({ count: 1 });
    tx.leaveCreditChange.create.mockImplementation(async ({ data }) => data);
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (transaction: unknown) => Promise<unknown>)(tx),
      );
  });
  it('allocates explicit credits once with zero usage and transactional provenance', async () => {
    const result = await setEmployeeLeaveCredits(input, audit);
    expect(result.balance).toMatchObject({
      revision: 1,
      usedCredits: new Prisma.Decimal(0),
      balance: new Prisma.Decimal(5),
    });
    expect(result.change).toMatchObject({
      id: input.operationId,
      previousTotalCredits: null,
      kind: 'ALLOCATION',
      sourceReference: input.sourceReference,
      actorId: input.actorId,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ previous: null, transaction: tx }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('sets a new total, preserving usage and recomputing only availability', async () => {
    tx.leaveBalance.findFirst.mockResolvedValue(balance);
    tx.leaveBalance.findUniqueOrThrow.mockResolvedValue({
      ...balance,
      totalCredits: new Prisma.Decimal(4),
      balance: new Prisma.Decimal(2.5),
      revision: 4,
    });
    const result = await setEmployeeLeaveCredits(
      { ...input, expectedRevision: 3, totalCredits: 4 },
      audit,
    );
    expect(result.change).toMatchObject({
      previousTotalCredits: new Prisma.Decimal(5),
      previousBalance: new Prisma.Decimal(3.5),
      availableBalance: new Prisma.Decimal(2.5),
      usedCredits: new Prisma.Decimal(1.5),
      kind: 'ADJUSTMENT',
    });
    expect(tx.leaveBalance.updateMany).toHaveBeenCalledWith({
      where: {
        id: balance.id,
        employee: { organizationId: 'org-1' },
        revision: 3,
      },
      data: {
        totalCredits: new Prisma.Decimal(4),
        balance: new Prisma.Decimal(2.5),
        revision: { increment: 1 },
      },
    });
  });
  it.each([null, 2, 4])(
    'rejects a missing or stale expected revision: %s',
    async (expectedRevision) => {
      tx.leaveBalance.findFirst.mockResolvedValue(balance);
      await expect(
        setEmployeeLeaveCredits({ ...input, expectedRevision }, audit),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.leaveBalance.updateMany).not.toHaveBeenCalled();
    },
  );
  it('cannot reduce total below recorded usage', async () => {
    tx.leaveBalance.findFirst.mockResolvedValue(balance);
    await expect(
      setEmployeeLeaveCredits(
        { ...input, expectedRevision: 3, totalCredits: 1 },
        audit,
      ),
    ).rejects.toThrow('less than already used');
    expect(tx.leaveCreditChange.create).not.toHaveBeenCalled();
  });
  it('cannot repair inconsistent legacy credits by resetting usage', async () => {
    tx.leaveBalance.findFirst.mockResolvedValue({
      ...balance,
      balance: new Prisma.Decimal(5),
    });
    await expect(
      setEmployeeLeaveCredits({ ...input, expectedRevision: 3 }, audit),
    ).rejects.toThrow('Reconcile them manually');
  });
  it('does not invent zero usage if legacy approved paid leave has no balance', async () => {
    tx.leaveRequest.findFirst.mockResolvedValue({
      id: 'legacy-approved-leave',
    });
    await expect(setEmployeeLeaveCredits(input, audit)).rejects.toThrow(
      'allocation cannot assume zero usage',
    );
    expect(tx.leaveBalance.create).not.toHaveBeenCalled();
  });

  it('does not permit self-allocation or self-adjustment', async () => {
    await expect(
      setEmployeeLeaveCredits(
        { ...input, actorEmployeeId: input.employeeId },
        audit,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([-1, 0.25, 1000, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid credit amounts: %s',
    async (totalCredits) => {
      await expect(
        setEmployeeLeaveCredits({ ...input, totalCredits }, audit),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it('does not create new lowercase policy aliases', async () => {
    await expect(
      setEmployeeLeaveCredits({ ...input, leaveType: 'sil' }, audit),
    ).rejects.toThrow('uppercase policy code');
    expect(tx.leaveBalance.create).not.toHaveBeenCalled();
  });
  it('does not allocate an uppercase duplicate of a legacy case-variant type', async () => {
    tx.leaveBalance.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'legacy-balance' });
    await expect(setEmployeeLeaveCredits(input, audit)).rejects.toThrow(
      'different casing',
    );
    expect(tx.leaveBalance.create).not.toHaveBeenCalled();
  });
  it('can adjust the exact legacy type without silently renaming it', async () => {
    tx.leaveBalance.findFirst.mockResolvedValue({
      ...balance,
      leaveType: 'sil',
    });
    tx.leaveBalance.findUniqueOrThrow.mockResolvedValue({
      ...balance,
      leaveType: 'sil',
      revision: 4,
    });
    const result = await setEmployeeLeaveCredits(
      { ...input, leaveType: 'sil', expectedRevision: 3 },
      audit,
    );
    expect(result.balance.leaveType).toBe('sil');
    expect(tx.leaveBalance.create).not.toHaveBeenCalled();
  });
  it('accepts an explicit zero allocation without inventing a positive entitlement', async () => {
    expect(
      (
        await setEmployeeLeaveCredits({ ...input, totalCredits: 0 }, audit)
      ).balance.balance.toString(),
    ).toBe('0');
  });

  it('replays only an identical committed operation without repeating audit or writes', async () => {
    const change = {
      id: input.operationId,
      balance: { ...balance, revision: 7 },
      actorId: input.actorId,
      sourceReference: input.sourceReference,
      reason: input.reason,
      totalCredits: new Prisma.Decimal(5),
      previousRevision: null,
    };
    tx.leaveCreditChange.findFirst.mockResolvedValue(change);
    expect((await setEmployeeLeaveCredits(input, audit)).replayed).toBe(true);
    expect(tx.leaveBalance.create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    await expect(
      setEmployeeLeaveCredits({ ...input, totalCredits: 6 }, audit),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      setEmployeeLeaveCredits({ ...input, actorId: 'other-hr' }, audit),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('propagates audit failure inside the transaction rather than reporting a successful allocation', async () => {
    audit.mockRejectedValue(new Error('Audit unavailable'));
    await expect(setEmployeeLeaveCredits(input, audit)).rejects.toThrow(
      'Audit unavailable',
    );
  });
});
