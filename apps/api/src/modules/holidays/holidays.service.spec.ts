import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@workspace/db';
import { HolidaysService, normalizeDate } from './holidays.service';

describe('HolidaysService', () => {
  let service: HolidaysService;
  let mockDb: {
    holidayCalendar: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const orgId = 'org-1';
  const mockHoliday = {
    id: 'hol-1',
    organizationId: orgId,
    date: new Date('2026-12-25T00:00:00.000Z'),
    name: 'Christmas Day',
    dayType: 'REGULAR_HOLIDAY' as const,
    isRecurring: true,
    createdById: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    service = new HolidaysService();
    mockDb = {
      holidayCalendar: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
  });

  describe('normalizeDate', () => {
    it('normalizes string and Date to UTC midnight', () => {
      const d1 = normalizeDate('2026-12-25');
      expect(d1.toISOString()).toBe('2026-12-25T00:00:00.000Z');
      const d2 = normalizeDate(new Date('2026-05-01T15:30:00.000Z'));
      expect(d2.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    });
  });

  describe('list', () => {
    it('returns holidays without year filter', async () => {
      mockDb.holidayCalendar.findMany.mockResolvedValue([mockHoliday]);

      const result = await service.list(
        orgId,
        undefined,
        mockDb as unknown as Prisma.TransactionClient,
      );

      expect(result).toEqual([mockHoliday]);
      expect(mockDb.holidayCalendar.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        orderBy: { date: 'asc' },
      });
    });

    it('filters by year and recurring holidays', async () => {
      mockDb.holidayCalendar.findMany.mockResolvedValue([mockHoliday]);

      const result = await service.list(
        orgId,
        2026,
        mockDb as unknown as Prisma.TransactionClient,
      );

      expect(result).toEqual([mockHoliday]);
      expect(mockDb.holidayCalendar.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          OR: [
            {
              date: {
                gte: new Date(Date.UTC(2026, 0, 1)),
                lte: new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)),
              },
            },
            { isRecurring: true },
          ],
        },
        orderBy: { date: 'asc' },
      });
    });
  });

  describe('getHolidayForDate', () => {
    it('finds exact date holiday', async () => {
      mockDb.holidayCalendar.findUnique.mockResolvedValue(mockHoliday);

      const result = await service.getHolidayForDate(
        orgId,
        '2026-12-25',
        mockDb as unknown as Prisma.TransactionClient,
      );

      expect(result).toEqual(mockHoliday);
    });

    it('matches recurring holiday on same month and day of another year', async () => {
      mockDb.holidayCalendar.findUnique.mockResolvedValue(null);
      mockDb.holidayCalendar.findMany.mockResolvedValue([mockHoliday]);

      const result = await service.getHolidayForDate(
        orgId,
        '2027-12-25',
        mockDb as unknown as Prisma.TransactionClient,
      );

      expect(result).toEqual(mockHoliday);
    });

    it('returns null if no holiday matches', async () => {
      mockDb.holidayCalendar.findUnique.mockResolvedValue(null);
      mockDb.holidayCalendar.findMany.mockResolvedValue([]);

      const result = await service.getHolidayForDate(
        orgId,
        '2026-03-15',
        mockDb as unknown as Prisma.TransactionClient,
      );

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a holiday with valid dayType', async () => {
      mockDb.holidayCalendar.findUnique.mockResolvedValue(null);
      mockDb.holidayCalendar.create.mockResolvedValue(mockHoliday);

      const result = await service.create(
        orgId,
        {
          date: '2026-12-25',
          name: 'Christmas Day',
          dayType: 'REGULAR_HOLIDAY',
          isRecurring: true,
        },
        'user-1',
        mockDb as unknown as Prisma.TransactionClient,
      );

      expect(result).toEqual(mockHoliday);
      expect(mockDb.holidayCalendar.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          date: normalizeDate('2026-12-25'),
          name: 'Christmas Day',
          dayType: 'REGULAR_HOLIDAY',
          isRecurring: true,
          createdById: 'user-1',
        },
      });
    });

    it('rejects invalid dayType like REGULAR_WORKDAY', async () => {
      await expect(
        service.create(
          orgId,
          {
            date: '2026-12-25',
            name: 'Not a holiday',
            dayType:
              'REGULAR_WORKDAY' as unknown as import('@workspace/db').DayType,
          },
          'user-1',
          mockDb as unknown as Prisma.TransactionClient,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws ConflictException on duplicate date for organization', async () => {
      mockDb.holidayCalendar.findUnique.mockResolvedValue(mockHoliday);

      await expect(
        service.create(
          orgId,
          {
            date: '2026-12-25',
            name: 'Christmas Day Duplicate',
            dayType: 'REGULAR_HOLIDAY',
          },
          'user-1',
          mockDb as unknown as Prisma.TransactionClient,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('updates holiday details', async () => {
      mockDb.holidayCalendar.findFirst.mockResolvedValue(mockHoliday);
      const updated = { ...mockHoliday, name: 'Christmas Day Observed' };
      mockDb.holidayCalendar.update.mockResolvedValue(updated);

      const result = await service.update(
        orgId,
        'hol-1',
        { name: 'Christmas Day Observed' },
        mockDb as unknown as Prisma.TransactionClient,
      );

      expect(result.name).toBe('Christmas Day Observed');
    });

    it('throws NotFoundException if holiday does not exist in org', async () => {
      mockDb.holidayCalendar.findFirst.mockResolvedValue(null);

      await expect(
        service.update(
          orgId,
          'non-existent',
          { name: 'Test' },
          mockDb as unknown as Prisma.TransactionClient,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('deletes an existing holiday', async () => {
      mockDb.holidayCalendar.findFirst.mockResolvedValue(mockHoliday);
      mockDb.holidayCalendar.delete.mockResolvedValue(mockHoliday);

      const result = await service.delete(
        orgId,
        'hol-1',
        mockDb as unknown as Prisma.TransactionClient,
      );

      expect(result).toEqual(mockHoliday);
    });

    it('throws NotFoundException if holiday not found', async () => {
      mockDb.holidayCalendar.findFirst.mockResolvedValue(null);

      await expect(
        service.delete(
          orgId,
          'missing',
          mockDb as unknown as Prisma.TransactionClient,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('populateNationalPresets', () => {
    it('populates Philippine holidays including Easter-based dates and Heroes Day', async () => {
      mockDb.holidayCalendar.findUnique.mockResolvedValue(null);
      mockDb.holidayCalendar.create.mockImplementation(({ data }) => ({
        id: `gen-${data.name}`,
        ...data,
      }));

      const result = await service.populateNationalPresets(
        orgId,
        2026,
        'user-1',
        mockDb as unknown as Prisma.TransactionClient,
      );

      // Total 16 statutory presets
      expect(result.addedCount).toBe(16);
      expect(mockDb.holidayCalendar.create).toHaveBeenCalledTimes(16);

      // Verify New Year's Day
      const nyd = result.holidays.find((h) => h.name === "New Year's Day");
      expect(nyd).toBeDefined();
      expect(nyd?.dayType).toBe('REGULAR_HOLIDAY');

      // Verify Maundy Thursday & Good Friday for 2026: Easter 2026 is April 5, so April 2 and April 3
      const maundy = result.holidays.find((h) => h.name === 'Maundy Thursday');
      expect(maundy).toBeDefined();
      expect(maundy?.date.toISOString().slice(0, 10)).toBe('2026-04-02');

      const goodFriday = result.holidays.find((h) => h.name === 'Good Friday');
      expect(goodFriday).toBeDefined();
      expect(goodFriday?.date.toISOString().slice(0, 10)).toBe('2026-04-03');

      // National Heroes Day: last Monday of August 2026 is August 31
      const heroesDay = result.holidays.find(
        (h) => h.name === 'National Heroes Day',
      );
      expect(heroesDay).toBeDefined();
      expect(heroesDay?.date.toISOString().slice(0, 10)).toBe('2026-08-31');
    });

    it('skips existing holidays without throwing conflict', async () => {
      // Simulate that Christmas already exists
      mockDb.holidayCalendar.findUnique.mockImplementation(({ where }) => {
        if (
          where.organizationId_date.date.toISOString().startsWith('2026-12-25')
        ) {
          return mockHoliday;
        }
        return null;
      });
      mockDb.holidayCalendar.create.mockImplementation(({ data }) => ({
        id: `gen-${data.name}`,
        ...data,
      }));

      const result = await service.populateNationalPresets(
        orgId,
        2026,
        'user-1',
        mockDb as unknown as Prisma.TransactionClient,
      );

      expect(result.addedCount).toBe(15); // 16 - 1 skipped
    });
  });
});
