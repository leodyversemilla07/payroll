CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComplianceDocument_storagePath_key" ON "ComplianceDocument"("storagePath");
CREATE INDEX "ComplianceDocument_organizationId_entityType_entityId_idx" ON "ComplianceDocument"("organizationId", "entityType", "entityId");
CREATE INDEX "ComplianceDocument_organizationId_employeeId_createdAt_idx" ON "ComplianceDocument"("organizationId", "employeeId", "createdAt");

ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
