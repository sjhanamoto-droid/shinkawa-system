-- CreateTable
CREATE TABLE "CatalogLink" (
    "id" TEXT NOT NULL,
    "groupName" TEXT NOT NULL DEFAULT 'その他',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogLink_groupName_sortOrder_idx" ON "CatalogLink"("groupName", "sortOrder");


-- 最初のリンク
INSERT INTO "CatalogLink" ("id", "groupName", "title", "url", "sortOrder", "updatedAt") VALUES
  ('cl_shinkawa_hp', '自社', 'シンカワ ホームページ', 'http://shinkawa-jp.com/', 10, CURRENT_TIMESTAMP),
  ('cl_sangetsu_sp', 'サンゲツ', 'サンゲツ SP', 'https://contents.sangetsu.co.jp/digital_book/sp25/', 110, CURRENT_TIMESTAMP),
  ('cl_sangetsu_fine', 'サンゲツ', 'サンゲツ fine', 'https://contents.sangetsu.co.jp/digital_book/fine26/', 120, CURRENT_TIMESTAMP),
  ('cl_sangetsu_reform', 'サンゲツ', 'リフォームアップ', 'https://contents.sangetsu.co.jp/digital_book/reform24/', 130, CURRENT_TIMESTAMP),
  ('cl_sangetsu_floortile', 'サンゲツ', 'フロアタイル', 'https://contents.sangetsu.co.jp/digital_book/floortile23/', 140, CURRENT_TIMESTAMP),
  ('cl_sangetsu_cf', 'サンゲツ', 'CF（クッションフロア）', 'https://contents.sangetsu.co.jp/digital_book/homefloor24/', 150, CURRENT_TIMESTAMP),
  ('cl_sangetsu_sfloor', 'サンゲツ', '長尺 Sフロア', 'https://contents.sangetsu.co.jp/digital_book/sfloor25/', 160, CURRENT_TIMESTAMP),
  ('cl_3m_dinoc', '3M', '3M ダイノック', 'https://3m.icata.net/iportal/CatalogViewInterfaceStartUpAction.do?method=startUp&mode=PAGE&volumeID=TMJ00001&catalogId=3300760000&pageGroupId=1&designID=JAJP&catalogCategoryId=&designConfirmFlg=&pagePosition=R', 210, CURRENT_TIMESTAMP);
