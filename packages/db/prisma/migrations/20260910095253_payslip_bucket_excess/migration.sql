-- Track per-payslip de minimis excess for the PHP 90,000 annual
-- other-benefits bucket (TRAIN Law). Existing rows default to zero;
-- their pre-migration excess is untracked, so year-to-date usage starts
-- from this migration forward and converges at year-end annualization.
ALTER TABLE "Payslip" ADD COLUMN "deMinimisExcessCents" BIGINT NOT NULL DEFAULT 0;
