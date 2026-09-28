-- Controlled correction (supersession) for write-once tax evidence. Rows are
-- never mutated: a correction appends a higher version of the same key that
-- points at the row it replaces, with a reason and a reviewer. Readers use
-- the highest version per key. Existing rows backfill to version 1.
ALTER TABLE "PriorEmployerDeclaration" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PriorEmployerDeclaration" ADD COLUMN "supersedesId" TEXT;
ALTER TABLE "PriorEmployerDeclaration" ADD COLUMN "correctionReason" TEXT;
ALTER TABLE "PriorEmployerDeclaration" ADD COLUMN "reviewedById" TEXT;
DROP INDEX "PriorEmployerDeclaration_employeeId_taxYear_key";
CREATE UNIQUE INDEX "PriorEmployerDeclaration_employeeId_taxYear_version_key" ON "PriorEmployerDeclaration"("employeeId", "taxYear", "version");
CREATE UNIQUE INDEX "PriorEmployerDeclaration_supersedesId_key" ON "PriorEmployerDeclaration"("supersedesId");
ALTER TABLE "PriorEmployerDeclaration" ADD CONSTRAINT "PriorEmployerDeclaration_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "PriorEmployerDeclaration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PreviousEmployerIncome" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PreviousEmployerIncome" ADD COLUMN "supersedesId" TEXT;
ALTER TABLE "PreviousEmployerIncome" ADD COLUMN "correctionReason" TEXT;
ALTER TABLE "PreviousEmployerIncome" ADD COLUMN "reviewedById" TEXT;
DROP INDEX "PreviousEmployerIncome_employee_year_tin_period_key";
CREATE UNIQUE INDEX "PreviousEmployerIncome_employee_year_tin_period_version_key" ON "PreviousEmployerIncome"("employeeId", "taxYear", "employerTin", "periodStart", "periodEnd", "version");
CREATE UNIQUE INDEX "PreviousEmployerIncome_supersedesId_key" ON "PreviousEmployerIncome"("supersedesId");
ALTER TABLE "PreviousEmployerIncome" ADD CONSTRAINT "PreviousEmployerIncome_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "PreviousEmployerIncome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MonthlyTaxRemittanceEvidence" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MonthlyTaxRemittanceEvidence" ADD COLUMN "supersedesId" TEXT;
ALTER TABLE "MonthlyTaxRemittanceEvidence" ADD COLUMN "correctionReason" TEXT;
ALTER TABLE "MonthlyTaxRemittanceEvidence" ADD COLUMN "reviewedById" TEXT;
DROP INDEX "MonthlyTaxRemittanceEvidence_organizationId_taxYear_month_key";
-- NB: Prisma truncates this identifier to 63 chars; keep the exact name so
-- future diffs stay clean.
CREATE UNIQUE INDEX "MonthlyTaxRemittanceEvidence_organizationId_taxYear_month_v_key" ON "MonthlyTaxRemittanceEvidence"("organizationId", "taxYear", "month", "version");
CREATE UNIQUE INDEX "MonthlyTaxRemittanceEvidence_supersedesId_key" ON "MonthlyTaxRemittanceEvidence"("supersedesId");
ALTER TABLE "MonthlyTaxRemittanceEvidence" ADD CONSTRAINT "MonthlyTaxRemittanceEvidence_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "MonthlyTaxRemittanceEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "YearEndTaxSettlement" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "YearEndTaxSettlement" ADD COLUMN "supersedesId" TEXT;
ALTER TABLE "YearEndTaxSettlement" ADD COLUMN "correctionReason" TEXT;
ALTER TABLE "YearEndTaxSettlement" ADD COLUMN "reviewedById" TEXT;
DROP INDEX "YearEndTaxSettlement_employeeId_taxYear_key";
CREATE UNIQUE INDEX "YearEndTaxSettlement_employeeId_taxYear_version_key" ON "YearEndTaxSettlement"("employeeId", "taxYear", "version");
CREATE UNIQUE INDEX "YearEndTaxSettlement_supersedesId_key" ON "YearEndTaxSettlement"("supersedesId");
ALTER TABLE "YearEndTaxSettlement" ADD CONSTRAINT "YearEndTaxSettlement_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "YearEndTaxSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
