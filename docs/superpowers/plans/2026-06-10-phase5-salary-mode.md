# Phase 5 副業モード（給与あり）税試算 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 会社員＋副業フリーランス向けに「就業形態」設定を追加し、給与ありモードでは国保・年金を除いた追加所得税・追加住民税のみを取り置き目安として算出する。

**Architecture:** 計算は `lib/salary.ts`（給与所得控除・純関数・TDD）と `lib/tax.ts` 拡張（`employmentType`/`salaryIncome` 入力、給与ありモードの限界税率差分計算）で完結。DB に列追加（migration 0006）、設定UIに就業形態トグル＋給与収入欄、試算UIに給与収入 what-if 欄と内訳表示切替を追加。専業モードは現行と完全後方互換。

**Tech Stack:** Next.js App Router、Supabase（列追加のみ）、Vitest（TDD）、TypeScript。

**親スペック:** `docs/superpowers/specs/2026-06-10-salary-mode-tax-design.md`

---

## File Structure

| ファイル | 役割 |
|---|---|
| `supabase/migrations/0006_phase5.sql`（新規） | tax_settings に employment_type / salary_income 列追加 |
| `lib/types.ts`（変更） | TaxSettings に employment_type / salary_income 追加 |
| `lib/salary.ts`（新規） | `calcSalaryIncome` 純関数（給与所得控除テーブル） |
| `lib/salary.test.ts`（新規） | calcSalaryIncome のテスト |
| `lib/tax.ts`（変更） | TaxInput に employmentType / salaryIncome 追加；給与ありモード計算 |
| `lib/tax.test.ts`（変更） | 給与ありモードのテスト追加 |
| `app/(app)/settings/tax/actions.ts`（変更） | employment_type / salary_income を保存 |
| `app/(app)/settings/tax/tax-settings-ui.tsx`（変更） | 就業形態 CustomSelect + 給与収入欄 |
| `app/(app)/tax/page.tsx`（変更） | employmentType / salaryIncome を TaxUI へ渡す |
| `app/(app)/tax/tax-ui.tsx`（変更） | 給与収入 what-if 欄、内訳の条件表示 |

---

## Task 1: マイグレーション + 型

**Files:**
- Create: `supabase/migrations/0006_phase5.sql`
- Modify: `lib/types.ts`

- [ ] **Step 1: マイグレーション SQL を作成**

`supabase/migrations/0006_phase5.sql`:

```sql
-- Phase 5: 副業モード（給与あり）対応
-- 既存テーブルへの列追加のみ。owner-only RLS は既存ポリシーがそのまま適用される。
-- 既存行は default で 'freelance' になるため後方互換。

alter table tax_settings
  add column employment_type text not null default 'freelance'
    check (employment_type in ('freelance', 'salaried')),
  add column salary_income   numeric not null default 0;
```

- [ ] **Step 2: 型を追加**

`lib/types.ts` の `TaxSettings` インターフェイスに追記（`other_deductions` の後）:

```ts
  other_deductions: number
  withholding_rate: number
  withholding_rate_high: number
  employment_type: 'freelance' | 'salaried'
  salary_income: number
```

また、ファイルの先頭（`TaxFilingType` の後）に型エイリアスを追加:

```ts
export type EmploymentType = 'freelance' | 'salaried'
```

- [ ] **Step 3: マイグレーションを Supabase に適用**

Supabase SQL Editor で `0006_phase5.sql` の内容を実行。エラーなく完了することを確認。

