# 業務委託向け 稼働・請求・経費管理システム — 設計書

- 作成日: 2026-06-02
- 対象: 個人利用（単一ユーザー）のMVP
- ステータス: Phase 1-3 実装済み
- 追補: Phase 4（入金管理・着地見込み・源泉徴収）を追加実装。本書は Phase 1-3 の原設計で、Phase 4 の詳細は別設計書 `2026-06-04-phase4-payment-projection-withholding-design.md` が単一の真実。

## 1. 目的

複数の業務委託案件について、日々の稼働を記録し、月末にクライアントごとの請求金額・稼働時間・経費を確認できる個人用Webアプリを構築する。会計サービス（freee等）は使わず、無料枠で運用する。

## 2. スコープ（フェーズ分割）

### Phase 1 — 稼働・請求・経費・集計（コアMVP）
- クライアント管理
- 契約条件管理（時給制 / 月間最低稼働時間 / 固定報酬を汎用的に設定）
- 稼働ログ入力（時間単位で直接入力）
- 経費入力（個人経費・定期経費）
- 月次サマリー（クライアント別の請求額・稼働・月の経費合計）
- 認証（自分専用1アカウント）
- Vercelへのデプロイ

### Phase 2 — 請求書PDF
- 月次サマリーから請求書PDFを生成（基本項目一式）
- 請求番号の採番と発行履歴

### Phase 3 — 年間手取り試算（概算シミュレーター）
- 年間の売上・経費から、税・社会保険料を概算して手取りを試算
- パラメータ（税率・控除・申告区分等）は設定で変更可能
- 「参考値。正確な税額は税理士に確認」の注意書きを常時表示

### Phase 4 — 入金管理・着地見込み・源泉徴収（追加実装）
- 請求書ごとの入金管理（未入金/入金済・入金日・入金予定日、未入金合計と期日超過の可視化）
- 年間売上の着地見込み（実績＋残月の契約ベース補完）を税試算の基準に使用
- 契約ごとの源泉徴収（請求書に小計/源泉/差引、税試算で前払い所得税として扱い還付/追加納付・取り置き補正）
- 詳細: `2026-06-04-phase4-payment-projection-withholding-design.md`

### やらないこと（対象外）
- 複数ユーザー / チーム機能
- 稼働の開始/終了時刻・休憩からの自動計算（時間を直接入力するため不要）
- 会計連携・確定申告書類の出力
- 経費のクライアント別配賦（経費は案件横断の個人経費として扱う）
- 消費税の管理・インボイス対応（免税事業者前提。将来拡張）
- 厳密な税額計算（税制改正への追従が必要なため、概算に留める）
- 請求書PDFの消費税・ロゴ表示（将来拡張）※源泉徴収は Phase 4 で実装済み
- 節税策の効果シミュレーション（将来拡張）。しきい値アラートは未実装だが、未入金/期日超過は Phase 4 で受動表示

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

### 4.5 profile（発行者プロフィール・単一行）
請求書PDFに載せる自分の情報。アプリ全体で1行。
```sql
id            uuid primary key default gen_random_uuid()
display_name  text            -- 氏名 / 屋号
address       text
email         text
phone         text
bank_info     text            -- 振込先（銀行名・支店・口座種別・番号・名義）
created_at    timestamptz not null default now()
updated_at    timestamptz not null default now()
```

### 4.6 invoices（請求書発行履歴）
PDFは都度生成だが、請求番号の安定採番と発行履歴のためにメタデータを保存する。
```sql
id           uuid primary key default gen_random_uuid()
invoice_no   text not null unique   -- 採番（例: 2026-06-001）
client_id    uuid not null references clients(id)
year_month   text not null          -- 'YYYY-MM'
issue_date   date not null
total_amount numeric not null       -- 発行時点の請求合計（スナップショット）
memo         text
created_at   timestamptz not null default now()
```
- 金額は発行時点のスナップショット。発行後に稼働を編集しても請求書の値は変わらない。
- PDFファイル自体はDBに保存せず、表示のたびに生成する（無料枠節約）。

