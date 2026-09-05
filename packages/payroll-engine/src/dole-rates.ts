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
 * Computes all DOLE premiums, overtimes, night differentials, and holiday compensations.
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
  const hourly = Number(hourlyRateCents);
  const includedBaseMultiplier = payBasis === PayBasis.MONTHLY ? 1 : 0;

  // Monthly salaries already include the first eight hours of base pay for
  // rest days and holidays. Daily/hourly workers need the full statutory rate.
  const restDayMultiplier = DOLE_MULTIPLIERS.REST_DAY - includedBaseMultiplier;
  const specialHolidayMultiplier =
    DOLE_MULTIPLIERS.SPECIAL_HOLIDAY - includedBaseMultiplier;
  const specialHolidayRestDayMultiplier =
    DOLE_MULTIPLIERS.SPECIAL_HOLIDAY_REST_DAY - includedBaseMultiplier;
  const regularHolidayMultiplier =
    DOLE_MULTIPLIERS.REGULAR_HOLIDAY - includedBaseMultiplier;
  const regularHolidayRestDayMultiplier =
    DOLE_MULTIPLIERS.REGULAR_HOLIDAY_REST_DAY - includedBaseMultiplier;

  // 1. Regular Overtime (125%)
  const regularOT =
    attendance.regularOvertimeHours * hourly * DOLE_MULTIPLIERS.REGULAR_OT;

  // 2. Rest Day Work (130% for first 8 hrs, 169% for OT)
  const restDayBase = attendance.restDayHours * hourly * restDayMultiplier;
  const restDayOT =
    attendance.restDayOvertimeHours * hourly * DOLE_MULTIPLIERS.REST_DAY_OT;
  const totalRestDay = restDayBase + restDayOT;

  // 3. Special Non-Working Holidays
  const specialHol =
    attendance.specialHolidayHours * hourly * specialHolidayMultiplier;
  const specialHolOT =
    attendance.specialHolidayOvertimeHours *
    hourly *
    DOLE_MULTIPLIERS.SPECIAL_HOLIDAY_OT;
  const specialHolRestDay =
    attendance.specialHolidayRestDayHours *
    hourly *
    specialHolidayRestDayMultiplier;
  const specialHolRestDayOT =
    attendance.specialHolidayRestDayOvertimeHours *
    hourly *
    DOLE_MULTIPLIERS.SPECIAL_HOLIDAY_REST_DAY_OT;

  // 4. Regular Holidays (200% base worked, 260% OT, 260% on Rest Day, 338% OT on Rest Day)
  const regularHol =
    attendance.regularHolidayHours * hourly * regularHolidayMultiplier;
  const regularHolidayUnworked =
    (attendance.regularHolidayUnworkedDays ?? 0) *
    8 *
    hourly *
    (payBasis === PayBasis.MONTHLY ? 0 : 1);
  const regularHolOT =
    attendance.regularHolidayOvertimeHours *
    hourly *
    DOLE_MULTIPLIERS.REGULAR_HOLIDAY_OT;
  const regularHolRestDay =
    attendance.regularHolidayRestDayHours *
    hourly *
    regularHolidayRestDayMultiplier;
  const regularHolRestDayOT =
    attendance.regularHolidayRestDayOvertimeHours *
    hourly *
    DOLE_MULTIPLIERS.REGULAR_HOLIDAY_REST_DAY_OT;

  const totalHolidays =
    specialHol +
    specialHolOT +
    specialHolRestDay +
    specialHolRestDayOT +
    regularHol +
    regularHolidayUnworked +
    regularHolOT +
    regularHolRestDay +
    regularHolRestDayOT;

  // 5. Night Shift Differential (10% additional per hour between 10PM and 6AM)
  const regularNightDiff =
    attendance.regularNightDiffHours * hourly * DOLE_MULTIPLIERS.NIGHT_DIFF;
  const overtimeNightDiff =
    attendance.overtimeNightDiffHours *
    hourly *
    (DOLE_MULTIPLIERS.REGULAR_OT * DOLE_MULTIPLIERS.NIGHT_DIFF);
  const restDayNightDiff =
    attendance.restDayNightDiffHours *
    hourly *
    (DOLE_MULTIPLIERS.REST_DAY * DOLE_MULTIPLIERS.NIGHT_DIFF);
  const holidayNightDiff =
    attendance.holidayNightDiffHours *
    hourly *
    (DOLE_MULTIPLIERS.REGULAR_HOLIDAY * DOLE_MULTIPLIERS.NIGHT_DIFF);

  const totalNightDiff =
    regularNightDiff + overtimeNightDiff + restDayNightDiff + holidayNightDiff;

  const overtimePayCents = BigInt(Math.round(regularOT));
  const restDayPayCents = BigInt(Math.round(totalRestDay));
  const holidayPayCents = BigInt(Math.round(totalHolidays));
  const nightDiffPayCents = BigInt(Math.round(totalNightDiff));

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