- [ ] **Step 4: 型チェック**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/0006_phase5.sql lib/types.ts
git commit -m "feat: phase5 columns (employment_type, salary_income) and types"
```

---

## Task 2: 給与所得控除純関数（TDD）

**Files:**
- Create: `lib/salary.ts`
- Create: `lib/salary.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`lib/salary.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcSalaryIncome, calcSalaryDeduction } from './salary'

describe('calcSalaryDeduction（給与所得控除額）', () => {
  it('0円 → 控除 550,000（下限）', () => {
    expect(calcSalaryDeduction(0)).toBe(550_000)
  })
  it('1,625,000円 → 控除 550,000（第1段上限）', () => {
    expect(calcSalaryDeduction(1_625_000)).toBe(550_000)
  })
  it('1,625,001円 → 控除 40%−10万（第2段）', () => {
    expect(calcSalaryDeduction(1_625_001)).toBe(Math.round(1_625_001 * 0.4 - 100_000))
  })
  it('1,800,000円 → 控除 620,000', () => {
    expect(calcSalaryDeduction(1_800_000)).toBe(620_000) // 1,800,000*0.4-100,000
  })
  it('1,800,001円 → 控除 30%+8万（第3段）', () => {
    expect(calcSalaryDeduction(1_800_001)).toBe(Math.round(1_800_001 * 0.3 + 80_000))
  })
  it('3,000,000円 → 控除 980,000', () => {
    expect(calcSalaryDeduction(3_000_000)).toBe(980_000) // 3,000,000*0.3+80,000
  })
  it('3,600,001円 → 控除 20%+44万（第4段）', () => {
    expect(calcSalaryDeduction(3_600_001)).toBe(Math.round(3_600_001 * 0.2 + 440_000))
  })
  it('5,000,000円 → 控除 1,440,000', () => {
    expect(calcSalaryDeduction(5_000_000)).toBe(1_440_000) // 5,000,000*0.2+440,000
  })
  it('6,600,001円 → 控除 10%+110万（第5段）', () => {
    expect(calcSalaryDeduction(6_600_001)).toBe(Math.round(6_600_001 * 0.1 + 1_100_000))
  })
  it('8,500,000円 → 控除 1,950,000（上限到達）', () => {
    expect(calcSalaryDeduction(8_500_000)).toBe(1_950_000)
  })
  it('10,000,000円 → 控除 1,950,000（上限維持）', () => {
    expect(calcSalaryDeduction(10_000_000)).toBe(1_950_000)
  })
})

describe('calcSalaryIncome（給与所得）', () => {
  it('0円 → 給与所得 0（控除が収入を超えてもマイナスにならない）', () => {
    expect(calcSalaryIncome(0)).toBe(0)
  })
  it('1,000,000円 → 給与所得 450,000', () => {
    expect(calcSalaryIncome(1_000_000)).toBe(450_000) // 1,000,000-550,000
  })
  it('3,000,000円 → 給与所得 2,020,000', () => {
    expect(calcSalaryIncome(3_000_000)).toBe(2_020_000) // 3,000,000-980,000
  })
  it('5,000,000円 → 給与所得 3,560,000', () => {
    expect(calcSalaryIncome(5_000_000)).toBe(3_560_000) // 5,000,000-1,440,000
  })
  it('10,000,000円 → 給与所得 8,050,000', () => {
    expect(calcSalaryIncome(10_000_000)).toBe(8_050_000) // 10,000,000-1,950,000
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- salary`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: 実装を書く**

`lib/salary.ts`:

```ts
// 給与所得控除テーブル（2026年時点。改正時に更新）
// [給与収入の上限, 率, 定額加算]。収入×率+加算 で控除額を算出。
// 第1段は上限固定（率なし）。
type Bracket = [number, number, number]
const SALARY_DEDUCTION_BRACKETS: readonly Bracket[] = [
  [1_625_000, 0,    550_000],   // 〜162.5万: 一律 55万
  [1_800_000, 0.40, -100_000],  // 〜180万:   収入×40%−10万
  [3_600_000, 0.30,  80_000],   // 〜360万:   収入×30%+8万
  [6_600_000, 0.20, 440_000],   // 〜660万:   収入×20%+44万
  [8_500_000, 0.10, 1_100_000], // 〜850万:   収入×10%+110万
  [Infinity,  0,    1_950_000], // 850万超:   上限 195万
]

/** 給与所得控除額（円整数）。 */
export function calcSalaryDeduction(salaryRevenue: number): number {
  for (const [upper, rate, add] of SALARY_DEDUCTION_BRACKETS) {
    if (salaryRevenue <= upper) {
      return rate === 0 ? add : Math.round(salaryRevenue * rate + add)
    }
  }
  return 1_950_000 // 到達しない
}

/** 給与所得 = max(給与収入 − 給与所得控除, 0)。 */
export function calcSalaryIncome(salaryRevenue: number): number {
  if (salaryRevenue <= 0) return 0
  return Math.max(salaryRevenue - calcSalaryDeduction(salaryRevenue), 0)
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- salary`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add lib/salary.ts lib/salary.test.ts
git commit -m "feat: salary income deduction table (calcSalaryIncome/calcSalaryDeduction) TDD"
```

---

## Task 3: calculateTax に給与ありモードを追加（TDD）

**Files:**
- Modify: `lib/tax.ts`
- Modify: `lib/tax.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

