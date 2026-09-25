import { UnprocessableEntityException } from '@nestjs/common';
import { TimekeepingService } from './timekeeping.service';

const cutoffStart = new Date('2026-09-01');
const cutoffEnd = new Date('2026-09-15');

function mockDatabase() {
  const record = {
    date: new Date('2026-09-10'),
    dayType: 'REGULAR_WORKDAY',
    actualWorkedMinutes: 0,
    tardinessMinutes: 0,
    undertimeMinutes: 0,
    overtimeMinutes: 0,
    nightDiffMinutes: 0,
    restDayOTMinutes: 0,
    specialHolidayMinutes: 0,
    regularHolidayMinutes: 0,
    timeIn: null as Date | null,
    timeOut: null as Date | null,
    isApproved: false,
    isAbsent: true,
  };
  const leave = {
    startDate: new Date('2026-09-10'),
    endDate: new Date('2026-09-10'),
    daysCount: 1,
  };
  const db = {
    dailyTimeRecord: { findMany: jest.fn().mockResolvedValue([record]) },
    leaveRequest: { findMany: jest.fn().mockResolvedValue([leave]) },
  };
  return { db, record, leave };
}

function summary(db: ReturnType<typeof mockDatabase>['db']) {
  return new TimekeepingService().getCutoffAttendanceSummary(
    'employee-1',
    'org-1',
    cutoffStart,
    cutoffEnd,
    db as never,
  );
}

describe('paid-leave payroll reconciliation', () => {
  it('converts an approved paid absence into a full-day credit, not hours worked', async () => {
    const { db } = mockDatabase();
    const result = await summary(db);

    expect(result).toMatchObject({
      paidLeaveDays: 1,
      absentDays: 0,
      regularHoursWorked: 0,
    });
    expect(db.leaveRequest.findMany).toHaveBeenCalledWith({
      where: {
        employeeId: 'employee-1',
        employee: { organizationId: 'org-1' },
        status: 'APPROVED',
        isPaid: true,
        startDate: { lte: cutoffEnd },
        endDate: { gte: cutoffStart },
      },
    });
  });

  it('does not charge tardiness on an approved full-day leave', async () => {
    const { db, record } = mockDatabase();
    record.tardinessMinutes = 60;
    expect(await summary(db)).toMatchObject({
      paidLeaveDays: 1,
      tardinessMinutes: 0,
    });
  });

  it('credits an approved leave without an existing DTR', async () => {
    const { db } = mockDatabase();
    db.dailyTimeRecord.findMany.mockResolvedValue([]);
    expect(await summary(db)).toMatchObject({
      paidLeaveDays: 1,
      absentDays: 0,
    });
  });

  it('rejects a worked shift overlapping paid leave', async () => {
    const { db, record } = mockDatabase();
    record.actualWorkedMinutes = 480;
    await expect(summary(db)).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects partial-day and overlapping requests without double credit', async () => {
    const { db, leave } = mockDatabase();
    leave.daysCount = 0.5;
    await expect(summary(db)).rejects.toThrow('full scheduled workdays');

    leave.daysCount = 1;
    db.leaveRequest.findMany.mockResolvedValue([leave, { ...leave }]);
    await expect(summary(db)).rejects.toThrow('Overlapping paid leave');
  });

  it('handles a Friday–Monday leave across a weekend as two scheduled days', async () => {
    const { db, leave } = mockDatabase();
    leave.startDate = new Date('2026-09-11');
    leave.endDate = new Date('2026-09-14');
    leave.daysCount = 2;
    db.dailyTimeRecord.findMany.mockResolvedValue([]);
    expect(await summary(db)).toMatchObject({ paidLeaveDays: 2 });
  });

  it('preserves the normal unapproved-DTR guard on non-leave days', async () => {
    const { db, record } = mockDatabase();
    db.dailyTimeRecord.findMany.mockResolvedValue([
      record,
      { ...record, date: new Date('2026-09-09') },
    ]);
    await expect(summary(db)).rejects.toThrow('unapproved attendance');
  });
});
