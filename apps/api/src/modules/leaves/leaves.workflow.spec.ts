import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, prisma } from '@workspace/db';
import { LeavesService } from './leaves.service';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: {
    $transaction: jest.fn(),
    employee: { findFirst: jest.fn() },
    leaveBalance: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    leaveRequest: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  },
}));
describe('read-only leave balances and pending rejection', () => {
  const service = new LeavesService();
  const database = prisma as unknown as Prisma.TransactionClient;
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(prisma.employee.findFirst)
      .mockResolvedValue({ id: 'employee-1' } as never);
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (tx: Prisma.TransactionClient) => Promise<unknown>)(
          database,
        ),
      );
  });
  it('returns empty recorded balances without inventing statutory or company credits', async () => {
    jest.mocked(prisma.leaveBalance.findMany).mockResolvedValue([]);
    expect(
      await service.getEmployeeLeaveBalances('employee-1', 'org-1', 2026),
    ).toEqual([]);
    expect(prisma.leaveBalance.upsert).not.toHaveBeenCalled();
    expect(prisma.leaveBalance.findMany).toHaveBeenCalledWith({
      where: {
        employeeId: 'employee-1',
        employee: { organizationId: 'org-1' },
        year: 2026,
      },
      orderBy: { leaveType: 'asc' },
    });
  });
  it('does not assume five SIL days when a conversion preview has no recorded balance', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      id: 'employee-1',
      compensation: { basicRateDailyCents: 100_000n },
    } as never);
    jest.mocked(prisma.leaveBalance.findUnique).mockResolvedValue(null);
    await expect(
      service.calculateSilMonetization('employee-1', 'org-1'),
    ).rejects.toThrow('Recorded SIL balance not found');
    expect(prisma.leaveBalance.upsert).not.toHaveBeenCalled();
  });

  it('limits a SIL conversion preview to the recorded balance', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      id: 'employee-1',
      firstName: 'Ana',
      lastName: 'Santos',
      compensation: { basicRateDailyCents: 100_000n },
    } as never);
    jest
      .mocked(prisma.leaveBalance.findUnique)
      .mockResolvedValue({ balance: new Prisma.Decimal(1.5) } as never);
    await expect(
      service.calculateSilMonetization('employee-1', 'org-1', 2),
    ).rejects.toThrow('cannot exceed');
    expect(
      await service.calculateSilMonetization('employee-1', 'org-1'),
    ).toMatchObject({ requestedDays: 1.5, availableBalanceDays: 1.5 });
    expect(prisma.leaveBalance.upsert).not.toHaveBeenCalled();
  });

  it('returns tenant-scoped bounded request history for the selected year/status', async () => {
    jest.mocked(prisma.leaveRequest.findMany).mockResolvedValue([]);
    await service.listEmployeeLeaveRequests(
      'employee-1',
      'org-1',
      2026,
      'PENDING',
      100,
    );
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith({
      where: {
        employeeId: 'employee-1',
        employee: { organizationId: 'org-1' },
        status: 'PENDING',
        startDate: { lt: new Date('2027-01-01') },
        endDate: { gte: new Date('2026-01-01') },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  });
  it('rejects once with reason, actor and before/after auditing, without debiting credits', async () => {
    const previous = { id: 'request-1', status: 'PENDING' };
    const request = {
      ...previous,
      status: 'REJECTED',
      rejectedById: 'admin-1',
      rejectionReason: 'Request was filed with incorrect dates',
    };
    jest
      .mocked(prisma.leaveRequest.findFirst)
      .mockResolvedValue(previous as never);
    jest.mocked(prisma.leaveRequest.updateMany).mockResolvedValue({ count: 1 });
    jest
      .mocked(prisma.leaveRequest.findUniqueOrThrow)
      .mockResolvedValue(request as never);
    const audit = jest.fn();
    expect(
      await service.rejectLeaveRequest(
        'request-1',
        'org-1',
        'admin-1',
        request.rejectionReason,
        audit,
      ),
    ).toMatchObject({ newlyRejected: true, request });
    expect(prisma.leaveRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'request-1', status: 'PENDING' },
      data: {
        status: 'REJECTED',
        rejectedById: 'admin-1',
        rejectionReason: request.rejectionReason,
      },
    });
    expect(audit).toHaveBeenCalledWith({
      previous,
      request,
      transaction: database,
    });
  });
  it('forbids rejecting your own employee leave request', async () => {
    const previous = {
      id: 'request-1',
      status: 'PENDING',
      employeeId: 'employee-1',
    };
    jest
      .mocked(prisma.leaveRequest.findFirst)
      .mockResolvedValue(previous as never);
    const audit = jest.fn();
    await expect(
      service.rejectLeaveRequest(
        'request-1',
        'org-1',
        'admin-1',
        'Request was filed with incorrect dates',
        audit,
        'employee-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.leaveRequest.updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
  it('replays a rejected decision without replacing the original actor or reason', async () => {
    const request = {
      id: 'request-1',
      status: 'REJECTED',
      rejectedById: 'original-admin',
      rejectionReason: 'Original review explanation',
    };
    jest
      .mocked(prisma.leaveRequest.findFirst)
      .mockResolvedValue(request as never);
    const audit = jest.fn();
    expect(
      await service.rejectLeaveRequest(
        'request-1',
        'org-1',
        'admin-2',
        'Different explanation',
        audit,
      ),
    ).toEqual({ request, newlyRejected: false });
    expect(prisma.leaveRequest.updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
  it('does not reject an already approved request', async () => {
    jest
      .mocked(prisma.leaveRequest.findFirst)
      .mockResolvedValue({ status: 'APPROVED' } as never);
    await expect(
      service.rejectLeaveRequest(
        'request-1',
        'org-1',
        'admin-1',
        'Wrong request originally filed',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.leaveRequest.updateMany).not.toHaveBeenCalled();
  });
});
