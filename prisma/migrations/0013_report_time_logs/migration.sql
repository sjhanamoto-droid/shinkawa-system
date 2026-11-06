-- 提出後に日報の開始・終了時刻を直した記録
CREATE TABLE "ReportTimeLog" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "fromStart" TEXT NOT NULL,
    "fromEnd" TEXT NOT NULL,
    "toStart" TEXT NOT NULL,
    "toEnd" TEXT NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportTimeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportTimeLog_reportId_createdAt_idx" ON "ReportTimeLog"("reportId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReportTimeLog" ADD CONSTRAINT "ReportTimeLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTimeLog" ADD CONSTRAINT "ReportTimeLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
