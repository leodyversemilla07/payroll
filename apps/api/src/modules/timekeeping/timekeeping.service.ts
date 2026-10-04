import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type DailyTimeRecord,
  type DayType,
  Prisma,
  prisma,
} from '@workspace/db';
import type {
  AttendanceSummary,
  ProcessedDtrDay,
} from '@workspace/payroll-engine';

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
    await this.assertEmployeeInOrganization(employeeId, organizationId);
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
      if (!record || record.isAbsent || record.actualWorkedMinutes <= 0) {
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
      ...records
        .filter((record) => !paidLeaveDates.has(record.date.getTime()))
        .map((record) =>
          halfLeaveDates.has(record.date.getTime())
            ? reconcileHalfDayDeductions(record)
            : record,
        ),
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
    assertCompleteWeekdayCoverage(records, paidLeaveDates, startDate, endDate);
    const paidLeaveDays = paidLeaveDates.size + halfLeaveDates.size * 0.5;
    return paidLeaveDays > 0 ? { ...summary, paidLeaveDays } : summary;
  }

  async recordPunch(
    employeeId: string,
    organizationId: string,
    date: Date,
    timeIn?: Date,
    timeOut?: Date,
    database?: Prisma.TransactionClient,
  ): Promise<DailyTimeRecord> {
    if (!database) {
      return prisma.$transaction(
        (transaction) =>
          this.recordPunch(
            employeeId,
            organizationId,
            date,
            timeIn,
            timeOut,
            transaction,
          ),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }
    await this.assertEmployeeInOrganization(
      employeeId,
      organizationId,
      database,
    );
    await this.assertAttendanceEditable(organizationId, date, database);

    return database.dailyTimeRecord.upsert({
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

  async correctAttendanceRecord(
    data: AttendanceCorrectionInput,
    database: Prisma.TransactionClient,
  ) {
    await this.assertEmployeeInOrganization(
      data.employeeId,
      data.organizationId,
      database,
    );
    await this.assertAttendanceEditable(
      data.organizationId,
      data.date,
      database,
    );
    const previous = await database.dailyTimeRecord.findUnique({
      where: {
        employeeId_date: { employeeId: data.employeeId, date: data.date },
      },
    });
    if (
      (previous?.updatedAt.getTime() ?? null) !==
      (data.expectedUpdatedAt?.getTime() ?? null)
    ) {
      throw new ConflictException(
        'Attendance changed since it was loaded. Reload the DTR before correcting it.',
      );
    }
    if (
      previous &&
      (previous.dayType === 'DOUBLE_HOLIDAY' ||
        previous.restDayOTMinutes ||
        previous.specialHolidayMinutes ||
        previous.regularHolidayMinutes)
    ) {
      throw new UnprocessableEntityException(
        'Double holidays and legacy premium breakdowns require manual reconciliation; this correction form cannot replace them.',
      );
    }
    const values = {
      dayType: data.dayType,
      timeIn: data.timeIn,
      timeOut: data.timeOut,
      actualWorkedMinutes: data.actualWorkedMinutes,
      tardinessMinutes: data.tardinessMinutes,
      undertimeMinutes: data.undertimeMinutes,
      overtimeMinutes: data.overtimeMinutes,
      nightDiffMinutes: data.nightDiffMinutes,
      isAbsent: data.isAbsent,
      isApproved: data.isApproved,
    };
    let record: DailyTimeRecord;
    if (previous) {
      const changed = await database.dailyTimeRecord.updateMany({
        where: { id: previous.id, updatedAt: previous.updatedAt },
        data: {
          ...values,
          updatedAt: new Date(
            Math.max(Date.now(), previous.updatedAt.getTime() + 1),
          ),
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Attendance changed since it was loaded. Reload the DTR before correcting it.',
        );
      record = await database.dailyTimeRecord.findUniqueOrThrow({
        where: { id: previous.id },
      });
    } else {
      record = await database.dailyTimeRecord.create({
        data: {
          employeeId: data.employeeId,
          date: data.date,
          ...values,
        },
      });
    }
    return { previous, record };
  }

  private async assertAttendanceEditable(
    organizationId: string,
    date: Date,
    database: Prisma.TransactionClient,
  ) {
    const consumed = await database.payrollRun.findFirst({
      where: {
        organizationId,
        cutoffSequence: { in: ['FIRST_CUTOFF', 'SECOND_CUTOFF'] },
        cutoffStartDate: { lte: date },
        cutoffEndDate: { gte: date },
        status: { not: 'CANCELLED' },
      },
      select: { id: true, status: true },
    });
    if (consumed) {
      throw new ConflictException(
        'This date is covered by a non-cancelled regular payroll run. Resolve payroll before changing attendance; disbursed payroll cannot be cancelled.',
      );
    }
  }

  async adjustAttendanceRecord(
    data: {
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
    },
    database?: Prisma.TransactionClient,
  ): Promise<DailyTimeRecord> {
    if (!database) {
      return prisma.$transaction(
        (transaction) => this.adjustAttendanceRecord(data, transaction),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }
    await this.assertEmployeeInOrganization(
      data.employeeId,
      data.organizationId,
      database,
    );
    await this.assertAttendanceEditable(
      data.organizationId,
      data.date,
      database,
    );

    return database.dailyTimeRecord.upsert({
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

  async importBiometricsCsv(
    csvContent: string,
    organizationId: string,
    database?: Prisma.TransactionClient,
  ): Promise<{
    totalPunchesParsed: number;
    daysImported: number;
    anomaliesDetected: number;
    details: ProcessedDtrDay[];
  }> {
    if (!database)
      return prisma.$transaction(
        (transaction) =>
          this.importBiometricsCsv(csvContent, organizationId, transaction),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 60_000,
        },
      );
    const { parseBiometricCsv, processBiometricLogs } = await import(
      '@workspace/payroll-engine'
    );
    let rawLogs: ReturnType<typeof parseBiometricCsv>;
    let processedDays: ReturnType<typeof processBiometricLogs>;
    try {
      rawLogs = parseBiometricCsv(csvContent);
      processedDays = processBiometricLogs(rawLogs);
    } catch (error) {
      if (error instanceof RangeError)
        throw new UnprocessableEntityException(error.message);
      throw error;
    }
    if (!rawLogs.length)
      throw new UnprocessableEntityException(
        'Biometric CSV contains no punch records',
      );

    let importedDaysCount = 0;
    let anomalyCount = 0;

    for (const day of processedDays) {
      if (day.hasMissingPunch) {
        anomalyCount += 1;
      }

      const emp = await database.employee.findFirst({
        where: {
          employeeNumber: day.employeeNumber,
          organizationId,
        },
      });

      if (!emp) continue;

      const holidayDayType = await this.getHolidayDayType(
        organizationId,
        new Date(day.dateStr),
        database,
      );
      const dayType: Exclude<DailyTimeRecord['dayType'], 'DOUBLE_HOLIDAY'> =
        holidayDayType === 'DOUBLE_HOLIDAY'
          ? 'REGULAR_HOLIDAY'
          : holidayDayType;

      await this.correctAttendanceRecord(
        {
          employeeId: emp.id,
          organizationId,
          expectedUpdatedAt: null,
          date: new Date(day.dateStr),
          dayType,
          timeIn: day.timeIn ?? null,
          timeOut: day.timeOut ?? null,
          actualWorkedMinutes: day.actualWorkedMinutes,
          tardinessMinutes: day.tardinessMinutes,
          undertimeMinutes: day.undertimeMinutes,
          overtimeMinutes: day.overtimeMinutes,
          nightDiffMinutes: day.nightDiffMinutes,
          isAbsent: false,
          // Import is not attendance approval: HR must confirm the shift, break,
          // holiday classification and punch anomalies through controlled review.
          isApproved: false,
        },
        database,
      );

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
    database: Pick<Prisma.TransactionClient, 'employee'> = prisma,
  ): Promise<void> {
    const employee = await database.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
  }

  private async getHolidayDayType(
    organizationId: string,
    date: Date,
    database: Prisma.TransactionClient,
  ): Promise<DayType> {
    const targetDate = new Date(
      `${date.toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    const exact = await database.holidayCalendar.findUnique({
      where: {
        organizationId_date: {
          organizationId,
          date: targetDate,
        },
      },
    });
    if (exact) return exact.dayType;

    const targetMonth = targetDate.getUTCMonth();
    const targetDay = targetDate.getUTCDate();
    const recurring = await database.holidayCalendar.findMany({
      where: {
        organizationId,
        isRecurring: true,
      },
    });
    const match = recurring.find((h) => {
      const hDate = new Date(h.date);
      return (
        hDate.getUTCMonth() === targetMonth && hDate.getUTCDate() === targetDay
      );
    });
    return match ? match.dayType : 'REGULAR_WORKDAY';
  }
}

export interface AttendanceCorrectionInput {
  employeeId: string;
  organizationId: string;
  date: Date;
  expectedUpdatedAt: Date | null;
  dayType: Exclude<DailyTimeRecord['dayType'], 'DOUBLE_HOLIDAY'>;
  timeIn: Date | null;
  timeOut: Date | null;
  actualWorkedMinutes: number;
  tardinessMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
  nightDiffMinutes: number;
  isAbsent: boolean;
  isApproved: boolean;
}

/**
 * The supported eight-hour weekday model credits four hours of paid leave.
 * Accept either full-shift deductions or explicitly leave-adjusted deductions.
 * Never subtract the credit twice or erase a real shortfall. Without an AM/PM
 * shift calendar, split/contradictory shortfalls require manual reconciliation.
 * This overlay does not modify the source DTR.
 */
function reconcileHalfDayDeductions(record: DailyTimeRecord): DailyTimeRecord {
  const paidHalfMinutes = 240;
  const remainingShortfall = paidHalfMinutes - record.actualWorkedMinutes;
  const { tardinessMinutes, undertimeMinutes } = record;
  const recordedShortfall = tardinessMinutes + undertimeMinutes;
  if (tardinessMinutes < 0 || undertimeMinutes < 0 || remainingShortfall < 0) {
    throw new UnprocessableEntityException(
      'Half-day attendance has invalid deduction minutes; reconcile manually',
    );
  }
  if (recordedShortfall === remainingShortfall) return record;
  if (recordedShortfall === remainingShortfall + paidHalfMinutes) {
    if (undertimeMinutes >= paidHalfMinutes)
      return {
        ...record,
        undertimeMinutes: undertimeMinutes - paidHalfMinutes,
      };
    if (tardinessMinutes >= paidHalfMinutes)
      return {
        ...record,
        tardinessMinutes: tardinessMinutes - paidHalfMinutes,
      };
  }
  throw new UnprocessableEntityException(
    'Half-day attendance deductions do not reconcile with worked minutes and the paid four-hour credit; reconcile the remaining half shift manually',
  );
}

/**
 * Regular payroll currently supports the same Mon–Fri schedule as its 261-day
 * rate divisor and leave overlay. Every weekday needs an explicit approved DTR
 * (including recorded holidays/rest exceptions/absences) or approved full-day
 * paid leave. Missing dates are never invented as attendance or absence.
 */
function assertCompleteWeekdayCoverage(
  records: Pick<
    DailyTimeRecord,
    'date' | 'dayType' | 'actualWorkedMinutes' | 'isAbsent' | 'isApproved'
  >[],
  paidLeaveDates: ReadonlySet<number>,
  startDate: Date,
  endDate: Date,
) {
  const recordsByDate = new Map(
    records.map((record) => [record.date.getTime(), record]),
  );
  const missing: string[] = [];
  const unresolved: string[] = [];
  for (
    let day = startDate.getTime();
    day <= endDate.getTime();
    day += 86_400_000
  ) {
    if ([0, 6].includes(new Date(day).getUTCDay()) || paidLeaveDates.has(day))
      continue;
    const record = recordsByDate.get(day);
    const date = new Date(day).toISOString().slice(0, 10);
    if (!record?.isApproved) missing.push(date);
    else if (
      (record.dayType === 'REGULAR_WORKDAY' ||
        record.dayType === 'SPECIAL_WORKING_HOLIDAY') &&
      !record.isAbsent &&
      record.actualWorkedMinutes === 0
    )
      unresolved.push(date);
  }
  if (missing.length) {
    throw new UnprocessableEntityException(
      `Payroll requires complete approved weekday attendance or approved full-day paid leave: ${missing.length} missing date(s) (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}). Record and approve the missing DTRs; do not assume attendance or absence.`,
    );
  }
  if (unresolved.length) {
    throw new UnprocessableEntityException(
      `Payroll cannot resolve ${unresolved.length} zero-work weekday DTR(s) (${unresolved.slice(0, 5).join(', ')}). Record an explicit absence, reconcile worked time, or approve supported paid leave.`,
    );
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
