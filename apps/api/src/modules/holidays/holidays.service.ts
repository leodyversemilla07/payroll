import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type DayType,
  type HolidayCalendar,
  Prisma,
  prisma,
} from '@workspace/db';

export const VALID_HOLIDAY_DAY_TYPES: readonly DayType[] = [
  'REGULAR_HOLIDAY',
  'SPECIAL_NON_WORKING_HOLIDAY',
  'SPECIAL_WORKING_HOLIDAY',
  'DOUBLE_HOLIDAY',
] as const;

export function normalizeDate(input: Date | string): Date {
  const dateStr =
    typeof input === 'string'
      ? input.slice(0, 10)
      : input.toISOString().slice(0, 10);
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * Computes Easter Sunday for a given Gregorian year using the
 * anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed month (2 = Mar, 3 = Apr)
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
}

/**
 * Computes National Heroes Day (last Monday of August in the Philippines).
 */
function getNationalHeroesDay(year: number): Date {
  // Start from August 31 (month index 7)
  const date = new Date(Date.UTC(year, 7, 31));
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = (dayOfWeek + 7 - 1) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date;
}

export interface CreateHolidayInput {
  date: Date | string;
  name: string;
  dayType: DayType;
  isRecurring?: boolean;
}

export interface UpdateHolidayInput {
  name?: string;
  dayType?: DayType;
  isRecurring?: boolean;
}

@Injectable()
export class HolidaysService {
  async list(
    organizationId: string,
    year?: number,
    database: Prisma.TransactionClient = prisma,
  ): Promise<HolidayCalendar[]> {
    if (year !== undefined) {
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

      return database.holidayCalendar.findMany({
        where: {
          organizationId,
          OR: [
            {
              date: {
                gte: yearStart,
                lte: yearEnd,
              },
            },
            {
              isRecurring: true,
            },
          ],
        },
        orderBy: { date: 'asc' },
      });
    }

    return database.holidayCalendar.findMany({
      where: { organizationId },
      orderBy: { date: 'asc' },
    });
  }

  async getById(
    organizationId: string,
    id: string,
    database: Prisma.TransactionClient = prisma,
  ): Promise<HolidayCalendar> {
    const holiday = await database.holidayCalendar.findFirst({
      where: { id, organizationId },
    });
    if (!holiday) {
      throw new NotFoundException('Holiday not found');
    }
    return holiday;
  }

  async getHolidayForDate(
    organizationId: string,
    dateInput: Date | string,
    database: Prisma.TransactionClient = prisma,
  ): Promise<HolidayCalendar | null> {
    const targetDate = normalizeDate(dateInput);

    // First check exact date
    const exact = await database.holidayCalendar.findUnique({
      where: {
        organizationId_date: {
          organizationId,
          date: targetDate,
        },
      },
    });
    if (exact) return exact;

    // Check recurring holidays matching the same month and day
    const recurring = await database.holidayCalendar.findMany({
      where: {
        organizationId,
        isRecurring: true,
      },
    });

    const targetMonth = targetDate.getUTCMonth();
    const targetDay = targetDate.getUTCDate();

    const match = recurring.find((h) => {
      const hDate = new Date(h.date);
      return (
        hDate.getUTCMonth() === targetMonth && hDate.getUTCDate() === targetDay
      );
    });

    return match ?? null;
  }