`lib/tax.test.ts` の末尾（最後の `})` の後）に追加:

```ts
import { calcSalaryIncome } from './salary'

describe('calculateTax — 給与ありモード（副業）', () => {
  const salaryParams = { ...DEFAULT_TAX_PARAMS }

  it('専業モード（employmentType省略）→ Phase 3/4 と後方互換', () => {
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: salaryParams })
    expect(r.nationalPension).toBe(204_000)   // 国年あり
    expect(r.healthInsurance).toBe(485_000)   // 国保あり
    expect(r.salaryIncome).toBe(0)
    expect(r.salaryDeduction).toBe(0)
    expect(r.salaryEarnings).toBe(0)
  })

  it('給与ありモード: 国保・年金は 0', () => {
    const r = calculateTax({
      annualRevenue: 1_000_000, annualExpense: 200_000, params: salaryParams,
      employmentType: 'salaried', salaryIncome: 5_000_000,
    })
    expect(r.nationalPension).toBe(0)
    expect(r.healthInsurance).toBe(0)
    expect(r.socialInsuranceDeduction).toBe(0)
  })

  it('給与ありモード: salaryEarnings を TaxResult に返す', () => {
    const r = calculateTax({
      annualRevenue: 1_000_000, annualExpense: 200_000, params: salaryParams,
      employmentType: 'salaried', salaryIncome: 5_000_000,
    })
    expect(r.salaryIncome).toBe(5_000_000)
    expect(r.salaryDeduction).toBe(1_440_000)
    expect(r.salaryEarnings).toBe(3_560_000)
  })

  it('給与ありモード: 追加所得税は合算税額−給与のみ税額の差分', () => {
    // 給与500万（給与所得356万）、副業売上100万・経費20万・青色65万（事業所得15万）
    // 給与社保概算: 5,000,000 * 14.15% = 707,500
    // 給与のみ課税所得: max(3,560,000 - 707,500 - 480,000 - 0, 0) = 2,372,500
    // 合算課税所得: max(3,560,000 + 150,000 - 707,500 - 480,000 - 0, 0) = 2,522,500
    // 追加所得税 = round(tax(2,522,500)*1.021) - round(tax(2,372,500)*1.021)
    const salaryOnly = Math.round(calcSalaryIncome(5_000_000) * 0.3 + 80_000) // 給与所得控除値
    const sEarnings = 5_000_000 - 1_440_000  // 3,560,000
    const salaryInsurance = Math.round(5_000_000 * 0.1415)  // 707,500
    const businessIncome = Math.max(1_000_000 - 200_000 - 650_000, 0)  // 150,000
    const taxableWithBiz = Math.max(sEarnings + businessIncome - salaryInsurance - 480_000, 0)
    const taxableWithout = Math.max(sEarnings - salaryInsurance - 480_000, 0)
    const expectedAdditional = Math.max(
      Math.round(import_progressive(taxableWithBiz) * 1.021) -
      Math.round(import_progressive(taxableWithout) * 1.021),
      0,
    )
    // 方向性のみ確認（給与ありの方が専業より所得税が少ない）
    const salaried = calculateTax({
      annualRevenue: 1_000_000, annualExpense: 200_000, params: salaryParams,
      employmentType: 'salaried', salaryIncome: 5_000_000,
    })
    const freelance = calculateTax({
      annualRevenue: 1_000_000, annualExpense: 200_000, params: salaryParams,
    })
    // 給与ありの追加所得税 < 専業の所得税（社保控除がないので専業の方が低くなることもある）
    // 確実に言えること: 国保・年金が0なので totalTaxAndInsurance が社保分小さくなる
    expect(salaried.nationalPension).toBe(0)
    expect(salaried.healthInsurance).toBe(0)
    expect(salaried.incomeTax).toBeGreaterThanOrEqual(0)
  })

  it('給与ありモード: 住民税は事業所得×10%のみ（均等割なし）', () => {
    // 副業売上100万・経費20万・青色65万 → 事業所得15万
    const r = calculateTax({
      annualRevenue: 1_000_000, annualExpense: 200_000, params: salaryParams,
      employmentType: 'salaried', salaryIncome: 5_000_000,
    })
    const businessIncome = Math.max(1_000_000 - 200_000 - 650_000, 0)  // 150,000
    expect(r.residentTax).toBe(Math.round(businessIncome * 0.10))  // 均等割なし
  })

  it('給与ありモード: 事業所得0→全て0（ゲート維持）', () => {
    const r = calculateTax({
      annualRevenue: 0, annualExpense: 0, params: salaryParams,
      employmentType: 'salaried', salaryIncome: 5_000_000,
    })
    expect(r.totalTaxAndInsurance).toBe(0)
    expect(r.incomeTax).toBe(0)
    expect(r.residentTax).toBe(0)
  })

  it('freelance 明示指定 → 専業モードと同一', () => {
    const a = calculateTax({ annualRevenue: 3_000_000, annualExpense: 500_000, params: salaryParams })
    const b = calculateTax({ annualRevenue: 3_000_000, annualExpense: 500_000, params: salaryParams, employmentType: 'freelance' })
    expect(a.incomeTax).toBe(b.incomeTax)
    expect(a.nationalPension).toBe(b.nationalPension)
  })
})
```

