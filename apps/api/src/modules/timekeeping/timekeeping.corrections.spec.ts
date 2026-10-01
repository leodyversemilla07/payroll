import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, prisma } from '@workspace/db';
import {
  type AttendanceCorrectionInput,
  TimekeepingService,
} from './timekeeping.service';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: {
    $transaction: jest.fn(),
    employee: { findFirst: jest.fn() },
    payrollRun: { findFirst: jest.fn() },
    dailyTimeRecord: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));
const updatedAt = new Date('2026-09-10T08:00:00Z');
const input: AttendanceCorrectionInput = {
  employeeId: 'employee-1',
  organizationId: 'org-1',
  date: new Date('2026-09-10'),
  expectedUpdatedAt: updatedAt,
  dayType: 'REGULAR_WORKDAY',
  timeIn: null,
  timeOut: null,
  actualWorkedMinutes: 450,
  tardinessMinutes: 30,
  undertimeMinutes: 0,
  overtimeMinutes: 0,
  nightDiffMinutes: 0,
  isAbsent: false,
  isApproved: false,
};
const previous = {
  id: 'record-1',
  updatedAt,
  dayType: 'REGULAR_WORKDAY',
  restDayOTMinutes: 0,
  specialHolidayMinutes: 0,
  regularHolidayMinutes: 0,
};

describe('controlled attendance corrections', () => {
  const service = new TimekeepingService();
  const database = prisma as unknown as Prisma.TransactionClient;
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(prisma.employee.findFirst)
      .mockResolvedValue({ id: 'employee-1' } as never);
    jest.mocked(prisma.payrollRun.findFirst).mockResolvedValue(null);
    jest
      .mocked(prisma.dailyTimeRecord.findUnique)
      .mockResolvedValue(previous as never);
    jest
      .mocked(prisma.dailyTimeRecord.updateMany)
      .mockResolvedValue({ count: 1 });
    jest
      .mocked(prisma.dailyTimeRecord.findUniqueOrThrow)
      .mockResolvedValue({ ...previous, ...input } as never);
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (tx: Prisma.TransactionClient) => Promise<unknown>)(
          database,
        ),
      );
  });

  it('updates exactly the loaded version and explicitly clears nullable punches', async () => {
    const result = await service.correctAttendanceRecord(input, database);
    expect(result.previous).toEqual(previous);
    expect(prisma.dailyTimeRecord.updateMany).toHaveBeenCalledWith({
      where: { id: previous.id, updatedAt },
      data: expect.objectContaining({
        timeIn: null,
        timeOut: null,
        actualWorkedMinutes: 450,
        isApproved: false,
        updatedAt: expect.any(Date),
      }),
    });
    const written = jest.mocked(prisma.dailyTimeRecord.updateMany).mock
      .calls[0][0].data.updatedAt as Date;
    expect(written.getTime()).toBeGreaterThan(updatedAt.getTime());
  });
  it('creates a record only when the client explicitly expects no existing version', async () => {
    jest.mocked(prisma.dailyTimeRecord.findUnique).mockResolvedValue(null);
    jest
      .mocked(prisma.dailyTimeRecord.create)
      .mockResolvedValue({ id: 'new-record' } as never);
    const result = await service.correctAttendanceRecord(
      { ...input, expectedUpdatedAt: null },
      database,
    );
    expect(result.previous).toBeNull();
    expect(prisma.dailyTimeRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: input.employeeId,
        date: input.date,
        actualWorkedMinutes: 450,
        isApproved: false,
      }),
    });
  });
  it.each([null, new Date('2026-09-10T07:00:00Z')])(
    'rejects a stale or missing expected version: %s',
    async (expectedUpdatedAt) => {
      await expect(
        service.correctAttendanceRecord(
          { ...input, expectedUpdatedAt },
          database,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.dailyTimeRecord.updateMany).not.toHaveBeenCalled();
      expect(prisma.dailyTimeRecord.create).not.toHaveBeenCalled();
    },
  );
  it('rejects a row changed between read and compare-and-update', async () => {
    jest
      .mocked(prisma.dailyTimeRecord.updateMany)
      .mockResolvedValue({ count: 0 });
    await expect(
      service.correctAttendanceRecord(input, database),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('does not read or write a foreign employee record', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue(null);
    await expect(
      service.correctAttendanceRecord(input, database),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.employee.findFirst).toHaveBeenCalledWith({
      where: { id: input.employeeId, organizationId: input.organizationId },
      select: { id: true },
    });
    expect(prisma.dailyTimeRecord.findUnique).not.toHaveBeenCalled();
  });
  it('distinguishes an inaccessible employee from an empty DTR range', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue(null);
    await expect(
      service.getEmployeeDTR(
        input.employeeId,
        input.organizationId,
        input.date,
        input.date,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.dailyTimeRecord.findMany).not.toHaveBeenCalled();
  });
  it.each(['PROCESSING', 'AUDITED', 'APPROVED', 'DISBURSED'])(
    'blocks dates consumed by %s regular payroll',
    async (status) => {
      jest
        .mocked(prisma.payrollRun.findFirst)
        .mockResolvedValue({ id: 'run-1', status } as never);
      await expect(
        service.correctAttendanceRecord(input, database),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.payrollRun.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: input.organizationId,
          cutoffSequence: { in: ['FIRST_CUTOFF', 'SECOND_CUTOFF'] },
          cutoffStartDate: { lte: input.date },
          cutoffEndDate: { gte: input.date },
          status: { not: 'CANCELLED' },
        },
        select: { id: true, status: true },
      });
      expect(prisma.dailyTimeRecord.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each([
    { dayType: 'DOUBLE_HOLIDAY' },
    { restDayOTMinutes: 1 },
    { specialHolidayMinutes: 1 },
    { regularHolidayMinutes: 1 },
  ])(
    'does not overwrite an unsupported premium breakdown: %j',
    async (override) => {
      jest
        .mocked(prisma.dailyTimeRecord.findUnique)
        .mockResolvedValue({ ...previous, ...override } as never);
      await expect(
        service.correctAttendanceRecord(input, database),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    },
  );
  it('also protects legacy punch and import writers from modifying processed cutoffs', async () => {
    jest
      .mocked(prisma.payrollRun.findFirst)
      .mockResolvedValue({ id: 'run-1', status: 'DISBURSED' } as never);
    await expect(
      service.recordPunch(input.employeeId, input.organizationId, input.date),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.adjustAttendanceRecord({
        employeeId: input.employeeId,
        organizationId: input.organizationId,
        date: input.date,
        actualWorkedMinutes: 480,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.dailyTimeRecord.upsert).not.toHaveBeenCalled();
  });
});
