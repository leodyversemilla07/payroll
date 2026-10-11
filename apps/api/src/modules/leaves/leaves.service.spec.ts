import { ConflictException, NotFoundException } from '@nestjs/common';
import { prisma } from '@workspace/db';
import { LeavesService } from './leaves.service';

jest.mock('@workspace/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    employee: { findFirst: jest.fn() },
    leaveRequest: { create: jest.fn(), findFirst: jest.fn() },
    leaveBalance: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  },
  Prisma: {
    Decimal: jest.fn((value: number) => value),
    TransactionIsolationLevel: { Serializable: 'Serializable' },
  },
}));

function mockApproval(
  options: {
    status?: string;
    balance?: number;
    paid?: boolean;
    missing?: boolean;
    lostRace?: boolean;
    processed?: boolean;
    overlap?: boolean;
  } = {},
) {
  let status = options.status ?? 'PENDING';
  let balance = options.balance ?? 5;
  let approvedById: string | null = null;
  const request = () => ({
    id: 'request-1',
    employeeId: 'employee-1',
    leaveType: 'SIL',
    startDate: new Date('2026-09-10'),
    endDate: new Date('2026-09-11'),
    partialDate: null,
    daysCount: 2,
    isPaid: options.paid ?? true,
    status,
    approvedById,
  });
  const transaction = {
    payrollRun: {
      findFirst: jest.fn(async () =>
        options.processed ? { id: 'run-1' } : null,
      ),
    },
    leaveRequest: {
      findFirst: jest.fn(async (args: { select?: unknown }) =>
        options.missing
          ? null
          : args.select
            ? options.overlap
              ? { id: 'other-leave' }
              : null
            : request(),
      ),
      updateMany: jest.fn(
        async (args: {
          where: { status: string };
          data: { approvedById: string };
        }) => {
          if (status !== args.where.status || options.lostRace) {
            return { count: 0 };
          }
          status = 'APPROVED';
          approvedById = args.data.approvedById;
          return { count: 1 };
        },
      ),
      findUniqueOrThrow: jest.fn(async () => request()),
    },
    leaveBalance: {
      findFirst: jest.fn(async () => ({ id: 'balance-1' })),
      updateMany: jest.fn(
        async (args: {
          where: { balance: { gte: number } };
          data: { balance: { decrement: number } };
        }) => {
          if (balance < args.where.balance.gte) return { count: 0 };
          balance -= args.data.balance.decrement;
          return { count: 1 };
        },
      ),
    },
  };
  jest
    .mocked(prisma.$transaction)
    .mockImplementation(async (callback: unknown) => {
      const snapshot = { status, balance, approvedById };
      try {
        return await (callback as (tx: typeof transaction) => Promise<unknown>)(
          transaction,
        );
      } catch (error) {
        status = snapshot.status;
        balance = snapshot.balance;
        approvedById = snapshot.approvedById;
        throw error;
      }
    });
  return { transaction, getBalance: () => balance, getStatus: () => status };
}

