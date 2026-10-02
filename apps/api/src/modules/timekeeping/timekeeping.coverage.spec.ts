import { TimekeepingService } from './timekeeping.service';

function record(date: string, overrides = {}) {
  return {
    date: new Date(date),
    dayType: 'REGULAR_WORKDAY',
    actualWorkedMinutes: 480,
    tardinessMinutes: 0,
    undertimeMinutes: 0,
    overtimeMinutes: 0,
    nightDiffMinutes: 0,
    restDayOTMinutes: 0,
    specialHolidayMinutes: 0,
    regularHolidayMinutes: 0,
    timeIn: null,
    timeOut: null,
    isApproved: true,
    isAbsent: false,
    ...overrides,
  };
}

function database(
  records: ReturnType<typeof record>[],
  leaves: unknown[] = [],
) {
  return {
    dailyTimeRecord: { findMany: jest.fn().mockResolvedValue(records) },
    leaveRequest: { findMany: jest.fn().mockResolvedValue(leaves) },
  };
}

function summary(
  db: ReturnType<typeof database>,
  start = '2026-09-07',
  end = '2026-09-11',
) {
  return new TimekeepingService().getCutoffAttendanceSummary(
    'employee-1',
    'org-1',
    new Date(start),
    new Date(end),
    db as never,
  );
}

const weekdays = [
  '2026-09-07',
  '2026-09-08',
  '2026-09-09',
  '2026-09-10',
  '2026-09-11',
] as const;

describe('regular payroll weekday coverage', () => {
  it('rejects a sparse cutoff and names the missing dates', async () => {
    await expect(summary(database([record(weekdays[0])]))).rejects.toThrow(
      '4 missing date(s) (2026-09-08, 2026-09-09, 2026-09-10, 2026-09-11)',
    );
  });

  it('accepts every approved weekday without requiring weekend DTRs', async () => {
    const db = database(weekdays.map((date) => record(date)));
    expect(await summary(db, '2026-09-05', '2026-09-13')).toMatchObject({
      regularHoursWorked: 40,
      absentDays: 0,
    });
    expect(db.dailyTimeRecord.findMany).toHaveBeenCalledWith({
      where: {
        employeeId: 'employee-1',
        employee: { organizationId: 'org-1' },
        date: { gte: new Date('2026-09-05'), lte: new Date('2026-09-13') },
      },
    });
  });

  it('does not confuse a Saturday shift with a missing weekday', async () => {
    await expect(summary(database([record('2026-09-12')]))).rejects.toThrow(
      '5 missing date(s)',
    );
  });

  it('accepts an explicit approved absence but never invents one', async () => {
    const rows = weekdays.map((date) => record(date));
    rows[2] = record(weekdays[2], { isAbsent: true, actualWorkedMinutes: 0 });
    expect(await summary(database(rows))).toMatchObject({
      regularHoursWorked: 32,
      absentDays: 1,
    });
  });

  it.each(['REST_DAY', 'REGULAR_HOLIDAY', 'SPECIAL_NON_WORKING_HOLIDAY'])(
    'accepts an explicit approved weekday %s exception',
    async (dayType) => {
      const rows = weekdays.map((date) => record(date));
      rows[2] = record(weekdays[2], { dayType, actualWorkedMinutes: 0 });
      expect(await summary(database(rows))).toMatchObject({ absentDays: 0 });
    },
  );

  it('rejects an unapproved record even when every date exists', async () => {
    const rows = weekdays.map((date) => record(date));
    rows[2] = record(weekdays[2], { isApproved: false });
    await expect(summary(database(rows))).rejects.toThrow(
      'unapproved attendance',
    );
  });

  it.each(['REGULAR_WORKDAY', 'SPECIAL_WORKING_HOLIDAY'])(
    'rejects a zero-work %s placeholder without an explicit absence',
    async (dayType) => {
      const rows = weekdays.map((date) => record(date));
      rows[2] = record(weekdays[2], { dayType, actualWorkedMinutes: 0 });
      await expect(summary(database(rows))).rejects.toThrow(
        'zero-work weekday DTR(s) (2026-09-09)',
      );
    },
  );

  it('allows approved full-day paid leave to cover a missing weekday', async () => {
    const leave = {
      startDate: new Date(weekdays[2]),
      endDate: new Date(weekdays[2]),
      daysCount: 1,
      partialDate: null,
    };
    const rows = weekdays
      .filter((_, index) => index !== 2)
      .map((date) => record(date));
    expect(await summary(database(rows, [leave]))).toMatchObject({
      regularHoursWorked: 32,
      paidLeaveDays: 1,
      absentDays: 0,
    });
    await expect(summary(database(rows))).rejects.toThrow(
      '1 missing date(s) (2026-09-09)',
    );
  });

  it('allows a cutoff consisting entirely of approved paid leave', async () => {
    const leave = {
      startDate: new Date(weekdays[0]),
      endDate: new Date(weekdays[4]),
      daysCount: 5,
      partialDate: null,
    };
    expect(await summary(database([], [leave]))).toMatchObject({
      regularHoursWorked: 0,
      paidLeaveDays: 5,
      absentDays: 0,
    });
  });

  it('does not use one paid-leave date to cover the rest of the cutoff', async () => {
    const leave = {
      startDate: new Date(weekdays[2]),
      endDate: new Date(weekdays[2]),
      daysCount: 1,
      partialDate: null,
    };
    await expect(summary(database([], [leave]))).rejects.toThrow(
      '4 missing date(s)',
    );
  });
});
