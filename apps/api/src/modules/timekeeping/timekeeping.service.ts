import { Injectable } from "@nestjs/common";
import { prisma } from "@workspace/db";
import type { AttendanceSummary } from "@workspace/payroll-engine";

@Injectable()
export class TimekeepingService {
  async getEmployeeDTR(employeeId: string, startDate: Date, endDate: Date) {
    return prisma.dailyTimeRecord.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: "asc" },
    });
  }

  async getCutoffAttendanceSummary(employeeId: string, startDate: Date, endDate: Date): Promise<AttendanceSummary> {
    const records = await prisma.dailyTimeRecord.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    let regularMinutes = 0;
    let tardinessMinutes = 0;
    let undertimeMinutes = 0;
    let absentDays = 0;
    let regularOvertimeMinutes = 0;
    let restDayMinutes = 0;
    let restDayOTMinutes = 0;
    let specialHolidayMinutes = 0;
    let specialHolidayOTMinutes = 0;
    let regularHolidayMinutes = 0;
    let regularHolidayOTMinutes = 0;
    let regularNightDiffMinutes = 0;

    for (const r of records) {
      if (r.isAbsent) {
        absentDays += 1;
        continue;
      }

      regularMinutes += r.actualWorkedMinutes;
      tardinessMinutes += r.tardinessMinutes;
      undertimeMinutes += r.undertimeMinutes;
      regularOvertimeMinutes += r.overtimeMinutes;
      regularNightDiffMinutes += r.nightDiffMinutes;
      restDayOTMinutes += r.restDayOTMinutes;
      specialHolidayMinutes += r.specialHolidayMinutes;
      regularHolidayMinutes += r.regularHolidayMinutes;
    }

    return {
      regularHoursWorked: regularMinutes / 60,
      tardinessMinutes,
      undertimeMinutes,
      absentDays,
      regularOvertimeHours: regularOvertimeMinutes / 60,
      restDayHours: restDayMinutes / 60,
      restDayOvertimeHours: restDayOTMinutes / 60,
      specialHolidayHours: specialHolidayMinutes / 60,
      specialHolidayOvertimeHours: specialHolidayOTMinutes / 60,
      specialHolidayRestDayHours: 0,
      specialHolidayRestDayOvertimeHours: 0,
      regularHolidayHours: regularHolidayMinutes / 60,
      regularHolidayOvertimeHours: regularHolidayOTMinutes / 60,
      regularHolidayRestDayHours: 0,
      regularHolidayRestDayOvertimeHours: 0,
      regularNightDiffHours: regularNightDiffMinutes / 60,
      overtimeNightDiffHours: 0,
      restDayNightDiffHours: 0,
      holidayNightDiffHours: 0,
    };
  }

  async recordPunch(employeeId: string, date: Date, timeIn?: Date, timeOut?: Date) {
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
}
