import type { Prisma } from '@workspace/db';

/** Synthetic complete Mon–Fri attendance for isolated PostgreSQL tests only. */
export function approvedWeekdayDtrs(
  employeeId: string,
  startDate: string,
  endDate: string,
): Prisma.DailyTimeRecordCreateManyInput[] {
  const rows: Prisma.DailyTimeRecordCreateManyInput[] = [];
  for (
    let day = new Date(startDate).getTime();
    day <= new Date(endDate).getTime();
    day += 86_400_000
  ) {
    const date = new Date(day);
    if ([0, 6].includes(date.getUTCDay())) continue;
    rows.push({ employeeId, date, actualWorkedMinutes: 480, isApproved: true });
  }
  return rows;
}
