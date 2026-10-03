CREATE TABLE "TaxEvidenceCorrection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT,
    "taxYear" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "originalEvidence" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "publishedRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "TaxEvidenceCorrection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaxEvidenceCorrection_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT "TaxEvidenceCorrection_kind_check" CHECK ("kind" IN ('DECLARATION', 'PREVIOUS_INCOME', 'REMITTANCE', 'SETTLEMENT')),
    CONSTRAINT "TaxEvidenceCorrection_review_check" CHECK (
      ("status" = 'PENDING' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL AND "publishedRecordId" IS NULL)
      OR ("status" <> 'PENDING' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewedById" <> "requestedById"
          AND (("status" = 'APPROVED' AND "publishedRecordId" IS NOT NULL) OR ("status" = 'REJECTED' AND "publishedRecordId" IS NULL)))
    )
);
CREATE INDEX "TaxEvidenceCorrection_organizationId_taxYear_status_idx" ON "TaxEvidenceCorrection"("organizationId", "taxYear", "status");
CREATE UNIQUE INDEX "TaxEvidenceCorrection_pending_target_key" ON "TaxEvidenceCorrection"("organizationId", "kind", "targetId") WHERE "status" = 'PENDING';
ALTER TABLE "TaxEvidenceCorrection" ADD CONSTRAINT "TaxEvidenceCorrection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
