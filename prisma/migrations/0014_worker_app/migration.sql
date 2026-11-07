-- スタッフ画面：高速代の区間、インター、高速料金のキャッシュ
ALTER TABLE "ReportExpense" ADD COLUMN "tollFrom" TEXT,
ADD COLUMN "tollTo" TEXT,
ADD COLUMN "tollFromIcId" TEXT,
ADD COLUMN "tollToIcId" TEXT,
ADD COLUMN "tollCar" TEXT,
ADD COLUMN "tollRound" BOOLEAN;

-- CreateTable
CREATE TABLE "Interchange" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roadName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TollFare" (
    "id" TEXT NOT NULL,
    "fromIcId" TEXT NOT NULL,
    "toIcId" TEXT NOT NULL,
    "fareKei" INTEGER,
    "fareNormal" INTEGER,
    "fareMedium" INTEGER,
    "fareLarge" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TollFare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interchange_name_idx" ON "Interchange"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TollFare_fromIcId_toIcId_key" ON "TollFare"("fromIcId", "toIcId");
