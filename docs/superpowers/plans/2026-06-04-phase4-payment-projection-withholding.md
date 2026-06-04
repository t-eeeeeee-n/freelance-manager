# Phase 4 Implementation Plan — 入金管理・着地見込み・源泉徴収

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 請求の入金管理、年商の着地見込み、源泉徴収（契約ごと選択・前払い所得税扱い）を追加する。

**Architecture:** 既存テーブルへ列追加（マイグレーション0005）。お金のロジックは純関数＋Vitest で TDD（`lib/withholding.ts`・`lib/projection.ts`・`lib/tax.ts` 拡張）。年商の月次内訳は `buildMonthlyAmounts` を単一の真実とし、着地見込みと源泉年額の双方がそこから導出される。UI は既存パターン（Server Component 読み取り / Server Action `{error}` 書き込み）踏襲。

**Tech Stack:** Next.js App Router + TypeScript、Supabase（Postgres + RLS）、Vitest、@react-pdf/renderer。

**親スペック:** `docs/superpowers/specs/2026-06-04-phase4-payment-projection-withholding-design.md`

---

## File Structure

| ファイル | 役割 |
|----------|------|
| `supabase/migrations/0005_phase4.sql`（新規） | invoices/contracts/tax_settings へ列追加 |
| `lib/types.ts`（変更） | `Invoice`/`InvoiceStatus` 追加、`Contract.withholding`、`TaxSettings` 源泉率 |
| `lib/withholding.ts`（新規）+ test | `calcWithholding` 純関数 |
| `lib/projection.ts`（新規）+ test | `buildMonthlyAmounts`/`buildAnnualProjection`/`estimateMonthly` |
| `lib/summary.ts`（変更） | `isMonthWithinPeriod` を export |
| `lib/tax.ts`（変更）+ test | `annualWithholding` 入力、`withholding`/`incomeTaxDue`/`incomeTaxRefund`、取り置き補正 |
| `app/(app)/invoices/page.tsx`（変更）+ `invoices-table.tsx`（新規）+ `payment-actions.ts`（新規） | 入金ステータス・期日・アクション |
| `app/(app)/dashboard/page.tsx`（変更） | 未入金・期日超過カード |
| `app/(app)/summary/invoice-actions.ts`（変更） | 発行時 due_date 既定・源泉額の保存 |
| `lib/pdf.tsx`（変更）+ test | 源泉行（小計/源泉/差引） |
| `app/(app)/contracts/contracts-ui.tsx`（変更）+ `actions.ts`（変更） | 源泉チェック |
| `app/(app)/tax/page.tsx`（変更）+ `tax-ui.tsx`（変更） | 基準トグル・源泉表示 |

---

# Stage 1: 入金管理

## Task 1: マイグレーション0005 + 型

**Files:**
- Create: `supabase/migrations/0005_phase4.sql`
- Modify: `lib/types.ts`

- [ ] **Step 1: マイグレーションSQLを作成**

`supabase/migrations/0005_phase4.sql`:

```sql
-- Phase 4: 入金管理・源泉徴収・着地見込み の列追加
-- 既存テーブルへの列追加のみ。owner-only RLS は既存ポリシーがそのまま適用される。

-- 入金管理 + 源泉スナップショット（invoices）
alter table invoices
  add column status             text not null default 'unpaid' check (status in ('unpaid','paid')),
  add column paid_date          date,
  add column due_date           date,
  add column withholding_amount numeric not null default 0;

-- 源泉フラグ（contracts）
alter table contracts
  add column withholding boolean not null default false;

-- 源泉率（tax_settings）。100万円の閾値はコード定数（lib/withholding.ts）で保持。
alter table tax_settings
  add column withholding_rate      numeric not null default 0.1021,
  add column withholding_rate_high numeric not null default 0.2042;
```

- [ ] **Step 2: 型を追加・更新**

`lib/types.ts` の `Contract` インターフェイスに `withholding` を追加（`is_active` の後）:

```ts
  is_active: boolean
  withholding: boolean
```

`Expense` インターフェイスの後に `Invoice` を追加:

```ts
export type InvoiceStatus = 'unpaid' | 'paid'

export interface Invoice {
  id: string
  invoice_no: string
  client_id: string
  year_month: string
  issue_date: string
  total_amount: number
  memo: string | null
  status: InvoiceStatus
  paid_date: string | null
  due_date: string | null
  withholding_amount: number
}
```

`TaxSettings` インターフェイスに源泉率を追加（`other_deductions` の後）:

```ts
  other_deductions: number
  withholding_rate: number
  withholding_rate_high: number
```

- [ ] **Step 3: マイグレーションを適用**

Supabase SQL Editor で `0005_phase4.sql` を実行。エラーなく完了を確認。

- [ ] **Step 4: 型チェック**

Run: `npx tsc --noEmit`
Expected: clean（型追加は加算的）

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/0005_phase4.sql lib/types.ts
git commit -m "feat: phase4 columns (payment/withholding) and types"
```

---

## Task 2: 入金 Server Actions

**Files:**
- Create: `app/(app)/invoices/payment-actions.ts`

- [ ] **Step 1: Server Action を作成**

`app/(app)/invoices/payment-actions.ts`（`{ error }` 規約・`revalidatePath`）:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function markPaid(id: string) {
  const supabase = await createClient()
  const paid_date = new Date().toISOString().slice(0, 10)
  const { error } = await supabase.from('invoices')
    .update({ status: 'paid', paid_date }).eq('id', id)
  if (error) return { error: '更新に失敗しました' }
  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  return { error: null }
}

export async function markUnpaid(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('invoices')
    .update({ status: 'unpaid', paid_date: null }).eq('id', id)
  if (error) return { error: '更新に失敗しました' }
  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  return { error: null }
}

export async function updateDueDate(id: string, dueDate: string) {
  const supabase = await createClient()
  const due_date = dueDate.trim() === '' ? null : dueDate
  const { error } = await supabase.from('invoices')
    .update({ due_date }).eq('id', id)
  if (error) return { error: '更新に失敗しました' }
  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  return { error: null }
}
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: コミット**

```bash
git add "app/(app)/invoices/payment-actions.ts"
git commit -m "feat: invoice payment server actions (mark paid/unpaid, due date)"
```

---

## Task 3: 請求書履歴に入金ステータス表示

**Files:**
- Create: `app/(app)/invoices/invoices-table.tsx`
- Modify: `app/(app)/invoices/page.tsx`

- [ ] **Step 1: クライアントテーブルコンポーネントを作成**

`app/(app)/invoices/invoices-table.tsx`:

```tsx
'use client'
import React from 'react'
import { useToast } from '@/components/toast'
import { markPaid, markUnpaid, updateDueDate } from './payment-actions'

