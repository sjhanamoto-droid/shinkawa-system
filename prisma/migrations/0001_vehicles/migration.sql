-- AlterTable
ALTER TABLE "Job" DROP COLUMN "vehicle",
ADD COLUMN     "vehicleId" TEXT;

-- AlterTable
ALTER TABLE "Occurrence" DROP COLUMN "vehicle";

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plateNumber" TEXT,
    "vehicleType" TEXT,
    "department" TEXT,
    "color" TEXT NOT NULL DEFAULT '#2f63f5',
    "memo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccurrenceVehicle" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OccurrenceVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vehicle_active_sortOrder_idx" ON "Vehicle"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "OccurrenceVehicle_vehicleId_idx" ON "OccurrenceVehicle"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "OccurrenceVehicle_occurrenceId_vehicleId_key" ON "OccurrenceVehicle"("occurrenceId", "vehicleId");

-- CreateIndex
CREATE INDEX "Job_vehicleId_idx" ON "Job"("vehicleId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccurrenceVehicle" ADD CONSTRAINT "OccurrenceVehicle_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccurrenceVehicle" ADD CONSTRAINT "OccurrenceVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

