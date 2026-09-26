-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "involvedOthers" TEXT,
ADD COLUMN     "involvedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "siteContact" TEXT;

