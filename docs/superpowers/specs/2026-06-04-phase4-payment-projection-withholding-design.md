# Phase 4 設計書 — 入金管理・着地見込み・源泉徴収

- 作成日: 2026-06-04
- 対象: 個人利用（単一ユーザー）。Phase 1-3 の上に積む拡張。
- 親設計書: `2026-06-02-freelance-management-system-design.md`（§2「やらないこと」の一部を Phase 4 として実装する）
- ステータス: 設計確定（実装プラン作成へ）

## 1. 目的

「稼働→請求→**入金**」のサイクルを閉じ（入金管理）、年の途中でも税・取り置きを正しく見積もれるようにし（着地見込み）、源泉徴収のある取引を正確に扱う（源泉徴収）。いずれも個人・無料・シンプルの方針を維持し、概算ツールとしての位置づけを崩さない。

## 2. スコープと非スコープ

### やること
- **入金管理**: 請求書ごとの入金ステータス・入金日・入金予定日（期日）。未入金合計と期日超過の可視化。
- **着地見込み**: 対象年の年商を「実績＋残月の契約ベース補完」で推計し、税試算の基準に使えるようにする。
- **源泉徴収**: 契約ごとに源泉あり/なしを設定。請求書PDFに源泉行・差引額。税試算で源泉を前払い所得税として扱い、取り置き圧縮・還付/追加納付見込みを表示。

### やらないこと（Phase 4 でも対象外）
- 一部入金（分割入金）の管理 — 未/済の2状態のみ。
- 入金の自動取込（銀行API連携）。
- 源泉徴収票の出力、住民税の特別徴収。
- 消費税・インボイス（親設計書のとおり免税前提）。
- しきい値アラート/通知（受動表示のみ）。

## 3. 技術前提（親設計書を踏襲）
- Next.js App Router（Server Components 読み取り / Server Actions 書き込み、`{ error: string | null }` 規約）。
- Supabase（Postgres + RLS）。**新規列追加のマイグレーションは owner-only RLS 既存ポリシーが既存テーブルに効くため追加ポリシー不要。新規テーブルは作らない。**
- 金額は円・整数（`Math.round`）。時間は numeric。
- お金のロジックは純関数＋Vitest で TDD。

## 4. データモデル変更

すべて既存テーブルへの列追加（マイグレーション `0005_phase4.sql`）。既存の owner-only RLS ポリシーがそのまま適用される（列追加はポリシーに影響しない）。

### 4.1 invoices（入金管理 + 源泉スナップショット）
```sql
alter table invoices
  add column status            text not null default 'unpaid' check (status in ('unpaid','paid')),
  add column paid_date         date,
  add column due_date          date,
  add column withholding_amount numeric not null default 0;
```
- `status`: 'unpaid'（未入金）/ 'paid'（入金済）。既存行は default で 'unpaid'。
- `paid_date`: 入金済にした日（status='paid' のとき設定、'unpaid' に戻すと null）。
- `due_date`: 入金予定日（期日）。発行時に「翌月末」を既定値として設定、後から編集可。
- `withholding_amount`: 発行時点の源泉徴収税額スナップショット（源泉なしなら 0）。`total_amount` は従来どおり**源泉控除前の請求合計（小計）**。差引入金額 = `total_amount - withholding_amount`。

### 4.2 contracts（源泉フラグ）
```sql
alter table contracts
  add column withholding boolean not null default false;
```
- この契約の請求に源泉徴収が発生するか。既定 false。

### 4.3 tax_settings（源泉率）
```sql
alter table tax_settings
  add column withholding_rate      numeric not null default 0.1021,
  add column withholding_rate_high numeric not null default 0.2042;
```
- `withholding_rate`: 100万円以下部分の率（10.21%）。
- `withholding_rate_high`: 100万円超部分の率（20.42%）。
- 100万円の閾値は法令定数としてコード側（`lib/withholding.ts`）に持つ（率と違い改正頻度が低く、設定化の必要が薄い）。

### 型（lib/types.ts）
- `Invoice` 型を追加（または既存の page 内 interface を整理）: `status: 'unpaid' | 'paid'`、`paid_date: string | null`、`due_date: string | null`、`withholding_amount: number` を含める。
- `Contract` に `withholding: boolean` を追加。
- `TaxSettings` に `withholding_rate: number`、`withholding_rate_high: number` を追加。

## 5. 純関数（TDD対象）

