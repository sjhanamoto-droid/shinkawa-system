-- AlterTable
ALTER TABLE "DailyReport" DROP COLUMN "vehicle",
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "handoverNone" BOOLEAN,
ADD COLUMN     "parkingFee" INTEGER,
ADD COLUMN     "trainFare" INTEGER;

-- CreateIndex
CREATE INDEX "DailyReport_propertyId_workDate_idx" ON "DailyReport"("propertyId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_occurrenceId_userId_workDate_key" ON "DailyReport"("occurrenceId", "userId", "workDate");

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

