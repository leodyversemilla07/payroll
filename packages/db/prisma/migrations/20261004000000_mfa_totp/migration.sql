-- AlterTable
ALTER TABLE "User" ADD COLUMN "mfaSecret" TEXT,
ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mfaBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
