-- Preserve existing requests. Legacy approvals have no inferred debit/refund provenance.
ALTER TABLE "LeaveRequest"
ADD COLUMN "debitedBalanceId" TEXT,
ADD COLUMN "debitedDays" DECIMAL(5,2),
ADD COLUMN "cancelledById" TEXT,
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "cancelledFromStatus" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "refundedDays" DECIMAL(5,2);
