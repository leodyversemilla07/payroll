/**
 * Biometric Punch Log Entry
 */
export interface RawBiometricLog {
  employeeNumber: string;
  timestamp: Date;
  punchType?: "CHECK_IN" | "CHECK_OUT" | "AUTO";
}

export interface ShiftSchedule {
  expectedTimeIn: string; // Manila wall time, e.g. "09:00"
  expectedTimeOut: string; // Manila wall time, e.g. "18:00"; daytime shifts only
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
  dateStr: string; // Manila civil date, "YYYY-MM-DD"
  timeIn?: Date;
  timeOut?: Date;
  actualWorkedMinutes: number;
  tardinessMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
  nightDiffMinutes: number;
  hasMissingPunch: boolean; // Also true for ambiguous pairings requiring review.
  remarks: string[];
}

/**
 * Parses simple biometric CSV rows. Offset-free clock values are Manila wall
 * time; explicit ISO offsets represent instants. Reject malformed rows rather
 * than silently dropping attendance or depending on the server's timezone.
 */
export function parseBiometricCsv(csvContent: string): RawBiometricLog[] {
  const lines = csvContent.trim().split(/\r?\n/);
  const logs: RawBiometricLog[] = [];

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    const cols = line.split(",").map((c) => c.replace(/["']/g, "").trim());
    const [employeeNumber, timestamp, thirdColumn, fourthColumn] = cols;
    if (/^(employee(?:[_ ]?(?:id|number))?|id)$/i.test(employeeNumber ?? ""))
      continue;
    const fail: () => never = () => {
      throw new RangeError(
        `Biometric CSV line ${index + 1}: supply an employee number, valid YYYY-MM-DD timestamp and CHECK_IN/CHECK_OUT/AUTO punch type`,
      );
    };
    if (!employeeNumber || !timestamp || cols.length < 2 || cols.length > 4)
      fail();
    const splitDateTime = /^\d{4}-\d{2}-\d{2}$/.test(timestamp ?? "");
    if (!splitDateTime && cols.length > 3) fail();
    const parsedDate = parseManilaClockTimestamp(
      splitDateTime ? `${timestamp}T${thirdColumn ?? ""}` : (timestamp ?? ""),
    );
    if (!parsedDate) fail();
    const typeStr =
      (splitDateTime ? fourthColumn : thirdColumn)?.toUpperCase() || "AUTO";
    const punchType =
      typeStr === "1" ? "CHECK_IN" : typeStr === "2" ? "CHECK_OUT" : typeStr;
    if (
      punchType !== "CHECK_IN" &&
      punchType !== "CHECK_OUT" &&
      punchType !== "AUTO"
    )
      fail();
    logs.push({ employeeNumber, timestamp: parsedDate, punchType });
  }

  return logs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * Aggregates punches by Manila date and estimates daytime-shift metrics.
 * These estimates require attendance/shift/break review before payroll approval.
 */
export function processBiometricLogs(
  logs: RawBiometricLog[],
  shift: ShiftSchedule = DEFAULT_STANDARD_SHIFT,
): ProcessedDtrDay[] {
  const inMinutes = parseShiftTime(shift.expectedTimeIn);
  const outMinutes = parseShiftTime(shift.expectedTimeOut);
  if (outMinutes <= inMinutes)
    throw new RangeError(
      "Overnight shifts require explicit shift-date pairing and manual reconciliation",
    );
  if (
    ![
      shift.gracePeriodMinutes,
      shift.breakDurationMinutes,
      shift.nightDiffStartHour,
      shift.nightDiffEndHour,
    ].every((value) => Number.isInteger(value) && value >= 0) ||
    shift.breakDurationMinutes >= outMinutes - inMinutes ||
    shift.nightDiffStartHour > 23 ||
    shift.nightDiffEndHour > 23 ||
    shift.nightDiffStartHour <= shift.nightDiffEndHour
  )
    throw new RangeError("Invalid biometric shift configuration");
  const grouped = new Map<
    string,
    { employeeNumber: string; dateStr: string; logs: RawBiometricLog[] }
  >();

  for (const log of [...logs].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )) {
    if (!log.employeeNumber || !Number.isFinite(log.timestamp.getTime()))
      throw new RangeError(
        "Biometric logs require valid timestamps and employee numbers",
      );
    const dateStr = new Date(log.timestamp.getTime() + MANILA_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
    const key = JSON.stringify([log.employeeNumber, dateStr]);
    const existing = grouped.get(key);
    if (existing) existing.logs.push(log);
    else
      grouped.set(key, {
        employeeNumber: log.employeeNumber,
        dateStr,
        logs: [log],
      });
  }

  const results: ProcessedDtrDay[] = [];

  for (const { employeeNumber, dateStr, logs: dayLogs } of grouped.values()) {
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
      if (
        dayLogs.length !== 2 ||
        firstLog.punchType === "CHECK_OUT" ||
        lastLog.punchType === "CHECK_IN" ||
        timeOut.getTime() <= timeIn.getTime()
      ) {
        remarks.push(
          "Ambiguous or duplicate punches require manual reconciliation",
        );
        timeIn = undefined;
        timeOut = undefined;
      }
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

    const manilaMidnight = new Date(`${dateStr}T00:00:00+08:00`).getTime();
    const expectedInDate = new Date(manilaMidnight + inMinutes * MINUTE_MS);
    const expectedOutDate = new Date(manilaMidnight + outMinutes * MINUTE_MS);

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
    const punchInMs = timeIn.getTime(),
      punchOutMs = timeOut.getTime();
    const overlap = (start: number, end: number) =>
      Math.max(0, Math.min(punchOutMs, end) - Math.max(punchInMs, start));
    nightDiffMinutes = Math.floor(
      (overlap(
        manilaMidnight,
        manilaMidnight + shift.nightDiffEndHour * 60 * MINUTE_MS,
      ) +
        overlap(
          manilaMidnight + shift.nightDiffStartHour * 60 * MINUTE_MS,
          manilaMidnight + 24 * 60 * MINUTE_MS,
        )) /
        MINUTE_MS,
    );

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

const MINUTE_MS = 60_000;
// Defined here rather than imported from ./manila-date so this module keeps
// running standalone: the TZ-hermetic spec below strips types and loads the
// source as a bare data: module, where sibling specifiers cannot resolve.
// The value matches MANILA_OFFSET_MS and cannot drift: PH has no DST.
const MANILA_OFFSET_MS = 8 * 60 * MINUTE_MS;

function parseShiftTime(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new RangeError("Shift times must be valid Manila HH:mm values");
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function parseManilaClockTimestamp(value: string): Date | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(
      value,
    );
  if (!match) return null;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fraction,
    offset,
  ] = match;
  const year = Number(yearText),
    month = Number(monthText),
    day = Number(dayText);
  const hour = Number(hourText),
    minute = Number(minuteText),
    second = Number(secondText ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  )
    return null;
  let offsetMinutes = 8 * 60;
  if (offset === "Z") offsetMinutes = 0;
  else if (offset) {
    const hours = Number(offset.slice(1, 3)),
      minutes = Number(offset.slice(4, 6));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0))
      return null;
    offsetMinutes = (offset[0] === "-" ? -1 : 1) * (hours * 60 + minutes);
  }
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
      Number((fraction ?? "").padEnd(3, "0")),
    ) -
      offsetMinutes * MINUTE_MS,
  );
}
