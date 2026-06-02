# 業務委託向け 稼働・請求・経費管理システム — 設計書

- 作成日: 2026-06-02
- 対象: 個人利用（単一ユーザー）のMVP
- ステータス: 設計確定待ち（レビュー中）

## 1. 目的

複数の業務委託案件について、日々の稼働を記録し、月末にクライアントごとの請求金額・稼働時間・経費を確認できる個人用Webアプリを構築する。会計サービス（freee等）は使わず、無料枠で運用する。

## 2. スコープ

### やること（MVP）
- クライアント管理
- 契約条件管理（時給制 / 月間最低稼働時間 / 固定報酬を汎用的に設定）
- 稼働ログ入力（時間単位で直接入力）
- 経費入力（個人経費・定期経費）
- 月次サマリー（クライアント別の請求額・稼働・月の経費合計）
- 認証（自分専用1アカウント）
- Vercelへのデプロイ

### やらないこと（MVP対象外）
- 請求書PDF生成
- 複数ユーザー / チーム機能
- 稼働の開始/終了時刻・休憩からの自動計算（時間を直接入力するため不要）
- 会計連携・確定申告出力
- 経費のクライアント別配賦（経費は案件横断の個人経費として扱う）

## 3. 技術構成

| レイヤ | 採用 | 補足 |
|--------|------|------|
| フロント/サーバ | Next.js (App Router) + TypeScript | Server Components で読み取り、Server Actions で書き込み |
| DB / 認証 | Supabase (Postgres + Auth) | 無料枠 |
| デプロイ | Vercel (Hobby・無料) | Next.js の全機能が素直に動く |
| Supabase接続 | `@supabase/ssr` | Cookieベース認証、RLSを必ず有効化 |
| スタイル | Tailwind CSS（+ 必要なら shadcn/ui） | 最小限。装飾より入力効率優先 |
| テスト | Vitest | 請求計算モジュールをTDDで固める |
| 開発 | Claude Code（vibe coding） | |

### 無料運用の注意
- Supabase無料プロジェクトは約1週間アクセスが無いと一時停止する（再開可）。毎日の稼働入力で実害は小さいが認識しておく。
- Vercel Hobby は商用利用に制限があるが、個人の業務記録ツールとしての利用は問題ない範囲。

## 4. データモデル

通貨は円・整数。時間は `numeric`（小数可、例: 7.5）。

### 4.1 clients（クライアント）
```sql
id          uuid primary key default gen_random_uuid()
name        text not null
memo        text
is_active   boolean not null default true
created_at  timestamptz not null default now()
updated_at  timestamptz not null default now()
```

### 4.2 contracts（契約条件）
```sql
id                   uuid primary key default gen_random_uuid()
client_id            uuid not null references clients(id) on delete cascade
name                 text not null
billing_type         text not null check (billing_type in ('hourly','monthly_minimum','fixed'))
minimum_hours        numeric        -- monthly_minimum のとき使用（例: 100）
base_hourly_rate     numeric        -- hourly / monthly_minimum のとき使用
overtime_hourly_rate numeric        -- monthly_minimum で超過単価がある場合のみ
fixed_amount         numeric        -- fixed のとき使用（月額）
start_date           date
end_date             date
is_active            boolean not null default true
created_at           timestamptz not null default now()
updated_at           timestamptz not null default now()
```
- 最低稼働時間はクライアント/契約ごとに自由設定（ハードコードしない）。

### 4.3 work_logs（稼働ログ）
1行 = 1日 × 1契約。時間は時間単位で直接入力する。
```sql
id            uuid primary key default gen_random_uuid()
client_id     uuid not null references clients(id) on delete cascade
contract_id   uuid not null references contracts(id) on delete cascade
work_date     date not null
planned_hours numeric        -- 予定時間（任意）
actual_hours  numeric        -- 実働時間（請求計算に使用）
memo          text
status        text not null default 'planned' check (status in ('planned','worked','billed'))
created_at    timestamptz not null default now()
updated_at    timestamptz not null default now()
```
- 開始/終了時刻・休憩・work_minutes・is_billable は持たない（②の決定）。
- 入力した稼働はすべて請求対象として扱う。請求したくない日は記録しない。

### 4.4 expenses（経費）
クライアントには紐付けない（案件横断の個人経費）。
```sql
id               uuid primary key default gen_random_uuid()
expense_date     date not null
category         text not null   -- 例: wifi / rent / mobile（自由入力 or 簡易選択）
amount           numeric not null
allocation_rate  numeric not null default 1.0   -- 按分率（0〜1）
allocated_amount numeric generated always as (round(amount * allocation_rate)) stored
memo             text
is_recurring     boolean not null default false  -- 定期経費の目印（複製対象）
created_at       timestamptz not null default now()
updated_at       timestamptz not null default now()
```
- `allocated_amount` は生成列（保存値のドリフトを防ぐ）。円整数に丸め。

