-- Explicit half-day date for fractional (x.5) leave requests. Whole-day rows
-- keep NULL; no backfill needed.
ALTER TABLE "LeaveRequest" ADD COLUMN "partialDate" DATE;