### 4.7 tax_settings（税試算パラメータ・単一行）
概算シミュレーターのパラメータ。申告区分が未定でも設定で切り替えられる。
```sql
id                       uuid primary key default gen_random_uuid()
filing_type              text not null default 'blue'  -- 'blue' | 'white'
blue_deduction           numeric not null default 650000  -- 青色申告特別控除（0/100000/550000/650000）
basic_deduction_income   numeric not null default 480000  -- 基礎控除（所得税）
basic_deduction_resident numeric not null default 430000  -- 基礎控除（住民税）
national_pension_annual  numeric not null default 204000  -- 国民年金（年額・概算）
health_insurance_rate    numeric not null default 0.10    -- 国保 所得比例分の率（自治体差大・概算）
health_insurance_fixed   numeric not null default 50000   -- 国保 均等割等の定額分（概算）
resident_tax_rate        numeric not null default 0.10    -- 住民税 所得割
resident_tax_fixed       numeric not null default 5000    -- 住民税 均等割
other_deductions         numeric not null default 0       -- その他所得控除（iDeCo等を手動入力）
created_at               timestamptz not null default now()
updated_at               timestamptz not null default now()
```

### 4.8 RLS（行レベルセキュリティ）
- 全テーブルで RLS を有効化。
- ポリシー: 認証済みユーザーのみ全操作可（`to authenticated`）。
- 単一ユーザー運用のため `user_id` 列は持たない（将来の複数ユーザー化が発生したら追加）。
- ⚠️ **セキュリティ前提**: `to authenticated` は「サインアップできる全員」を含むため、必ず
  Supabase Auth で**公開サインアップを無効化**し、自分のアカウントのみ手動作成すること。
  さらに多層防御として、アカウント作成後に**オーナーUID限定ポリシー**
  （`using (auth.uid() = '<OWNER_UUID>')`）へ置き換えることを推奨
  （マイグレーション末尾にスニペット同梱）。

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

## 7. 請求書PDF（Phase 2）

月次サマリーの「クライアント別請求」から、クライアント単位で請求書PDFを生成する。

### 生成方法
- ブラウザ側でHTMLテンプレートを描画し、`@react-pdf/renderer`（推奨）または印刷用CSS＋ブラウザ印刷でPDF化。
  - 推奨: `@react-pdf/renderer` でサーバ/クライアントから安定したレイアウトのPDFを生成（フォント埋め込みで日本語対応）。
- PDFファイルは保存せず都度生成。発行時に `invoices` にメタデータ（番号・金額スナップショット）を記録。

### 採番ルール
- `invoice_no` = `YYYY-MM-連番3桁`（例: `2026-06-001`）。同一年月内で発行順に採番。

### 記載項目（基本一式）
- 発行者: `profile` の氏名/屋号・住所・連絡先・振込先
- 宛先: クライアント名
- 請求番号 / 発行日 / 対象年月
- 品目（稼働内容）: 契約名・請求対象時間・単価・金額（契約ごと1行）
- 合計金額
- メモ欄

### 計算の出所
- 金額は §5 の請求計算結果をそのまま使用（PDF専用の再計算はしない＝単一の真実）。

## 8. 年間手取り試算（Phase 3・概算シミュレーター）

⚠️ 画面上に常時「概算です。正確な税額・保険料は税理士・自治体にご確認ください」と明記する。

`lib/tax.ts` に純関数として実装し、Vitest でテストする。パラメータは `tax_settings`（§4.7）から取得。

### 入力
- `annualRevenue` = 対象年の全クライアント請求金額の合計（§5の月次結果を年集計）
- `annualExpense` = 対象年の `allocated_amount` 合計
- `tax_settings` の各パラメータ

### 計算ステップ（概算）
```
事業所得   = max(annualRevenue - annualExpense - blue_deduction, 0)        // 青色控除は filing_type=blue のときのみ
国民年金   = national_pension_annual
国民健康保険 = 事業所得 * health_insurance_rate + health_insurance_fixed      // 概算（自治体差は設定で吸収）
社会保険料控除 = 国民年金 + 国民健康保険

課税所得(所得税) = max(事業所得 - 社会保険料控除 - basic_deduction_income - other_deductions, 0)
所得税本体 = 累進税率テーブル(課税所得(所得税))                              // 5%〜45%
所得税     = round(所得税本体 * 1.021)                                      // 復興特別所得税

課税所得(住民税) = max(事業所得 - 社会保険料控除 - basic_deduction_resident - other_deductions, 0)
住民税     = round(課税所得(住民税) * resident_tax_rate) + resident_tax_fixed

税・保険合計 = 所得税 + 住民税 + 国民年金 + 国民健康保険
手取り(可処分) = annualRevenue - annualExpense - 税・保険合計
```
- 所得税の累進テーブル（2026年時点の概算・設定化はせずコード定数、改正時に更新）:
  | 課税所得 | 税率 | 控除額 |
  |----------|------|--------|
  | 〜195万 | 5% | 0 |
  | 〜330万 | 10% | 97,500 |
  | 〜695万 | 20% | 427,500 |
  | 〜900万 | 23% | 636,000 |
  | 〜1,800万 | 33% | 1,536,000 |
  | 〜4,000万 | 40% | 2,796,000 |
  | 4,000万〜 | 45% | 4,796,000 |