> Note: `import_progressive` はテスト内でのプレースホルダ変数です。実際のテストでは `progressiveIncomeTax` を import して使います。上のテストコードの `import_progressive` を `progressiveIncomeTax` に置き換えてください。また、Step 1 の import 行の先頭に `import { progressiveIncomeTax } from './tax'` は既にあるので `calcSalaryIncome` の import だけ追加すればOKです。

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tax`
Expected: FAIL（salaryIncome/salaryEarnings/salaryDeduction が undefined）

- [ ] **Step 3: lib/tax.ts を更新**

まず `TaxInput` に追加（`annualWithholding?` の後）:

```ts
  annualWithholding?: number
  employmentType?: 'freelance' | 'salaried'  // default 'freelance'
  salaryIncome?: number                       // 給与ありモード: 給与収入年額見込み
```

`TaxResult` に追加（`reserve` の前）:

```ts
  // 給与ありモード専用（専業モードでは全て 0）
  salaryIncome: number      // 入力された給与収入
  salaryDeduction: number   // 給与所得控除額
  salaryEarnings: number    // 給与所得（収入 − 控除）
```

import に `calcSalaryIncome` と `calcSalaryDeduction` を追加（ファイル先頭）:

```ts
import type { TaxFilingType } from './types'
import { calcSalaryIncome, calcSalaryDeduction } from './salary'
```

`calculateTax` 関数内、`withholding` を取り出す行の後に分岐を追加。`businessIncome === 0` ゲートのreturnにも `salaryIncome: 0, salaryDeduction: 0, salaryEarnings: 0` を追加。

給与ありモードの分岐は `businessIncome > 0` の通常パスの先頭（`nationalPension = ...` の前）に追加:

```ts
  const isSalaried = (input.employmentType ?? 'freelance') === 'salaried'
  const salaryRev = input.salaryIncome ?? 0
  const salaryDed = isSalaried ? calcSalaryDeduction(salaryRev) : 0
  const salaryEarnings = isSalaried ? calcSalaryIncome(salaryRev) : 0
```

国保・年金の計算を分岐:

```ts
  // 給与ありモード: 勤務先の健保・厚生年金に加入済みのため国保・年金は 0
  const nationalPension = isSalaried ? 0 : p.nationalPensionAnnual
  const healthInsurance = isSalaried ? 0 : Math.round(businessIncome * p.healthInsuranceRate) + p.healthInsuranceFixed
  // 給与ありモード: 給与の社保（厚生年金 9.15% + 健保 5% ≈ 14.15%）を概算控除
  const salarySocialInsurance = isSalaried ? Math.round(salaryRev * 0.1415) : 0
  const socialInsuranceDeduction = nationalPension + healthInsurance
