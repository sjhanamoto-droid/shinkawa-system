-- テスト通知の連打を防ぐ（最後に送った日時）
ALTER TABLE "User" ADD COLUMN "lastPushTestAt" TIMESTAMP(3);
