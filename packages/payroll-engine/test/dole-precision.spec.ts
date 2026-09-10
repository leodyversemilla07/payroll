import { describe, expect, it } from "vitest";
import type { AttendanceSummary } from "../src/index.js";
import { calculateDolePremiums, PayBasis } from "../src/index.js";

function attendanceWith(
  overrides: Partial<AttendanceSummary>,
): AttendanceSummary {
  return {
    regularHoursWorked: 0,
    tardinessMinutes: 0,
    undertimeMinutes: 0,
    absentDays: 0,
    regularOvertimeHours: 0,
    restDayHours: 0,
    restDayOvertimeHours: 0,
    specialHolidayHours: 0,
    specialHolidayOvertimeHours: 0,
    specialHolidayRestDayHours: 0,
    specialHolidayRestDayOvertimeHours: 0,
    regularHolidayHours: 0,
    regularHolidayOvertimeHours: 0,
    regularHolidayRestDayHours: 0,
    regularHolidayRestDayOvertimeHours: 0,
    regularNightDiffHours: 0,
    overtimeNightDiffHours: 0,
    restDayNightDiffHours: 0,
    holidayNightDiffHours: 0,
    ...overrides,
  };
}

// Hourly rates below are real deriveRates outputs (261-day divisor):
// PHP 15,400/mo -> 8,850/hr and PHP 65,000/mo -> 37,356/hr.
describe("DOLE premium exact arithmetic", () => {
  it("rounds an exact half centavo up for rest-day work", () => {
    // 8,850 x 146min x 130bps / 6,000 = 27,995.5 -> 27,996.
    // Binary floating point evaluated this as 27,995.49... and paid 27,995.
    const premiums = calculateDolePremiums(
      8850n,
      attendanceWith({ restDayHours: 146 / 60 }),
      PayBasis.DAILY,
    );
    expect(premiums.restDayPayCents).toBe(27996n);
  });

  it("rounds an exact half centavo up for regular overtime", () => {
    // 37,356 x 34min x 125bps / 6,000 = 26,460.5 -> 26,461.
    // Binary floating point evaluated this as 26,460.49... and paid 26,460.
    const premiums = calculateDolePremiums(
      37356n,
      attendanceWith({ regularOvertimeHours: 34 / 60 }),
      PayBasis.DAILY,
    );
    expect(premiums.overtimePayCents).toBe(26461n);
  });

  it("rounds an exact half centavo up for night differential", () => {
    // 8,850 x 262min x 10bps / 6,000 = 3,864.5 -> 3,865.
    // Binary floating point evaluated this as 3,864.49... and paid 3,864.
    const premiums = calculateDolePremiums(
      8850n,
      attendanceWith({ regularNightDiffHours: 262 / 60 }),
      PayBasis.DAILY,
    );
    expect(premiums.nightDiffPayCents).toBe(3865n);
  });

  it("pays monthly staff only the premium slice above included base pay", () => {
    // Monthly salaries already cover the first 8 hours, so an 8-hour rest
    // day earns exactly the 30% premium: 8,850 x 480min x 30bps / 6,000.
    const premiums = calculateDolePremiums(
      8850n,
      attendanceWith({ restDayHours: 8 }),
      PayBasis.MONTHLY,
    );
    expect(premiums.restDayPayCents).toBe(21240n);
  });
});