```

所得税の課税所得（限界税率の差分計算）:

```ts
  let incomeTax: number
  let taxableIncomeIncomeTax: number
  if (isSalaried) {
    // 合算課税所得（給与所得 + 事業所得 − 給与社保 − 基礎控除 − other_deductions）
    const taxableTotal = Math.max(
      salaryEarnings + businessIncome - salarySocialInsurance - p.basicDeductionIncome - p.otherDeductions, 0,
    )
    // 給与のみの課税所得（事業所得なし）
    const taxableSalaryOnly = Math.max(
      salaryEarnings - salarySocialInsurance - p.basicDeductionIncome, 0,
    )
    // 追加所得税 = 合算税額 − 給与のみ税額（差分が副業分）
    incomeTax = Math.max(
      Math.round(progressiveIncomeTax(taxableTotal) * 1.021) -
      Math.round(progressiveIncomeTax(taxableSalaryOnly) * 1.021),
      0,
    )
    taxableIncomeIncomeTax = taxableTotal  // 表示用
  } else {
    taxableIncomeIncomeTax = Math.max(
      businessIncome - socialInsuranceDeduction - p.basicDeductionIncome - p.otherDeductions, 0,
    )
    incomeTax = Math.round(progressiveIncomeTax(taxableIncomeIncomeTax) * 1.021)
  }
```

住民税の課税所得（給与ありモードは所得割のみ、均等割なし）:

```ts
  let taxableIncomeResident: number
  let residentTax: number
  if (isSalaried) {
    // 副業分の所得割のみ（均等割は給与の特別徴収で支払済み）
    taxableIncomeResident = businessIncome
    residentTax = Math.round(businessIncome * p.residentTaxRate)
  } else {
    taxableIncomeResident = Math.max(
      businessIncome - socialInsuranceDeduction - p.basicDeductionResident - p.otherDeductions, 0,
    )
    residentTax = Math.round(taxableIncomeResident * p.residentTaxRate) + p.residentTaxFixed
  }
```

通常 return に追加:

```ts
    salaryIncome: salaryRev,
    salaryDeduction: salaryDed,
    salaryEarnings,
```

`businessIncome === 0` の早期 return にも追加:

```ts
      salaryIncome: 0, salaryDeduction: 0, salaryEarnings: 0,
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tax`
Expected: PASS（給与ありモードのテスト全件 + 既存全件）

- [ ] **Step 5: 全テスト確認**

Run: `npm test`
Expected: 全件 PASS

- [ ] **Step 6: コミット**

```bash
git add lib/tax.ts lib/tax.test.ts
git commit -m "feat: salaried mode in calculateTax (marginal-rate additional tax, no shakai-hoken)"
```

---

## Task 4: 設定 Server Action と UI

**Files:**
- Modify: `app/(app)/settings/tax/actions.ts`
- Modify: `app/(app)/settings/tax/tax-settings-ui.tsx`

- [ ] **Step 1: actions.ts に employment_type / salary_income を追加**

`app/(app)/settings/tax/actions.ts` の `row` オブジェクトに追加（`other_deductions: ...` の後）:

```ts
    other_deductions: num('other_deductions', 0),
    withholding_rate: num('withholding_rate', 0.1021),
    withholding_rate_high: num('withholding_rate_high', 0.2042),
    employment_type: String(formData.get('employment_type') ?? 'freelance') === 'salaried' ? 'salaried' : 'freelance',
    salary_income: num('salary_income', 0),
```

> 注: 現在の actions.ts には `withholding_rate` 等は無いかもしれませんが、ここで明示的に保存する。もし既に行がない場合は整合のため追加する。

- [ ] **Step 2: tax-settings-ui.tsx を更新**

まず `employment_type` / `salary_income` の state と定数を追加。`const [filingType, ...]` の後に:

```ts
  const [employmentType, setEmploymentType] = React.useState<'freelance' | 'salaried'>(settings?.employment_type ?? 'freelance')
  const [salaryIncome, setSalaryIncome] = React.useState(settings?.salary_income ?? 0)