### 5.1 lib/withholding.ts — 源泉徴収税額
```
calcWithholding(amount, rate, rateHigh, threshold = 1_000_000) =
  round( min(amount, threshold) * rate + max(amount - threshold, 0) * rateHigh )
```
- 1回の支払（＝1請求 or 契約×月）に対する源泉税額。
- `amount <= 0` のとき 0。
- 請求書発行（その請求の `total_amount`）と税試算（契約×月の billing 額）の双方で共用。

#### テストケース（最低限）
- 50万円・10.21% → 51,050
- ちょうど100万円 → 102,100
- 150万円 → 100万×0.1021 + 50万×0.2042 = 102,100 + 102,100 = 204,200
- 0円 → 0
- 端数（小数 amount でも円整数に丸め）

### 5.2 lib/projection.ts — 年商の着地見込み
```
buildAnnualProjection(year, contracts, workLogs, today): { actual: number, projected: number, basisMonth: number }
```
- 月ごとに金額を決めて12ヶ月合算する。
  - **過去月**（その月末 < today の月）= 実績。`buildMonthlySummary(ym, contracts, workLogs, 0).totalBilling` を使用。
  - **当月・未来月**（その月末 >= today）= アクティブ契約から推計。
- アクティブ契約の月額推計 `estimateMonthly(contract, monthYM, recentAvgHours)`:
  - 契約期間外の月 → 0。
  - `fixed` → `fixed_amount`。
  - `monthly_minimum` → `max(minimumHours, recentAvgHours) * baseHourlyRate`（超過単価があっても見込みは基本単価で概算）。
  - `hourly` → `recentAvgHours * baseHourlyRate`。
- `recentAvgHours`（契約ごと）= その契約の YTD 実働合計 ÷ 経過月数（経過月0なら0）。
- 返り値: `actual`（過去月実績の合計＝当月含まず）、`projected`（過去月実績＋当月以降の推計＝年商見込み）。
- 暦年・`today` は呼び出し側から渡す（純関数のため `new Date()` を関数内で使わない）。

#### テストケース（最低限）
- 全期間が過去 → projected == actual（実績と一致）。
- 固定契約のみ・年初時点 → projected ≈ fixed × 12（期間内月数）。
- 時給契約・経過3ヶ月で平均20h → 残9ヶ月を 20h×単価 で補完。
- 契約期間外の月は加算されない。

### 5.3 lib/tax.ts 拡張 — 源泉の取り込み
`TaxInput` に `annualWithholding: number`（省略時 0）を追加。`TaxResult` に追加:
```
withholding: number          // 源泉徴収合計（前払い所得税）
incomeTaxDue: number         // 確定申告で追加納付（max(incomeTax - withholding, 0)）
incomeTaxRefund: number      // 還付見込み（max(withholding - incomeTax, 0)）
```
- 計算ルール:
  - `incomeTax`（所得税・復興込み）は従来どおり（源泉とは独立に算出）。
  - `incomeTaxDue = max(incomeTax - withholding, 0)`、`incomeTaxRefund = max(withholding - incomeTax, 0)`。
  - `totalTaxAndInsurance`・`netIncome` は**従来式のまま不変**（源泉は所得税の前払いであり総額に影響しない）。
- 取り置きの補正（`buildReserve` を拡張）:
  - `monthlyReserve = round( max(totalTaxAndInsurance - withholding, 0) / 12 )`（源泉で既に納めた分は自分で取り置かない）。
  - `reserveRate = annualRevenue > 0 ? max(totalTaxAndInsurance - withholding, 0) / annualRevenue : 0`。
  - `monthlyDisposable` は従来どおり `round(netIncome / 12)`。
- 事業所得=0 ゲート時は withholding 系も全て 0 とする（売上0→全て0 を維持。ただし annualWithholding が渡っても事業所得0なら 0 表示で一貫）。

#### 追加テストケース
- withholding=0 のとき、既存の取り置き・各値が Phase 3 と同一（後方互換）。
- withholding < incomeTax → incomeTaxDue>0・refund=0、monthlyReserve が源泉分だけ減る。
- withholding > incomeTax → refund>0・due=0。
- 取り置きは `(税保険合計 − 源泉)` を 12 で割った値。源泉が税保険合計を超えても monthlyReserve は 0 未満にならない。

### 5.4 税試算での源泉年額の算出（呼び出し側）
- `/tax` の Server Component で、源泉年額を**算出ベースと同じ契約×月の billing から**求める（実績/見込みの基準に合わせる）。
  - 各 `withholding=true` の契約について、対象年の月ごとの billing 額に `calcWithholding` を適用して合算（月単位で 100万閾値を判定）。
  - 実績基準なら過去月の実績 billing、見込み基準なら projection の月額に対して適用。
