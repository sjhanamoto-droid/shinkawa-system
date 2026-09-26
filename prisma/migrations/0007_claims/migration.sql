-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "claimId" TEXT;

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "occurredOn" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cause" TEXT,
    "prevention" TEXT,
    "audience" TEXT[],
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimAck" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimAck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Claim_createdAt_idx" ON "Claim"("createdAt");

-- CreateIndex
CREATE INDEX "Claim_propertyId_idx" ON "Claim"("propertyId");

-- CreateIndex
CREATE INDEX "ClaimAck_userId_ackAt_idx" ON "ClaimAck"("userId", "ackAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimAck_claimId_userId_key" ON "ClaimAck"("claimId", "userId");

-- CreateIndex
CREATE INDEX "Photo_claimId_idx" ON "Photo"("claimId");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimAck" ADD CONSTRAINT "ClaimAck_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimAck" ADD CONSTRAINT "ClaimAck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

