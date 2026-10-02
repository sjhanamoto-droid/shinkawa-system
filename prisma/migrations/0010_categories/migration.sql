-- CreateTable
CREATE TABLE "Category" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "short" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "department" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Category_sortOrder_idx" ON "Category"("sortOrder");

-- 最初からある種別（これまでコードに書いていたもの。サイボウズのラベルに合わせた名前・色）
INSERT INTO "Category" ("key", "label", "short", "color", "department", "sortOrder", "builtin", "updatedAt") VALUES
  ('HANDOVER_CLEANING',    '引渡し清掃',       '引渡',   '#14b8a6', 'CLEANING',     10,  true, CURRENT_TIMESTAMP),
  ('REGULAR_CLEANING',     '定期清掃',         '定期',   '#10b981', 'CLEANING',     20,  true, CURRENT_TIMESTAMP),
  ('FLOOR_CLEANING',       '床清掃',           '床',     '#0ea5e9', 'CLEANING',     30,  true, CURRENT_TIMESTAMP),
  ('AIRCON',               'エアコン',         'AC',     '#3b82f6', 'CLEANING',     40,  true, CURRENT_TIMESTAMP),
  ('POST_REFORM_CLEANING', 'リフォーム後清掃', 'R後',    '#06b6d4', 'CLEANING',     50,  true, CURRENT_TIMESTAMP),
  ('VACANT',               '空室',             '空室',   '#6366f1', 'CLEANING',     60,  true, CURRENT_TIMESTAMP),
  ('INTERIOR',             '内装工事',         '内装',   '#f97316', 'CONSTRUCTION', 70,  true, CURRENT_TIMESTAMP),
  ('EXTERIOR',             '外壁工事',         '外壁',   '#ef4444', 'CONSTRUCTION', 80,  true, CURRENT_TIMESTAMP),
  ('CLOTH',                'クロス工事',       'クロス', '#d946ef', 'CONSTRUCTION', 90,  true, CURRENT_TIMESTAMP),
  ('SURVEY',               '現調',             '現調',   '#8b5cf6', NULL,           100, true, CURRENT_TIMESTAMP),
  ('WASTE_DISPOSAL',       '産廃処分',         '産廃',   '#78716c', NULL,           110, true, CURRENT_TIMESTAMP),
  ('SUPPORT',              '作業応援',         '応援',   '#f59e0b', NULL,           120, true, CURRENT_TIMESTAMP),
  ('OFF',                  '休み',             '休',     '#64748b', NULL,           130, true, CURRENT_TIMESTAMP),
  ('OTHER',                'その他',           '他',     '#94a3b8', NULL,           140, true, CURRENT_TIMESTAMP);
