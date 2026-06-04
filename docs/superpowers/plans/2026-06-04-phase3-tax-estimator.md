# Phase 3 年間手取り試算（概算シミュレーター）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 対象年の売上・経費から税・社会保険料・手取りを概算し、さらに「毎月いくら取り置けばよいか／月に使っていい額」を表示する試算画面と、その税パラメータ設定画面を追加する。

**Architecture:** 計算は `lib/tax.ts` の純関数（Vitest で TDD）。年間売上は既存 `lib/summary.ts` の `buildMonthlySummary` を 12 ヶ月分合算して再利用（単一の真実）。設定画面 `/settings/tax` が `tax_settings`（DB・単一行）を保存し確定値とする。試算画面 `/tax` はそれを初期値に読み込み、主要レバー（売上/経費/申告区分/その他控除）を画面上で一時的に上書きして即時再計算する（what-if、保存しない）。

**Tech Stack:** Next.js App Router（Server Components で読み取り / Server Actions で書き込み）、Supabase（Postgres + RLS）、Vitest、Tailwind/既存 globals.css。

**スペック:** `docs/superpowers/specs/2026-06-02-freelance-management-system-design.md` §4.7・§8・§9。

**設計上の決定（スペック補足）:**
- **「売上0 → 全て0」と「住民税 = 課税所得×率 + 均等割定額」の矛盾**を、**事業所得 = 0 のとき税・保険を全てゼロにゲート**して解決する（概算シミュレーターとしての割り切り。コメントで明記）。
- **取り置き目安（新要望）**を `calculateTax` の戻り値に派生ブロックとして追加：`monthlyReserve`（税・保険合計 ÷ 12）、`reserveRate`（税・保険合計 ÷ 売上）、`monthlyDisposable`（手取り ÷ 12）。
- 会計年度は暦年（1〜12月）。
- 所得税の累進テーブルはコード定数（スペック §8 の表、2026年時点の概算）。

---

## File Structure

| ファイル | 役割 |
|----------|------|
| `supabase/migrations/0004_tax_settings.sql`（新規） | `tax_settings` テーブル + owner-only RLS + grant |
| `lib/types.ts`（変更） | `TaxFilingType`・`TaxSettings`（DB行・snake_case）型を追加 |
| `lib/tax.ts`（新規） | `TaxParams`/`TaxInput`/`TaxResult` 型、`DEFAULT_TAX_PARAMS`、`progressiveIncomeTax`、`calculateTax` 純関数 |
| `lib/tax.test.ts`（新規） | `calculateTax`・`progressiveIncomeTax` の Vitest |
| `lib/summary.ts`（変更） | `buildAnnualRevenue` を追加（`buildMonthlySummary` を再利用） |
| `lib/summary.test.ts`（変更） | `buildAnnualRevenue` のテストを追加 |
| `app/(app)/settings/tax/page.tsx`（新規） | 税設定タブ（Server Component・`tax_settings` 読み取り） |
| `app/(app)/settings/tax/tax-settings-ui.tsx`（新規） | 設定フォーム（Client・profile-ui と同形） |
| `app/(app)/settings/tax/actions.ts`（新規） | `upsertTaxSettings` Server Action |
| `app/(app)/settings/settings-nav.tsx`（変更） | 「税試算」タブを追加 |
| `app/(app)/tax/page.tsx`（新規） | 試算画面（Server Component・年集計） |
| `app/(app)/tax/tax-ui.tsx`（新規） | what-if 再計算 UI（Client） |
| `components/icon.tsx`（変更） | `calc` アイコンを追加 |
| `components/rail-nav.tsx`（変更） | 「年間手取り試算」ナビ項目を追加 |

---

## Task 1: マイグレーション + 型定義

`tax_settings` テーブルを §4.7 通りに作成。owner_id default auth.uid() + owner-only RLS + grant をセットで（0002 のパターン踏襲。**新規テーブルは grant を忘れない**）。型を `lib/types.ts` に追加。

**Files:**
- Create: `supabase/migrations/0004_tax_settings.sql`
- Modify: `lib/types.ts`

- [ ] **Step 1: マイグレーション SQL を作成**

`supabase/migrations/0004_tax_settings.sql`:

```sql
-- tax_settings（税試算パラメータ・単一行）スペック §4.7
-- owner_id: 挿入したユーザーのUIDが自動で入り、RLSで本人のみアクセス可能
create table tax_settings (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null default auth.uid() references auth.users(id),
  filing_type              text not null default 'blue' check (filing_type in ('blue','white')),
  blue_deduction           numeric not null default 650000,
  basic_deduction_income   numeric not null default 480000,
  basic_deduction_resident numeric not null default 430000,
  national_pension_annual  numeric not null default 204000,
  health_insurance_rate    numeric not null default 0.10,
  health_insurance_fixed   numeric not null default 50000,
  resident_tax_rate        numeric not null default 0.10,
  resident_tax_fixed       numeric not null default 5000,
  other_deductions         numeric not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
-- 1ユーザー1行のシングルトン制約
create unique index tax_settings_owner_unique on tax_settings (owner_id);

-- RLS: オーナー本人のみ
alter table tax_settings enable row level security;
create policy "owner only" on tax_settings for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- 権限付与（自動公開OFFのため手動でgrant。行アクセスはRLSが制御）
grant select, insert, update, delete on table tax_settings to authenticated;
```

