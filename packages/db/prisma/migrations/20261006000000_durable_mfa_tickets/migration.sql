CREATE TABLE "MfaTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MfaTicket_tokenHash_key" ON "MfaTicket"("tokenHash");
CREATE INDEX "MfaTicket_expiresAt_idx" ON "MfaTicket"("expiresAt");
CREATE INDEX "MfaTicket_userId_idx" ON "MfaTicket"("userId");

ALTER TABLE "MfaTicket"
ADD CONSTRAINT "MfaTicket_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
