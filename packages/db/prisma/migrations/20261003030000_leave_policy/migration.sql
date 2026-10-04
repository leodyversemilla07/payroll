-- CreateEnum
CREATE TYPE "AccrualFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "CarryoverPolicy" AS ENUM ('NO_CARRYOVER', 'CAPPED', 'UNLIMITED');

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "annualCredits" DECIMAL(5,2) NOT NULL,
    "accrualFrequency" "AccrualFrequency" NOT NULL DEFAULT 'ANNUAL',
    "carryoverPolicy" "CarryoverPolicy" NOT NULL DEFAULT 'NO_CARRYOVER',
    "maxCarryoverDays" DECIMAL(5,2),
    "eligibleAfterMonths" INTEGER NOT NULL DEFAULT 6,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeavePolicy_organizationId_leaveType_key" ON "LeavePolicy"("organizationId", "leaveType");

-- CreateIndex
CREATE INDEX "LeavePolicy_organizationId_idx" ON "LeavePolicy"("organizationId");

-- CreateIndex
CREATE INDEX "LeavePolicy_isActive_idx" ON "LeavePolicy"("isActive");

-- AddForeignKey
ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