### 4.5 RLS（行レベルセキュリティ）
- 全テーブルで RLS を有効化。
- ポリシー: 認証済みユーザー（`auth.role() = 'authenticated'`）のみ全操作可。
- 単一ユーザー運用のため `user_id` 列は持たない（将来の複数ユーザー化が発生したら追加）。

## 5. 請求計算ロジック（TS純関数・TDD対象）

`lib/billing.ts` に純関数として実装し、Vitest でテストする。入力はプレーンな値、出力は金額と内訳。

### 入力（契約ごと・対象年月ごと）
- `billingType`, `minimumHours`, `baseHourlyRate`, `overtimeHourlyRate`, `fixedAmount`
- `workedHours` = 対象年月・対象契約の `actual_hours` 合計
- `month` が契約期間 `[start_date, end_date]` 内かどうか

### 計算ルール
```
billable_hours（請求対象時間） = max(workedHours, minimumHours)   // monthly_minimum のとき

[hourly]            amount = workedHours * baseHourlyRate
[monthly_minimum]
  overtime_rate あり: amount = minimumHours * baseHourlyRate
                             + max(workedHours - minimumHours, 0) * overtimeHourlyRate
  overtime_rate なし: amount = max(workedHours, minimumHours) * baseHourlyRate
[fixed]             amount = (month が契約期間内) ? fixedAmount : 0
```
- 最終的に円整数へ丸め（`Math.round`）。
- 入力した稼働は全て請求対象（非請求フラグは無い）。

### テストケース（最低限）
- hourly: 80h × 5000円 = 400,000
- monthly_minimum（超過単価なし）: 実働80h < 最低100h → 100h × 単価
- monthly_minimum（超過単価なし）: 実働120h ≥ 最低100h → 120h × 単価
- monthly_minimum（超過単価あり）: 実働120h, 最低100h, base/overtime → base*100 + over*20
- fixed: 契約期間内の月 → fixed_amount、期間外の月 → 0
- 端数・小数時間（7.5h 等）の丸め確認

## 6. 月次サマリーの定義

対象年月を選び、契約単位で集計して一覧表示する。

### クライアント/契約別の行
| 項目 | 内容 |
|------|------|
| 対象年月 | 選択した年月 |
| クライアント / 契約 | 対象 |
| 実働時間合計 | その月の `actual_hours` 合計 |
| 最低保証時間 | `minimum_hours`（monthly_minimum のみ） |
| 請求対象時間 | `max(実働, 最低)`（monthly_minimum）/ 実働（hourly）/ − （fixed） |
| 基本単価 / 超過単価 | 契約値 |
| 請求金額 | §5の計算結果 |

### 月全体
- **経費合計** = その月の `allocated_amount` 合計（クライアント横断・別枠表示）
- **合計金額** = 全クライアント/契約の請求金額の合計（＝売上）。経費は差し引かない。

## 7. 画面

| 画面 | 内容 |
|------|------|
| ダッシュボード | 今月の稼働時間 / 今月の請求見込み（実働ベース） / 今月の経費合計 / クライアント別稼働状況 |
| クライアント一覧・編集 | 追加 / 編集 / 無効化 |
| 契約条件設定 | クライアントごとに契約を追加・編集。最低稼働時間・単価・固定報酬を設定。billing_typeで入力項目を出し分け |
| 稼働入力 | 日付 / クライアント / 契約 / 予定時間 / 実働時間 / メモ / status。一覧から日別に追加・編集 |
| 経費入力 | 日付 / カテゴリ / 金額 / 按分率 / メモ / 定期フラグ。「先月の定期経費を複製」ボタン |
| 月次サマリー | 年月選択 → 契約別集計 + 月の経費合計 + 合計金額 |

### 定期経費の複製
- 月次の経費画面に「先月の定期経費を複製」ボタンを置く。
- 対象前月で `is_recurring = true` の経費を、当月の同日（または月初）にコピーして作成。金額は編集可能。

## 8. ディレクトリ構成（案）
```
freelance-manager/
  app/                 # Next.js App Router
    dashboard/
    clients/
    contracts/
    work-logs/
    expenses/
    summary/
    login/
  lib/
    supabase/          # クライアント生成（server / client）
    billing.ts         # 請求計算純関数
    billing.test.ts    # Vitest
  components/
  supabase/
    migrations/        # SQL（テーブル定義 + RLS）
  docs/superpowers/specs/
```

## 9. 実装の優先順位（MVP）
1. Supabaseテーブル設計 + RLS（マイグレーションSQL）
2. 請求計算モジュール（`lib/billing.ts`）をTDDで実装
3. クライアント管理（CRUD）
4. 契約条件管理（CRUD、billing_typeで項目出し分け）
5. 稼働ログ入力（CRUD）
6. 経費入力（CRUD + 定期複製）
7. 月次サマリー（集計表示）
8. ダッシュボード
9. 認証（メール+パス1アカウント、ミドルウェアで保護）
10. Vercelデプロイ

## 10. 制約・方針
- 個人利用 / できるだけ無料 / 複雑にしすぎない。
- 会計サービスは使わない。
- 将来、業務委託案件（クライアント・契約）が増えても対応できる汎用データモデルを維持する。
