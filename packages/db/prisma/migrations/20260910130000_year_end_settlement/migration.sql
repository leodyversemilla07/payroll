-- Auditable December/termination year-end tax settlement ledger. A computed
-- 2316 difference is not a payment: each row records that a deficiency was
-- actually withheld from (or a refund actually paid with) disbursed payroll.
-- Write-once per employee-year; no rows are backfilled.
CREATE TABLE "YearEndTaxSettlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "settlementType" TEXT NOT NULL,
    "computedDifferenceCents" BIGINT NOT NULL,
    "settledCents" BIGINT NOT NULL,
    "settlementDate" DATE NOT NULL,
    "documentReference" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "YearEndTaxSettlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "YearEndTaxSettlement_type_check" CHECK ("settlementType" IN ('DEFICIENCY_WITHHELD', 'REFUND_PAID')),
    CONSTRAINT "YearEndTaxSettlement_amount_check" CHECK ("settledCents" > 0),
    CONSTRAINT "YearEndTaxSettlement_year_check" CHECK ("taxYear" BETWEEN 2023 AND 2100 AND EXTRACT(YEAR FROM "settlementDate") = "taxYear")
);
CREATE UNIQUE INDEX "YearEndTaxSettlement_employeeId_taxYear_key" ON "YearEndTaxSettlement"("employeeId", "taxYear");
CREATE INDEX "YearEndTaxSettlement_organizationId_taxYear_idx" ON "YearEndTaxSettlement"("organizationId", "taxYear");
ALTER TABLE "YearEndTaxSettlement" ADD CONSTRAINT "YearEndTaxSettlement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "YearEndTaxSettlement" ADD CONSTRAINT "YearEndTaxSettlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
