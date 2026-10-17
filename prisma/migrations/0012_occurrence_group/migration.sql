-- 連続工事を1日ずつの予定に分けたとき、同じ工事の日どうしをつなぐ
ALTER TABLE "Occurrence" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "Occurrence_groupId_idx" ON "Occurrence"("groupId");