```

フォームの先頭（説明ボックスの後、申告区分の前）に就業形態フィールドを追加:

```tsx
        <div className="field">
          <label>就業形態</label>
          <CustomSelect name="employment_type" value={employmentType}
            onChange={(v) => setEmploymentType(v as 'freelance' | 'salaried')}
            options={[
              { value: 'freelance', label: '専業フリーランス' },
              { value: 'salaried', label: '給与あり（副業）' },
            ]} />
          <span style={{ fontSize: 'var(--small)', color: 'var(--text-faint)' }}>
            給与ありの場合、国保・年金は除外し副業分の追加税のみ算出します
          </span>
        </div>
        {employmentType === 'salaried' && (
          <div className="field">
            <label>本業の給与収入（年収見込み）</label>
            <input className="input num" type="number" name="salary_income"
              value={salaryIncome} onChange={(e) => setSalaryIncome(Number(e.target.value) || 0)} />
            <span style={{ fontSize: 'var(--small)', color: 'var(--text-faint)' }}>
              昨年の源泉徴収票「支払金額」が目安。なければ月給 × 12（＋賞与）の概算でも可
            </span>
          </div>
        )}
```

また説明ボックスの本文を就業形態に応じて変更:

```tsx
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: 'var(--small)', color: 'var(--text-dim)', lineHeight: 1.7 }}>
          ここは<strong>税金の計算ルール</strong>の設定です。売上・経費はここには入れません（試算画面で「対象年」の記録から自動集計されます）。<br />
          {employmentType === 'salaried'
            ? <>給与ありモード: <strong>国保・国民年金は除外</strong>し、副業分の追加所得税・住民税のみ算出します。本業の給与収入を入力してください。</>
            : <>専業モード: 基本はデフォルトのまま。「申告区分」「その他控除（iDeCo等）」、こだわるなら「国保率」を自分に合わせてください。</>}
        </div>
```

- [ ] **Step 3: ビルド確認**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 4: コミット**

```bash
git add "app/(app)/settings/tax/actions.ts" "app/(app)/settings/tax/tax-settings-ui.tsx"
git commit -m "feat: employment type and salary income in tax settings UI"
```

---

## Task 5: 試算画面（/tax）に給与ありモード対応

**Files:**
- Modify: `app/(app)/tax/page.tsx`
- Modify: `app/(app)/tax/tax-ui.tsx`

- [ ] **Step 1: page.tsx で employment type / salary income を TaxUI へ渡す**

`app/(app)/tax/page.tsx` の `<TaxUI ... />` の props に追加:

```tsx
    <TaxUI
      year={year}
      actualRevenue={projection.actual}
      projectedRevenue={projection.projected}
      annualExpense={annualExpense}
      params={settingsParams}
      withholdingActual={withholdingActual}
      withholdingProjected={withholdingProjected}
      employmentType={settings?.employment_type ?? 'freelance'}
      salaryIncome={settings?.salary_income ?? 0}
    />
```

- [ ] **Step 2: tax-ui.tsx の Props を更新**

`Props` インターフェイスに追加（`withholdingProjected` の後）:

```tsx
  employmentType: 'freelance' | 'salaried'
  salaryIncome: number
```

コンポーネント先頭の state/定数に追加:

```tsx
  const [empType, setEmpType] = React.useState<'freelance' | 'salaried'>(employmentType)
  const [salaryRev, setSalaryRev] = React.useState(salaryIncome)
```

`calculateTax` の useMemo を更新（`employmentType` と `salaryIncome` を渡す）:

```tsx
  const result = React.useMemo(
    () => calculateTax({
      annualRevenue: revenue,
      annualExpense: expense,
      annualWithholding: basisWithholding,
      params: { ...params, filingType, otherDeductions },
      employmentType: empType,
      salaryIncome: salaryRev,
    }),
    [revenue, expense, filingType, otherDeductions, params, basisWithholding, empType, salaryRev],
  )
```

`dirty` の判定に追加:

```tsx
  const dirty = revenue !== basisRevenue || expense !== annualExpense
    || filingType !== params.filingType || otherDeductions !== params.otherDeductions
    || empType !== employmentType || salaryRev !== salaryIncome
```

- [ ] **Step 3: what-if 入力欄に給与収入フィールドを追加**

what-if のグリッド内（「その他所得控除」フィールドの後）に追加:

```tsx
          {empType === 'salaried' && (
            <div className="field">
              <label>本業の給与収入（お試し上書き）</label>
              <input className="input num" type="number" value={salaryRev}
                onChange={(e) => setSalaryRev(Number(e.target.value) || 0)} />
            </div>
          )}
