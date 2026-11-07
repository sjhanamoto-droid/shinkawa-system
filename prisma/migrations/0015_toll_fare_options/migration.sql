-- 高速料金：料金の種類（ETC・現金・各種割引）ごとの保存と、選んだ種類
ALTER TABLE "ReportExpense" ADD COLUMN "tollFareLabel" TEXT;

ALTER TABLE "TollFare" ADD COLUMN "options" JSONB;

-- CreateTable
CREATE TABLE "TollFareType" (
    "id" INTEGER NOT NULL,
    "caption" TEXT NOT NULL,
    "roadGroup" TEXT,
    "payment" TEXT,
    "applyTimes" TEXT,
    "applyDays" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TollFareType_pkey" PRIMARY KEY ("id")
);
