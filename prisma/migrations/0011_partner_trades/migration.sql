-- 協力会社・下請の「業種」（複数・任意の文字列）
ALTER TABLE "Partner" ADD COLUMN "trades" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- これまでの「主な部門」を業種に移す
UPDATE "Partner" SET "trades" = ARRAY['クリーニング'] WHERE "department" = 'CLEANING';
UPDATE "Partner" SET "trades" = ARRAY['工事'] WHERE "department" = 'CONSTRUCTION';
