-- Track per-payslip 13th-month/bonus payouts for the PHP 90,000 annual
-- other-benefits bucket (TRAIN Law), alongside de minimis excess.
-- Existing rows default to zero; year-to-date usage starts from the
-- column's introduction forward and converges at year-end annualization.
ALTER TABLE "Payslip" ADD COLUMN "bonusPaidCents" BIGINT NOT NULL DEFAULT 0;
