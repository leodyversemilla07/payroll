-- Preserve pending-request rejection provenance without changing existing records.
ALTER TABLE "LeaveRequest"
ADD COLUMN "rejectedById" TEXT,
ADD COLUMN "rejectionReason" TEXT;
