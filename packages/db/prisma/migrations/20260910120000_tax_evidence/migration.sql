-- Write-once provenance for tax reconciliation inputs. No historical rows are
-- backfilled or assumed verified: older years require explicit evidence entry.
CREATE TABLE "PriorEmployerDeclaration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "hasPriorEmployer" BOOLEAN NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriorEmployerDeclaration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PriorEmployerDeclaration_employeeId_taxYear_key" ON "PriorEmployerDeclaration"("employeeId", "taxYear");
CREATE INDEX "PriorEmployerDeclaration_organizationId_taxYear_idx" ON "PriorEmployerDeclaration"("organizationId", "taxYear");
ALTER TABLE "PriorEmployerDeclaration" ADD CONSTRAINT "PriorEmployerDeclaration_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriorEmployerDeclaration" ADD CONSTRAINT "PriorEmployerDeclaration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PreviousEmployerIncome" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "employerName" TEXT NOT NULL,
    "employerTin" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "grossCompensationCents" BIGINT NOT NULL,
    "taxableCompensationCents" BIGINT NOT NULL,
    "taxWithheldCents" BIGINT NOT NULL,
    "documentReference" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PreviousEmployerIncome_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PreviousEmployerIncome_amount_check" CHECK ("grossCompensationCents" >= 0 AND "taxableCompensationCents" >= 0 AND "taxWithheldCents" >= 0 AND "taxableCompensationCents" <= "grossCompensationCents"),
    CONSTRAINT "PreviousEmployerIncome_period_check" CHECK ("periodStart" <= "periodEnd" AND EXTRACT(YEAR FROM "periodStart") = "taxYear" AND EXTRACT(YEAR FROM "periodEnd") = "taxYear")
);
CREATE UNIQUE INDEX "PreviousEmployerIncome_employee_year_tin_period_key" ON "PreviousEmployerIncome"("employeeId", "taxYear", "employerTin", "periodStart", "periodEnd");
CREATE INDEX "PreviousEmployerIncome_organizationId_taxYear_idx" ON "PreviousEmployerIncome"("organizationId", "taxYear");
ALTER TABLE "PreviousEmployerIncome" ADD CONSTRAINT "PreviousEmployerIncome_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreviousEmployerIncome" ADD CONSTRAINT "PreviousEmployerIncome_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MonthlyTaxRemittanceEvidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "remittedCents" BIGINT NOT NULL,
    "documentReference" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlyTaxRemittanceEvidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MonthlyTaxRemittanceEvidence_month_check" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "MonthlyTaxRemittanceEvidence_amount_check" CHECK ("remittedCents" >= 0)
);
CREATE UNIQUE INDEX "MonthlyTaxRemittanceEvidence_organizationId_taxYear_month_key" ON "MonthlyTaxRemittanceEvidence"("organizationId", "taxYear", "month");
ALTER TABLE "MonthlyTaxRemittanceEvidence" ADD CONSTRAINT "MonthlyTaxRemittanceEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
