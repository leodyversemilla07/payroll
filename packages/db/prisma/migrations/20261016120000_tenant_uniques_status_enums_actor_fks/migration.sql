-- Tenant-scoped employee identity, strict status/tax domains, and actor
-- foreign keys. Safe to replay on a populated database: status columns are
-- converted in place with USING casts (they must contain only legal values —
-- the cast aborts loudly otherwise, matching the API's fail-closed writes),
-- and the new composite uniques only tighten the previous global ones, whose
-- per-org subsets are guaranteed to stay collision-free.

-- CreateEnum
CREATE TYPE "OvertimeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaxCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "YearEndSettlementType" AS ENUM ('DEFICIENCY_WITHHELD', 'REFUND_PAID');

-- CreateEnum
CREATE TYPE "Bir2316Status" AS ENUM ('ISSUED', 'VOIDED');

-- DropIndex
DROP INDEX "Employee_employeeNumber_key";

-- DropIndex
DROP INDEX "Employee_email_key";

-- AlterTable (values preserved via I/O cast; aborts if any row holds a value
-- outside the new domain)
ALTER TABLE "OvertimeRequest" ALTER COLUMN "status" TYPE "OvertimeRequestStatus" USING ("status"::"OvertimeRequestStatus");
ALTER TABLE "OvertimeRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"OvertimeRequestStatus";

ALTER TABLE "LeaveRequest" ALTER COLUMN "status" TYPE "LeaveRequestStatus" USING ("status"::"LeaveRequestStatus");
ALTER TABLE "LeaveRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"LeaveRequestStatus";
ALTER TABLE "LeaveRequest" ALTER COLUMN "cancelledFromStatus" TYPE "LeaveRequestStatus" USING ("cancelledFromStatus"::"LeaveRequestStatus");

ALTER TABLE "TaxEvidenceCorrection" ALTER COLUMN "status" TYPE "TaxCorrectionStatus" USING ("status"::"TaxCorrectionStatus");
ALTER TABLE "TaxEvidenceCorrection" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"TaxCorrectionStatus";

ALTER TABLE "YearEndTaxSettlement" ALTER COLUMN "settlementType" TYPE "YearEndSettlementType" USING ("settlementType"::"YearEndSettlementType");

ALTER TABLE "Bir2316Issuance" ALTER COLUMN "status" TYPE "Bir2316Status" USING ("status"::"Bir2316Status");

-- CreateIndex (tenant-scoped identity)
CREATE UNIQUE INDEX "Employee_organizationId_employeeNumber_key" ON "Employee"("organizationId", "employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_organizationId_email_key" ON "Employee"("organizationId", "email");

-- CreateIndex
CREATE INDEX "TaxEvidenceCorrection_organizationId_taxYear_status_idx" ON "TaxEvidenceCorrection"("organizationId", "taxYear", "status");

-- AddForeignKey (actor references; onDelete mirrors the tenancy cascade —
-- the app never hard-deletes users, so these only fire during intentional
-- tenant teardown, never silently mid-life)
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayCalendar" ADD CONSTRAINT "HolidayCalendar_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveCreditChange" ADD CONSTRAINT "LeaveCreditChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransmittalBatch" ADD CONSTRAINT "BankTransmittalBatch_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxEvidenceCorrection" ADD CONSTRAINT "TaxEvidenceCorrection_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxEvidenceCorrection" ADD CONSTRAINT "TaxEvidenceCorrection_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorEmployerDeclaration" ADD CONSTRAINT "PriorEmployerDeclaration_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorEmployerDeclaration" ADD CONSTRAINT "PriorEmployerDeclaration_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviousEmployerIncome" ADD CONSTRAINT "PreviousEmployerIncome_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviousEmployerIncome" ADD CONSTRAINT "PreviousEmployerIncome_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyTaxRemittanceEvidence" ADD CONSTRAINT "MonthlyTaxRemittanceEvidence_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyTaxRemittanceEvidence" ADD CONSTRAINT "MonthlyTaxRemittanceEvidence_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YearEndTaxSettlement" ADD CONSTRAINT "YearEndTaxSettlement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YearEndTaxSettlement" ADD CONSTRAINT "YearEndTaxSettlement_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bir2316Issuance" ADD CONSTRAINT "Bir2316Issuance_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bir2316Issuance" ADD CONSTRAINT "Bir2316Issuance_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