- [ ] **Step 2: 型を追加**

`lib/types.ts` の末尾（`Expense` インターフェイスの後）に追記:

```ts
export type TaxFilingType = 'blue' | 'white'

export interface TaxSettings {
  id: string
  filing_type: TaxFilingType
  blue_deduction: number
  basic_deduction_income: number
  basic_deduction_resident: number
  national_pension_annual: number
  health_insurance_rate: number
  health_insurance_fixed: number
  resident_tax_rate: number
  resident_tax_fixed: number
  other_deductions: number
}
```

- [ ] **Step 3: マイグレーションを Supabase に適用**

Supabase SQL Editor で `0004_tax_settings.sql` の内容を実行する（プロジェクトのマイグレーション運用に合わせる）。エラーなく完了することを確認。

- [ ] **Step 4: コミット**

```bash
git add supabase/migrations/0004_tax_settings.sql lib/types.ts
git commit -m "feat: tax_settings table and TaxSettings type (Phase 3)"
```

---

## Task 2: 累進所得税テーブル（純関数・TDD）

スペック §8 の累進テーブルを実装。`progressiveIncomeTax(taxable)` = 復興特別所得税を含まない「所得税本体」。境界値テストで税率切り替えを固める。

**Files:**
- Create: `lib/tax.ts`
- Test: `lib/tax.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`lib/tax.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { progressiveIncomeTax } from './tax'