describe('LeavesService approval', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deducts a paid leave once and returns the existing approval on retry', async () => {
    const { transaction, getBalance } = mockApproval();
    const service = new LeavesService();
    const first = await service.approveLeaveRequest(
      'request-1',
      'org-1',
      'admin-1',
    );
    const second = await service.approveLeaveRequest(
      'request-1',
      'org-1',
      'admin-2',
    );

    expect(first).toMatchObject({
      newlyApproved: true,
      request: { status: 'APPROVED', approvedById: 'admin-1' },
    });
    expect(second).toMatchObject({
      newlyApproved: false,
      request: { status: 'APPROVED', approvedById: 'admin-1' },
    });
    expect(transaction.leaveRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'request-1', employee: { organizationId: 'org-1' } },
    });
    expect(transaction.leaveBalance.updateMany).toHaveBeenCalledTimes(1);
    expect(getBalance()).toBe(3);
  });

  it('notifies inside the approval transaction and stays silent on replay', async () => {
    const { transaction } = mockApproval();
    const service = new LeavesService();
    const notify = jest.fn();
    const first = await service.approveLeaveRequest(
      'request-1',
      'org-1',
      'admin-1',
      undefined,
      undefined,
      notify,
    );
    expect(first.newlyApproved).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({
      request: expect.objectContaining({ id: 'request-1' }),
      transaction,
    });
    const second = await service.approveLeaveRequest(
      'request-1',
      'org-1',
      'admin-2',
      undefined,
      undefined,
      notify,
    );
    expect(second.newlyApproved).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('rolls back the approval when the notify hook fails', async () => {
    const { getStatus } = mockApproval();
    const notify = jest.fn().mockRejectedValue(new Error('fan-out down'));
    await expect(
      new LeavesService().approveLeaveRequest(
        'request-1',
        'org-1',
        'admin-1',
        undefined,
        undefined,
        notify,
      ),
    ).rejects.toThrow('fan-out down');
    expect(getStatus()).toBe('PENDING');
  });

  it('does not approve paid leave without enough balance', async () => {
    const { transaction, getBalance, getStatus } = mockApproval({ balance: 1 });
    await expect(
      new LeavesService().approveLeaveRequest('request-1', 'org-1', 'admin-1'),
    ).rejects.toThrow(ConflictException);
    expect(getBalance()).toBe(1);
    expect(getStatus()).toBe('PENDING');
    expect(transaction.leaveRequest.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('does not deduct for unpaid leave', async () => {
    const { transaction } = mockApproval({ paid: false });
    const result = await new LeavesService().approveLeaveRequest(
      'request-1',
      'org-1',
      'admin-1',
    );
    expect(result.newlyApproved).toBe(true);
    expect(transaction.leaveBalance.updateMany).not.toHaveBeenCalled();
  });

  it('rolls back the debit after a lost approval race', async () => {
    const { getBalance, getStatus } = mockApproval({ lostRace: true });
    await expect(
      new LeavesService().approveLeaveRequest('request-1', 'org-1', 'admin-1'),
    ).rejects.toThrow(ConflictException);
    expect(getBalance()).toBe(5);
    expect(getStatus()).toBe('PENDING');
  });

  it('retries a serialization conflict before deducting leave', async () => {
    const { transaction, getBalance } = mockApproval();
    jest.mocked(prisma.$transaction).mockImplementationOnce(async () => {
      throw { code: 'P2034' };
    });

    const result = await new LeavesService().approveLeaveRequest(
      'request-1',
      'org-1',
      'admin-1',
    );
    expect(result.newlyApproved).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(transaction.leaveBalance.updateMany).toHaveBeenCalledTimes(1);
    expect(getBalance()).toBe(3);
  });

  it('rejects non-pending requests without changing the balance', async () => {
    const { transaction } = mockApproval({ status: 'REJECTED' });
    await expect(
      new LeavesService().approveLeaveRequest('request-1', 'org-1', 'admin-1'),
    ).rejects.toThrow(ConflictException);
    expect(transaction.leaveBalance.updateMany).not.toHaveBeenCalled();
  });

  it('rolls back approval and debit if its audit callback fails', async () => {
    const { getBalance, getStatus } = mockApproval();
    const audit = jest.fn().mockRejectedValue(new Error('audit unavailable'));
    await expect(
      new LeavesService().approveLeaveRequest(
        'request-1',
        'org-1',
        'admin-1',
        audit,
      ),
    ).rejects.toThrow('audit unavailable');
    expect(getBalance()).toBe(5);
    expect(getStatus()).toBe('PENDING');
  });

  it.each([{ processed: true }, { overlap: true }])(
    'does not approve after payroll or overlapping approval: %j',
    async (options) => {
      const { getBalance, getStatus } = mockApproval(options);
      await expect(
        new LeavesService().approveLeaveRequest(
          'request-1',
          'org-1',
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(getBalance()).toBe(5);
      expect(getStatus()).toBe('PENDING');
    },
  );

  it('does not allow an approver to approve their own linked employee leave', async () => {
    const { getBalance } = mockApproval();
    await expect(
      new LeavesService().approveLeaveRequest(
        'request-1',
        'org-1',
        'admin-1',
        undefined,
        'employee-1',
      ),
    ).rejects.toThrow('cannot approve your own');
    expect(getBalance()).toBe(5);
  });

  it('rejects a different-tenant or missing request', async () => {
    mockApproval({ missing: true });
    await expect(
      new LeavesService().approveLeaveRequest('request-1', 'org-1', 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('LeavesService filing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      id: 'employee-1',
    } as never);
    jest.mocked(prisma.leaveRequest.findFirst).mockResolvedValue(null);
    (prisma.leaveRequest.create as unknown as jest.Mock).mockImplementation(
      (args: { data: object }) =>
        Promise.resolve({ id: 'leave-1', ...args.data }),
    );
  });

  const base = {
    employeeId: 'employee-1',
    organizationId: 'org-1',
    leaveType: 'VACATION',
    // Thursday 2026-09-10.
    startDate: new Date('2026-09-10'),
    endDate: new Date('2026-09-10'),
    isPaid: true,
    reason: 'Family errand',
  };

  it('files a whole-day request without a partial date', async () => {
    const request = await new LeavesService().fileLeaveRequest({
      ...base,
      daysCount: 1,
    });
    expect(request).toMatchObject({ partialDate: null });
    expect(prisma.leaveRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ partialDate: null }),
      }),
    );
  });

  it('files a half-day request naming the partial weekday', async () => {
    const request = await new LeavesService().fileLeaveRequest({
      ...base,
      // Friday 2026-09-11 through Monday 2026-09-14: two scheduled days.
      startDate: new Date('2026-09-11'),
      endDate: new Date('2026-09-14'),
      daysCount: 1.5,
      partialDate: new Date('2026-09-14'),
    });
    expect(request).toMatchObject({ id: 'leave-1' });
    expect(prisma.leaveRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          partialDate: new Date('2026-09-14'),
        }),
      }),
    );
  });

  it.each([0.25, 1.1, 0, -1])(
    'rejects a non-half-increment count of %s',
    async (daysCount) => {
      await expect(
        new LeavesService().fileLeaveRequest({ ...base, daysCount }),
      ).rejects.toThrow('multiple of 0.5');
      expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
    },
  );

  it('rejects a half-day count without naming the partial date', async () => {
    await expect(
      new LeavesService().fileLeaveRequest({ ...base, daysCount: 0.5 }),
    ).rejects.toThrow('scheduled weekdays');
  });

  it('rejects a half-day count that does not match the range', async () => {
    await expect(
      new LeavesService().fileLeaveRequest({
        ...base,
        daysCount: 1.5,
        partialDate: new Date('2026-09-10'),
      }),
    ).rejects.toThrow('one half day short');
  });

  it('rejects a weekend partial date', async () => {
    await expect(
      new LeavesService().fileLeaveRequest({
        ...base,
        startDate: new Date('2026-09-11'),
        endDate: new Date('2026-09-14'),
        daysCount: 1.5,
        // Saturday 2026-09-12.
        partialDate: new Date('2026-09-12'),
      }),
    ).rejects.toThrow('weekday inside the range');
  });

  it('rejects a partial date outside the request range', async () => {
    await expect(
      new LeavesService().fileLeaveRequest({
        ...base,
        startDate: new Date('2026-09-11'),
        endDate: new Date('2026-09-14'),
        daysCount: 1.5,
        // Wednesday 2026-09-09 is a weekday but outside the range.
        partialDate: new Date('2026-09-09'),
      }),
    ).rejects.toThrow('weekday inside the range');
  });

  it('rejects a whole-day count carrying a partial date', async () => {
    await expect(
      new LeavesService().fileLeaveRequest({
        ...base,
        daysCount: 1,
        partialDate: new Date('2026-09-10'),
      }),
    ).rejects.toThrow('one half day short');
  });

  it('rejects an inverted date range', async () => {
    await expect(
      new LeavesService().fileLeaveRequest({
        ...base,
        startDate: new Date('2026-09-11'),
        endDate: new Date('2026-09-10'),
        daysCount: 1,
      }),
    ).rejects.toThrow('valid range');
  });

  it('rejects ancient dates rather than normalizing year 0090 into 1990', async () => {
    await expect(
      new LeavesService().fileLeaveRequest({
        ...base,
        startDate: new Date('0090-09-10'),
        endDate: new Date('0090-09-10'),
        daysCount: 1,
      }),
    ).rejects.toThrow('between 1900 and 2100');
    expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a cross-year request rather than debiting only the starting year', async () => {
    await expect(
      new LeavesService().fileLeaveRequest({
        ...base,
        startDate: new Date('2026-12-31'),
        endDate: new Date('2027-01-01'),
        daysCount: 2,
      }),
    ).rejects.toThrow('split cross-year');
    expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it('rejects overlapping pending or approved requests before filing', async () => {
    jest
      .mocked(prisma.leaveRequest.findFirst)
      .mockResolvedValue({ id: 'existing' } as never);
    await expect(
      new LeavesService().fileLeaveRequest({ ...base, daysCount: 1 }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it('rejects filing for another tenant’s employee', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue(null);
    await expect(
      new LeavesService().fileLeaveRequest({ ...base, daysCount: 1 }),
    ).rejects.toThrow(NotFoundException);
  });
});
