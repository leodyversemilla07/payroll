-- The daily/hourly paid-leave credit is part of basic pay and included in
-- gross compensation and 13th-month accrual. Keep a separate audit amount
-- without changing existing payslip totals.
ALTER TABLE "Payslip" ADD COLUMN "paidLeavePayCents" BIGINT NOT NULL DEFAULT 0;
