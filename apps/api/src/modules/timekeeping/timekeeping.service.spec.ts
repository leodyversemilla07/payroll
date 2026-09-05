import { UnprocessableEntityException } from '@nestjs/common';
import { summarizeAttendanceRecords } from './timekeeping.service';

type AttendanceRecord = Parameters<
  typeof summarizeAttendanceRecords
>[0][number];

function attendanceRecord(
  overrides: Partial<AttendanceRecord> = {},
): AttendanceRecord {
  return {
    dayType: 'REGULAR_WORKDAY',
    actualWorkedMinutes: 480,
    tardinessMinutes: 0,
    undertimeMinutes: 0,
    overtimeMinutes: 0,
    nightDiffMinutes: 0,
    isApproved: true,
    isAbsent: false,
    ...overrides,
  };
}

describe('summarizeAttendanceRecords', () => {
  it('classifies base time, overtime, holidays, and rest days without double counting', () => {
    const summary = summarizeAttendanceRecords([
      attendanceRecord({
        actualWorkedMinutes: 600,
        overtimeMinutes: 120,
        nightDiffMinutes: 60,
      }),
      attendanceRecord({
        dayType: 'REST_DAY',
        actualWorkedMinutes: 540,
        overtimeMinutes: 60,
        nightDiffMinutes: 30,
      }),
      attendanceRecord({
        dayType: 'SPECIAL_NON_WORKING_HOLIDAY',
        actualWorkedMinutes: 480,
      }),
      attendanceRecord({
        dayType: 'REGULAR_HOLIDAY',
        actualWorkedMinutes: 600,
        overtimeMinutes: 120,
        nightDiffMinutes: 45,
      }),
      attendanceRecord({
        dayType: 'REGULAR_HOLIDAY',
        actualWorkedMinutes: 0,
      }),
    ]);

    expect(summary.regularHoursWorked).toBe(8);
    expect(summary.regularOvertimeHours).toBe(2);
    expect(summary.restDayHours).toBe(8);
    expect(summary.restDayOvertimeHours).toBe(1);
    expect(summary.specialHolidayHours).toBe(8);
    expect(summary.regularHolidayHours).toBe(8);
    expect(summary.regularHolidayOvertimeHours).toBe(2);
    expect(summary.regularHolidayUnworkedDays).toBe(1);
    expect(summary.regularNightDiffHours).toBe(1);
    expect(summary.restDayNightDiffHours).toBe(0.5);
    expect(summary.holidayNightDiffHours).toBe(0.75);
  });

  it('counts absences only on ordinary paid workdays', () => {
    const summary = summarizeAttendanceRecords([
      attendanceRecord({ isAbsent: true }),
      attendanceRecord({
        dayType: 'SPECIAL_WORKING_HOLIDAY',
        isAbsent: true,
      }),
      attendanceRecord({ dayType: 'REST_DAY', isAbsent: true }),
      attendanceRecord({ dayType: 'REGULAR_HOLIDAY', isAbsent: true }),
    ]);

    expect(summary.absentDays).toBe(2);
  });

  it('rejects an empty cutoff instead of assuming full attendance', () => {
    expect(() => summarizeAttendanceRecords([])).toThrow(
      'Payroll cannot proceed without attendance records for the cutoff',
    );
  });

  it('rejects payroll summaries containing unapproved records', () => {
    expect(() =>
      summarizeAttendanceRecords([attendanceRecord({ isApproved: false })]),
    ).toThrow(UnprocessableEntityException);
  });

  it('rejects double holidays until an explicit rate breakdown is available', () => {
    expect(() =>
      summarizeAttendanceRecords([
        attendanceRecord({ dayType: 'DOUBLE_HOLIDAY' }),
      ]),
    ).toThrow(
      'Double-holiday payroll requires an explicit approved rate breakdown',
    );
  });
});
