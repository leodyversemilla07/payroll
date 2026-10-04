-- CreateTable
CREATE TABLE "HolidayCalendar" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "dayType" "DayType" NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HolidayCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HolidayCalendar_organizationId_date_key" ON "HolidayCalendar"("organizationId", "date");

-- CreateIndex
CREATE INDEX "HolidayCalendar_organizationId_idx" ON "HolidayCalendar"("organizationId");

-- CreateIndex
CREATE INDEX "HolidayCalendar_date_idx" ON "HolidayCalendar"("date");

-- AddForeignKey
ALTER TABLE "HolidayCalendar" ADD CONSTRAINT "HolidayCalendar_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
