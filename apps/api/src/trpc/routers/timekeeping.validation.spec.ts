import {
  attendanceCorrectionSchema,
  dtrRangeSchema,
} from './timekeeping.validation';

const input = {
  employeeId: '11111111-1111-4111-8111-111111111111',
  date: '2026-09-10',
  expectedUpdatedAt: null,
  dayType: 'REGULAR_WORKDAY',
  timeIn: '2026-09-10T00:00:00.000Z',
  timeOut: '2026-09-10T09:00:00.000Z',
  actualWorkedMinutes: 480,
  tardinessMinutes: 0,
  undertimeMinutes: 0,
  overtimeMinutes: 0,
  nightDiffMinutes: 0,
  isAbsent: false,
  isApproved: false,
  correctionReason: 'Verified against the signed attendance sheet',
};

describe('attendance correction validation', () => {
  it('accepts explicit verified totals and a Manila-day punch interval', () => {
    expect(attendanceCorrectionSchema.parse(input)).toEqual(input);
  });
  it('accepts next-day clock out for an overnight Manila shift', () => {
    expect(
      attendanceCorrectionSchema.safeParse({
        ...input,
        timeIn: '2026-09-10T14:00:00Z',
        timeOut: '2026-09-10T22:00:00Z',
        nightDiffMinutes: 480,
      }).success,
    ).toBe(true);
  });
  it('accepts manually verified minute totals without punches and absent days with zero totals', () => {
    expect(
      attendanceCorrectionSchema.safeParse({
        ...input,
        timeIn: null,
        timeOut: null,
      }).success,
    ).toBe(true);
    expect(
      attendanceCorrectionSchema.safeParse({
        ...input,
        timeIn: null,
        timeOut: null,
        isAbsent: true,
        actualWorkedMinutes: 0,
      }).success,
    ).toBe(true);
  });
  it.each([
    { actualWorkedMinutes: -1 },
    { actualWorkedMinutes: 1441 },
    { overtimeMinutes: 0.5 },
    { overtimeMinutes: 481 },
    { nightDiffMinutes: 481 },
    { isAbsent: true },
    { timeOut: null },
    { timeIn: null },
    { timeOut: '2026-09-09T23:00:00Z' },
    { timeOut: '2026-09-11T01:00:00Z' },
    { timeIn: '2026-09-09T14:00:00Z' },
    { actualWorkedMinutes: 600 },
    { correctionReason: ' ' },
    { correctionReason: 'short' },
    { dayType: 'DOUBLE_HOLIDAY' },
    { date: 'not-a-date' },
    { timeIn: 'not-a-timestamp' },
    { expectedUpdatedAt: 'bad' },
  ])('rejects inconsistent/unsafe attendance values: %j', (override) => {
    expect(
      attendanceCorrectionSchema.safeParse({ ...input, ...override }).success,
    ).toBe(false);
  });
  it('does not supply a presumed full shift or automatically approve a record', () => {
    const {
      actualWorkedMinutes: _minutes,
      isApproved: _approved,
      ...partial
    } = input;
    expect(attendanceCorrectionSchema.safeParse(partial).success).toBe(false);
  });
  it.each([
    ['2026-09-10', '2026-09-09'],
    ['2025-01-01', '2026-01-02'],
    ['invalid', '2026-01-01'],
  ])('rejects invalid or overlong DTR ranges: %s–%s', (startDate, endDate) => {
    expect(
      dtrRangeSchema.safeParse({
        employeeId: input.employeeId,
        startDate,
        endDate,
      }).success,
    ).toBe(false);
  });
});
