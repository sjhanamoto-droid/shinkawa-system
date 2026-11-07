-- カレンダーから登録した現場で「作業内容：未設定」になっていたものを直す。
-- 作業（Job）が1つも無く、予定がある現場に、いちばん新しい予定の部門・種別で作業を作る
-- （工事なら契約の形は「工事」、クリーニングなら「スポット」）。その現場の作業が付いていない予定は、作った作業に付ける。

WITH latest AS (
  SELECT DISTINCT ON (o."propertyId")
    o."propertyId", o."department", o."category"
  FROM "Occurrence" o
  WHERE o."propertyId" IS NOT NULL
    AND o."category" <> 'OFF'
    AND o."department" IN ('CLEANING', 'CONSTRUCTION')
    AND NOT EXISTS (SELECT 1 FROM "Job" j WHERE j."propertyId" = o."propertyId")
  ORDER BY o."propertyId", o."createdAt" DESC
),
created AS (
  INSERT INTO "Job" ("id", "customerId", "propertyId", "name", "department", "category", "contractType", "status", "createdAt", "updatedAt")
  SELECT
    gen_random_uuid()::text,
    p."customerId",
    l."propertyId",
    COALESCE(c."label", l."category"),
    l."department",
    l."category",
    CASE WHEN l."department" = 'CONSTRUCTION' THEN 'CONSTRUCTION' ELSE 'SPOT' END,
    CASE p."status" WHEN 'PAUSED' THEN 'PAUSED' WHEN 'INACTIVE' THEN 'ENDED' ELSE 'ACTIVE' END,
    NOW(),
    NOW()
  FROM latest l
  JOIN "Property" p ON p."id" = l."propertyId"
  LEFT JOIN "Category" c ON c."key" = l."category"
  RETURNING "id", "propertyId"
)
UPDATE "Occurrence" o
SET "jobId" = created."id"
FROM created
WHERE o."propertyId" = created."propertyId" AND o."jobId" IS NULL;
