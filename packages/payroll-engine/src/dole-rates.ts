import type {
  AttendanceSummary,
  Centavos,
  EmployeeCompensationProfile,
} from "./types";
import { PayBasis } from "./types";

/**
 * Calculates hourly, daily, and minute rates from an employee's compensation profile.
 */
export function deriveRates(compensation: EmployeeCompensationProfile): {
  dailyRateCents: Centavos;
  hourlyRateCents: Centavos;
  minuteRateCents: Centavos;
} {
  let dailyRateCents: Centavos;
  let hourlyRateCents: Centavos;
  let minuteRateCents: Centavos;

  if (compensation.payBasis === PayBasis.DAILY && compensation.dailyRateCents) {
    dailyRateCents = compensation.dailyRateCents;
    hourlyRateCents = dailyRateCents / 8n;
    minuteRateCents = hourlyRateCents / 60n;
  } else if (
    compensation.payBasis === PayBasis.HOURLY &&
    compensation.hourlyRateCents
  ) {
    hourlyRateCents = compensation.hourlyRateCents;
    dailyRateCents = hourlyRateCents * 8n;
    minuteRateCents = hourlyRateCents / 60n;
  } else {
    // Standard Monthly: Daily = (Monthly Rate * 12) / Divisor
    const divisor = BigInt(compensation.divisor || 261);
    const annualBasicCents = compensation.monthlyBasicRateCents * 12n;
    dailyRateCents = annualBasicCents / divisor;
    hourlyRateCents = dailyRateCents / 8n;
    minuteRateCents = hourlyRateCents / 60n;
  }

  return { dailyRateCents, hourlyRateCents, minuteRateCents };
}

/**
 * DOLE Premium and Overtime Multipliers
 */
export const DOLE_MULTIPLIERS = {
  REGULAR_OT: 1.25,
  REST_DAY: 1.3,
  REST_DAY_OT: 1.69, // 1.30 * 1.30
  SPECIAL_HOLIDAY: 1.3,
  SPECIAL_HOLIDAY_OT: 1.69,
  SPECIAL_HOLIDAY_REST_DAY: 1.5,
  SPECIAL_HOLIDAY_REST_DAY_OT: 1.95, // 1.50 * 1.30
  REGULAR_HOLIDAY: 2.0,
  REGULAR_HOLIDAY_OT: 2.6, // 2.00 * 1.30
  REGULAR_HOLIDAY_REST_DAY: 2.6,
  REGULAR_HOLIDAY_REST_DAY_OT: 3.38, // 2.60 * 1.30
  NIGHT_DIFF: 0.1, // 10%
};

/**
 * Exact integer multipliers in basis points (parts per hundred), mirroring
 * DOLE_MULTIPLIERS. Floating-point cannot represent values like 1.69 or the
 * monthly base-pay adjustment (1.3 - 1 = 0.30000000000000004) exactly, so all
 * premium math below runs on integers.
 */
interface PremiumBasisPoints {
  regularOT: number;
  restDay: number;
  restDayOT: number;
  specialHoliday: number;
  specialHolidayOT: number;
  specialHolidayRestDay: number;
  specialHolidayRestDayOT: number;
  regularHoliday: number;
  regularHolidayOT: number;
  regularHolidayRestDay: number;
  regularHolidayRestDayOT: number;
  regularHolidayUnworked: number;
  nightDiff: number;
}

function premiumBasisPoints(monthlyPaidBase: boolean): PremiumBasisPoints {
  // Monthly salaries already include the first eight hours of base pay for
  // rest days and holidays. Daily/hourly workers need the full statutory rate.
  const base = monthlyPaidBase ? 100 : 0;
  return {
    regularOT: 125,
    restDay: 130 - base,
    restDayOT: 169,
    specialHoliday: 130 - base,
    specialHolidayOT: 169,
    specialHolidayRestDay: 150 - base,
    specialHolidayRestDayOT: 195,
    regularHoliday: 200 - base,
    regularHolidayOT: 260,
    regularHolidayRestDay: 260 - base,
    regularHolidayRestDayOT: 338,
    regularHolidayUnworked: monthlyPaidBase ? 0 : 100,
    nightDiff: 10,
  };
}

// pay = rateCents * (minutes / 60) * (bps / 100), so single-multiplier terms
// share the denominator 60 * 100. Night differentials layer a second 10%
// factor, giving those terms the denominator 60 * 100 * 100.
const SINGLE_DENOMINATOR = 6000n;
const NIGHT_DENOMINATOR = 600000n;

