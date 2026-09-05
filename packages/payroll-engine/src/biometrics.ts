/**
 * Biometric Punch Log Entry
 */
export interface RawBiometricLog {
  employeeNumber: string;
  timestamp: Date;
  punchType?: "CHECK_IN" | "CHECK_OUT" | "AUTO";
}

export interface ShiftSchedule {
  expectedTimeIn: string; // "09:00"
  expectedTimeOut: string; // "18:00"
  gracePeriodMinutes: number; // e.g. 5 mins
  breakDurationMinutes: number; // 60 mins lunch break
  nightDiffStartHour: number; // 22 (10 PM)
  nightDiffEndHour: number; // 6 (6 AM)
}

export const DEFAULT_STANDARD_SHIFT: ShiftSchedule = {
  expectedTimeIn: "09:00",
  expectedTimeOut: "18:00",
  gracePeriodMinutes: 5,
  breakDurationMinutes: 60,
  nightDiffStartHour: 22,
  nightDiffEndHour: 6,
};

export interface ProcessedDtrDay {
  employeeNumber: string;
  dateStr: string; // "YYYY-MM-DD"
  timeIn?: Date;
  timeOut?: Date;
  actualWorkedMinutes: number;
  tardinessMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
  nightDiffMinutes: number;
  hasMissingPunch: boolean;
  remarks: string[];
}

/**
 * Parses raw CSV content from biometric clocks into structured logs.
 */
export function parseBiometricCsv(csvContent: string): RawBiometricLog[] {
  const lines = csvContent.trim().split(/\r?\n/);
  const logs: RawBiometricLog[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("Employee") || line.startsWith("ID")) {
      continue; // Skip headers or empty lines
    }

    const cols = line.split(",").map((c) => c.replace(/["']/g, "").trim());
    const [employeeNumber, timestamp, thirdColumn, fourthColumn] = cols;
    if (!employeeNumber || !timestamp) continue;

    let parsedDate = new Date(timestamp);

    if (Number.isNaN(parsedDate.getTime()) && thirdColumn) {
      parsedDate = new Date(`${timestamp}T${thirdColumn}`);
    }

    if (!Number.isNaN(parsedDate.getTime())) {
      let punchType: "CHECK_IN" | "CHECK_OUT" | "AUTO" = "AUTO";
      const typeStr = (fourthColumn || thirdColumn || "").toUpperCase();
      if (typeStr.includes("IN") || typeStr === "1") punchType = "CHECK_IN";
      if (typeStr.includes("OUT") || typeStr === "2") punchType = "CHECK_OUT";

      logs.push({
        employeeNumber,
        timestamp: parsedDate,
        punchType,
      });
    }
  }

  return logs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * Aggregates raw punch logs into daily DTR entries and computes DOLE timekeeping metrics.
 */
export function processBiometricLogs(
  logs: RawBiometricLog[],
  shift: ShiftSchedule = DEFAULT_STANDARD_SHIFT,
): ProcessedDtrDay[] {
  const grouped = new Map<string, RawBiometricLog[]>();

  for (const log of logs) {
    const dateStr = log.timestamp.toISOString().slice(0, 10);
    const key = `${log.employeeNumber}_${dateStr}`;
    const existing = grouped.get(key) || [];
    existing.push(log);
    grouped.set(key, existing);
  }

  const results: ProcessedDtrDay[] = [];

  for (const [key, dayLogs] of grouped.entries()) {
    const [employeeNumber, dateStr] = key.split("_") as [string, string];
    const remarks: string[] = [];

    let timeIn: Date | undefined;
    let timeOut: Date | undefined;

    const firstLog = dayLogs[0];
    const lastLog = dayLogs.at(-1);
    if (!firstLog || !lastLog) continue;

    if (dayLogs.length === 1) {
      if (firstLog.punchType === "CHECK_OUT") {
        timeOut = firstLog.timestamp;
        remarks.push("Missing Clock-In Punch");
      } else {
        timeIn = firstLog.timestamp;
        remarks.push("Missing Clock-Out Punch");
      }
    } else {
      timeIn = firstLog.timestamp;
      timeOut = lastLog.timestamp;
    }

    if (!timeIn || !timeOut) {
      results.push({
        employeeNumber,
        dateStr,
        timeIn,
        timeOut,
        actualWorkedMinutes: 0,
        tardinessMinutes: 0,
        undertimeMinutes: 0,
        overtimeMinutes: 0,
        nightDiffMinutes: 0,
        hasMissingPunch: true,
        remarks,
      });
      continue;
    }

    const [inHours, inMins] = shift.expectedTimeIn.split(":").map(Number) as [
      number,
      number,
    ];
    const [outHours, outMins] = shift.expectedTimeOut
      .split(":")
      .map(Number) as [number, number];

    const expectedInDate = new Date(timeIn);
    expectedInDate.setHours(inHours, inMins, 0, 0);

    const expectedOutDate = new Date(timeIn);
    expectedOutDate.setHours(outHours, outMins, 0, 0);

    // 1. Tardiness Computation
    let tardinessMinutes = 0;
    const lateDiffMs = timeIn.getTime() - expectedInDate.getTime();
    if (lateDiffMs > shift.gracePeriodMinutes * 60 * 1000) {
      tardinessMinutes = Math.floor(lateDiffMs / (60 * 1000));
      remarks.push(`Late by ${tardinessMinutes}m`);
    }

    // 2. Undertime Computation
    let undertimeMinutes = 0;
    const earlyDiffMs = expectedOutDate.getTime() - timeOut.getTime();
    if (earlyDiffMs > 0 && timeOut.getTime() < expectedOutDate.getTime()) {
      undertimeMinutes = Math.floor(earlyDiffMs / (60 * 1000));
      remarks.push(`Undertime: ${undertimeMinutes}m`);
    }

    // 3. Gross Duration & Actual Worked Minutes (minus lunch break if duration >= 5 hours)
    const totalSpanMinutes = Math.floor(
      (timeOut.getTime() - timeIn.getTime()) / (60 * 1000),
    );
    let actualWorkedMinutes = totalSpanMinutes;
    if (totalSpanMinutes >= 300) {
      actualWorkedMinutes = Math.max(
        0,
        totalSpanMinutes - shift.breakDurationMinutes,
      );
    }

    // 4. Overtime Computation (work beyond expected shift out, minimum 30 min OT threshold)
    let overtimeMinutes = 0;
    const otDiffMs = timeOut.getTime() - expectedOutDate.getTime();
    if (otDiffMs >= 30 * 60 * 1000) {
      overtimeMinutes = Math.floor(otDiffMs / (60 * 1000));
      remarks.push(`Overtime: ${(overtimeMinutes / 60).toFixed(1)} hrs`);
    }

    // 5. DOLE Night Shift Differential (10:00 PM to 6:00 AM)
    let nightDiffMinutes = 0;
    const currentIter = new Date(timeIn);
    while (currentIter < timeOut) {
      const hour = currentIter.getHours();
      if (hour >= shift.nightDiffStartHour || hour < shift.nightDiffEndHour) {
        nightDiffMinutes += 1;
      }
      currentIter.setMinutes(currentIter.getMinutes() + 1);
    }

    if (nightDiffMinutes > 0) {
      remarks.push(`Night Diff: ${(nightDiffMinutes / 60).toFixed(1)} hrs`);
    }

    results.push({
      employeeNumber,
      dateStr,
      timeIn,
      timeOut,
      actualWorkedMinutes,
      tardinessMinutes,
      undertimeMinutes,
      overtimeMinutes,
      nightDiffMinutes,
      hasMissingPunch: false,
      remarks,
    });
  }

  return results;
}
