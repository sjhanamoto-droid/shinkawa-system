# シンカワシステム

> 株式会社シンカワ（清掃・工事）向けの予定管理システム。Mielba（建設業向け現場管理アプリ）を母体に再構成。
> 白板（仮組み）＋サイボウズ（確定）の二段運用を、ひとつのカレンダーに置き換える。

## Phase 1 の範囲

| 機能 | 概要 |
| --- | --- |
| **カレンダー**（`/schedule`） | 月／週／日／担当者ボード。週ビューの左に「未割当レーン」。PC はドラッグ＆ドロップ、スマホは「移動」シート。定期の回を動かすと「この回だけ／以降の定期も」を選択。変更履歴・競合検知・30秒ポーリング。1行入力「9/24 直井さん 1人」からの仮登録（クイック登録） |
| 顧客（`/customers`） | 元請・管理会社。サイボウズ アドレス帳の CSV 取込（Shift_JIS/UTF-8、列マッピング、dryRun） |
| 現場＝物件（`/properties`） | 住所・キーBOX（番号・場所・写真）・入館メモ・図面PDF・現調写真・メモ・引き継ぎ・関連物件 |
| 案件（`/jobs`） | 定期契約（毎月／月2回／毎週／第n曜日／nか月ごと／季節）・スポット・工事。翌月分の実施回を「未割当」で自動生成（毎月の設定日 cron ＋手動ボタン） |
| 作業者（`/workers`）／協力会社（`/partners`） | 社員・アルバイト（タグ）・協力会社スタッフ・下請。ログインの有無を分けられる |
| 車両（`/vehicles`） | 社有車の台帳。カレンダーの予定ごとに「当日使う車両」を複数選べ、同じ日に他の予定でも使う車両には注意が出る（ブロックはしない）。案件に既定の車両を付けると生成した実施回に引き継がれる |
| 権限 | 最高管理者 / 事務・経理 / 手配担当（自部門のみ編集） / スタッフ（自分の予定・完了のみ）。**金額は最高管理者・事務経理にしかHTMLに含めない** |

Phase 2 以降（日報・経費OCR・勤怠CSV・LINE連携）は `docs/` の計画を参照。

## セットアップ

```bash
npm install
cp .env.example .env      # Neon の接続文字列・AUTH_SECRET などを設定
npx prisma migrate dev --name init   # 初回（開発DB）。以降は npm run db:migrate
npm run db:seed           # デモデータ（顧客300・物件約450・実施回3ヶ月分）
npm run dev               # http://localhost:3000
```

ローカルに PostgreSQL が無い場合は Neon の開発ブランチを使う（`POSTGRES_PRISMA_URL` にプール接続、`POSTGRES_URL_NON_POOLING` に直結）。

### デモログイン（パスワード共通：`shinkawa123`、`SEED_PASSWORD` で変更可）

| 役割 | メール |
| --- | --- |
| 最高管理者 | `kondo@example.com` |
| 事務・経理 | `jimu@example.com` |
| 手配担当（清掃） | `tehai-c@example.com` |
| 手配担当（工事） | `tehai-k@example.com` |
| スタッフ | `fujino@example.com` ほか |
| アルバイト | `pt01@example.com` 〜 `pt08@example.com` |

## コマンド

```bash
npm run build        # prisma generate && next build
npm run lint         # next lint
npm run typecheck    # tsc --noEmit
npm test             # vitest（周期ルール・権限・CSV）
npm run db:migrate   # prisma migrate dev
npm run db:deploy    # prisma migrate deploy（本番）
npm run db:seed      # シード
npm run db:reset     # 開発DBを作り直してシード
npm run test:routes  # スモーク（dev サーバー起動後。BASE=http://localhost:3000）
```

## 環境変数（`.env.example`）

| 変数 | 用途 |
| --- | --- |
| `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` | Neon PostgreSQL（プール／直結） |
| `AUTH_SECRET` | セッション JWT の署名鍵 |
| `NEXT_PUBLIC_APP_NAME` | 表示名（既定 シンカワ） |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | クイック登録の抽出（未設定なら正規表現で動作） |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob（写真・PDF。Vercel 上は OIDC で自動） |
| `CRON_SECRET` | Vercel Cron の認可 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push |
| `SEED_PASSWORD` / `SEED_ONLY_IF_EMPTY` | シード |

## デプロイ（Vercel ＋ Neon）

- `vercel-build`：`prisma generate && prisma migrate deploy && SEED_ONLY_IF_EMPTY=1 tsx prisma/seed.ts && next build`
- `vercel.json` の cron：`/api/cron/daily-checks`（毎日 18:00 JST：明日の予定通知・Blob掃除）、`/api/cron/generate-occurrences`（毎日 09:00 JST に呼び、設定日と一致する日だけ翌月分を生成）
- リージョンは Neon と揃える（既定 `sin1`）。

## マイグレーション方針

- `prisma/migrations/` は PostgreSQL 専用。初回は `prisma migrate dev --name init` で1本の baseline を作る。
- 以後のスキーマ変更は additive を基本にし、DROP を含む差分はレビュー必須。本番は `prisma migrate deploy`。

## ディレクトリ構成

```
prisma/
  schema.prisma        顧客→物件→案件→実施回→配員 のデータモデル
  seed.ts              決定的なデモデータ
src/
  app/(app)/           認証必須の各画面（schedule / customers / properties / jobs / workers / partners / settings …）
  app/api/             avatars / photos / media / cron
  features/schedule/   カレンダー（query / actions / D&D / 各ビュー / ドロワー / 移動シート / クイック登録）
  features/customers|properties|jobs|partners|users|settings|notifications|auth
  lib/                 permissions（権限マトリクス） / recurrence（周期ルール） / generate-occurrences / csv / date / session / media …
  components/          UI部品・App Shell
scripts/smoke.mts      ルートのスモークテスト
```

## 設計メモ

- 実施回（Occurrence）の状態：`UNASSIGNED（未割当）→ TENTATIVE（仮）→ CONFIRMED（確定）→ DONE / CANCELLED`。`date=null` は未割当レーン。
- 楽観ロック：`Occurrence.version`。他の人が先に動かしていたら CONFLICT を返し、画面は最新に更新する。
- 日付は `src/lib/date.ts` の規約（サーバーTZの深夜0時を保存、`storedDateKey` で復元）。`@db.Date` は使わない。
- 金額は `canViewAmounts(user)` のときだけ Prisma の `select` に含める（クライアントに渡さない）。
