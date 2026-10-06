import { z } from 'zod';

const minutes = z.number().int().min(0).max(1440);
const dayMs = 86_400_000;

export const dtrRangeSchema = z
  .object({
    employeeId: z.string().uuid(),
    startDate: z.string().date(),
    endDate: z.string().date(),
  })
  .superRefine((input, context) => {
    const difference = Date.parse(input.endDate) - Date.parse(input.startDate);
    if (difference < 0 || difference > 365 * dayMs) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'Select an ordered DTR range of at most 366 calendar days',
      });
    }
  });

export const attendanceCorrectionSchema = z
  .object({
    employeeId: z.string().uuid(),
    date: z.string().date(),
    expectedUpdatedAt: z.string().datetime().nullable(),
    correctionReason: z.string().trim().min(10).max(500),
    dayType: z.enum([
      'REGULAR_WORKDAY',
      'REST_DAY',
      'SPECIAL_NON_WORKING_HOLIDAY',
      'SPECIAL_WORKING_HOLIDAY',
      'REGULAR_HOLIDAY',
    ]),
    timeIn: z.string().datetime({ offset: true }).nullable(),
    timeOut: z.string().datetime({ offset: true }).nullable(),
    actualWorkedMinutes: minutes,
    tardinessMinutes: minutes,
    undertimeMinutes: minutes,
    overtimeMinutes: minutes,
    nightDiffMinutes: minutes,
    isAbsent: z.boolean(),
    isApproved: z.boolean(),
  })
  .superRefine((input, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });
    if (
      input.overtimeMinutes > input.actualWorkedMinutes ||
      input.nightDiffMinutes > input.actualWorkedMinutes
    ) {
      issue(
        'actualWorkedMinutes',
        'Overtime and night differential cannot exceed total worked minutes (which includes overtime)',
      );
    }
    if (
      input.isAbsent &&
      (input.actualWorkedMinutes ||
        input.tardinessMinutes ||
        input.undertimeMinutes ||
        input.overtimeMinutes ||
        input.nightDiffMinutes ||
        input.timeIn ||
        input.timeOut)
    ) {
      issue(
        'isAbsent',
        'An absent day cannot also contain punches or worked/deduction minutes',
      );
    }
    if ((input.timeIn === null) !== (input.timeOut === null)) {
      issue(
        'timeOut',
        'Supply both punches or clear both; partial punches require reconciliation',
      );
    }
    if (input.timeIn && input.timeOut) {
      const start = Date.parse(input.timeIn);
      const duration = Date.parse(input.timeOut) - start;
      if (!Number.isFinite(start) || !Number.isFinite(duration)) return;
      if (duration <= 0 || duration > dayMs) {
        issue('timeOut', 'Time out must follow time in by at most 24 hours');
      }
      if (
        new Date(start + 8 * 3_600_000).toISOString().slice(0, 10) !==
        input.date
      ) {
        issue(
          'timeIn',
          'Time in must fall on the selected DTR date in Asia/Manila',
        );
      }
      if (input.actualWorkedMinutes > Math.floor(duration / 60_000)) {
        issue(
          'actualWorkedMinutes',
          'Worked minutes cannot exceed the punch interval',
        );
      }
    }
  });
