import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type DailyTimeRecord, type Prisma, prisma } from '@workspace/db';
import type { AttendanceSummary } from '@workspace/payroll-engine';

@Injectable()
export class TimekeepingService {
  async listRecentRecords(organizationId: string, limit = 50) {
    return prisma.dailyTimeRecord.findMany({
      where: { employee: { organizationId } },
      take: limit,
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  async getEmployeeDTR(
    employeeId: string,
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ) {
    return prisma.dailyTimeRecord.findMany({
      where: {
        employeeId,
        employee: { organizationId },
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  async getCutoffAttendanceSummary(
    employeeId: string,
    organizationId: string,
    startDate: Date,
    endDate: Date,
    database: Pick<
      Prisma.TransactionClient,
      'dailyTimeRecord' | 'leaveRequest'
    > = prisma,
  ): Promise<AttendanceSummary> {
    const records = await database.dailyTimeRecord.findMany({
      where: {
        employeeId,
        employee: { organizationId },
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const paidLeaves = await database.leaveRequest.findMany({
      where: {
        employeeId,
        employee: { organizationId },
        status: 'APPROVED',
        isPaid: true,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });

    // A full paid-leave day replaces the DTR for that date; it is not worked
    // time, but it must not create an unpaid absence either. A half-day
    // request (daysCount one half day short of the scheduled weekdays) names
    // its partial date explicitly: that date keeps its real DTR — worked
    // minutes up to half a standard shift still count as hours worked — and
    // earns a half-day credit on top. Without a shift calendar only whole
    // Mon–Fri days plus one explicit half day are supported. Fail closed for
    // other fractions, overlapping or ambiguous schedules rather than
    // silently overpaying.
    const HALF_SHIFT_MINUTES = 240;
    const paidLeaveDates = new Set<number>();
    const halfLeaveDates = new Set<number>();
    for (const leave of paidLeaves) {
      const start = leave.startDate.getTime();
      const end = leave.endDate.getTime();
      if (start > end || end - start > 366 * 86_400_000) {
        throw new UnprocessableEntityException(
          'Paid leave date range requires manual reconciliation',
        );
      }
      const daysCount = Number(leave.daysCount);
      const partialTime = leave.partialDate?.getTime() ?? null;
      let workingDays = 0;
      for (let day = start; day <= end; day += 86_400_000) {
        const weekday = new Date(day).getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        workingDays += 1;
        if (day === partialTime) continue;
        if (day < startDate.getTime() || day > endDate.getTime()) continue;
        if (paidLeaveDates.has(day) || halfLeaveDates.has(day)) {
          throw new UnprocessableEntityException(
            'Overlapping paid leave requests cannot be processed twice',
          );
        }
        paidLeaveDates.add(day);
      }
      if (partialTime !== null) {
        const partialWeekday = new Date(partialTime).getUTCDay();
        if (
          partialWeekday === 0 ||
          partialWeekday === 6 ||
          partialTime < start ||
          partialTime > end
        ) {
          throw new UnprocessableEntityException(
            'Half-day leave date must be a scheduled weekday inside the request range; reconcile manually',
          );
        }
        if (daysCount !== workingDays - 0.5) {
          throw new UnprocessableEntityException(
            'Paid leave credits must match full scheduled workdays less one half day; reconcile partial days manually',
          );
        }
        if (
          paidLeaveDates.has(partialTime) ||
          halfLeaveDates.has(partialTime)
        ) {
          throw new UnprocessableEntityException(
            'Overlapping paid leave requests cannot be processed twice',
          );
        }
        if (
          partialTime >= startDate.getTime() &&
          partialTime <= endDate.getTime()
        ) {
          halfLeaveDates.add(partialTime);
        }
      } else if (workingDays === 0 || daysCount !== workingDays) {
        throw new UnprocessableEntityException(
          'Paid leave credits must match full scheduled workdays; reconcile partial days manually',
        );
      }
    }

    const recordsByDate = new Map(
      records.map((record) => [record.date.getTime(), record]),
    );
    for (const day of paidLeaveDates) {
      const record = recordsByDate.get(day);
      if (!record) continue;
      if (
        (record.dayType !== 'REGULAR_WORKDAY' &&
          record.dayType !== 'SPECIAL_WORKING_HOLIDAY') ||
        record.actualWorkedMinutes !== 0 ||
        record.overtimeMinutes !== 0 ||
        record.nightDiffMinutes !== 0 ||
        record.restDayOTMinutes !== 0 ||
        record.specialHolidayMinutes !== 0 ||
        record.regularHolidayMinutes !== 0 ||
        record.timeIn !== null ||
        record.timeOut !== null
      ) {
        throw new UnprocessableEntityException(
          'Paid leave conflicts with worked time or a holiday DTR; reconcile attendance before payroll',
        );
      }
    }
    for (const day of halfLeaveDates) {
      const record = recordsByDate.get(day);
      if (!record || record.isAbsent) {
        throw new UnprocessableEntityException(
          'Half-day leave requires a worked attendance record for the partial date; reconcile attendance before payroll',
        );
      }
      if (
        (record.dayType !== 'REGULAR_WORKDAY' &&
          record.dayType !== 'SPECIAL_WORKING_HOLIDAY') ||
        record.actualWorkedMinutes > HALF_SHIFT_MINUTES ||
        record.overtimeMinutes !== 0 ||
        record.nightDiffMinutes !== 0 ||
        record.restDayOTMinutes !== 0 ||
        record.specialHolidayMinutes !== 0 ||
        record.regularHolidayMinutes !== 0
      ) {
        throw new UnprocessableEntityException(
          'Half-day leave conflicts with overtime, holiday premiums, or more than a half shift worked; reconcile attendance before payroll',
        );
      }
    }

    const effectiveRecords = [
      ...records.filter((record) => !paidLeaveDates.has(record.date.getTime())),
      ...[...paidLeaveDates].map(() => ({
        dayType: 'REGULAR_WORKDAY' as const,
        actualWorkedMinutes: 0,
        tardinessMinutes: 0,
        undertimeMinutes: 0,
        overtimeMinutes: 0,
        nightDiffMinutes: 0,
        isApproved: true,
        isAbsent: false,
      })),
    ];
    const summary = summarizeAttendanceRecords(effectiveRecords);
    const paidLeaveDays = paidLeaveDates.size + halfLeaveDates.size * 0.5;
    return paidLeaveDays > 0 ? { ...summary, paidLeaveDays } : summary;
  }

  async recordPunch(
    employeeId: string,
    organizationId: string,
    date: Date,
    timeIn?: Date,
    timeOut?: Date,
  ) {
    await this.assertEmployeeInOrganization(employeeId, organizationId);

    return prisma.dailyTimeRecord.upsert({
      where: {
        employeeId_date: { employeeId, date },
      },
      update: { timeIn, timeOut },
      create: {
        employeeId,
        date,
        timeIn,
        timeOut,
      },
    });
  }

  async adjustAttendanceRecord(data: {
    employeeId: string;
    organizationId: string;
    date: Date;
    dayType?:
      | 'REGULAR_WORKDAY'
      | 'REST_DAY'
      | 'SPECIAL_NON_WORKING_HOLIDAY'
      | 'SPECIAL_WORKING_HOLIDAY'
      | 'REGULAR_HOLIDAY'
      | 'DOUBLE_HOLIDAY';
    timeIn?: Date;
    timeOut?: Date;
    actualWorkedMinutes: number;
    tardinessMinutes?: number;
    undertimeMinutes?: number;
    overtimeMinutes?: number;
    nightDiffMinutes?: number;
    isAbsent?: boolean;
    isApproved?: boolean;
  }) {
    await this.assertEmployeeInOrganization(
      data.employeeId,
      data.organizationId,
    );

    return prisma.dailyTimeRecord.upsert({
      where: {
        employeeId_date: { employeeId: data.employeeId, date: data.date },
      },
      update: {
        dayType: data.dayType,
        timeIn: data.timeIn,
        timeOut: data.timeOut,
        actualWorkedMinutes: data.actualWorkedMinutes,
        tardinessMinutes: data.tardinessMinutes ?? 0,
        undertimeMinutes: data.undertimeMinutes ?? 0,
        overtimeMinutes: data.overtimeMinutes ?? 0,
        nightDiffMinutes: data.nightDiffMinutes ?? 0,
        isAbsent: data.isAbsent ?? false,
        isApproved: data.isApproved ?? true,
      },
      create: {
        employeeId: data.employeeId,
        date: data.date,
        dayType: data.dayType || 'REGULAR_WORKDAY',
        timeIn: data.timeIn,
        timeOut: data.timeOut,
        actualWorkedMinutes: data.actualWorkedMinutes,
        tardinessMinutes: data.tardinessMinutes ?? 0,
        undertimeMinutes: data.undertimeMinutes ?? 0,
        overtimeMinutes: data.overtimeMinutes ?? 0,
        nightDiffMinutes: data.nightDiffMinutes ?? 0,
        isAbsent: data.isAbsent ?? false,
        isApproved: data.isApproved ?? true,
      },
    });
  }

  async importBiometricsCsv(csvContent: string, organizationId: string) {
    const { parseBiometricCsv, processBiometricLogs } = await import(
      '@workspace/payroll-engine'
    );
    const rawLogs = parseBiometricCsv(csvContent);
    const processedDays = processBiometricLogs(rawLogs);

    let importedDaysCount = 0;
    let anomalyCount = 0;

    for (const day of processedDays) {
      if (day.hasMissingPunch) {
        anomalyCount += 1;
      }

      const emp = await prisma.employee.findFirst({
        where: {
          employeeNumber: day.employeeNumber,
          organizationId,
        },
      });

      if (!emp) continue;

      await this.adjustAttendanceRecord({
        employeeId: emp.id,
        organizationId,
        date: new Date(day.dateStr),
        dayType: 'REGULAR_WORKDAY',
        timeIn: day.timeIn,
        timeOut: day.timeOut,
        actualWorkedMinutes: day.actualWorkedMinutes,
        tardinessMinutes: day.tardinessMinutes,
        undertimeMinutes: day.undertimeMinutes,
        overtimeMinutes: day.overtimeMinutes,
        nightDiffMinutes: day.nightDiffMinutes,
        isAbsent: false,
        isApproved: !day.hasMissingPunch,
      });

      importedDaysCount += 1;
    }

    return {
      totalPunchesParsed: rawLogs.length,
      daysImported: importedDaysCount,
      anomaliesDetected: anomalyCount,
      details: processedDays,
    };
  }

  private async assertEmployeeInOrganization(
    employeeId: string,
    organizationId: string,
  ): Promise<void> {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
  }
}

export function summarizeAttendanceRecords(
  records: Pick<
    DailyTimeRecord,
    | 'dayType'
    | 'actualWorkedMinutes'
    | 'tardinessMinutes'
    | 'undertimeMinutes'
    | 'overtimeMinutes'
    | 'nightDiffMinutes'
    | 'isApproved'
    | 'isAbsent'
  >[],
): AttendanceSummary {
  if (records.length === 0) {
    throw new UnprocessableEntityException(
      'Payroll cannot proceed without attendance records for the cutoff',
    );
  }

  const unapprovedCount = records.filter((record) => !record.isApproved).length;
  if (unapprovedCount > 0) {
    throw new UnprocessableEntityException(
      `Payroll cannot proceed with ${unapprovedCount} unapproved attendance record(s)`,
    );
  }

  if (records.some((record) => record.dayType === 'DOUBLE_HOLIDAY')) {
    throw new UnprocessableEntityException(
      'Double-holiday payroll requires an explicit approved rate breakdown',
    );
  }

  let regularMinutes = 0;
  let tardinessMinutes = 0;
  let undertimeMinutes = 0;
  let absentDays = 0;
  let regularOvertimeMinutes = 0;
  let restDayMinutes = 0;
  let restDayOvertimeMinutes = 0;
  let specialHolidayMinutes = 0;
  let specialHolidayOvertimeMinutes = 0;
  let regularHolidayMinutes = 0;
  let regularHolidayOvertimeMinutes = 0;
  let regularHolidayUnworkedDays = 0;
  let regularNightDiffMinutes = 0;
  let restDayNightDiffMinutes = 0;
  let holidayNightDiffMinutes = 0;

  for (const record of records) {
    const baseWorkedMinutes = Math.max(
      0,
      record.actualWorkedMinutes - record.overtimeMinutes,
    );

    if (record.isAbsent) {
      if (
        record.dayType === 'REGULAR_WORKDAY' ||
        record.dayType === 'SPECIAL_WORKING_HOLIDAY'
      ) {
        absentDays += 1;
      }
      continue;
    }

    switch (record.dayType) {
      case 'REGULAR_WORKDAY':
      case 'SPECIAL_WORKING_HOLIDAY':
        regularMinutes += baseWorkedMinutes;
        regularOvertimeMinutes += record.overtimeMinutes;
        regularNightDiffMinutes += record.nightDiffMinutes;
        tardinessMinutes += record.tardinessMinutes;
        undertimeMinutes += record.undertimeMinutes;
        break;
      case 'REST_DAY':
        restDayMinutes += baseWorkedMinutes;
        restDayOvertimeMinutes += record.overtimeMinutes;
        restDayNightDiffMinutes += record.nightDiffMinutes;
        break;
      case 'SPECIAL_NON_WORKING_HOLIDAY':
        specialHolidayMinutes += baseWorkedMinutes;
        specialHolidayOvertimeMinutes += record.overtimeMinutes;
        holidayNightDiffMinutes += record.nightDiffMinutes;
        break;
      case 'REGULAR_HOLIDAY':
        if (baseWorkedMinutes === 0 && record.overtimeMinutes === 0) {
          regularHolidayUnworkedDays += 1;
        } else {
          regularHolidayMinutes += baseWorkedMinutes;
          regularHolidayOvertimeMinutes += record.overtimeMinutes;
          holidayNightDiffMinutes += record.nightDiffMinutes;
        }
        break;
      case 'DOUBLE_HOLIDAY':
        break;
    }
  }

  return {
    regularHoursWorked: regularMinutes / 60,
    tardinessMinutes,
    undertimeMinutes,
    absentDays,
    regularOvertimeHours: regularOvertimeMinutes / 60,
    restDayHours: restDayMinutes / 60,
    restDayOvertimeHours: restDayOvertimeMinutes / 60,
    specialHolidayHours: specialHolidayMinutes / 60,
    specialHolidayOvertimeHours: specialHolidayOvertimeMinutes / 60,
    specialHolidayRestDayHours: 0,
    specialHolidayRestDayOvertimeHours: 0,
    regularHolidayHours: regularHolidayMinutes / 60,
    regularHolidayOvertimeHours: regularHolidayOvertimeMinutes / 60,
    regularHolidayUnworkedDays,
    regularHolidayRestDayHours: 0,
    regularHolidayRestDayOvertimeHours: 0,
    regularNightDiffHours: regularNightDiffMinutes / 60,
    overtimeNightDiffHours: 0,
    restDayNightDiffHours: restDayNightDiffMinutes / 60,
    holidayNightDiffHours: holidayNightDiffMinutes / 60,
  };
}

export interface AbsenceDayRecord {
  date: Date | string;
  dayType: string;
  isAbsent: boolean;
}

/**
 * Counts unpaid absence days in a calendar year for 13th-month LWOP
 * deduction. Mirrors summarizeAttendanceRecords: only absences on regular
 * workdays (and special working holidays) reduce the 13th-month base.
 */
export function countUnpaidAbsenceDays(
  records: AbsenceDayRecord[],
  taxYear: number,
): number {
  const yearStart = Date.UTC(taxYear, 0, 1);
  const yearEnd = Date.UTC(taxYear + 1, 0, 1);
  let days = 0;

  for (const record of records) {
    if (!record.isAbsent) {
      continue;
    }
    const time =
      record.date instanceof Date
        ? record.date.getTime()
        : Date.parse(record.date);
    if (Number.isNaN(time) || time < yearStart || time >= yearEnd) {
      continue;
    }
    if (
      record.dayType === 'REGULAR_WORKDAY' ||
      record.dayType === 'SPECIAL_WORKING_HOLIDAY'
    ) {
      days += 1;
    }
  }

  return days;
}