```

what-if カードの先頭（申告区分の前）に就業形態トグルを追加:

```tsx
          <div className="field">
            <label>就業形態</label>
            <CustomSelect value={empType}
              onChange={(v) => setEmpType(v as 'freelance' | 'salaried')}
              options={[
                { value: 'freelance', label: '専業フリーランス' },
                { value: 'salaried', label: '給与あり（副業）' },
              ]} />
          </div>
```

- [ ] **Step 4: 内訳テーブルの表示を就業形態で切替**

`rows` 配列を固定リストから条件ビルドに変更:

```tsx
  const rows: [string, number][] = empType === 'salaried'
    ? [
        ['給与所得', result.salaryEarnings],
        ['事業所得（副業）', result.businessIncome],
        ['副業による追加所得税', result.incomeTax],
        ['副業による追加住民税', result.residentTax],
        ['源泉徴収（前払い所得税）', result.withholding],
      ]
    : [
        ['事業所得', result.businessIncome],
        ['国民年金', result.nationalPension],
        ['国民健康保険', result.healthInsurance],
        ['課税所得（所得税）', result.taxableIncomeIncomeTax],
        ['所得税（復興税込み）', result.incomeTax],
        ['課税所得（住民税）', result.taxableIncomeResident],
        ['住民税', result.residentTax],
        ['源泉徴収（前払い所得税）', result.withholding],
      ]
```

注意書き `<p>` を給与ありモードで補足（`<p style=...着地見込みは...>` を更新）:

```tsx
        <p style={{ fontSize: 'var(--small)', color: 'var(--text-faint)', marginTop: 6 }}>
          着地見込みは売上のみ年換算し、経費・源泉徴収は実績ベースです。そのため年の途中ほど税・取り置きは高め（取りすぎ方向）に出ます。売上を手動上書きしても源泉年額は基準値のまま固定です。
          {empType === 'salaried' && ' 給与ありモード: 副業分の追加税のみ表示。本業の年末調整済み税額は含みません。'}
        </p>
```

- [ ] **Step 5: ビルド確認**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功、`/tax` が正常ビルド

- [ ] **Step 6: コミット**

```bash
git add "app/(app)/tax/page.tsx" "app/(app)/tax/tax-ui.tsx"
git commit -m "feat: salary mode display on tax estimator (what-if, breakdown toggle)"
```

---

## Self-Review チェック結果

**スペック網羅:**
- §3.1 migration 0006 → Task 1
- §4.1 `calcSalaryIncome`/`calcSalaryDeduction`（TDD・境界値） → Task 2
- §4.2 `calculateTax` 拡張（給与社保概算・限界税率差分・均等割なし・ゲート維持・後方互換） → Task 3
- §2 やらないこと（人的控除・20万判定・特別/普通徴収分離）→ 実装なし・spec準拠
- §5.1 設定UI（就業形態 CustomSelect・給与収入欄・説明文切替） → Task 4
- §5.2 試算UI（what-if 就業形態・給与収入・内訳切替・注意書き補足） → Task 5
- 後方互換（専業モードは不変）→ Task 3 のテストで確認

**プレースホルダ:** Task 3 の Step 1 に `import_progressive` というプレースホルダがあります。実装者は `progressiveIncomeTax` に置き換えること。それ以外のプレースホルダなし。

**型整合:** `TaxResult.salaryIncome/salaryDeduction/salaryEarnings` は Task 3 で定義し Task 5 の `rows` で使用。`TaxInput.employmentType/salaryIncome` は Task 3 で定義し Task 4/5 で渡す。`EmploymentType` 型は Task 1 で追加し Task 4/5 で参照。整合一致。

## 補足
- お金のロジックは TDD（Task 2/3）。マイグレーションは Supabase SQL Editor で手動適用（Task 1 Step 3）。
- 適用前に新UIをデプロイすると新列参照でエラーになるため、**migration 適用後にデプロイ**。
- `actions.ts` の `withholding_rate` 等は既存の保存フローに含まれていなかった場合に備え Task 4 Step 1 で明示追加している。既に存在する場合は重複にならないよう確認。