/**
 * Computes all DOLE premiums, overtimes, night differentials, and holiday compensations.
 *
 * Every term is evaluated as an exact integer rational and each premium
 * category is rounded half-up once, matching historical centavo results
 * while removing binary floating-point drift.
 */
export function calculateDolePremiums(
  hourlyRateCents: Centavos,
  attendance: AttendanceSummary,
  payBasis: PayBasis = PayBasis.DAILY,
): {
  overtimePayCents: Centavos;
  nightDiffPayCents: Centavos;
  holidayPayCents: Centavos;
  restDayPayCents: Centavos;
  totalPremiumPayCents: Centavos;
} {
  const bps = premiumBasisPoints(payBasis === PayBasis.MONTHLY);

  // Attendance hours arrive as minutes / 60. Recovering whole minutes keeps
  // the production path (integer DTR minutes) bit-exact.
  const toMinutes = (hours: number): bigint => BigInt(Math.round(hours * 60));

  // Exact numerator of rateCents * (minutes / 60) * (bps / 100).
  const singleTerm = (hours: number, multiplierBps: number): bigint =>
    hourlyRateCents * toMinutes(hours) * BigInt(multiplierBps);

  const roundSingle = (numerator: bigint): Centavos =>
    (numerator + SINGLE_DENOMINATOR / 2n) / SINGLE_DENOMINATOR;

  // 1. Regular Overtime (125%)
  const overtimePayCents = roundSingle(
    singleTerm(attendance.regularOvertimeHours, bps.regularOT),
  );

  // 2. Rest Day Work (130% for first 8 hrs, 169% for OT)
  const restDayPayCents = roundSingle(
    singleTerm(attendance.restDayHours, bps.restDay) +
      singleTerm(attendance.restDayOvertimeHours, bps.restDayOT),
  );

  // 3. & 4. Special Non-Working and Regular Holidays. Unworked regular
  // holidays convert whole days to hours; monthly staff already received
  // base pay for them, hence the zero multiplier.
  const holidayPayCents = roundSingle(
    singleTerm(attendance.specialHolidayHours, bps.specialHoliday) +
      singleTerm(attendance.specialHolidayOvertimeHours, bps.specialHolidayOT) +
      singleTerm(
        attendance.specialHolidayRestDayHours,
        bps.specialHolidayRestDay,
      ) +
      singleTerm(
        attendance.specialHolidayRestDayOvertimeHours,
        bps.specialHolidayRestDayOT,
      ) +
      singleTerm(attendance.regularHolidayHours, bps.regularHoliday) +
      singleTerm(
        (attendance.regularHolidayUnworkedDays ?? 0) * 8,
        bps.regularHolidayUnworked,
      ) +
      singleTerm(attendance.regularHolidayOvertimeHours, bps.regularHolidayOT) +
      singleTerm(
        attendance.regularHolidayRestDayHours,
        bps.regularHolidayRestDay,
      ) +
      singleTerm(
        attendance.regularHolidayRestDayOvertimeHours,
        bps.regularHolidayRestDayOT,
      ),
  );

  // 5. Night Shift Differential (10% additional per hour between 10PM and 6AM).
  // Overtime, rest-day, and holiday night hours layer the 10% factor on top
  // of the full base premium, independent of the monthly base-pay adjustment.
  const nightSingle = (hours: number): bigint =>
    hourlyRateCents * toMinutes(hours) * BigInt(bps.nightDiff) * 100n;
  const nightLayered = (hours: number, baseBps: number): bigint =>
    hourlyRateCents *
    toMinutes(hours) *
    BigInt(baseBps) *
    BigInt(bps.nightDiff);
  const nightDiffPayCents =
    (nightSingle(attendance.regularNightDiffHours) +
      nightLayered(attendance.overtimeNightDiffHours, 125) +
      nightLayered(attendance.restDayNightDiffHours, 130) +
      nightLayered(attendance.holidayNightDiffHours, 200) +
      NIGHT_DENOMINATOR / 2n) /
    NIGHT_DENOMINATOR;

  const totalPremiumPayCents =
    overtimePayCents + restDayPayCents + holidayPayCents + nightDiffPayCents;

  return {
    overtimePayCents,
    nightDiffPayCents,
    holidayPayCents,
    restDayPayCents,
    totalPremiumPayCents,
  };
}