### 出力
- 事業所得 / 課税所得 / 所得税 / 住民税 / 国保 / 年金 / 税・保険合計 / 手取り
- 各内訳を表示し、設定値を変えると即座に再計算（クライアント側計算）。

### テストケース（最低限）
- 売上0 → 全て0、手取り0
- 売上600万・経費100万・青色65万・各デフォルト → 各税額が想定レンジ内
- filing_type=white（青色控除0） → 事業所得が65万増えることを確認
- 累進テーブルの各境界（195万/330万/695万 等）で税率が切り替わる
- other_deductions（iDeCo相当）を増やすと課税所得・税が減る

## 9. 画面

| 画面 | 内容 |
|------|------|
| ダッシュボード | 今月の稼働時間 / 今月の請求見込み（実働ベース） / 今月の経費合計 / クライアント別稼働状況 |
| クライアント一覧・編集 | 追加 / 編集 / 無効化 |
| 契約条件設定 | クライアントごとに契約を追加・編集。最低稼働時間・単価・固定報酬を設定。billing_typeで入力項目を出し分け |
| 稼働入力 | 日付 / クライアント / 契約 / 予定時間 / 実働時間 / メモ / status。一覧から日別に追加・編集 |
| 経費入力 | 日付 / カテゴリ / 金額 / 按分率 / メモ / 定期フラグ。「先月の定期経費を複製」ボタン |
| 月次サマリー | 年月選択 → 契約別集計 + 月の経費合計 + 合計金額。各クライアント行から「請求書PDF発行」 |
| 請求書プレビュー/発行（Phase 2） | クライアント・年月を指定 → PDFプレビュー → 発行（採番・履歴記録） |
| 設定: プロフィール（Phase 2） | 氏名/屋号・住所・連絡先・振込先（請求書の発行者情報） |
| 年間手取り試算（Phase 3） | 対象年選択 → 売上・経費の年集計から税・保険・手取りを概算表示。注意書き常時表示 |
| 設定: 税試算パラメータ（Phase 3） | 申告区分・各控除・国保率・年金額などを編集 |

### 定期経費の複製
- 月次の経費画面に「先月の定期経費を複製」ボタンを置く。
- 対象前月で `is_recurring = true` の経費を、当月の同日（または月初）にコピーして作成。金額は編集可能。

## 10. ディレクトリ構成（案）
```
freelance-manager/
  app/                 # Next.js App Router
    dashboard/
    clients/
    contracts/
    work-logs/
    expenses/
    summary/
    invoices/          # Phase 2: 請求書プレビュー/発行
    tax/               # Phase 3: 年間手取り試算
    settings/          # Phase 2/3: プロフィール・税パラメータ
    login/
  lib/
    supabase/          # クライアント生成（server / client）
    billing.ts         # 請求計算純関数
    billing.test.ts    # Vitest
    tax.ts             # Phase 3: 手取り試算純関数
    tax.test.ts        # Vitest
  components/
  supabase/
    migrations/        # SQL（テーブル定義 + RLS）
  docs/superpowers/specs/
```

## 11. 実装の優先順位
**Phase 1（コアMVP）**
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

**Phase 2（請求書PDF）**
11. プロフィール設定 + `profile` / `invoices` テーブル
12. 請求書PDF生成（`@react-pdf/renderer`）+ 採番・発行履歴

**Phase 3（手取り試算）**
13. 税パラメータ設定 + `tax_settings` テーブル
14. 手取り試算モジュール（`lib/tax.ts`）をTDDで実装 + 試算画面

## 12. 制約・方針
- 個人利用 / できるだけ無料 / 複雑にしすぎない。
- 会計サービスは使わない。
- 将来、業務委託案件（クライアント・契約）が増えても対応できる汎用データモデルを維持する。
