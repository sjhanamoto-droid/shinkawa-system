-- 削除済みの領収書を元に戻すとき経費につなぎ直すための経費ID、バックアップに失敗したものを後回しにする印
ALTER TABLE "DeletedMedia" ADD COLUMN "expenseId" TEXT;
ALTER TABLE "Photo" ADD COLUMN "backupFailedAt" TIMESTAMP(3);
