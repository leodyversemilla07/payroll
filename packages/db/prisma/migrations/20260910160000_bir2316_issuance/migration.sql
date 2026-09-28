-- BIR 2316 issuance ledger. A worksheet preview is never the certificate:
-- each row marks an actual issuance with frozen reconciled figures.
-- Certificates are voided, never deleted; a re-issue appends a higher
-- version. No rows are backfilled.
CREATE TABLE "Bir2316Issuance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "hadPriorEmployer" BOOLEAN NOT NULL,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bir2316Issuance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Bir2316Issuance_status_check" CHECK ("status" IN ('ISSUED', 'VOIDED')),
    CONSTRAINT "Bir2316Issuance_year_check" CHECK ("taxYear" BETWEEN 2023 AND 2100)
);
CREATE UNIQUE INDEX "Bir2316Issuance_employeeId_taxYear_version_key" ON "Bir2316Issuance"("employeeId", "taxYear", "version");
CREATE UNIQUE INDEX "Bir2316Issuance_supersedesId_key" ON "Bir2316Issuance"("supersedesId");
CREATE INDEX "Bir2316Issuance_organizationId_taxYear_idx" ON "Bir2316Issuance"("organizationId", "taxYear");
ALTER TABLE "Bir2316Issuance" ADD CONSTRAINT "Bir2316Issuance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bir2316Issuance" ADD CONSTRAINT "Bir2316Issuance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bir2316Issuance" ADD CONSTRAINT "Bir2316Issuance_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Bir2316Issuance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
