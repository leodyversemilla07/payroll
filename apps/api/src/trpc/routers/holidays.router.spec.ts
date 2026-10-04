import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Role } from '@workspace/db';
import type { Request, Response } from 'express';
import { type Context, TrpcService } from '../trpc.service';
import { createHolidaysRouter } from './holidays.router';
import { createRouterContext, type RouterServices } from './router-context';

function context(role: Role | null, organizationId = 'org-1'): Context {
  return {
    req: {
      ip: '127.0.0.1',
      get: () => 'test',
      headers: {},
    } as unknown as Request,
    res: {} as Response,
    user: role
      ? {
          id: 'user-1',
          organizationId,
          email: 'staff@test.invalid',
          name: 'Test Staff',
          role,
        }
      : null,
  };
}

describe('holidays.router', () => {
  const mockHolidaysService = {
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    populateNationalPresets: jest.fn(),
  };
  const mockAuditService = { record: jest.fn() };

  const routerContext = createRouterContext(new TrpcService(), {
    holidaysService: mockHolidaysService,
    auditService: mockAuditService,
  } as unknown as RouterServices);

  const router = createHolidaysRouter(routerContext);

  const sampleHoliday = {
    id: '33333333-3333-4333-8333-333333333333',
    organizationId: 'org-1',
    date: new Date('2026-12-25T00:00:00.000Z'),
    name: 'Christmas Day',
    dayType: 'REGULAR_HOLIDAY' as const,
    isRecurring: true,
    createdById: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('list', () => {
    it.each([
      Role.SUPER_ADMIN,
      Role.HR_ADMIN,
      Role.PAYROLL_SPECIALIST,
      Role.DEPARTMENT_MANAGER,
    ])('allows %s to list holidays', async (role) => {
      mockHolidaysService.list.mockResolvedValue([sampleHoliday]);
      const caller = router.createCaller(context(role));

      const result = await caller.list({ year: 2026 });
      expect(result).toEqual([sampleHoliday]);
      expect(mockHolidaysService.list).toHaveBeenCalledWith('org-1', 2026);
    });

    it('denies unauthenticated caller', async () => {
      const caller = router.createCaller(context(null));
      await expect(caller.list({})).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('denies regular employee role from listing staff holiday calendar', async () => {
      const caller = router.createCaller(context(Role.EMPLOYEE));
      await expect(caller.list({})).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('create', () => {
    const input = {
      date: '2026-12-25',
      name: 'Christmas Day',
      dayType: 'REGULAR_HOLIDAY' as const,
      isRecurring: true,
    };

    it('allows HR_ADMIN to create holiday and records audit log', async () => {
      mockHolidaysService.create.mockResolvedValue(sampleHoliday);
      const caller = router.createCaller(context(Role.HR_ADMIN));

      const result = await caller.create(input);
      expect(result).toEqual(sampleHoliday);
      expect(mockHolidaysService.create).toHaveBeenCalledWith(
        'org-1',
        input,
        'user-1',
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'HolidayCalendar',
          entityId: sampleHoliday.id,
        }),
      );
    });

    it.each([
      Role.PAYROLL_SPECIALIST,
      Role.DEPARTMENT_MANAGER,
      Role.EMPLOYEE,
      null,
    ])('denies %s from creating holiday', async (role) => {
      const caller = router.createCaller(context(role));
      await expect(caller.create(input)).rejects.toMatchObject({
        code: role ? 'FORBIDDEN' : 'UNAUTHORIZED',
      });
    });

    it('maps ConflictException to CONFLICT error', async () => {
      mockHolidaysService.create.mockRejectedValue(
        new ConflictException('A holiday is already configured for this date'),
      );
      const caller = router.createCaller(context(Role.HR_ADMIN));

      await expect(caller.create(input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'A holiday is already configured for this date',
      });
    });

    it('maps UnprocessableEntityException to UNPROCESSABLE_CONTENT error', async () => {
      mockHolidaysService.create.mockRejectedValue(
        new UnprocessableEntityException(
          'Selected day type must be a valid holiday type',
        ),
      );
      const caller = router.createCaller(context(Role.HR_ADMIN));

      await expect(caller.create(input)).rejects.toMatchObject({
        code: 'UNPROCESSABLE_CONTENT',
      });
    });
  });

  describe('update', () => {
    const input = {
      id: sampleHoliday.id,
      name: 'Christmas Day (Updated)',
    };

    it('allows HR_ADMIN to update holiday and records audit log', async () => {
      const updated = { ...sampleHoliday, name: input.name };
      mockHolidaysService.getById.mockResolvedValue(sampleHoliday);
      mockHolidaysService.update.mockResolvedValue(updated);
      const caller = router.createCaller(context(Role.HR_ADMIN));

      const result = await caller.update(input);
      expect(result).toEqual(updated);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entityType: 'HolidayCalendar',
          previousValue: sampleHoliday,
          newValue: updated,
        }),
      );
    });

    it('maps NotFoundException to NOT_FOUND error', async () => {
      mockHolidaysService.getById.mockRejectedValue(
        new NotFoundException('Holiday not found'),
      );
      const caller = router.createCaller(context(Role.HR_ADMIN));

      await expect(caller.update(input)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('delete', () => {
    it('allows HR_ADMIN to delete holiday and records audit log', async () => {
      mockHolidaysService.delete.mockResolvedValue(sampleHoliday);
      const caller = router.createCaller(context(Role.HR_ADMIN));

      const result = await caller.delete({ id: sampleHoliday.id });
      expect(result).toEqual(sampleHoliday);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE',
          entityType: 'HolidayCalendar',
          entityId: sampleHoliday.id,
        }),
      );
    });
  });

  describe('populatePresets', () => {
    it('populates Philippine presets and logs audit entry', async () => {
      const presetResult = { addedCount: 16, holidays: [sampleHoliday] };
      mockHolidaysService.populateNationalPresets.mockResolvedValue(
        presetResult,
      );
      const caller = router.createCaller(context(Role.HR_ADMIN));

      const result = await caller.populatePresets({ year: 2026 });
      expect(result).toEqual(presetResult);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'HolidayCalendarPresets',
          entityId: 'org-1',
          newValue: {
            year: 2026,
            addedCount: 16,
          },
        }),
      );
    });
  });
});