  async create(
    organizationId: string,
    input: CreateHolidayInput,
    createdById?: string,
    database: Prisma.TransactionClient = prisma,
  ): Promise<HolidayCalendar> {
    if (!VALID_HOLIDAY_DAY_TYPES.includes(input.dayType)) {
      throw new UnprocessableEntityException(
        'Selected day type must be a valid holiday type (REGULAR_HOLIDAY, SPECIAL_NON_WORKING_HOLIDAY, SPECIAL_WORKING_HOLIDAY, or DOUBLE_HOLIDAY)',
      );
    }

    const date = normalizeDate(input.date);

    const existing = await database.holidayCalendar.findUnique({
      where: {
        organizationId_date: {
          organizationId,
          date,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'A holiday is already configured for this date',
      );
    }

    return database.holidayCalendar.create({
      data: {
        organizationId,
        date,
        name: input.name.trim(),
        dayType: input.dayType,
        isRecurring: input.isRecurring ?? false,
        createdById,
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateHolidayInput,
    database: Prisma.TransactionClient = prisma,
  ): Promise<HolidayCalendar> {
    await this.getById(organizationId, id, database);

    if (input.dayType && !VALID_HOLIDAY_DAY_TYPES.includes(input.dayType)) {
      throw new UnprocessableEntityException(
        'Selected day type must be a valid holiday type (REGULAR_HOLIDAY, SPECIAL_NON_WORKING_HOLIDAY, SPECIAL_WORKING_HOLIDAY, or DOUBLE_HOLIDAY)',
      );
    }

    return database.holidayCalendar.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.dayType !== undefined ? { dayType: input.dayType } : {}),
        ...(input.isRecurring !== undefined
          ? { isRecurring: input.isRecurring }
          : {}),
      },
    });
  }

  async delete(
    organizationId: string,
    id: string,
    database: Prisma.TransactionClient = prisma,
  ): Promise<HolidayCalendar> {
    await this.getById(organizationId, id, database);
    return database.holidayCalendar.delete({
      where: { id },
    });
  }

  /**
   * Generates and seeds standard Philippine national holidays for a given year.
   * Skips any dates already configured for the organization.
   */
  async populateNationalPresets(
    organizationId: string,
    year: number,
    createdById?: string,
    database: Prisma.TransactionClient = prisma,
  ): Promise<{ addedCount: number; holidays: HolidayCalendar[] }> {
    const easter = getEasterSunday(year);

    // Maundy Thursday: 3 days before Easter
    const maundyThursday = new Date(easter);
    maundyThursday.setUTCDate(easter.getUTCDate() - 3);

    // Good Friday: 2 days before Easter
    const goodFriday = new Date(easter);
    goodFriday.setUTCDate(easter.getUTCDate() - 2);

    // Black Saturday: 1 day before Easter
    const blackSaturday = new Date(easter);
    blackSaturday.setUTCDate(easter.getUTCDate() - 1);

    // National Heroes Day: Last Monday of August
    const nationalHeroesDay = getNationalHeroesDay(year);

    const statutoryPresets: Array<{
      date: Date;
      name: string;
      dayType: DayType;
      isRecurring: boolean;
    }> = [
      // Regular Holidays
      {
        date: new Date(Date.UTC(year, 0, 1)),
        name: "New Year's Day",
        dayType: 'REGULAR_HOLIDAY',
        isRecurring: true,
      },
      {
        date: maundyThursday,
        name: 'Maundy Thursday',
        dayType: 'REGULAR_HOLIDAY',
        isRecurring: false,
      },
      {
        date: goodFriday,
        name: 'Good Friday',
        dayType: 'REGULAR_HOLIDAY',
        isRecurring: false,
      },
      {
        date: new Date(Date.UTC(year, 3, 9)),
        name: 'Araw ng Kagitingan (Day of Valor)',
        dayType: 'REGULAR_HOLIDAY',
        isRecurring: true,
      },
      {
        date: new Date(Date.UTC(year, 4, 1)),
        name: 'Labor Day',
        dayType: 'REGULAR_HOLIDAY',
        isRecurring: true,
      },
      {
        date: new Date(Date.UTC(year, 5, 12)),
        name: 'Independence Day',
        dayType: 'REGULAR_HOLIDAY',
        isRecurring: true,
      },
      {
        date: nationalHeroesDay,
        name: 'National Heroes Day',
        dayType: 'REGULAR_HOLIDAY',
        isRecurring: false,
      },
      {
        date: new Date(Date.UTC(year, 10, 30)),
        name: 'Bonifacio Day',
        dayType: 'REGULAR_HOLIDAY',
        isRecurring: true,
      },
      {
        date: new Date(Date.UTC(year, 11, 25)),
        name: 'Christmas Day',
        dayType: 'REGULAR_HOLIDAY',
        isRecurring: true,
      },
      {
        date: new Date(Date.UTC(year, 11, 30)),
        name: 'Rizal Day',
        dayType: 'REGULAR_HOLIDAY',
        isRecurring: true,
      },

      // Special Non-Working Days
      {
        date: blackSaturday,
        name: 'Black Saturday',
        dayType: 'SPECIAL_NON_WORKING_HOLIDAY',
        isRecurring: false,
      },
      {
        date: new Date(Date.UTC(year, 7, 21)),
        name: 'Ninoy Aquino Day',
        dayType: 'SPECIAL_NON_WORKING_HOLIDAY',
        isRecurring: true,
      },
      {
        date: new Date(Date.UTC(year, 10, 1)),
        name: "All Saints' Day",
        dayType: 'SPECIAL_NON_WORKING_HOLIDAY',
        isRecurring: true,
      },
      {
        date: new Date(Date.UTC(year, 11, 8)),
        name: 'Feast of the Immaculate Conception',
        dayType: 'SPECIAL_NON_WORKING_HOLIDAY',
        isRecurring: true,
      },
      {
        date: new Date(Date.UTC(year, 11, 24)),
        name: 'Christmas Eve',
        dayType: 'SPECIAL_NON_WORKING_HOLIDAY',
        isRecurring: true,
      },
      {
        date: new Date(Date.UTC(year, 11, 31)),
        name: 'Last Day of the Year',
        dayType: 'SPECIAL_NON_WORKING_HOLIDAY',
        isRecurring: true,
      },
    ];

    const createdList: HolidayCalendar[] = [];

    for (const preset of statutoryPresets) {
      const date = normalizeDate(preset.date);
      const existing = await database.holidayCalendar.findUnique({
        where: {
          organizationId_date: {
            organizationId,
            date,
          },
        },
      });

      if (!existing) {
        const created = await database.holidayCalendar.create({
          data: {
            organizationId,
            date,
            name: preset.name,
            dayType: preset.dayType,
            isRecurring: preset.isRecurring,
            createdById,
          },
        });
        createdList.push(created);
      }
    }

    return {
      addedCount: createdList.length,
      holidays: createdList,
    };
  }
}
