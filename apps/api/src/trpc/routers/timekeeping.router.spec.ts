import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, prisma, Role } from '@workspace/db';
import type { Request, Response } from 'express';
import { type Context, TrpcService } from '../trpc.service';
import { createRouterContext, type RouterServices } from './router-context';
import { createTimekeepingRouter } from './timekeeping.router';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: { $transaction: jest.fn() },
}));
const input = {
  employeeId: '11111111-1111-4111-8111-111111111111',
  date: '2026-09-10',
  expectedUpdatedAt: '2026-09-10T08:00:00.000Z',
  dayType: 'REGULAR_WORKDAY' as const,
  timeIn: null,
  timeOut: null,
  actualWorkedMinutes: 450,
  tardinessMinutes: 30,
  undertimeMinutes: 0,
  overtimeMinutes: 0,
  nightDiffMinutes: 0,
  isAbsent: false,
  isApproved: false,
  correctionReason: 'Verified against signed attendance sheet',
};
function context(role: Role | null, employeeId?: string): Context {
  return {
    req: {
      ip: '127.0.0.1',
      get: () => 'test',
      headers: {},
    } as unknown as Request,
    res: {} as Response,
    user: role
      ? {
          id: 'user-1',
          organizationId: 'org-1',
          email: 'staff@test.invalid',
          name: 'Test staff',
          role,
          employeeId,
        }
      : null,
  };
}

describe('timekeeping tRPC permissions and audit', () => {
  const correctAttendanceRecord = jest.fn();
  const getEmployeeDTR = jest.fn();
  const listRecentRecords = jest.fn();
  const record = jest.fn();
  const transaction = {} as Prisma.TransactionClient;
  const router = createTimekeepingRouter(
    createRouterContext(new TrpcService(), {
      timekeepingService: {
        correctAttendanceRecord,
        getEmployeeDTR,
        listRecentRecords,
      },
      auditService: { record },
    } as unknown as RouterServices),
  );
  const previous = { id: 'dtr-1', actualWorkedMinutes: 480 };
  const saved = {
    id: 'dtr-1',
    actualWorkedMinutes: 450,
    date: new Date(input.date),
  };
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (tx: Prisma.TransactionClient) => Promise<unknown>)(
          transaction,
        ),
      );
    correctAttendanceRecord.mockResolvedValue({ previous, record: saved });
    getEmployeeDTR.mockResolvedValue([]);
    listRecentRecords.mockResolvedValue([]);
  });
  it.each([null, Role.EMPLOYEE])(
    'denies attendance writes to %s',
    async (role) => {
      await expect(
        router
          .createCaller(context(role, input.employeeId))
          .adjustAttendance(input),
      ).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each([
    Role.SUPER_ADMIN,
    Role.HR_ADMIN,
    Role.PAYROLL_SPECIALIST,
    Role.DEPARTMENT_MANAGER,
  ])(
    'uses the %s caller tenant and audit actor, not submitted provenance',
    async (role) => {
      const caller = router.createCaller(context(role));
      await caller.getDTR({
        employeeId: input.employeeId,
        startDate: input.date,
        endDate: input.date,
      });
      expect(getEmployeeDTR).toHaveBeenCalledWith(
        input.employeeId,
        'org-1',
        new Date(input.date),
        new Date(input.date),
      );
      await caller.adjustAttendance({
        ...input,
        organizationId: 'foreign-org',
      } as typeof input);
      const { correctionReason: _reason, ...values } = input;
      expect(correctAttendanceRecord).toHaveBeenCalledWith(
        {
          ...values,
          organizationId: 'org-1',
          date: new Date(input.date),
          expectedUpdatedAt: new Date(input.expectedUpdatedAt),
        },
        transaction,
      );
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            id: 'user-1',
            organizationId: 'org-1',
          }),
          action: 'UPDATE',
          entityType: 'DailyTimeRecord',
          entityId: saved.id,
          previousValue: previous,
          newValue: { ...saved, correctionReason: input.correctionReason },
        }),
        transaction,
      );
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    },
  );
  it('allows an employee to read only their linked record', async () => {
    const caller = router.createCaller(
      context(Role.EMPLOYEE, input.employeeId),
    );
    await caller.getDTR({
      employeeId: input.employeeId,
      startDate: input.date,
      endDate: input.date,
    });
    await expect(
      caller.getDTR({
        employeeId: '22222222-2222-4222-8222-222222222222',
        startDate: input.date,
        endDate: input.date,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(getEmployeeDTR).toHaveBeenCalledTimes(1);
    await expect(caller.listRecent({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('denies anonymous DTR reads', async () => {
    await expect(
      router.createCaller(context(null)).getDTR({
        employeeId: input.employeeId,
        startDate: input.date,
        endDate: input.date,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('audits a new record as CREATE with no fabricated previous values', async () => {
    correctAttendanceRecord.mockResolvedValue({
      previous: null,
      record: saved,
    });
    await router
      .createCaller(context(Role.HR_ADMIN))
      .adjustAttendance({ ...input, expectedUpdatedAt: null });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', previousValue: null }),
      transaction,
    );
  });
  it.each([
    new ConflictException('Reload the DTR'),
    new Prisma.PrismaClientKnownRequestError('private serialization detail', {
      code: 'P2034',
      clientVersion: '6',
    }),
  ])('maps stale and concurrent requests to conflicts', async (error) => {
    correctAttendanceRecord.mockRejectedValue(error);
    await expect(
      router.createCaller(context(Role.HR_ADMIN)).adjustAttendance(input),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(record).not.toHaveBeenCalled();
  });
  it('distinguishes inaccessible employee reads from an empty date range', async () => {
    getEmployeeDTR.mockRejectedValue(
      new NotFoundException('Employee not found'),
    );
    await expect(
      router.createCaller(context(Role.HR_ADMIN)).getDTR({
        employeeId: input.employeeId,
        startDate: input.date,
        endDate: input.date,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('rejects an audit failure without exposing storage internals', async () => {
    record.mockRejectedValue(new Error('private audit connection information'));
    await expect(
      router.createCaller(context(Role.HR_ADMIN)).adjustAttendance(input),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Timekeeping request failed. Please retry.',
    });
  });
});
