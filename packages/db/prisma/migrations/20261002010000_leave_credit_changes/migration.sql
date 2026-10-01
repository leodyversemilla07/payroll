-- Existing credits remain unchanged and are not represented as verified allocations.
ALTER TABLE "LeaveBalance" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "LeaveCreditChange" (
  "id" TEXT NOT NULL,
  "balanceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "previousTotalCredits" DECIMAL(5,2),
  "totalCredits" DECIMAL(5,2) NOT NULL,
  "usedCredits" DECIMAL(5,2) NOT NULL,
  "previousBalance" DECIMAL(5,2),
  "availableBalance" DECIMAL(5,2) NOT NULL,
  "previousRevision" INTEGER,
  "revision" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveCreditChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LeaveCreditChange_balanceId_createdAt_idx" ON "LeaveCreditChange"("balanceId", "createdAt");
ALTER TABLE "LeaveCreditChange" ADD CONSTRAINT "LeaveCreditChange_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "LeaveBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
