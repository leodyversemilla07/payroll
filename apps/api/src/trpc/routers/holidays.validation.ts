import { z } from 'zod';

export const holidayDayTypeSchema = z.enum([
  'REGULAR_HOLIDAY',
  'SPECIAL_NON_WORKING_HOLIDAY',
  'SPECIAL_WORKING_HOLIDAY',
  'DOUBLE_HOLIDAY',
]);

export const listHolidaysSchema = z
  .object({
    year: z.number().int().min(2000).max(2100).optional(),
  })
  .optional();

export const createHolidaySchema = z.object({
  date: z.string().date(),
  name: z.string().trim().min(2).max(100),
  dayType: holidayDayTypeSchema,
  isRecurring: z.boolean().optional(),
});

export const updateHolidaySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(100).optional(),
  dayType: holidayDayTypeSchema.optional(),
  isRecurring: z.boolean().optional(),
});

export const deleteHolidaySchema = z.object({
  id: z.string().uuid(),
});

export const populatePresetsSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});
