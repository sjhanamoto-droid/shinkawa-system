-- 写真・図面：改訂（版）、バックアップ済みの印、削除の猶予（削除済み）
ALTER TABLE "Photo" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "replacesId" TEXT,
ADD COLUMN "supersededAt" TIMESTAMP(3),
ADD COLUMN "backedUpAt" TIMESTAMP(3);

CREATE INDEX "Photo_backedUpAt_idx" ON "Photo"("backedUpAt");

CREATE TABLE "DeletedMedia" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "occurrenceId" TEXT,
    "reportId" TEXT,
    "claimId" TEXT,
    "dataUrl" TEXT,
    "thumbUrl" TEXT,
    "blobPath" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "duration" INTEGER,
    "caption" TEXT,
    "kind" TEXT NOT NULL,
    "isVideo" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,
    "height" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "replacesId" TEXT,
    "supersededAt" TIMESTAMP(3),
    "backedUpAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAfter" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "DeletedMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeletedMedia_purgeAfter_idx" ON "DeletedMedia"("purgeAfter");
CREATE INDEX "DeletedMedia_propertyId_idx" ON "DeletedMedia"("propertyId");
CREATE INDEX "DeletedMedia_reportId_idx" ON "DeletedMedia"("reportId");