- これにより税試算の源泉は revenue と整合（請求書実物の合計ではなく、試算と同じ単一の真実から導出）。

## 6. UI

### 6.1 入金管理
- **請求書履歴 `/invoices`**:
  - 列に「状態」バッジ（未入金/入金済、期日超過は強調）、「入金日」「期日」を追加。
  - 行アクション「入金済にする」（status='paid'、paid_date=今日）/「未入金に戻す」（status='unpaid'、paid_date=null）。Server Action、`{ error }` 規約。
  - 期日（due_date）の編集（インライン or 小フォーム）。
- **ダッシュボード**:
  - 「未入金 ◯件・合計◯円」カード（status='unpaid' の total_amount 合計）。
  - 「期日超過 ◯件」表示（status='unpaid' かつ due_date < 今日）。0件なら控えめ表示。
- **発行時**: `due_date` を「翌月末」で既定設定（`generateInvoicePdf` の insert に追加）。

### 6.2 着地見込み（`/tax`）
- 基準トグル「実績(YTD)」/「着地見込み」。既定は**着地見込み**。
- 選択基準の年商を `calculateTax` の `annualRevenue` に渡す。経費は従来どおりその年の `allocated_amount` 合計（経費は見込み補完しない＝実績のみ。注記する）。
- what-if 上書き（売上・経費・申告区分・その他控除）は従来通り。トグル切替で売上 state を基準値に再初期化。

### 6.3 源泉徴収
- **契約フォーム**: 「源泉徴収あり」チェックボックス（`withholding`）。billing_type に依らず表示。
- **請求書PDF（`lib/pdf.tsx` + `generateInvoicePdf`）**: 源泉ありの契約行があるとき、合計欄に `小計` / `源泉徴収税額（▲）` / `差引請求額` を表示。源泉額 = 請求小計に対し `calcWithholding`（税率は tax_settings から取得、無ければ既定）。`withholding_amount` を invoices に保存。
  - 源泉の有無は請求書内の契約行の `withholding` で判定。混在（源泉あり契約となし契約が同一請求書）→ 源泉額は源泉あり契約の billing 合計に対してのみ算出。
- **税試算（`/tax`）**: 「源泉徴収（前払い所得税）◯円」「還付見込み/追加納付見込み ◯円」を内訳に表示。取り置き目安は源泉控除後（§5.3）。

## 7. ディレクトリ/ファイル

```
lib/
  withholding.ts        # 新規（純関数）
  withholding.test.ts   # 新規
  projection.ts         # 新規（純関数、buildMonthlySummary を再利用）
  projection.test.ts    # 新規
  tax.ts                # 拡張（annualWithholding, refund/due, reserve 補正）
  tax.test.ts           # 追加テスト
  types.ts              # Invoice/Contract/TaxSettings 型更新
supabase/migrations/
  0005_phase4.sql       # 列追加
app/(app)/
  invoices/page.tsx          # 状態列・アクション
  invoices/payment-actions.ts # 新規（markPaid/markUnpaid/updateDueDate）
  dashboard/page.tsx         # 未入金・期日超過カード
  contracts/...              # 源泉チェック追加（既存フォーム）
  summary/invoice-actions.ts # due_date 既定・withholding_amount 保存
  tax/page.tsx, tax/tax-ui.tsx # 基準トグル・源泉表示
lib/pdf.tsx                   # 源泉行
```

## 8. 実装ステージング（独立性が高い順）
1. **入金管理** — invoices 列 + payment-actions + /invoices UI + dashboard カード + 発行時 due_date 既定。税ロジックに非依存。
2. **着地見込み** — `lib/projection.ts`（TDD）+ /tax 基準トグル。
3. **源泉徴収** — contracts/tax_settings 列 + `lib/withholding.ts`（TDD）+ 契約フォーム + PDF + `lib/tax.ts` 拡張（TDD）+ /tax 表示。

各ステージは単体で動作・デプロイ可能。お金のロジック（withholding/projection/tax）は必ず TDD。

## 9. 運用注意
- マイグレーション `0005_phase4.sql` は Supabase SQL Editor で手動適用（既存運用どおり）。列追加のみで既存 RLS に影響しないが、適用前に新UIをデプロイすると新列参照箇所がエラーになるため、**適用後にデプロイ**するか、適用前提でステージごとに進める。
- 源泉税率・所得税累進テーブルは概算。改正時に定数/設定を更新。
```
