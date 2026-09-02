import { Injectable } from "@nestjs/common";
import { prisma } from "@workspace/db";
import type { AttendanceSummary } from "@workspace/payroll-engine";

@Injectable()
export class TimekeepingService {
  async listRecentRecords(limit = 50) {
    return prisma.dailyTimeRecord.findMany({
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
      orderBy: { date: "desc" },
    });
  }

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

  async adjustAttendanceRecord(data: {
    employeeId: string;
    date: Date;
    dayType?: "REGULAR_WORKDAY" | "REST_DAY" | "SPECIAL_NON_WORKING_HOLIDAY" | "REGULAR_HOLIDAY" | "DOUBLE_HOLIDAY";
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
        dayType: data.dayType || "REGULAR_WORKDAY",
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

  async importBiometricsCsv(csvContent: string) {
    const { parseBiometricCsv, processBiometricLogs } = await import("@workspace/payroll-engine");
    const rawLogs = parseBiometricCsv(csvContent);
    const processedDays = processBiometricLogs(rawLogs);

    let importedDaysCount = 0;
    let anomalyCount = 0;

    for (const day of processedDays) {
      if (day.hasMissingPunch) {
        anomalyCount += 1;
      }

      const emp = await prisma.employee.findUnique({
        where: { employeeNumber: day.employeeNumber },
      });

      if (!emp) continue;

      await this.adjustAttendanceRecord({
        employeeId: emp.id,
        date: new Date(day.dateStr),
        dayType: "REGULAR_WORKDAY",
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
}