describe('progressiveIncomeTax（所得税本体・復興税抜き）', () => {
  it('課税所得0 → 0', () => {
    expect(progressiveIncomeTax(0)).toBe(0)
  })
  it('195万以下は5%・控除0', () => {
    expect(progressiveIncomeTax(1_950_000)).toBe(97_500) // 1,950,000 * 0.05
  })
  it('195万超は10%・控除97,500（境界の連続性）', () => {
    expect(progressiveIncomeTax(1_950_001)).toBe(Math.round(1_950_001 * 0.10 - 97_500))
  })
  it('330万ちょうどは10%', () => {
    expect(progressiveIncomeTax(3_300_000)).toBe(3_300_000 * 0.10 - 97_500) // 232,500
  })
  it('330万超は20%・控除427,500（境界の連続性）', () => {
    expect(progressiveIncomeTax(3_300_001)).toBe(Math.round(3_300_001 * 0.20 - 427_500))
  })
  it('695万ちょうどは20%', () => {
    expect(progressiveIncomeTax(6_950_000)).toBe(6_950_000 * 0.20 - 427_500) // 962,500
  })
  it('最高税率45%・控除4,796,000', () => {
    expect(progressiveIncomeTax(50_000_000)).toBe(50_000_000 * 0.45 - 4_796_000)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tax`
Expected: FAIL（`progressiveIncomeTax` is not a function / モジュール未作成）

- [ ] **Step 3: 最小実装**

`lib/tax.ts`:

```ts
// 所得税の累進税率テーブル（スペック §8・2026年時点の概算。改正時に更新）
// [上限, 税率, 控除額]。上限以下に該当する最初の段を使う。
const INCOME_TAX_BRACKETS: ReadonlyArray<[number, number, number]> = [
  [1_950_000, 0.05, 0],
  [3_300_000, 0.10, 97_500],
  [6_950_000, 0.20, 427_500],
  [9_000_000, 0.23, 636_000],
  [18_000_000, 0.33, 1_536_000],
  [40_000_000, 0.40, 2_796_000],
  [Infinity, 0.45, 4_796_000],
]

/** 復興特別所得税を含まない所得税本体。課税所得が0以下なら0。 */
export function progressiveIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0
  for (const [upper, rate, deduction] of INCOME_TAX_BRACKETS) {
    if (taxableIncome <= upper) {
      return Math.round(taxableIncome * rate - deduction)
    }
  }
  return 0 // 到達しない（Infinity で必ず捕捉）
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tax`
Expected: PASS（progressiveIncomeTax の7件）

- [ ] **Step 5: コミット**

```bash
git add lib/tax.ts lib/tax.test.ts
git commit -m "feat: progressive income tax table (Phase 3)"
```

---

## Task 3: 手取り試算コア `calculateTax`（純関数・TDD）

事業所得 → 社会保険料 → 課税所得（所得税/住民税）→ 各税額 → 税・保険合計 → 手取り。**事業所得=0なら税・保険を全て0**（売上0テストとの整合）。

**Files:**
- Modify: `lib/tax.ts`
- Test: `lib/tax.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

`lib/tax.test.ts` の末尾に追記:

```ts
import { calculateTax, DEFAULT_TAX_PARAMS } from './tax'

describe('calculateTax', () => {
  it('売上0 → 全て0、手取り0', () => {
    const r = calculateTax({ annualRevenue: 0, annualExpense: 0, params: DEFAULT_TAX_PARAMS })
    expect(r.businessIncome).toBe(0)
    expect(r.nationalPension).toBe(0)
    expect(r.healthInsurance).toBe(0)
    expect(r.incomeTax).toBe(0)
    expect(r.residentTax).toBe(0)
    expect(r.totalTaxAndInsurance).toBe(0)
    expect(r.netIncome).toBe(0)
  })

  it('売上600万・経費100万・青色65万・デフォルト → 内訳を固定', () => {
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    expect(r.businessIncome).toBe(4_350_000)        // 600万-100万-65万
    expect(r.nationalPension).toBe(204_000)
    expect(r.healthInsurance).toBe(485_000)         // round(435万*0.10)+5万 = 435,000+50,000
    expect(r.socialInsuranceDeduction).toBe(689_000)
    expect(r.taxableIncomeIncomeTax).toBe(3_181_000) // 435万-68.9万-48万
    expect(r.incomeTax).toBe(225_233)               // round((318,100-97,500)*1.021)
    expect(r.taxableIncomeResident).toBe(3_231_000)  // 435万-68.9万-43万
    expect(r.residentTax).toBe(328_100)             // round(323.1万*0.10)+5,000
    expect(r.totalTaxAndInsurance).toBe(1_242_333)
    expect(r.netIncome).toBe(3_757_667)             // 600万-100万-税保険合計
  })

  it('filing_type=white は青色控除0 → 事業所得が65万増える', () => {
    const blue = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    const white = calculateTax({
      annualRevenue: 6_000_000, annualExpense: 1_000_000,
      params: { ...DEFAULT_TAX_PARAMS, filingType: 'white' },
    })
    expect(white.businessIncome - blue.businessIncome).toBe(650_000)
  })

  it('other_deductions（iDeCo相当）を増やすと課税所得・所得税が減る', () => {
    const base = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    const ideco = calculateTax({
      annualRevenue: 6_000_000, annualExpense: 1_000_000,
      params: { ...DEFAULT_TAX_PARAMS, otherDeductions: 800_000 },
    })
    expect(ideco.taxableIncomeIncomeTax).toBeLessThan(base.taxableIncomeIncomeTax)
    expect(ideco.incomeTax).toBeLessThan(base.incomeTax)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tax`
Expected: FAIL（`calculateTax` / `DEFAULT_TAX_PARAMS` is not exported）

- [ ] **Step 3: 型・デフォルト・実装を追加**

`lib/tax.ts` の `progressiveIncomeTax` の**上**（import 直後）に型とデフォルトを追加:

```ts
import type { TaxFilingType } from './types'

export interface TaxParams {
  filingType: TaxFilingType
  blueDeduction: number
  basicDeductionIncome: number
  basicDeductionResident: number
  nationalPensionAnnual: number
  healthInsuranceRate: number
  healthInsuranceFixed: number
  residentTaxRate: number
  residentTaxFixed: number
  otherDeductions: number
}

export interface TaxInput {
  annualRevenue: number
  annualExpense: number
  params: TaxParams
}

export interface TaxResult {
  businessIncome: number            // 事業所得
  nationalPension: number           // 国民年金
  healthInsurance: number           // 国民健康保険
  socialInsuranceDeduction: number  // 社会保険料控除
  taxableIncomeIncomeTax: number    // 課税所得（所得税）
  incomeTax: number                 // 所得税（復興特別所得税込み）
  taxableIncomeResident: number     // 課税所得（住民税）
  residentTax: number               // 住民税
  totalTaxAndInsurance: number      // 税・保険合計
  netIncome: number                 // 手取り（年・可処分）
}

// スペック §4.7 のデフォルト値と一致させる
export const DEFAULT_TAX_PARAMS: TaxParams = {
  filingType: 'blue',
  blueDeduction: 650000,
  basicDeductionIncome: 480000,
  basicDeductionResident: 430000,
  nationalPensionAnnual: 204000,
  healthInsuranceRate: 0.10,
  healthInsuranceFixed: 50000,
  residentTaxRate: 0.10,
  residentTaxFixed: 5000,
  otherDeductions: 0,
}
```

`lib/tax.ts` の末尾に `calculateTax` を追加:

```ts
/** スペック §8 の概算ロジック。事業所得が0なら税・保険は全て0（売上0→全て0）。 */
export function calculateTax(input: TaxInput): TaxResult {
  const { annualRevenue, annualExpense, params: p } = input

  const blue = p.filingType === 'blue' ? p.blueDeduction : 0
  const businessIncome = Math.max(annualRevenue - annualExpense - blue, 0)

  if (businessIncome === 0) {
    return {
      businessIncome: 0,
      nationalPension: 0,
      healthInsurance: 0,
      socialInsuranceDeduction: 0,
      taxableIncomeIncomeTax: 0,
      incomeTax: 0,
      taxableIncomeResident: 0,
      residentTax: 0,
      totalTaxAndInsurance: 0,
      netIncome: annualRevenue - annualExpense,
    }
  }

  const nationalPension = p.nationalPensionAnnual
  const healthInsurance = Math.round(businessIncome * p.healthInsuranceRate) + p.healthInsuranceFixed
  const socialInsuranceDeduction = nationalPension + healthInsurance

  const taxableIncomeIncomeTax = Math.max(
    businessIncome - socialInsuranceDeduction - p.basicDeductionIncome - p.otherDeductions, 0,
  )
  const incomeTax = Math.round(progressiveIncomeTax(taxableIncomeIncomeTax) * 1.021) // 復興特別所得税

  const taxableIncomeResident = Math.max(
    businessIncome - socialInsuranceDeduction - p.basicDeductionResident - p.otherDeductions, 0,
  )
  const residentTax = Math.round(taxableIncomeResident * p.residentTaxRate) + p.residentTaxFixed

  const totalTaxAndInsurance = incomeTax + residentTax + nationalPension + healthInsurance
  const netIncome = annualRevenue - annualExpense - totalTaxAndInsurance

  return {
    businessIncome,
    nationalPension,
    healthInsurance,
    socialInsuranceDeduction,
    taxableIncomeIncomeTax,
    incomeTax,
    taxableIncomeResident,
    residentTax,
    totalTaxAndInsurance,
    netIncome,
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tax`
Expected: PASS（calculateTax の4件 + progressiveIncomeTax の7件）

- [ ] **Step 5: コミット**

```bash
git add lib/tax.ts lib/tax.test.ts
git commit -m "feat: calculateTax annual take-home estimator (Phase 3)"
```

---

## Task 4: 取り置き目安を `TaxResult` に追加（TDD・新要望）

年間試算から「毎月の取り置き」「取り置き率」「月に使っていい手取り」を導出。`reserve` ブロックとして `TaxResult` に追加。

**Files:**
- Modify: `lib/tax.ts`
- Test: `lib/tax.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

`lib/tax.test.ts` の `describe('calculateTax', ...)` 内に追記:

```ts
  it('取り置き目安: 月額・率・月の可処分を導出', () => {
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    expect(r.reserve.monthlyReserve).toBe(103_528)        // round(1,242,333 / 12)
    expect(r.reserve.monthlyDisposable).toBe(313_139)     // round(3,757,667 / 12)
    expect(r.reserve.reserveRate).toBeCloseTo(1_242_333 / 6_000_000, 5) // ≈0.2071
  })

  it('取り置き目安: 売上0でも0除算せず率0', () => {
    const r = calculateTax({ annualRevenue: 0, annualExpense: 0, params: DEFAULT_TAX_PARAMS })
    expect(r.reserve.monthlyReserve).toBe(0)
    expect(r.reserve.reserveRate).toBe(0)
    expect(r.reserve.monthlyDisposable).toBe(0)
  })
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tax`
Expected: FAIL（`r.reserve` is undefined）

- [ ] **Step 3: `TaxResult` と `calculateTax` を更新**

`lib/tax.ts` の `TaxResult` インターフェイスに追記:

```ts
  reserve: {
    monthlyReserve: number     // 毎月の取り置き目安（税・保険合計 ÷ 12）
    reserveRate: number        // 取り置き率（税・保険合計 ÷ 売上、0〜1）
    monthlyDisposable: number  // 月に使っていい手取り（手取り ÷ 12）
  }
```

`calculateTax` 内に `reserve` を組み立てるヘルパーを追加し、**両方の return**（businessIncome===0 の早期 return と通常 return）に含める。重複を避けるため、各 return の直前で算出する:

businessIncome===0 の早期 return を次に置き換え:

```ts
  if (businessIncome === 0) {
    const netIncome = annualRevenue - annualExpense
    return {
      businessIncome: 0,
      nationalPension: 0,
      healthInsurance: 0,
      socialInsuranceDeduction: 0,
      taxableIncomeIncomeTax: 0,
      incomeTax: 0,
      taxableIncomeResident: 0,
      residentTax: 0,
      totalTaxAndInsurance: 0,
      netIncome,
      reserve: buildReserve(0, netIncome, annualRevenue),
    }
  }
```

通常 return の末尾に追記:

```ts
    netIncome,
    reserve: buildReserve(totalTaxAndInsurance, netIncome, annualRevenue),
  }
```

ファイル末尾（`calculateTax` の後）にヘルパーを追加:

```ts
function buildReserve(totalTaxAndInsurance: number, netIncome: number, annualRevenue: number) {
  return {
    monthlyReserve: Math.round(totalTaxAndInsurance / 12),
    reserveRate: annualRevenue > 0 ? totalTaxAndInsurance / annualRevenue : 0,
    monthlyDisposable: Math.round(netIncome / 12),
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tax`
Expected: PASS（reserve 2件を含む全件）

- [ ] **Step 5: コミット**

```bash
git add lib/tax.ts lib/tax.test.ts
git commit -m "feat: monthly tax reserve guidance in TaxResult (Phase 3)"
```

---

## Task 5: 年間売上の集計 `buildAnnualRevenue`（TDD）

12 ヶ月分の `buildMonthlySummary().totalBilling` を合算。請求ロジックを再利用し単一の真実を保つ。

**Files:**
- Modify: `lib/summary.ts`
- Test: `lib/summary.test.ts`

- [ ] **Step 1: 既存テストの形を確認**

Run: `npm test -- summary`
Expected: 既存の summary テストが PASS することを確認（前提の確認）。

- [ ] **Step 2: 失敗するテストを追加**

`lib/summary.test.ts` の末尾に追記（既存の import / 型生成ヘルパーがあればそれに合わせる。無ければ以下を自己完結で追加）:

```ts
import { buildAnnualRevenue } from './summary'
import type { Contract, WorkLog } from './types'

describe('buildAnnualRevenue', () => {
  const hourly: Contract = {
    id: 'c1', client_id: 'cl1', name: '時給契約', billing_type: 'hourly',
    minimum_hours: null, base_hourly_rate: 5000, overtime_hourly_rate: null,
    fixed_amount: null, start_date: null, end_date: null, is_active: true,
  }
  const log = (id: string, date: string, hours: number): WorkLog => ({
    id, client_id: 'cl1', contract_id: 'c1', work_date: date,
    planned_hours: null, actual_hours: hours,
    actual_start_time: null, actual_end_time: null, break_minutes: 0,
    memo: null, status: 'worked',
  })

  it('対象年の12ヶ月分の請求を合算する', () => {
    const logs = [log('w1', '2026-01-10', 10), log('w2', '2026-07-20', 20)]
    // 1月: 10h*5000=50,000 / 7月: 20h*5000=100,000 → 150,000
    expect(buildAnnualRevenue(2026, [hourly], logs)).toBe(150_000)
  })

  it('対象年以外の稼働は含めない', () => {
    const logs = [log('w1', '2025-12-31', 10), log('w2', '2027-01-01', 10)]
    expect(buildAnnualRevenue(2026, [hourly], logs)).toBe(0)
  })
})
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npm test -- summary`
Expected: FAIL（`buildAnnualRevenue` is not a function）

- [ ] **Step 4: 実装を追加**

`lib/summary.ts` の末尾に追記:

```ts
/** 対象年（暦年）の全契約の請求金額合計。buildMonthlySummary を 12 ヶ月分合算して再利用。 */
export function buildAnnualRevenue(year: number, contracts: Contract[], workLogs: WorkLog[]): number {
  let total = 0
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`
    total += buildMonthlySummary(ym, contracts, workLogs, 0).totalBilling
  }
  return total
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- summary`
Expected: PASS（buildAnnualRevenue 2件 + 既存全件）

- [ ] **Step 6: 全テスト確認 + コミット**

Run: `npm test`
Expected: PASS（既存26件 + 今回追加分すべて）

```bash
git add lib/summary.ts lib/summary.test.ts
git commit -m "feat: buildAnnualRevenue yearly billing aggregation (Phase 3)"
```

---

## Task 6: 税試算パラメータ設定画面（`/settings/tax`）

profile タブと同形。`tax_settings` を upsert（単一行）。設定ナビにタブ追加。

**Files:**
- Create: `app/(app)/settings/tax/actions.ts`
- Create: `app/(app)/settings/tax/tax-settings-ui.tsx`
- Create: `app/(app)/settings/tax/page.tsx`
- Modify: `app/(app)/settings/settings-nav.tsx`

- [ ] **Step 1: Server Action を作成**

`app/(app)/settings/tax/actions.ts`（profile/actions.ts の規約に合わせ `{ error }` を返す）:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function upsertTaxSettings(formData: FormData) {
  const num = (key: string, fallback: number) => {
    const v = formData.get(key)
    if (v == null || String(v).trim() === '') return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  const filing_type = String(formData.get('filing_type') ?? 'blue') === 'white' ? 'white' : 'blue'
  const row = {
    filing_type,
    blue_deduction: num('blue_deduction', 650000),
    basic_deduction_income: num('basic_deduction_income', 480000),
    basic_deduction_resident: num('basic_deduction_resident', 430000),
    national_pension_annual: num('national_pension_annual', 204000),
    health_insurance_rate: num('health_insurance_rate', 0.10),
    health_insurance_fixed: num('health_insurance_fixed', 50000),
    resident_tax_rate: num('resident_tax_rate', 0.10),
    resident_tax_fixed: num('resident_tax_fixed', 5000),
    other_deductions: num('other_deductions', 0),
  }

  const supabase = await createClient()
  const { data: existing } = await supabase.from('tax_settings').select('id').limit(1).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('tax_settings')
      .update({ ...row, updated_at: new Date().toISOString() }).eq('id', existing.id)
    if (error) return { error: '保存に失敗しました' }
  } else {
    const { error } = await supabase.from('tax_settings').insert(row)
    if (error) return { error: '保存に失敗しました' }
  }
  revalidatePath('/settings/tax')
  revalidatePath('/tax')
  return { error: null }
}
```

- [ ] **Step 2: 設定フォーム UI を作成**

`app/(app)/settings/tax/tax-settings-ui.tsx`（profile-ui.tsx と同じ送信パターン・toast 利用）:

```tsx
'use client'
import React from 'react'
import { upsertTaxSettings } from './actions'
import { useToast } from '@/components/toast'
import type { TaxSettings } from '@/lib/types'

const D = {
  blue_deduction: 650000, basic_deduction_income: 480000, basic_deduction_resident: 430000,
  national_pension_annual: 204000, health_insurance_rate: 0.10, health_insurance_fixed: 50000,
  resident_tax_rate: 0.10, resident_tax_fixed: 5000, other_deductions: 0,
}

export function TaxSettingsUI({ settings }: { settings: TaxSettings | null }) {
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const formRef = React.useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formRef.current) return
    setBusy(true); setError(null)
    const res = await upsertTaxSettings(new FormData(formRef.current))
    setBusy(false)
    if (res.error) setError(res.error)
    else toast('税試算パラメータを保存しました')
  }

  const numField = (name: keyof typeof D, label: string, hint?: string, step = '1') => (
    <div className="field">
      <label>{label}</label>
      <input className="input num" type="number" step={step} name={name}
        defaultValue={String(settings?.[name as keyof TaxSettings] ?? D[name])} />
      {hint && <span style={{ fontSize: 'var(--small)', color: 'var(--text-faint)' }}>{hint}</span>}
    </div>
  )

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ maxWidth: 520 }}>
      {error && <div className="errbox" style={{ marginBottom: 16 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="field">
          <label>申告区分</label>
          <select className="select" name="filing_type" defaultValue={settings?.filing_type ?? 'blue'}>
            <option value="blue">青色申告</option>
            <option value="white">白色申告</option>
          </select>
        </div>
        {numField('blue_deduction', '青色申告特別控除', '0 / 10万 / 55万 / 65万')}
        {numField('basic_deduction_income', '基礎控除（所得税）')}
        {numField('basic_deduction_resident', '基礎控除（住民税）')}
        {numField('national_pension_annual', '国民年金（年額）')}
        {numField('health_insurance_rate', '国保 所得比例分の率', '自治体差が大きい概算', '0.01')}
        {numField('health_insurance_fixed', '国保 定額分（均等割等）')}
        {numField('resident_tax_rate', '住民税 所得割の率', undefined, '0.01')}
        {numField('resident_tax_fixed', '住民税 均等割（定額）')}
        {numField('other_deductions', 'その他所得控除', 'iDeCo・小規模企業共済など')}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: 設定ページ（Server Component）を作成**

`app/(app)/settings/tax/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { TaxSettingsUI } from './tax-settings-ui'

export default async function TaxSettingsPage() {
  const supabase = await createClient()
  const { data: settings } = await supabase.from('tax_settings').select('*').limit(1).maybeSingle()
  return (
    <>
      <p style={{ fontSize: 'var(--small)', color: 'var(--text-faint)', marginBottom: 16 }}>
        年間手取り試算に使うパラメータ（概算）。正確な税額・保険料は税理士・自治体にご確認ください。
      </p>
      <TaxSettingsUI settings={settings ?? null} />
    </>
  )
}
```

- [ ] **Step 4: 設定ナビにタブを追加**

`app/(app)/settings/settings-nav.tsx` の `TABS` を更新:

```tsx
const TABS = [
  { href: '/settings/profile', label: 'プロフィール' },
  { href: '/settings/appearance', label: '外観' },
  { href: '/settings/tax', label: '税試算' },
]
```

- [ ] **Step 5: 動作確認**

Run: `npm run dev`（または本番デプロイ後の URL）
確認: `/settings/tax` を開く → 各項目がデフォルト値で表示 → 値を変更して保存 → toast 表示 → リロードで保持。

- [ ] **Step 6: コミット**

```bash
git add "app/(app)/settings/tax" "app/(app)/settings/settings-nav.tsx"
git commit -m "feat: tax settings page and nav tab (Phase 3)"
```

---

## Task 7: 年間手取り試算画面（`/tax`）+ ナビ

Server Component で年集計 → Client what-if UI で即時再計算。注意書きを常時表示。rail-nav にナビ項目とアイコンを追加。

**Files:**
- Modify: `components/icon.tsx`
- Modify: `components/rail-nav.tsx`
- Create: `app/(app)/tax/page.tsx`
- Create: `app/(app)/tax/tax-ui.tsx`

- [ ] **Step 1: アイコンを追加**

`components/icon.tsx` の `I` オブジェクトに追記（`search` の後）:

```ts
  calc: "M6 2h12v20H6z M9 6h6 M9 11h1 M13 11h1 M9 15h1 M13 15h1 M9 19h1 M13 19h1",
```

- [ ] **Step 2: rail-nav にナビ項目を追加**

`components/rail-nav.tsx` の `NAV` 配列、`summary` の後に追加:

```tsx
  { href: '/tax', label: '年間手取り試算', icon: 'calc' },
```

- [ ] **Step 3: 試算ページ（Server Component）を作成**

`app/(app)/tax/page.tsx`（summary/page.tsx の年月ナビを年ナビに置き換えたパターン。年集計は `buildAnnualRevenue`、経費はその年の `allocated_amount` 合計）:

```tsx
import { createClient } from '@/lib/supabase/server'
import { buildAnnualRevenue } from '@/lib/summary'
import { calculateTax, DEFAULT_TAX_PARAMS, type TaxParams } from '@/lib/tax'
import type { Contract, WorkLog, Expense, TaxSettings } from '@/lib/types'
import { TaxUI } from './tax-ui'

function toParams(s: TaxSettings | null): TaxParams {
  if (!s) return DEFAULT_TAX_PARAMS
  return {
    filingType: s.filing_type,
    blueDeduction: s.blue_deduction,
    basicDeductionIncome: s.basic_deduction_income,
    basicDeductionResident: s.basic_deduction_resident,
    nationalPensionAnnual: s.national_pension_annual,
    healthInsuranceRate: s.health_insurance_rate,
    healthInsuranceFixed: s.health_insurance_fixed,
    residentTaxRate: s.resident_tax_rate,
    residentTaxFixed: s.resident_tax_fixed,
    otherDeductions: s.other_deductions,
  }
}

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  const { y } = await searchParams
  const year = Number(y) || new Date().getFullYear()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  const supabase = await createClient()
  const [{ data: contracts }, { data: logs }, { data: expenses }, { data: settings }] = await Promise.all([
    supabase.from('contracts').select('*').eq('is_active', true),
    supabase.from('work_logs').select('*').gte('work_date', yearStart).lte('work_date', yearEnd),
    supabase.from('expenses').select('allocated_amount').gte('expense_date', yearStart).lte('expense_date', yearEnd),
    supabase.from('tax_settings').select('*').limit(1).maybeSingle(),
  ])

  const annualRevenue = buildAnnualRevenue(year, (contracts ?? []) as Contract[], (logs ?? []) as WorkLog[])
  const annualExpense = ((expenses ?? []) as Pick<Expense, 'allocated_amount'>[])
    .reduce((s, e) => s + (e.allocated_amount ?? 0), 0)

  // 初期計算（SSR）。以降は TaxUI が what-if で再計算。
  void calculateTax // 型参照のため（TaxUI 側で実行）

  return (
    <TaxUI
      year={year}
      annualRevenue={annualRevenue}
      annualExpense={annualExpense}
      params={toParams((settings ?? null) as TaxSettings | null)}
    />
  )
}
```

> 注: `void calculateTax` 行は不要なら削除可。SSR で初期内訳を出したい場合は `calculateTax({annualRevenue, annualExpense, params})` を計算して `initial` として渡してもよいが、本実装では TaxUI（Client）が初期描画時に同じ純関数で計算するため二重計算を避けて props のみ渡す。

- [ ] **Step 4: what-if UI（Client Component）を作成**

`app/(app)/tax/tax-ui.tsx`（主要レバーを画面で一時上書き → `useMemo` で即時再計算。保存はしない。詳細パラメータは設定へ誘導。注意書き常時表示。表示は既存 `tablecard`/`card`/`totalcard` クラスを流用）:

```tsx
'use client'
import React from 'react'
import Link from 'next/link'
import { Icon } from '@/components/icon'
import { calculateTax, type TaxParams } from '@/lib/tax'

interface Props {
  year: number
  annualRevenue: number
  annualExpense: number
  params: TaxParams
}

const yen = (n: number) => Math.round(n).toLocaleString('ja-JP')

export function TaxUI({ year, annualRevenue, annualExpense, params }: Props) {
  // what-if 用の一時上書き（保存しない）
  const [revenue, setRevenue] = React.useState(annualRevenue)
  const [expense, setExpense] = React.useState(annualExpense)
  const [filingType, setFilingType] = React.useState(params.filingType)
  const [otherDeductions, setOtherDeductions] = React.useState(params.otherDeductions)

  const result = React.useMemo(
    () => calculateTax({
      annualRevenue: revenue,
      annualExpense: expense,
      params: { ...params, filingType, otherDeductions },
    }),
    [revenue, expense, filingType, otherDeductions, params],
  )

  const dirty = revenue !== annualRevenue || expense !== annualExpense
    || filingType !== params.filingType || otherDeductions !== params.otherDeductions

  const rows: [string, number][] = [
    ['事業所得', result.businessIncome],
    ['国民年金', result.nationalPension],
    ['国民健康保険', result.healthInsurance],
    ['課税所得（所得税）', result.taxableIncomeIncomeTax],
    ['所得税（復興税込み）', result.incomeTax],
    ['課税所得（住民税）', result.taxableIncomeResident],
    ['住民税', result.residentTax],
  ]

  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>年間手取り試算</h1><p>対象年の売上・経費から税・保険・手取りを概算します。</p></div>
        <div className="ymselect">
          <Link href={`/tax?y=${year - 1}`} className="nav" aria-label="前年"><Icon name="chevL" size={16} /></Link>
          <span className="cur num">{year}年</span>
          <Link href={`/tax?y=${year + 1}`} className="nav" aria-label="翌年"><Icon name="chevR" size={16} /></Link>
        </div>
      </div>

      <div className="errbox" style={{ marginBottom: 16 }}>
        概算です。正確な税額・保険料は税理士・自治体にご確認ください。
      </div>

      {/* what-if 入力 */}
      <div className="tablecard" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="field">
            <label>年間売上（お試し上書き）</label>
            <input className="input num" type="number" value={revenue}
              onChange={(e) => setRevenue(Number(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>年間経費（お試し上書き）</label>
            <input className="input num" type="number" value={expense}
              onChange={(e) => setExpense(Number(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>申告区分</label>
            <select className="select" value={filingType}
              onChange={(e) => setFilingType(e.target.value === 'white' ? 'white' : 'blue')}>
              <option value="blue">青色申告</option>
              <option value="white">白色申告</option>
            </select>
          </div>
          <div className="field">
            <label>その他所得控除</label>
            <input className="input num" type="number" value={otherDeductions}
              onChange={(e) => setOtherDeductions(Number(e.target.value) || 0)} />
          </div>
        </div>
        <p style={{ fontSize: 'var(--small)', color: 'var(--text-faint)', marginTop: 12 }}>
          ここでの変更は保存されません（お試し計算）。確定値は
          <Link href="/settings/tax" style={{ textDecoration: 'underline', margin: '0 4px' }}>税試算パラメータ設定</Link>
          で編集してください。{dirty && '（現在お試し値で計算中）'}
        </p>
      </div>

      {/* 内訳 */}
      <div className="tablecard">
        <div className="tablewrap">
          <table className="tbl">
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="ar num yen">{yen(value)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                <td style={{ fontWeight: 700 }}>税・保険合計</td>
                <td className="ar num yen" style={{ fontWeight: 800 }}>{yen(result.totalTaxAndInsurance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 手取り + 取り置き目安 */}
      <div className="summary-totals">
        <div className="card totalcard totalcard--accent">
          <span className="lbl">年間手取り（可処分）</span>
          <span className="big num yen">{yen(result.netIncome)}</span>
          <span className="sub">売上 − 経費 − 税・保険合計</span>
        </div>
        <div className="card totalcard">
          <span className="lbl">毎月の取り置き目安</span>
          <span className="big num yen">{yen(result.reserve.monthlyReserve)}</span>
          <span className="sub">税・保険用に毎月確保（売上の約{Math.round(result.reserve.reserveRate * 100)}%）</span>
        </div>
        <div className="card totalcard">
          <span className="lbl">月に使っていい手取り</span>
          <span className="big num yen">{yen(result.reserve.monthlyDisposable)}</span>
          <span className="sub">手取り ÷ 12 の目安</span>
        </div>
      </div>
    </div>
  )
}
```

> 注: `summary-totals` は 2 カラム前提のスタイルの可能性がある。3 枚並べて崩れる場合は globals.css を確認し、`summary-totals` に `flex-wrap` や grid 列指定が効いているか確認のうえ、必要なら inline style で `gridTemplateColumns: 'repeat(3, 1fr)'` を補う。

- [ ] **Step 5: ビルド確認**

Run: `npm run build`
Expected: 型エラー・ビルドエラーなく成功。

- [ ] **Step 6: 動作確認（本番 URL / dev）**

- `/tax` を開く → 当年の売上・経費が集計表示され、内訳・手取り・取り置き目安が出る。
- 年ナビ（前年/翌年）で対象年が切り替わり再集計される。
- 「年間売上（お試し上書き）」を変更すると即座に全内訳が再計算される。
- 申告区分を白色に変えると事業所得が増える。
- 注意書きが常時表示される。
- rail-nav / モバイルナビに「年間手取り試算」が出る。
- `/settings/tax` で保存した値が `/tax` の初期値・計算に反映される。

- [ ] **Step 7: コミット**

```bash
git add "app/(app)/tax" components/icon.tsx components/rail-nav.tsx
git commit -m "feat: annual take-home estimator page with what-if and reserve guidance (Phase 3)"
```

---

## Self-Review チェック結果

- **スペック §4.7（tax_settings）** → Task 1。全列・デフォルト・RLS・grant を網羅。
- **スペック §8 計算ステップ** → Task 2（累進テーブル）+ Task 3（事業所得〜手取り）。復興特別所得税 ×1.021、社会保険料控除、所得税/住民税の基礎控除分離をカバー。
- **スペック §8 テストケース**（売上0 / 600万・経費100万 / white / 境界 / other_deductions）→ Task 2・3 のテストで網羅。
- **スペック §8 出力項目**（事業所得/課税所得/所得税/住民税/国保/年金/合計/手取り）→ Task 7 の内訳テーブル + 手取りカード。
- **スペック §9 画面**（年間手取り試算 / 税試算パラメータ設定）→ Task 7 / Task 6。年選択・注意書き常時表示を含む。
- **新要望（取り置き目安）** → Task 4 + Task 7 のカード3枚。
- **「設定値を変えると即座に再計算（クライアント側）」** → Task 7 の what-if（useMemo）。
- **矛盾の解決**（売上0→全て0 vs 住民税均等割）→ 事業所得=0ゲートを Task 3 に明記。
- **プレースホルダ無し** → 全ステップに実コード・実コマンド・期待結果あり。
- **型整合** → `TaxParams`（camelCase, lib）/ `TaxSettings`（snake_case, DB）を `toParams` で変換。`calculateTax`/`progressiveIncomeTax`/`buildAnnualRevenue`/`DEFAULT_TAX_PARAMS` の名前は全タスクで一致。

## 補足
- お金のロジックは必ず TDD（Task 2〜5）。
- Server Action は `{ error: string | null }` 返却規約に準拠（Task 6）。
- 新規テーブルは owner_id default auth.uid() + owner-only RLS + grant をセットで適用済み（Task 1）。
- UI 崩れ確認は本番 URL（Vercel 自動デプロイ、push 後 1-2 分）。
```
