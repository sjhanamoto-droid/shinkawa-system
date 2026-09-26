-- AlterTable
ALTER TABLE "ReportExpense" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "ocr" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receiptPhotoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ReportExpense_receiptPhotoId_key" ON "ReportExpense"("receiptPhotoId");

-- AddForeignKey
ALTER TABLE "ReportExpense" ADD CONSTRAINT "ReportExpense_receiptPhotoId_fkey" FOREIGN KEY ("receiptPhotoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

