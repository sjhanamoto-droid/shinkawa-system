-- ログインの世代（パスワード変更・リセット・無効化で上げ、それより前のログインを使えなくする）
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
