import { countUnpaidAbsenceDays } from './timekeeping.service';

jest.mock('@workspace/db', () => ({
  prisma: {},
}));

describe('countUnpaidAbsenceDays', () => {
  it('counts workday absences within the tax year', () => {
    expect(
      countUnpaidAbsenceDays(
        [
          {
            date: '2026-03-10T12:00:00',
            dayType: 'REGULAR_WORKDAY',
            isAbsent: true,
          },
          {
            date: new Date(Date.UTC(2026, 5, 15, 12)),
            dayType: 'SPECIAL_WORKING_HOLIDAY',
            isAbsent: true,
          },
          {
            date: '2026-04-01T12:00:00',
            dayType: 'REGULAR_WORKDAY',
            isAbsent: false,
          },
        ],
        2026,
      ),
    ).toBe(2);
  });

  it('ignores rest-day and holiday absences, other years, and bad dates', () => {
    expect(
      countUnpaidAbsenceDays(
        [
          {
            date: '2026-05-01T12:00:00',
            dayType: 'REST_DAY',
            isAbsent: true,
          },
          {
            date: '2026-12-25T12:00:00',
            dayType: 'REGULAR_HOLIDAY',
            isAbsent: true,
          },
          {
            date: '2025-12-31T12:00:00',
            dayType: 'REGULAR_WORKDAY',
            isAbsent: true,
          },
          {
            date: 'not-a-date',
            dayType: 'REGULAR_WORKDAY',
            isAbsent: true,
          },
        ],
        2026,
      ),
    ).toBe(0);
  });
});