export interface InvoiceRow {
  id: string
  invoice_no: string
  year_month: string
  issue_date: string
  total_amount: number
  withholding_amount: number
  status: 'unpaid' | 'paid'
  paid_date: string | null
  due_date: string | null
  memo: string | null
  clients: { name: string } | null
}

const yen = (n: number) => Math.round(n).toLocaleString('ja-JP')
const today = () => new Date().toISOString().slice(0, 10)

export function InvoicesTable({ invoices }: { invoices: InvoiceRow[] }) {
  const toast = useToast()
  const [busy, setBusy] = React.useState<string | null>(null)

  const toggle = async (inv: InvoiceRow) => {
    setBusy(inv.id)
    const res = inv.status === 'paid' ? await markUnpaid(inv.id) : await markPaid(inv.id)
    setBusy(null)
    if (res.error) toast(res.error, 'err')
    else toast(inv.status === 'paid' ? '未入金に戻しました' : '入金済にしました')
  }

  const onDue = async (inv: InvoiceRow, value: string) => {
    const res = await updateDueDate(inv.id, value)
    if (res.error) toast(res.error, 'err')
    else toast('入金予定日を更新しました')
  }

  return (
    <div className="tablecard">
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr>
            <th>請求番号</th><th>クライアント</th><th>対象月</th>
            <th className="ar">金額</th><th className="ar">源泉</th><th className="ar">差引</th>
            <th>期日</th><th style={{ width: 110 }}>状態</th><th style={{ width: 120 }}>操作</th>
          </tr></thead>
          <tbody>
            {invoices.length === 0 && (
              <tr><td colSpan={9}><div className="empty"><p>まだ請求書を発行していません</p></div></td></tr>
            )}
            {invoices.map((inv) => {
              const overdue = inv.status === 'unpaid' && inv.due_date != null && inv.due_date < today()
              const net = inv.total_amount - (inv.withholding_amount ?? 0)
              return (
                <tr key={inv.id}>
                  <td className="num" style={{ fontWeight: 600 }}>{inv.invoice_no}</td>
                  <td>{inv.clients?.name ?? '—'}</td>
                  <td className="num">{inv.year_month}</td>
                  <td className="ar num yen">{yen(inv.total_amount)}</td>
                  <td className="ar num">{inv.withholding_amount ? `▲${yen(inv.withholding_amount)}` : '—'}</td>
                  <td className="ar num yen" style={{ fontWeight: 600 }}>{yen(net)}</td>
                  <td>
                    <input className="input num" type="date" defaultValue={inv.due_date ?? ''}
                      style={{ padding: '4px 8px', maxWidth: 150 }}
                      onChange={(e) => onDue(inv, e.target.value)} />
                  </td>
                  <td>
                    {inv.status === 'paid'
                      ? <span className="chip chip--dot" style={{ color: 'var(--ok, #16a34a)' }}>入金済 {inv.paid_date ?? ''}</span>
                      : <span className="chip chip--dot" style={{ color: overdue ? 'var(--danger, #dc2626)' : 'var(--text-dim)' }}>{overdue ? '期日超過' : '未入金'}</span>}
                  </td>
                  <td>
                    <button className="btn btn--ghost btn--sm" disabled={busy === inv.id} onClick={() => toggle(inv)}>
                      {busy === inv.id ? '…' : inv.status === 'paid' ? '未入金に戻す' : '入金済にする'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ページを書き換え**

`app/(app)/invoices/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { InvoicesTable, type InvoiceRow } from './invoices-table'

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_no, year_month, issue_date, total_amount, withholding_amount, status, paid_date, due_date, memo, clients(name)')
    .order('created_at', { ascending: false })

  const invoices = (data ?? []) as unknown as InvoiceRow[]

  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>請求書履歴</h1><p>発行済みの請求書と入金状況</p></div>
      </div>
      <InvoicesTable invoices={invoices} />
    </div>
  )
}
```

- [ ] **Step 3: ビルド確認**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功、`/invoices` がビルドされる

- [ ] **Step 4: コミット**

```bash
git add "app/(app)/invoices/page.tsx" "app/(app)/invoices/invoices-table.tsx"
git commit -m "feat: invoice payment status UI (status badge, mark paid, due date)"
```

---

## Task 4: ダッシュボードに未入金・期日超過カード

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: 未入金クエリと集計を追加**

`app/(app)/dashboard/page.tsx` の `Promise.all` 内のクエリ配列の末尾に未入金請求の取得を追加。現状:

```ts
  const [{ data: contracts }, { data: logs }, { data: expenses }, { data: clients }] = await Promise.all([
    supabase.from('contracts').select('*').eq('is_active', true),
    supabase.from('work_logs').select('*').gte('work_date', monthStart).lte('work_date', monthEnd),
    supabase.from('expenses').select('allocated_amount').gte('expense_date', monthStart).lte('expense_date', monthEnd),
    supabase.from('clients').select('id, name'),
  ])
```

に変更:

```ts
  const [{ data: contracts }, { data: logs }, { data: expenses }, { data: clients }, { data: unpaid }] = await Promise.all([
    supabase.from('contracts').select('*').eq('is_active', true),
    supabase.from('work_logs').select('*').gte('work_date', monthStart).lte('work_date', monthEnd),
    supabase.from('expenses').select('allocated_amount').gte('expense_date', monthStart).lte('expense_date', monthEnd),
    supabase.from('clients').select('id, name'),
    supabase.from('invoices').select('total_amount, due_date').eq('status', 'unpaid'),
  ])
```

- [ ] **Step 2: 集計値を計算**

`expenseTotal` を計算している箇所の直後に追加:

```ts
  const today = new Date().toISOString().slice(0, 10)
  const unpaidRows = (unpaid ?? []) as { total_amount: number; due_date: string | null }[]
  const unpaidTotal = unpaidRows.reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const unpaidCount = unpaidRows.length
  const overdueCount = unpaidRows.filter((r) => r.due_date != null && r.due_date < today).length
```

- [ ] **Step 3: カードを表示**

`<div className="grid-stats">` ブロックの「今月の経費合計」カード（`statcard` の3枚目）の直後に4枚目のカードを追加:

```tsx
        <div className="card statcard">
          <div className="statcard__label"><span className="statcard__ic"><Icon name="copy" size={17} /></span>未入金</div>
          <div className="stat"><span className="v num yen">{yen(unpaidTotal)}</span></div>
          <div style={{ fontSize: 'var(--small)', color: overdueCount > 0 ? 'var(--danger, #dc2626)' : 'var(--text-faint)' }}>
            {unpaidCount}件{overdueCount > 0 ? ` ・ 期日超過 ${overdueCount}件` : ''}
          </div>
        </div>
```

- [ ] **Step 4: ビルド確認**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 5: コミット**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "feat: dashboard unpaid invoices and overdue card"
```

---

## Task 5: 発行時に入金予定日（翌月末）を既定設定

**Files:**
- Modify: `app/(app)/summary/invoice-actions.ts`

- [ ] **Step 1: due_date 計算を追加して insert に含める**

`app/(app)/summary/invoice-actions.ts` の `issueDate` を計算している行の直後に追加:

```ts
  const issueDate = new Date().toISOString().slice(0, 10)
  // 入金予定日の既定 = 翌月末
  const [iy, im] = issueDate.split('-').map(Number)
  const dueY = im === 12 ? iy + 1 : iy
  const dueM = im === 12 ? 1 : im + 1
  const dueLast = new Date(dueY, dueM, 0).getDate()
  const dueDate = `${dueY}-${String(dueM).padStart(2, '0')}-${String(dueLast).padStart(2, '0')}`
```

`invoices` への `insert({ ... })` に `due_date: dueDate` を追加（`memo: memo ?? null,` の後）:

```ts
  const { error: insertError } = await supabase.from('invoices').insert({
    invoice_no: invoiceNo,
    client_id: clientId,
    year_month: yearMonth,
    issue_date: issueDate,
    total_amount: totalAmount,
    memo: memo ?? null,
    due_date: dueDate,
  })
```

- [ ] **Step 2: ビルド確認**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 3: コミット**

```bash
git add "app/(app)/summary/invoice-actions.ts"
git commit -m "feat: default invoice due date to end of next month"
```

---

# Stage 2: 着地見込み

## Task 6: 年商の着地見込み純関数（TDD）

**Files:**
- Modify: `lib/summary.ts`（`isMonthWithinPeriod` を export）
- Create: `lib/projection.ts`
- Test: `lib/projection.test.ts`

- [ ] **Step 1: `isMonthWithinPeriod` を export 化**

`lib/summary.ts` の関数定義を `function isMonthWithinPeriod(` から `export function isMonthWithinPeriod(` に変更（1語追加のみ。他は変更しない）。

- [ ] **Step 2: 失敗するテストを書く**

`lib/projection.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildAnnualProjection, buildMonthlyAmounts } from './projection'
import type { Contract, WorkLog } from './types'

function hourlyContract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', client_id: 'cl1', name: '時給', billing_type: 'hourly',
    minimum_hours: null, base_hourly_rate: 5000, overtime_hourly_rate: null,
    fixed_amount: null, start_date: null, end_date: null, is_active: true, withholding: false, ...over,
  }
}
function fixedContract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'f1', client_id: 'cl1', name: '固定', billing_type: 'fixed',
    minimum_hours: null, base_hourly_rate: null, overtime_hourly_rate: null,
    fixed_amount: 300000, start_date: null, end_date: null, is_active: true, withholding: false, ...over,
  }
}
function log(id: string, date: string, hours: number, contractId = 'c1'): WorkLog {
  return {
    id, client_id: 'cl1', contract_id: contractId, work_date: date,
    planned_hours: null, actual_hours: hours, actual_start_time: null, actual_end_time: null,
    break_minutes: 0, memo: null, status: 'worked',
  }
}

describe('buildAnnualProjection', () => {
  it('対象年が全て過去なら projected == actual', () => {
    const logs = [log('w1', '2025-03-10', 10), log('w2', '2025-09-10', 20)]
    const r = buildAnnualProjection(2025, [hourlyContract()], logs, '2026-06-15')
    expect(r.actual).toBe(150_000) // (10+20)*5000
    expect(r.projected).toBe(r.actual)
  })

  it('固定契約・年初(1月)時点 → 12ヶ月分を見込む', () => {
    const r = buildAnnualProjection(2026, [fixedContract()], [], '2026-01-01')
    expect(r.actual).toBe(0)           // 過去月なし
    expect(r.projected).toBe(3_600_000) // 300,000 * 12
  })

  it('時給契約・経過3ヶ月平均20h → 残9ヶ月を補完', () => {
    const logs = [log('w1', '2026-01-10', 20), log('w2', '2026-02-10', 20), log('w3', '2026-03-10', 20)]
    const r = buildAnnualProjection(2026, [hourlyContract()], logs, '2026-04-01')
    expect(r.actual).toBe(300_000)     // 3ヶ月 * 20h * 5000
    expect(r.projected).toBe(1_200_000) // 実績300,000 + 9ヶ月*100,000
  })

  it('契約期間外の月は見込みに含めない', () => {
    const r = buildAnnualProjection(2026, [fixedContract({ end_date: '2026-03-31' })], [], '2026-01-01')
    expect(r.projected).toBe(900_000) // 1-3月のみ 300,000*3
  })
})

describe('buildMonthlyAmounts', () => {
  it('源泉フラグと isActual を月×契約で返す', () => {
    const logs = [log('w1', '2026-01-10', 20)]
    const amts = buildMonthlyAmounts(2026, [hourlyContract({ withholding: true })], logs, '2026-02-01')
    const jan = amts.find((a) => a.ym === '2026-01')!
    const feb = amts.find((a) => a.ym === '2026-02')!
    expect(jan.isActual).toBe(true)
    expect(jan.amount).toBe(100_000)
    expect(jan.withholding).toBe(true)
    expect(feb.isActual).toBe(false) // 当月は見込み
  })
})
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npm test -- projection`
Expected: FAIL（モジュール未作成）

- [ ] **Step 4: 実装を書く**

`lib/projection.ts`:

```ts
import type { Contract, WorkLog } from './types'
import { buildMonthlySummary, isMonthWithinPeriod } from './summary'

export interface MonthlyAmount {
  ym: string
  contractId: string
  withholding: boolean
  amount: number
  isActual: boolean
}

/** アクティブ契約の1ヶ月見込み額（契約期間外は0、円整数）。 */
export function estimateMonthly(contract: Contract, ym: string, recentAvgHours: number): number {
  if (!isMonthWithinPeriod(ym, contract.start_date, contract.end_date)) return 0
  switch (contract.billing_type) {
    case 'fixed':
      return Math.round(contract.fixed_amount ?? 0)
    case 'monthly_minimum':
      return Math.round(Math.max(contract.minimum_hours ?? 0, recentAvgHours) * (contract.base_hourly_rate ?? 0))
    case 'hourly':
      return Math.round(recentAvgHours * (contract.base_hourly_rate ?? 0))
  }
}

/** 月×契約の金額内訳。過去月=実績(buildMonthlySummary)、当月以降=契約からの見込み。 */
export function buildMonthlyAmounts(
  year: number, contracts: Contract[], workLogs: WorkLog[], today: string,
): MonthlyAmount[] {
  const todayY = Number(today.slice(0, 4))
  const todayM = Number(today.slice(5, 7))
  const elapsed = year < todayY ? 12 : year > todayY ? 0 : todayM - 1

  // 契約ごとの直近平均稼働時間（対象年の経過月の実働 ÷ 経過月数）
  const recentAvg: Record<string, number> = {}
  for (const c of contracts) {
    const sum = workLogs
      .filter((w) => w.contract_id === c.id
        && w.work_date.slice(0, 4) === String(year)
        && Number(w.work_date.slice(5, 7)) <= elapsed)
      .reduce((s, w) => s + (w.actual_hours ?? 0), 0)
    recentAvg[c.id] = sum / Math.max(elapsed, 1)
  }

  const out: MonthlyAmount[] = []
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`
    const isPast = year < todayY || (year === todayY && m < todayM)
    if (isPast) {
      const summ = buildMonthlySummary(ym, contracts, workLogs, 0)
      for (const r of summ.rows) {
        const c = contracts.find((x) => x.id === r.contractId)
        out.push({ ym, contractId: r.contractId, withholding: c?.withholding ?? false, amount: r.amount, isActual: true })
      }
    } else {
      for (const c of contracts) {
        out.push({ ym, contractId: c.id, withholding: c.withholding, amount: estimateMonthly(c, ym, recentAvg[c.id]), isActual: false })
      }
    }
  }
  return out
}

/** 対象年（暦年）の年商。actual=過去月実績の合計、projected=実績+当月以降見込み。 */
export function buildAnnualProjection(
  year: number, contracts: Contract[], workLogs: WorkLog[], today: string,
): { actual: number; projected: number } {
  const amts = buildMonthlyAmounts(year, contracts, workLogs, today)
  const actual = amts.filter((a) => a.isActual).reduce((s, a) => s + a.amount, 0)
  const projected = amts.reduce((s, a) => s + a.amount, 0)
  return { actual, projected }
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- projection`
Expected: PASS（5件）

- [ ] **Step 6: 全テスト + コミット**

Run: `npm test`
Expected: 既存全件 + projection 5件 PASS

```bash
git add lib/projection.ts lib/projection.test.ts lib/summary.ts
git commit -m "feat: annual revenue projection (buildAnnualProjection/buildMonthlyAmounts) TDD"
```

---

## Task 7: 試算画面に「実績／着地見込み」基準トグル

**Files:**
- Modify: `app/(app)/tax/page.tsx`
- Modify: `app/(app)/tax/tax-ui.tsx`

> 注: このタスクでは源泉は未配線（Stage 3 で追加）。基準トグルと projection の配線のみ。

- [ ] **Step 1: page.tsx で実績・見込みの両方を計算して渡す**

`app/(app)/tax/page.tsx` の import に projection を追加:

```ts
import { buildAnnualProjection } from '@/lib/projection'
```

`buildAnnualRevenue` の import と使用を `buildAnnualProjection` に置き換える。`annualRevenue` 計算箇所を次に変更:

```ts
  const today = new Date().toISOString().slice(0, 10)
  const projection = buildAnnualProjection(year, (contracts ?? []) as Contract[], (logs ?? []) as WorkLog[], today)
  const annualExpense = ((expenses ?? []) as Pick<Expense, 'allocated_amount'>[])
    .reduce((s, e) => s + (e.allocated_amount ?? 0), 0)
```

`<TaxUI .../>` の props を変更（`annualRevenue` を `actualRevenue`/`projectedRevenue` に）:

```tsx
    <TaxUI
      year={year}
      actualRevenue={projection.actual}
      projectedRevenue={projection.projected}
      annualExpense={annualExpense}
      params={toParams((settings ?? null) as TaxSettings | null)}
    />
```

（`buildAnnualRevenue` の import 行を削除。`Contract`/`WorkLog` の import は projection 用に残す。）

- [ ] **Step 2: tax-ui.tsx に基準トグルを追加**

`app/(app)/tax/tax-ui.tsx` の `Props` を変更:

```tsx
interface Props {
  year: number
  actualRevenue: number
  projectedRevenue: number
  annualExpense: number
  params: TaxParams
}
```

コンポーネント先頭の state を変更（`annualRevenue` の代わりに basis を持つ）:

```tsx
export function TaxUI({ year, actualRevenue, projectedRevenue, annualExpense, params }: Props) {
  const [basis, setBasis] = React.useState<'actual' | 'projected'>('projected')
  const basisRevenue = basis === 'projected' ? projectedRevenue : actualRevenue
  // what-if 用の一時上書き（保存しない）
  const [revenue, setRevenue] = React.useState(basisRevenue)
  const [expense, setExpense] = React.useState(annualExpense)
  const [filingType, setFilingType] = React.useState(params.filingType)
  const [otherDeductions, setOtherDeductions] = React.useState(params.otherDeductions)

  // 基準切替時に売上 state を基準値へ再初期化
  const onBasis = (b: 'actual' | 'projected') => {
    setBasis(b)
    setRevenue(b === 'projected' ? projectedRevenue : actualRevenue)
  }
```

`dirty` の定義の `revenue !== annualRevenue` を `revenue !== basisRevenue` に変更。

ヘッダ（`<div className="ymselect">…</div>` の年ナビ）の直後、`errbox` の前に基準トグルを追加:

```tsx
      <div className="ctabs" style={{ marginBottom: 16 }}>
        <button className="ctab" data-active={String(basis === 'projected')} onClick={() => onBasis('projected')}>着地見込み</button>
        <button className="ctab" data-active={String(basis === 'actual')} onClick={() => onBasis('actual')}>実績(YTD)</button>
      </div>
```

what-if の補足文（経費は実績のみである旨）を `<p>` 注記に追記:

```tsx
          ここでの変更は保存されません（お試し計算）。経費は実績のみ（見込み補完なし）。確定値は
```

- [ ] **Step 3: ビルド確認**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 4: 動作確認（任意・dev）**

`/tax` で「着地見込み／実績(YTD)」を切り替えると売上と全内訳が再計算される。

- [ ] **Step 5: コミット**

```bash
git add "app/(app)/tax/page.tsx" "app/(app)/tax/tax-ui.tsx"
git commit -m "feat: actual/projection basis toggle on tax estimator"
```

---

# Stage 3: 源泉徴収

## Task 8: 源泉徴収額の純関数（TDD）

**Files:**
- Create: `lib/withholding.ts`
- Test: `lib/withholding.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`lib/withholding.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcWithholding } from './withholding'

describe('calcWithholding', () => {
  it('50万円・10.21% → 51,050', () => {
    expect(calcWithholding(500_000, 0.1021, 0.2042)).toBe(51_050)
  })
  it('ちょうど100万円 → 102,100', () => {
    expect(calcWithholding(1_000_000, 0.1021, 0.2042)).toBe(102_100)
  })
  it('150万円 → 100万×10.21% + 50万×20.42% = 204,200', () => {
    expect(calcWithholding(1_500_000, 0.1021, 0.2042)).toBe(204_200)
  })
  it('0円 → 0', () => {
    expect(calcWithholding(0, 0.1021, 0.2042)).toBe(0)
  })
  it('負の額 → 0', () => {
    expect(calcWithholding(-100, 0.1021, 0.2042)).toBe(0)
  })
  it('小数を含む額でも円整数に丸める', () => {
    expect(calcWithholding(123_456, 0.1021, 0.2042)).toBe(Math.round(123_456 * 0.1021))
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- withholding`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: 実装を書く**

`lib/withholding.ts`:

```ts
// 源泉徴収の閾値（法令定数・改正時に更新）。100万円超の部分は高率。
export const WITHHOLDING_THRESHOLD = 1_000_000

/** 1回の支払額に対する源泉徴収税額。min(amount,閾値)*rate + max(amount-閾値,0)*rateHigh、円整数丸め。 */
export function calcWithholding(
  amount: number, rate: number, rateHigh: number, threshold = WITHHOLDING_THRESHOLD,
): number {
  if (amount <= 0) return 0
  const low = Math.min(amount, threshold) * rate
  const high = Math.max(amount - threshold, 0) * rateHigh
  return Math.round(low + high)
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- withholding`
Expected: PASS（6件）

- [ ] **Step 5: コミット**

```bash
git add lib/withholding.ts lib/withholding.test.ts
git commit -m "feat: withholding tax calculation (tiered) TDD"
```

---

## Task 9: 契約に「源泉徴収あり」フラグ

**Files:**
- Modify: `app/(app)/contracts/actions.ts`
- Modify: `app/(app)/contracts/contracts-ui.tsx`

- [ ] **Step 1: actions で withholding を保存**

`app/(app)/contracts/actions.ts` の `createContract` の insert に `withholding` を追加。`start_date`/`end_date` を読む箇所の後に:

```ts
  const start_date = String(formData.get('start_date') ?? '') || null
  const end_date = String(formData.get('end_date') ?? '') || null
  const withholding = formData.get('withholding') === 'on'
```

insert オブジェクトに `withholding,` を追加:

```ts
  const { error } = await supabase.from('contracts').insert({
    client_id, name, billing_type, base_hourly_rate, minimum_hours,
    overtime_hourly_rate, fixed_amount, start_date, end_date, withholding,
  })
```

`updateContract` でも同様に、`end_date` の後に `const withholding = formData.get('withholding') === 'on'` を追加し、update オブジェクトに `withholding,` を追加:

```ts
  const { error } = await supabase.from('contracts').update({
    name, billing_type, base_hourly_rate, minimum_hours, overtime_hourly_rate,
    fixed_amount, start_date, end_date, withholding, updated_at: new Date().toISOString(),
  }).eq('id', id)
```

- [ ] **Step 2: フォームにチェックボックスを追加**

`app/(app)/contracts/contracts-ui.tsx` の `ContractForm` の「終了日」`Field` の後（`</form>` の前）に追加:

```tsx
        <Field label="源泉徴収" hint="この契約の請求に源泉徴収が発生する場合にオン">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" name="withholding" defaultChecked={record?.withholding ?? false} />
            <span>源泉徴収あり（10.21% / 100万超は20.42%）</span>
          </label>
        </Field>
```

- [ ] **Step 3: ビルド確認**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 4: コミット**

```bash
git add "app/(app)/contracts/actions.ts" "app/(app)/contracts/contracts-ui.tsx"
git commit -m "feat: per-contract withholding flag"
```

---

## Task 10: 請求書PDFと発行記録に源泉を反映

**Files:**
- Modify: `lib/pdf.tsx`
- Modify: `lib/pdf.test.tsx`
- Modify: `app/(app)/summary/invoice-actions.ts`

- [ ] **Step 1: pdf.tsx の InvoiceData に源泉フィールドを追加**

`lib/pdf.tsx` の `InvoiceData` インターフェイスに `withholdingAmount` を追加（`totalAmount: number` の後）:

```ts
  totalAmount: number
  withholdingAmount?: number
```

`InvoiceDocument` の合計欄（`<View style={S.totalRow}>…</View>`）を、源泉がある場合に 小計/源泉/差引 を出すよう置き換え:

```tsx
          {data.withholdingAmount && data.withholdingAmount > 0 ? (
            <>
              <View style={S.totalRow}>
                <Text style={[S.bold, { flex: 4 }]}>小計</Text>
                <Text style={[S.bold, { flex: 1, textAlign: 'right' }]}>{yen(data.totalAmount)}</Text>
              </View>
              <View style={S.row}>
                <Text style={{ flex: 4 }}>源泉徴収税額</Text>
                <Text style={{ flex: 1, textAlign: 'right' }}>▲{yen(data.withholdingAmount)}</Text>
              </View>
              <View style={S.totalRow}>
                <Text style={[S.bold, { flex: 4 }]}>差引請求額</Text>
                <Text style={[S.bold, { flex: 1, textAlign: 'right', fontSize: 13 }]}>{yen(data.totalAmount - data.withholdingAmount)}</Text>
              </View>
            </>
          ) : (
            <View style={S.totalRow}>
              <Text style={[S.bold, { flex: 4 }]}>合計</Text>
              <Text style={[S.bold, { flex: 1, textAlign: 'right', fontSize: 13 }]}>{yen(data.totalAmount)}</Text>
            </View>
          )}
```

- [ ] **Step 2: pdf テストに源泉ケースを追加**

`lib/pdf.test.tsx` の `describe` 内に追加（既存の smoke テストと同形・PDFが生成できることの確認）:

```tsx
  it('源泉徴収ありでもPDFを生成できる', async () => {
    const bytes = await renderInvoicePdf({
      invoiceNo: '2026-06-002', issueDate: '2026-06-30', yearMonth: '2026-06',
      clientName: 'テスト株式会社',
      rows: [{
        clientId: 'c1', contractId: 'ct1', contractName: '開発',
        billingType: 'hourly', workedHours: 100, minimumHours: null,
        billableHours: 100, baseRate: 5000, overtimeRate: null, amount: 500000,
      }],
      totalAmount: 500000, withholdingAmount: 51050,
      profile: { display_name: '山田', address: '東京', email: 'a@b.c', phone: '090', bank_info: '〇〇銀行' },
    })
    expect(bytes.length).toBeGreaterThan(1000)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF')
  }, 30000)
```

- [ ] **Step 3: 源泉テストを実行**

Run: `npm test -- pdf`
Expected: PASS（既存 + 新規）

- [ ] **Step 4: invoice-actions で源泉額を計算・保存・PDFへ渡す**

`app/(app)/summary/invoice-actions.ts` の import に追加:

```ts
import { calcWithholding } from '@/lib/withholding'
```

`profile` 取得の Promise.all に `tax_settings` を加える。現状の取得:

```ts
  const { data: profile } = await supabase.from('profile').select('*').limit(1).maybeSingle()
  const { data: clientData } = await supabase.from('clients').select('*').eq('id', clientId).single()
```

の後に追加:

```ts
  const { data: taxSettings } = await supabase.from('tax_settings').select('withholding_rate, withholding_rate_high').limit(1).maybeSingle()
  const whRate = taxSettings?.withholding_rate ?? 0.1021
  const whRateHigh = taxSettings?.withholding_rate_high ?? 0.2042
```

`billableRows` と `totalAmount` を計算した後、源泉額を算出（源泉あり契約の billing 合計に対して）:

```ts
  const totalAmount = billableRows.reduce((s, r) => s + r.amount, 0)
  // 源泉あり契約の請求額合計に対して源泉徴収税額を算出
  const whContractIds = new Set(((contracts ?? []) as Contract[]).filter((c) => c.withholding).map((c) => c.id))
  const withholdingBase = billableRows.filter((r) => whContractIds.has(r.contractId)).reduce((s, r) => s + r.amount, 0)
  const withholdingAmount = calcWithholding(withholdingBase, whRate, whRateHigh)
```

`renderInvoicePdf({ ... })` の引数に `withholdingAmount,` を追加（`totalAmount,` の後）。

insert オブジェクトに `withholding_amount: withholdingAmount,` を追加。

- [ ] **Step 5: ビルド確認**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 6: コミット**

```bash
git add lib/pdf.tsx lib/pdf.test.tsx "app/(app)/summary/invoice-actions.ts"
git commit -m "feat: withholding on invoice PDF and issuance record"
```

---

## Task 11: 税試算に源泉を取り込む（TDD）

**Files:**
- Modify: `lib/tax.ts`
- Modify: `lib/tax.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

`lib/tax.test.ts` の `describe('calculateTax', ...)` 内に追加:

```ts
  it('源泉0（未指定）なら Phase3 と同一の取り置き（後方互換）', () => {
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    expect(r.withholding).toBe(0)
    expect(r.incomeTaxDue).toBe(r.incomeTax)
    expect(r.incomeTaxRefund).toBe(0)
    expect(r.reserve.monthlyReserve).toBe(103_528) // 税保険合計/12（源泉なし）
  })

  it('源泉 < 所得税 → 追加納付あり・取り置きが源泉分だけ減る', () => {
    const base = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, params: DEFAULT_TAX_PARAMS })
    const wh = 100_000
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, annualWithholding: wh, params: DEFAULT_TAX_PARAMS })
    expect(r.withholding).toBe(wh)
    expect(r.incomeTaxRefund).toBe(0)
    expect(r.incomeTaxDue).toBe(base.incomeTax - wh)
    expect(r.reserve.monthlyReserve).toBe(Math.round((base.totalTaxAndInsurance - wh) / 12))
  })

  it('源泉 > 所得税 → 還付見込みあり', () => {
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, annualWithholding: 5_000_000, params: DEFAULT_TAX_PARAMS })
    expect(r.incomeTaxRefund).toBe(5_000_000 - r.incomeTax)
    expect(r.incomeTaxDue).toBe(0)
  })

  it('取り置きは源泉が税保険合計を超えても0未満にならない', () => {
    const r = calculateTax({ annualRevenue: 6_000_000, annualExpense: 1_000_000, annualWithholding: 99_000_000, params: DEFAULT_TAX_PARAMS })
    expect(r.reserve.monthlyReserve).toBe(0)
    expect(r.reserve.reserveRate).toBe(0)
  })

  it('売上0は源泉が渡っても全て0（ゲート維持）', () => {
    const r = calculateTax({ annualRevenue: 0, annualExpense: 0, annualWithholding: 50_000, params: DEFAULT_TAX_PARAMS })
    expect(r.withholding).toBe(0)
    expect(r.incomeTaxDue).toBe(0)
    expect(r.incomeTaxRefund).toBe(0)
  })
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tax`
Expected: FAIL（`withholding`/`incomeTaxDue`/`incomeTaxRefund` undefined、annualWithholding 未対応）

- [ ] **Step 3: 実装を更新**

`lib/tax.ts` の `TaxInput` に `annualWithholding` を追加:

```ts
export interface TaxInput {
  annualRevenue: number
  annualExpense: number
  annualWithholding?: number
  params: TaxParams
}
```

`TaxResult` に追加（`reserve` の前）:

```ts
  withholding: number          // 源泉徴収合計（前払い所得税）
  incomeTaxDue: number         // 確定申告での追加納付（max(所得税 - 源泉, 0)）
  incomeTaxRefund: number      // 還付見込み（max(源泉 - 所得税, 0)）
```

`buildReserve` を源泉対応に変更:

```ts
function buildReserve(totalTaxAndInsurance: number, netIncome: number, annualRevenue: number, withholding: number) {
  const reserveBase = Math.max(totalTaxAndInsurance - withholding, 0)
  return {
    monthlyReserve: Math.round(reserveBase / 12),
    reserveRate: annualRevenue > 0 ? reserveBase / annualRevenue : 0,
    monthlyDisposable: Math.round(netIncome / 12),
  }
}
```

`calculateTax` 内：先頭で `const withholding = input.annualWithholding ?? 0` を取得。

`businessIncome === 0` の早期 return を更新（源泉系を0、buildReserve に 0 を渡す）:

```ts
  if (businessIncome === 0) {
    const netIncome = annualRevenue - annualExpense
    // 赤字年（経費>売上）は手取りが負になりうる。損失の事実を表すため意図的にクランプしない。
    return {
      businessIncome: 0, nationalPension: 0, healthInsurance: 0, socialInsuranceDeduction: 0,
      taxableIncomeIncomeTax: 0, incomeTax: 0, taxableIncomeResident: 0, residentTax: 0,
      totalTaxAndInsurance: 0, netIncome,
      withholding: 0, incomeTaxDue: 0, incomeTaxRefund: 0,
      reserve: buildReserve(0, netIncome, annualRevenue, 0),
    }
  }
```

通常 return の前に追加計算:

```ts
  const incomeTaxDue = Math.max(incomeTax - withholding, 0)
  const incomeTaxRefund = Math.max(withholding - incomeTax, 0)
```

通常 return に `withholding, incomeTaxDue, incomeTaxRefund,` を追加し、`reserve` の呼び出しを `buildReserve(totalTaxAndInsurance, netIncome, annualRevenue, withholding)` に変更。

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tax`
Expected: PASS（新規 + 既存すべて。Phase3 既存テストは withholding 省略のため後方互換で不変）

- [ ] **Step 5: 全テスト + コミット**

Run: `npm test`
Expected: 全件 PASS

```bash
git add lib/tax.ts lib/tax.test.ts
git commit -m "feat: withholding as prepaid income tax in calculateTax (refund/due, reserve adjust)"
```

---

## Task 12: 試算画面に源泉年額・還付/追加納付を表示

**Files:**
- Modify: `app/(app)/tax/page.tsx`
- Modify: `app/(app)/tax/tax-ui.tsx`

- [ ] **Step 1: page.tsx で源泉年額（実績/見込み別）を算出して渡す**

`app/(app)/tax/page.tsx` の import に追加:

```ts
import { buildAnnualProjection, buildMonthlyAmounts } from '@/lib/projection'
import { calcWithholding } from '@/lib/withholding'
```

projection 計算の後に源泉年額を算出（基準ごと。月×契約単位で 100万閾値を判定）:

```ts
  const settingsParams = toParams((settings ?? null) as TaxSettings | null)
  const whRate = settingsParams.filingType ? (settings?.withholding_rate ?? 0.1021) : 0.1021
  const whRateHigh = settings?.withholding_rate_high ?? 0.2042
  const amounts = buildMonthlyAmounts(year, (contracts ?? []) as Contract[], (logs ?? []) as WorkLog[], today)
  const withholdingActual = amounts
    .filter((a) => a.withholding && a.isActual)
    .reduce((s, a) => s + calcWithholding(a.amount, whRate, whRateHigh), 0)
  const withholdingProjected = amounts
    .filter((a) => a.withholding)
    .reduce((s, a) => s + calcWithholding(a.amount, whRate, whRateHigh), 0)
```

（注: `whRate` は `settings?.withholding_rate ?? 0.1021` で十分。上の三項は冗長なので `const whRate = settings?.withholding_rate ?? 0.1021` に簡略化してよい。）

`<TaxUI/>` に源泉 props を追加:

```tsx
    <TaxUI
      year={year}
      actualRevenue={projection.actual}
      projectedRevenue={projection.projected}
      annualExpense={annualExpense}
      withholdingActual={withholdingActual}
      withholdingProjected={withholdingProjected}
      params={settingsParams}
    />
```

- [ ] **Step 2: tax-ui.tsx で源泉を計算に渡し、表示する**

`Props` に追加:

```tsx
  withholdingActual: number
  withholdingProjected: number
```

シグネチャと basis 連動を更新:

```tsx
export function TaxUI({ year, actualRevenue, projectedRevenue, annualExpense, withholdingActual, withholdingProjected, params }: Props) {
  const [basis, setBasis] = React.useState<'actual' | 'projected'>('projected')
  const basisRevenue = basis === 'projected' ? projectedRevenue : actualRevenue
  const basisWithholding = basis === 'projected' ? withholdingProjected : withholdingActual
```

`result` の useMemo に `annualWithholding` を追加し、依存配列にも追加:

```tsx
  const result = React.useMemo(
    () => calculateTax({
      annualRevenue: revenue,
      annualExpense: expense,
      annualWithholding: basisWithholding,
      params: { ...params, filingType, otherDeductions },
    }),
    [revenue, expense, basisWithholding, filingType, otherDeductions, params],
  )
```

内訳テーブルの `rows` 配列に源泉行を追加（`['住民税', result.residentTax]` の後）:

```tsx
    ['源泉徴収（前払い所得税）', result.withholding],
```

`税・保険合計` の行の後（`</tbody>` の前）に還付/追加納付の行を追加:

```tsx
              {result.withholding > 0 && (
                <tr>
                  <td style={{ fontWeight: 600 }}>{result.incomeTaxRefund > 0 ? '還付見込み' : '確定申告での追加納付'}</td>
                  <td className="ar num yen" style={{ fontWeight: 700, color: result.incomeTaxRefund > 0 ? 'var(--ok, #16a34a)' : 'inherit' }}>
                    {result.incomeTaxRefund > 0 ? yen(result.incomeTaxRefund) : yen(result.incomeTaxDue)}
                  </td>
                </tr>
              )}
```

取り置きカードの説明文（「税・保険用に毎月確保」）に源泉控除後である旨を反映（`sub` テキストを変更）:

```tsx
          <span className="sub">税・保険用に毎月確保（源泉控除後・売上の約{Math.round(result.reserve.reserveRate * 100)}%）</span>
```

- [ ] **Step 3: ビルド確認**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 4: 動作確認（任意・dev）**

源泉ありの契約があるとき `/tax` に「源泉徴収（前払い所得税）」行・還付/追加納付行が出て、取り置き目安が源泉分だけ小さくなる。基準トグルで源泉年額も切り替わる。

- [ ] **Step 5: コミット**

```bash
git add "app/(app)/tax/page.tsx" "app/(app)/tax/tax-ui.tsx"
git commit -m "feat: show withholding, refund/due, and withholding-adjusted reserve on tax page"
```

---

## Self-Review チェック結果

**スペック網羅:**
- §4.1 invoices 列 → Task 1。§4.2 contracts.withholding → Task 1/9。§4.3 tax_settings 源泉率 → Task 1。
- §5.1 calcWithholding → Task 8。§5.2 projection → Task 6。§5.3 tax 拡張（源泉・還付/追加納付・取り置き補正・ゲート） → Task 11。§5.4 源泉年額の基準別算出 → Task 12。
- §6.1 入金管理UI（履歴ステータス・アクション・期日編集・ダッシュボード・発行時既定） → Task 2/3/4/5。§6.2 基準トグル・経費は実績のみ注記 → Task 7。§6.3 契約チェック・PDF・試算表示 → Task 9/10/12。
- §8 ステージング順（入金→見込み→源泉）に一致。

**プレースホルダ:** なし（全ステップに実コード・実コマンド・期待結果）。

**型整合:** `calcWithholding`(amount,rate,rateHigh,threshold)、`buildMonthlyAmounts`/`buildAnnualProjection`/`estimateMonthly`、`MonthlyAmount`、`calculateTax` の `annualWithholding`/`withholding`/`incomeTaxDue`/`incomeTaxRefund`、`Invoice`/`InvoiceStatus`、`Contract.withholding`、`TaxSettings.withholding_rate(_high)` — 全タスクで名称一致。`TaxUI` props は Task 7 で actual/projected 化、Task 12 で源泉 props 追加（順に拡張、矛盾なし）。

## 補足
- お金のロジックは TDD（Task 6/8/11）。Server Action は `{ error }` 規約（Task 2/9/10）。
- マイグレーション 0005 は列追加のみで既存 RLS に影響しない。**適用後にデプロイ**（未適用で新UIをデプロイすると新列参照でエラー）。
- UI 崩れ確認は本番URL（Vercel自動デプロイ）。
```
