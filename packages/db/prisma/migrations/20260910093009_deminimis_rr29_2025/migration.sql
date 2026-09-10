-- Extend the allowance category enum for RR No. 29-2025 de minimis items
-- (actual medical assistance) and previously unmodeled BIR categories
-- (achievement awards, Christmas/major-anniversary gifts).
ALTER TYPE "DeMinimisCategory" ADD VALUE 'ACTUAL_MEDICAL_ASSISTANCE';
ALTER TYPE "DeMinimisCategory" ADD VALUE 'ACHIEVEMENT_AWARD';
ALTER TYPE "DeMinimisCategory" ADD VALUE 'GIFTS_CHRISTMAS_MAJOR';
