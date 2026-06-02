# 業務委託 稼働・請求・経費管理システム — Phase 1 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 複数の業務委託案件について、クライアント・契約・稼働・経費を記録し、月次でクライアント別の請求額と経費を確認できる個人用Webアプリ（Phase 1コアMVP）を構築する。

**Architecture:** Next.js (App Router) を Vercel にデプロイ。Supabase (Postgres + Auth) をDB/認証に使い、`@supabase/ssr` でCookieベース認証＋RLSを効かせる。読み取りは Server Components、書き込みは Server Actions。金額に関わる請求計算と月次集計は副作用のない純関数 (`lib/billing.ts` / `lib/summary.ts`) に分離し Vitest でTDDする。UIのビジュアルは claude design に委譲し、本計画はデータ層・サーバアクション・検証・テストを担う。

**Tech Stack:** Next.js 15 (App Router) / TypeScript / Tailwind CSS / Supabase (`@supabase/ssr`, `@supabase/supabase-js`) / Vitest / Vercel

---

## デザイン分業のルール（全UIタスク共通）

各UIタスクには「デザインブリーフ」ステップを含める。ブリーフに書くのは**デザイン以外の要件のみ**：画面の目的・データ項目と型/制約/必須・操作とアクション・条件出し分け・バリデーション/エラー・画面遷移・技術制約。**配色/余白/タイポ/コンポーネント見た目は書かない**（claude design の領分）。claude design から返ったコンポーネントを、本計画のサーバアクション/データ取得に接続する。

実装順の原則：**①データ層（テーブル/型）→ ②純関数（テスト付き）→ ③サーバアクション（検証付き）→ ④デザインブリーフ → ⑤UI接続**。④⑤の間に claude design への往復が入る。

---

## ファイル構成

```
freelance-manager/
  app/
    layout.tsx, globals.css
    login/page.tsx
    (app)/                         # 認証必須グループ
      dashboard/page.tsx
      clients/page.tsx, clients/actions.ts
      contracts/page.tsx, contracts/actions.ts
      work-logs/page.tsx, work-logs/actions.ts
      expenses/page.tsx, expenses/actions.ts
      summary/page.tsx
  lib/
    supabase/server.ts             # Server Component / Action 用クライアント
    supabase/client.ts             # ブラウザ用クライアント
    supabase/middleware.ts         # セッション更新ヘルパ
    billing.ts                     # 請求計算純関数
    billing.test.ts
    summary.ts                     # 月次集計純関数
    summary.test.ts
    types.ts                       # 共有ドメイン型
  middleware.ts                    # 認証ガード
  supabase/migrations/0001_init.sql
  .env.local                       # SUPABASE URL / ANON KEY（コミットしない）
  vitest.config.ts
```

各ファイルの責務：
- `lib/billing.ts` — 1契約・1ヶ月分の請求金額計算（純関数）。お金の唯一の真実。
- `lib/summary.ts` — 契約配列＋稼働ログ配列から月次サマリー行と合計を組み立てる（純関数、`billing.ts`を利用）。
- `lib/types.ts` — `BillingType` などDBと一致する型定義。
- `*/actions.ts` — Server Actions（DB書き込み＋入力検証＋`revalidatePath`）。
- `*/page.tsx` — Server Component。データ取得＋claude design製コンポーネント描画。

---

## Task 1: プロジェクト雛形と Vitest セットアップ

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `app/layout.tsx`, `app/globals.css`, `.gitignore`, `.env.local.example`

- [ ] **Step 1: Next.js プロジェクトを作成**

作業ディレクトリ `C:/workspace/ten/repository/freelance-manager` で実行（既存の `docs/` を残すため `--no-git` かつカレントに展開）:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --no-git --use-npm
```

既存ファイル（docs等）があるため上書き確認には「No」を選び、衝突しないこと。生成後 `app/`, `package.json` 等ができる。

- [ ] **Step 2: Vitest と関連依存を追加**

```bash
npm install -D vitest @vitejs/plugin-react jsdom
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 3: `vitest.config.ts` を作成**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', include: ['lib/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

- [ ] **Step 4: `package.json` にテストスクリプトを追加**

`scripts` に追記:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: `.env.local.example` を作成し `.gitignore` を確認**

`.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`.gitignore` に `.env*.local` が含まれることを確認（create-next-app が生成済み）。

- [ ] **Step 6: ビルドが通ることを確認**

Run: `npm run build`
Expected: ビルド成功（エラーなし）。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind and Vitest"
```

---

## Task 2: 共有ドメイン型

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: 型を定義**

```ts
export type BillingType = 'hourly' | 'monthly_minimum' | 'fixed'
export type WorkLogStatus = 'planned' | 'worked' | 'billed'

export interface Client {
  id: string
  name: string
  memo: string | null
  is_active: boolean
}

export interface Contract {
  id: string
  client_id: string
  name: string
  billing_type: BillingType
  minimum_hours: number | null
  base_hourly_rate: number | null
  overtime_hourly_rate: number | null
  fixed_amount: number | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
}

export interface WorkLog {
  id: string
  client_id: string
  contract_id: string
  work_date: string
  planned_hours: number | null
  actual_hours: number | null
  memo: string | null
  status: WorkLogStatus
}

export interface Expense {
  id: string
  expense_date: string
  category: string
  amount: number
  allocation_rate: number
  allocated_amount: number
  memo: string | null
  is_recurring: boolean
}
```

- [ ] **Step 2: 型チェックが通ることを確認**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add shared domain types"
```

---

## Task 3: 請求計算モジュール（TDD）

**Files:**
- Create: `lib/billing.ts`, `lib/billing.test.ts`

請求金額の唯一の真実。スペック §5 の計算ルールを実装する。

- [ ] **Step 1: 失敗するテストを書く**

`lib/billing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calculateBilling } from './billing'

describe('calculateBilling', () => {
  it('hourly: 実働 × 単価', () => {
    const r = calculateBilling({
      billingType: 'hourly', workedHours: 80, baseHourlyRate: 5000,
      minimumHours: null, overtimeHourlyRate: null, fixedAmount: null, isWithinContractPeriod: true,
    })
    expect(r.amount).toBe(400000)
    expect(r.billableHours).toBe(80)
  })

  it('monthly_minimum (超過単価なし): 実働 < 最低 → 最低 × 単価', () => {
    const r = calculateBilling({
      billingType: 'monthly_minimum', workedHours: 80, minimumHours: 100, baseHourlyRate: 5000,
      overtimeHourlyRate: null, fixedAmount: null, isWithinContractPeriod: true,
    })
    expect(r.billableHours).toBe(100)
    expect(r.amount).toBe(500000)
  })

  it('monthly_minimum (超過単価なし): 実働 >= 最低 → 実働 × 単価', () => {
    const r = calculateBilling({
      billingType: 'monthly_minimum', workedHours: 120, minimumHours: 100, baseHourlyRate: 5000,
      overtimeHourlyRate: null, fixedAmount: null, isWithinContractPeriod: true,
    })
    expect(r.billableHours).toBe(120)
    expect(r.amount).toBe(600000)
  })

  it('monthly_minimum (超過単価あり): base*最低 + overtime*超過', () => {
    const r = calculateBilling({
      billingType: 'monthly_minimum', workedHours: 120, minimumHours: 100,
      baseHourlyRate: 5000, overtimeHourlyRate: 6000, fixedAmount: null, isWithinContractPeriod: true,
    })
    // 100*5000 + 20*6000 = 500000 + 120000
    expect(r.amount).toBe(620000)
  })

  it('monthly_minimum (超過単価あり): 実働<最低なら超過分は0', () => {
    const r = calculateBilling({
      billingType: 'monthly_minimum', workedHours: 90, minimumHours: 100,
      baseHourlyRate: 5000, overtimeHourlyRate: 6000, fixedAmount: null, isWithinContractPeriod: true,
    })
    expect(r.amount).toBe(500000)
  })

  it('fixed: 契約期間内なら固定額', () => {
    const r = calculateBilling({
      billingType: 'fixed', fixedAmount: 300000, isWithinContractPeriod: true,
      workedHours: 0, minimumHours: null, baseHourlyRate: null, overtimeHourlyRate: null,
    })
    expect(r.amount).toBe(300000)
    expect(r.billableHours).toBeNull()
  })

  it('fixed: 契約期間外なら0', () => {
    const r = calculateBilling({
      billingType: 'fixed', fixedAmount: 300000, isWithinContractPeriod: false,
      workedHours: 0, minimumHours: null, baseHourlyRate: null, overtimeHourlyRate: null,
    })
    expect(r.amount).toBe(0)
  })

  it('小数時間は円整数に丸める', () => {
    const r = calculateBilling({
      billingType: 'hourly', workedHours: 7.5, baseHourlyRate: 3333,
      minimumHours: null, overtimeHourlyRate: null, fixedAmount: null, isWithinContractPeriod: true,
    })
    expect(r.amount).toBe(Math.round(7.5 * 3333)) // 24998
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- lib/billing.test.ts`
Expected: FAIL（`calculateBilling` 未定義）。

- [ ] **Step 3: 最小実装を書く**

`lib/billing.ts`:

```ts
import type { BillingType } from './types'

export interface BillingInput {
  billingType: BillingType
  workedHours: number
  minimumHours: number | null
  baseHourlyRate: number | null
  overtimeHourlyRate: number | null
  fixedAmount: number | null
  isWithinContractPeriod: boolean
}

export interface BillingResult {
  billableHours: number | null
  amount: number
}

export function calculateBilling(input: BillingInput): BillingResult {
  const base = input.baseHourlyRate ?? 0
  const min = input.minimumHours ?? 0

  switch (input.billingType) {
    case 'hourly':
      return { billableHours: input.workedHours, amount: Math.round(input.workedHours * base) }

    case 'monthly_minimum': {
      const billableHours = Math.max(input.workedHours, min)
      if (input.overtimeHourlyRate != null) {
        const baseAmount = min * base
        const overtimeAmount = Math.max(input.workedHours - min, 0) * input.overtimeHourlyRate
        return { billableHours, amount: Math.round(baseAmount + overtimeAmount) }
      }
      return { billableHours, amount: Math.round(billableHours * base) }
    }

    case 'fixed':
      return {
        billableHours: null,
        amount: input.isWithinContractPeriod ? Math.round(input.fixedAmount ?? 0) : 0,
      }
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- lib/billing.test.ts`
Expected: PASS（全8ケース）。

- [ ] **Step 5: Commit**

```bash
git add lib/billing.ts lib/billing.test.ts
git commit -m "feat: add billing calculation module with tests"
```

---

## Task 4: 月次集計モジュール（TDD）

**Files:**
- Create: `lib/summary.ts`, `lib/summary.test.ts`

契約配列・稼働ログ配列・経費合計から、月次サマリー行と合計（売上＝請求合計）を組み立てる純関数。スペック §6。

- [ ] **Step 1: 失敗するテストを書く**

`lib/summary.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildMonthlySummary } from './summary'
import type { Contract, WorkLog } from './types'

const contract = (over: Partial<Contract>): Contract => ({
  id: 'c1', client_id: 'cl1', name: '契約A', billing_type: 'hourly',
  minimum_hours: null, base_hourly_rate: 5000, overtime_hourly_rate: null,
  fixed_amount: null, start_date: '2026-01-01', end_date: null, is_active: true, ...over,
})

const log = (over: Partial<WorkLog>): WorkLog => ({
  id: 'w1', client_id: 'cl1', contract_id: 'c1', work_date: '2026-06-10',
  planned_hours: null, actual_hours: 10, memo: null, status: 'worked', ...over,
})

describe('buildMonthlySummary', () => {
  it('対象月の実働を契約ごとに合計し請求額を出す', () => {
    const res = buildMonthlySummary('2026-06', [contract({})], [
      log({ id: 'w1', actual_hours: 10, work_date: '2026-06-01' }),
      log({ id: 'w2', actual_hours: 5, work_date: '2026-06-02' }),
    ], 0)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].workedHours).toBe(15)
    expect(res.rows[0].amount).toBe(75000)
    expect(res.totalBilling).toBe(75000)
  })

  it('対象月以外のログは除外する', () => {
    const res = buildMonthlySummary('2026-06', [contract({})], [
      log({ id: 'w1', actual_hours: 10, work_date: '2026-06-01' }),
      log({ id: 'w2', actual_hours: 99, work_date: '2026-05-31' }),
    ], 0)
    expect(res.rows[0].workedHours).toBe(10)
  })

  it('actual_hours が null のログは0として扱う', () => {
    const res = buildMonthlySummary('2026-06', [contract({})], [
      log({ id: 'w1', actual_hours: null }),
    ], 0)
    expect(res.rows[0].workedHours).toBe(0)
    expect(res.rows[0].amount).toBe(0)
  })

  it('fixed契約は対象月が契約期間内なら固定額', () => {
    const c = contract({ billing_type: 'fixed', fixed_amount: 200000, base_hourly_rate: null,
      start_date: '2026-06-01', end_date: '2026-12-31' })
    const res = buildMonthlySummary('2026-06', [c], [], 0)
    expect(res.rows[0].amount).toBe(200000)
    expect(res.totalBilling).toBe(200000)
  })

  it('fixed契約は契約期間外の月なら0かつ売上に含めない', () => {
    const c = contract({ billing_type: 'fixed', fixed_amount: 200000, base_hourly_rate: null,
      start_date: '2026-07-01', end_date: '2026-12-31' })
    const res = buildMonthlySummary('2026-06', [c], [], 0)
    expect(res.rows[0].amount).toBe(0)
    expect(res.totalBilling).toBe(0)
  })

  it('経費合計はそのまま別枠で返し、売上には影響しない', () => {
    const res = buildMonthlySummary('2026-06', [contract({})],
      [log({ actual_hours: 10 })], 123000)
    expect(res.expenseTotal).toBe(123000)
    expect(res.totalBilling).toBe(50000)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- lib/summary.test.ts`
Expected: FAIL（`buildMonthlySummary` 未定義）。

- [ ] **Step 3: 最小実装を書く**

`lib/summary.ts`:

```ts
import type { Contract, WorkLog, BillingType } from './types'
import { calculateBilling } from './billing'

export interface SummaryRow {
  clientId: string
  contractId: string
  contractName: string
  billingType: BillingType
  workedHours: number
  minimumHours: number | null
  billableHours: number | null
  baseRate: number | null
  overtimeRate: number | null
  amount: number
}

export interface MonthlySummary {
  yearMonth: string
  rows: SummaryRow[]
  totalBilling: number
  expenseTotal: number
}

/** yearMonth: 'YYYY-MM'。work_date / start_date / end_date は 'YYYY-MM-DD'。 */
function isMonthWithinPeriod(yearMonth: string, start: string | null, end: string | null): boolean {
  const monthStart = `${yearMonth}-01`
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate()
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`
  if (start && start > monthEnd) return false
  if (end && end < monthStart) return false
  return true
}

export function buildMonthlySummary(
  yearMonth: string,
  contracts: Contract[],
  workLogs: WorkLog[],
  expenseTotal: number,
): MonthlySummary {
  const rows: SummaryRow[] = contracts.map((c) => {
    const workedHours = workLogs
      .filter((w) => w.contract_id === c.id && w.work_date.slice(0, 7) === yearMonth)
      .reduce((sum, w) => sum + (w.actual_hours ?? 0), 0)

    const billing = calculateBilling({
      billingType: c.billing_type,
      workedHours,
      minimumHours: c.minimum_hours,
      baseHourlyRate: c.base_hourly_rate,
      overtimeHourlyRate: c.overtime_hourly_rate,
      fixedAmount: c.fixed_amount,
      isWithinContractPeriod: isMonthWithinPeriod(yearMonth, c.start_date, c.end_date),
    })

    return {
      clientId: c.client_id,
      contractId: c.id,
      contractName: c.name,
      billingType: c.billing_type,
      workedHours,
      minimumHours: c.minimum_hours,
      billableHours: billing.billableHours,
      baseRate: c.base_hourly_rate,
      overtimeRate: c.overtime_hourly_rate,
      amount: billing.amount,
    }
  })

  const totalBilling = rows.reduce((sum, r) => sum + r.amount, 0)
  return { yearMonth, rows, totalBilling, expenseTotal }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- lib/summary.test.ts`
Expected: PASS（全6ケース）。

- [ ] **Step 5: Commit**

```bash
git add lib/summary.ts lib/summary.test.ts
git commit -m "feat: add monthly summary aggregation with tests"
```

---

## Task 5: Supabase スキーマ + RLS マイグレーション

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: マイグレーションSQLを書く**

`supabase/migrations/0001_init.sql`:

```sql
-- clients
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  memo text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- contracts
create table contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  billing_type text not null check (billing_type in ('hourly','monthly_minimum','fixed')),
  minimum_hours numeric,
  base_hourly_rate numeric,
  overtime_hourly_rate numeric,
  fixed_amount numeric,
  start_date date,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- work_logs
create table work_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  contract_id uuid not null references contracts(id) on delete cascade,
  work_date date not null,
  planned_hours numeric,
  actual_hours numeric,
  memo text,
  status text not null default 'planned' check (status in ('planned','worked','billed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- expenses
create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null,
  amount numeric not null,
  allocation_rate numeric not null default 1.0,
  allocated_amount numeric generated always as (round(amount * allocation_rate)) stored,
  memo text,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: 認証済みユーザーのみ全操作可（単一ユーザー運用）
alter table clients enable row level security;
alter table contracts enable row level security;
alter table work_logs enable row level security;
alter table expenses enable row level security;

create policy "auth all" on clients   for all to authenticated using (true) with check (true);
create policy "auth all" on contracts for all to authenticated using (true) with check (true);
create policy "auth all" on work_logs for all to authenticated using (true) with check (true);
create policy "auth all" on expenses  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Supabase プロジェクトに適用**

1. https://supabase.com で無料プロジェクトを作成。
2. プロジェクトの SQL Editor を開き、`0001_init.sql` の内容を貼り付けて Run。
3. Table Editor で4テーブルが作成され、各テーブルに RLS が有効化されていることを確認。
4. Project Settings → API から `Project URL` と `anon public` キーを控える。

- [ ] **Step 3: `.env.local` を設定**

`freelance-manager/.env.local`（コミットしない）:

```
NEXT_PUBLIC_SUPABASE_URL=<Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```

- [ ] **Step 4: Commit（SQLのみ）**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: add Supabase schema and RLS migration"
```

---

## Task 6: Supabase クライアントと認証ガード

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/middleware.ts`, `middleware.ts`

- [ ] **Step 1: ブラウザ用クライアント**

`lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 2: サーバ用クライアント**

`lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch { /* Server Component からの呼び出しでは無視 */ }
        },
      },
    },
  )
}
```

- [ ] **Step 3: セッション更新ヘルパとミドルウェア**

`lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const isLogin = request.nextUrl.pathname.startsWith('/login')
  if (!user && !isLogin) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  return response
}
```

`middleware.ts`（プロジェクト直下）:

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 4: 型チェックとビルド確認**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 5: Commit**

```bash
git add lib/supabase middleware.ts
git commit -m "feat: add Supabase clients and auth middleware guard"
```

---

## Task 7: ログイン画面

**Files:**
- Create: `app/login/page.tsx`, `app/login/actions.ts`

メール+パスワードで Supabase Auth にサインイン。アカウントは Supabase ダッシュボードの Authentication → Users で1件手動作成しておく（自分専用のため新規登録UIは作らない）。

- [ ] **Step 1: サインイン用 Server Action**

`app/login/actions.ts`:

```ts
'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signIn(_prev: string | null, formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!email || !password) return 'メールとパスワードを入力してください'

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return 'ログインに失敗しました'
  redirect('/dashboard')
}
```

- [ ] **Step 2: デザインブリーフを作成し claude design に渡す**

ブリーフ内容（デザイン以外の要件のみ）:
- 目的: 自分専用1アカウントのログイン。新規登録なし。
- 項目: email（必須・type=email）、password（必須・type=password）。
- アクション: 送信ボタン1つ。`signIn` Server Action を `useActionState` で呼ぶ。
- エラー: action が文字列を返したらフォーム上部にメッセージ表示。
- 遷移: 成功で `/dashboard` へ（action 側で redirect）。
- 技術制約: Next.js App Router の Client Component、`useActionState(signIn, null)`、PC中心。

claude design からフォームUIを受け取る。

- [ ] **Step 3: 受け取ったUIで `app/login/page.tsx` を作成し action を接続**

claude design 製コンポーネントを配置し、`form action` に `useActionState` 経由の `signIn` を接続する（接続例）:

```tsx
'use client'
import { useActionState } from 'react'
import { signIn } from './actions'

export default function LoginPage() {
  const [error, action] = useActionState(signIn, null)
  // ↓ claude design 製のマークアップで <form action={action}> を包み、
  //   name="email" / name="password" の入力と error 表示を組み込む
  return (/* claude design 提供のJSX。input の name は email / password を維持 */)
}
```

- [ ] **Step 4: 手動確認**

Run: `npm run dev` → `/login` でダッシュボードへリダイレクトされること（未ログイン時）、正しい資格情報でログインできることを確認。

- [ ] **Step 5: Commit**

```bash
git add app/login
git commit -m "feat: add email/password login"
```

---

## Task 8: クライアント管理（CRUD）

**Files:**
- Create: `app/(app)/clients/actions.ts`, `app/(app)/clients/page.tsx`

- [ ] **Step 1: Server Actions（作成・更新・有効/無効切替）**

`app/(app)/clients/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createClientRecord(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'クライアント名は必須です' }
  const memo = String(formData.get('memo') ?? '').trim() || null

  const supabase = await createClient()
  const { error } = await supabase.from('clients').insert({ name, memo })
  if (error) return { error: '保存に失敗しました' }
  revalidatePath('/clients')
  return { error: null }
}

export async function updateClientRecord(id: string, formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'クライアント名は必須です' }
  const memo = String(formData.get('memo') ?? '').trim() || null

  const supabase = await createClient()
  const { error } = await supabase.from('clients')
    .update({ name, memo, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: '更新に失敗しました' }
  revalidatePath('/clients')
  return { error: null }
}

export async function setClientActive(id: string, isActive: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from('clients')
    .update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: '更新に失敗しました' }
  revalidatePath('/clients')
  return { error: null }
}
```

- [ ] **Step 2: データ取得を含む Server Component（仮UI）を作成**

`app/(app)/clients/page.tsx`（claude design 前の最小動作版）:

```tsx
import { createClient } from '@/lib/supabase/server'
import type { Client } from '@/lib/types'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
  const clients = (data ?? []) as Client[]
  return (
    <main>
      <h1>クライアント</h1>
      <ul>{clients.map((c) => <li key={c.id}>{c.name}{c.is_active ? '' : '（無効）'}</li>)}</ul>
    </main>
  )
}
```

- [ ] **Step 3: 手動確認**

Run: `npm run dev` → Supabase ダッシュボードで手動挿入したクライアントが一覧表示されることを確認。

- [ ] **Step 4: デザインブリーフを作成し claude design に渡す**

ブリーフ内容:
- 目的: クライアントの一覧・追加・編集・有効/無効切替。
- 項目: name（必須）、memo（任意・複数行）、is_active（トグル表示）。
- アクション: 追加フォーム、行ごとの編集、有効/無効トグル（`setClientActive`）。
- エラー: action が `{ error }` を返したら表示。
- 遷移: 同一ページ内で完結。
- 技術制約: Server Component でデータ取得済み、上記 actions を呼ぶ Client Component を内包。

- [ ] **Step 5: claude design 製UIに差し替えて actions を接続**

`page.tsx` の仮UIを claude design 製の一覧＋フォームに置換し、`createClientRecord` / `updateClientRecord` / `setClientActive` を接続する。

- [ ] **Step 6: 手動確認**

追加・編集・無効化が一覧に反映されることを確認。

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/clients"
git commit -m "feat: add client management CRUD"
```

---

## Task 9: 契約条件管理（CRUD）

**Files:**
- Create: `app/(app)/contracts/actions.ts`, `app/(app)/contracts/page.tsx`

`billing_type` により入力項目を出し分ける（hourly: 基本単価 / monthly_minimum: 最低時間・基本単価・超過単価 / fixed: 固定報酬額）。

- [ ] **Step 1: 入力検証付き Server Action（作成）**

`app/(app)/contracts/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { BillingType } from '@/lib/types'

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').trim()
  return s === '' ? null : Number(s)
}

function validate(billingType: BillingType, base: number | null, min: number | null, fixed: number | null): string | null {
  if (billingType === 'hourly' && base == null) return '時給制は基本単価が必須です'
  if (billingType === 'monthly_minimum' && (base == null || min == null)) return '月間最低制は最低稼働時間と基本単価が必須です'
  if (billingType === 'fixed' && fixed == null) return '固定報酬は固定報酬額が必須です'
  return null
}

export async function createContract(formData: FormData) {
  const client_id = String(formData.get('client_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const billing_type = String(formData.get('billing_type') ?? '') as BillingType
  if (!client_id || !name) return { error: 'クライアントと契約名は必須です' }

  const base_hourly_rate = numOrNull(formData.get('base_hourly_rate'))
  const minimum_hours = numOrNull(formData.get('minimum_hours'))
  const overtime_hourly_rate = numOrNull(formData.get('overtime_hourly_rate'))
  const fixed_amount = numOrNull(formData.get('fixed_amount'))
  const start_date = String(formData.get('start_date') ?? '') || null
  const end_date = String(formData.get('end_date') ?? '') || null

  const v = validate(billing_type, base_hourly_rate, minimum_hours, fixed_amount)
  if (v) return { error: v }

  const supabase = await createClient()
  const { error } = await supabase.from('contracts').insert({
    client_id, name, billing_type, base_hourly_rate, minimum_hours,
    overtime_hourly_rate, fixed_amount, start_date, end_date,
  })
  if (error) return { error: '保存に失敗しました' }
  revalidatePath('/contracts')
  return { error: null }
}
```

（更新・有効切替は `createContract` と同じ検証を使い `.update().eq('id', id)` で実装。クライアント側からは同じフォーム項目を送る。）

- [ ] **Step 2: 更新・有効切替アクションを追加**

同ファイルに追記:

```ts
export async function updateContract(id: string, formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const billing_type = String(formData.get('billing_type') ?? '') as BillingType
  if (!name) return { error: '契約名は必須です' }
  const base_hourly_rate = numOrNull(formData.get('base_hourly_rate'))
  const minimum_hours = numOrNull(formData.get('minimum_hours'))
  const overtime_hourly_rate = numOrNull(formData.get('overtime_hourly_rate'))
  const fixed_amount = numOrNull(formData.get('fixed_amount'))
  const start_date = String(formData.get('start_date') ?? '') || null
  const end_date = String(formData.get('end_date') ?? '') || null

  const v = validate(billing_type, base_hourly_rate, minimum_hours, fixed_amount)
  if (v) return { error: v }

  const supabase = await createClient()
  const { error } = await supabase.from('contracts').update({
    name, billing_type, base_hourly_rate, minimum_hours, overtime_hourly_rate,
    fixed_amount, start_date, end_date, updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { error: '更新に失敗しました' }
  revalidatePath('/contracts')
  return { error: null }
}

export async function setContractActive(id: string, isActive: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from('contracts')
    .update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: '更新に失敗しました' }
  revalidatePath('/contracts')
  return { error: null }
}
```

- [ ] **Step 3: データ取得 Server Component（仮UI）**

`app/(app)/contracts/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import type { Contract, Client } from '@/lib/types'

export default async function ContractsPage() {
  const supabase = await createClient()
  const [{ data: contracts }, { data: clients }] = await Promise.all([
    supabase.from('contracts').select('*').order('created_at', { ascending: false }),
    supabase.from('clients').select('*').eq('is_active', true).order('name'),
  ])
  const list = (contracts ?? []) as Contract[]
  const clientList = (clients ?? []) as Client[]
  return (
    <main>
      <h1>契約条件</h1>
      <ul>{list.map((c) => <li key={c.id}>{c.name} / {c.billing_type}</li>)}</ul>
      <p>選択可能クライアント: {clientList.length}</p>
    </main>
  )
}
```

- [ ] **Step 4: デザインブリーフを作成し claude design に渡す**

ブリーフ内容:
- 目的: クライアントごとの契約条件の一覧・追加・編集・有効切替。
- 項目: client_id（select・必須）、name（必須）、billing_type（select: hourly/monthly_minimum/fixed・必須）、start_date / end_date（date・任意）。
- **条件出し分け**: billing_type=hourly → base_hourly_rate のみ。monthly_minimum → minimum_hours・base_hourly_rate（必須）＋ overtime_hourly_rate（任意）。fixed → fixed_amount のみ。
- バリデーション: Step1 の `validate` と同条件。エラーは `{ error }` を表示。
- 技術制約: クライアント側で billing_type に応じて入力欄を表示切替する Client Component。

- [ ] **Step 5: claude design 製UIに差し替えて接続**

`createContract` / `updateContract` / `setContractActive` を接続。input の name は Step1/2 のキーと一致させる。

- [ ] **Step 6: 手動確認**

3種の billing_type で契約を作成し、必須検証が効くこと・一覧反映を確認。

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/contracts"
git commit -m "feat: add contract management CRUD with billing-type fields"
```

---

## Task 10: 稼働ログ入力（CRUD）

**Files:**
- Create: `app/(app)/work-logs/actions.ts`, `app/(app)/work-logs/page.tsx`

時間単位で直接入力（予定時間・実働時間）。1行=1日×1契約。

- [ ] **Step 1: Server Actions**

`app/(app)/work-logs/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { WorkLogStatus } from '@/lib/types'

function hoursOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').trim()
  return s === '' ? null : Number(s)
}

export async function createWorkLog(formData: FormData) {
  const client_id = String(formData.get('client_id') ?? '')
  const contract_id = String(formData.get('contract_id') ?? '')
  const work_date = String(formData.get('work_date') ?? '')
  if (!client_id || !contract_id || !work_date) return { error: 'クライアント・契約・日付は必須です' }

  const planned_hours = hoursOrNull(formData.get('planned_hours'))
  const actual_hours = hoursOrNull(formData.get('actual_hours'))
  const status = (String(formData.get('status') ?? 'planned')) as WorkLogStatus
  const memo = String(formData.get('memo') ?? '').trim() || null

  const supabase = await createClient()
  const { error } = await supabase.from('work_logs').insert({
    client_id, contract_id, work_date, planned_hours, actual_hours, status, memo,
  })
  if (error) return { error: '保存に失敗しました' }
  revalidatePath('/work-logs')
  return { error: null }
}

export async function updateWorkLog(id: string, formData: FormData) {
  const work_date = String(formData.get('work_date') ?? '')
  if (!work_date) return { error: '日付は必須です' }
  const planned_hours = hoursOrNull(formData.get('planned_hours'))
  const actual_hours = hoursOrNull(formData.get('actual_hours'))
  const status = (String(formData.get('status') ?? 'planned')) as WorkLogStatus
  const memo = String(formData.get('memo') ?? '').trim() || null

  const supabase = await createClient()
  const { error } = await supabase.from('work_logs').update({
    work_date, planned_hours, actual_hours, status, memo, updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { error: '更新に失敗しました' }
  revalidatePath('/work-logs')
  return { error: null }
}

export async function deleteWorkLog(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('work_logs').delete().eq('id', id)
  if (error) return { error: '削除に失敗しました' }
  revalidatePath('/work-logs')
  return { error: null }
}
```

- [ ] **Step 2: データ取得 Server Component（仮UI・当月分）**

`app/(app)/work-logs/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import type { WorkLog, Contract, Client } from '@/lib/types'

export default async function WorkLogsPage() {
  const supabase = await createClient()
  const [{ data: logs }, { data: contracts }, { data: clients }] = await Promise.all([
    supabase.from('work_logs').select('*').order('work_date', { ascending: false }).limit(100),
    supabase.from('contracts').select('*').eq('is_active', true),
    supabase.from('clients').select('*').eq('is_active', true),
  ])
  const logList = (logs ?? []) as WorkLog[]
  void (contracts as Contract[] | null); void (clients as Client[] | null)
  return (
    <main>
      <h1>稼働ログ</h1>
      <ul>{logList.map((l) => <li key={l.id}>{l.work_date} / 実働 {l.actual_hours ?? '-'}h</li>)}</ul>
    </main>
  )
}
```

- [ ] **Step 3: デザインブリーフを作成し claude design に渡す**

ブリーフ内容:
- 目的: 日々の稼働の登録・編集・削除。
- 項目: work_date（date・必須）、client_id（select・必須）、contract_id（選択クライアントの契約に絞る・必須）、planned_hours（数値・任意・小数可）、actual_hours（数値・任意・小数可）、status（select: planned/worked/billed）、memo（任意）。
- 連動: client_id を選ぶと contract_id の選択肢をそのクライアントの有効契約に絞る。
- アクション: 追加・編集・削除。
- バリデーション: 必須3項目。エラー `{ error }` 表示。
- 技術制約: クライアント・契約リストを Server Component から props で受け取る Client Component。

- [ ] **Step 4: claude design 製UIに差し替えて接続**

`createWorkLog` / `updateWorkLog` / `deleteWorkLog` を接続。

- [ ] **Step 5: 手動確認**

稼働を複数日登録・編集・削除し、一覧反映を確認。

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/work-logs"
git commit -m "feat: add work log CRUD with direct hour input"
```

---

## Task 11: 経費入力（CRUD + 定期経費の複製）

**Files:**
- Create: `app/(app)/expenses/actions.ts`, `app/(app)/expenses/page.tsx`

- [ ] **Step 1: Server Actions（CRUD）**

`app/(app)/expenses/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createExpense(formData: FormData) {
  const expense_date = String(formData.get('expense_date') ?? '')
  const category = String(formData.get('category') ?? '').trim()
  const amountStr = String(formData.get('amount') ?? '').trim()
  if (!expense_date || !category || amountStr === '') return { error: '日付・カテゴリ・金額は必須です' }

  const amount = Number(amountStr)
  const rateStr = String(formData.get('allocation_rate') ?? '1').trim()
  const allocation_rate = rateStr === '' ? 1 : Number(rateStr)
  const is_recurring = formData.get('is_recurring') === 'on'
  const memo = String(formData.get('memo') ?? '').trim() || null

  const supabase = await createClient()
  // allocated_amount は生成列のため挿入しない
  const { error } = await supabase.from('expenses')
    .insert({ expense_date, category, amount, allocation_rate, is_recurring, memo })
  if (error) return { error: '保存に失敗しました' }
  revalidatePath('/expenses')
  return { error: null }
}

export async function updateExpense(id: string, formData: FormData) {
  const expense_date = String(formData.get('expense_date') ?? '')
  const category = String(formData.get('category') ?? '').trim()
  const amountStr = String(formData.get('amount') ?? '').trim()
  if (!expense_date || !category || amountStr === '') return { error: '日付・カテゴリ・金額は必須です' }

  const amount = Number(amountStr)
  const allocation_rate = Number(String(formData.get('allocation_rate') ?? '1') || '1')
  const is_recurring = formData.get('is_recurring') === 'on'
  const memo = String(formData.get('memo') ?? '').trim() || null

  const supabase = await createClient()
  const { error } = await supabase.from('expenses').update({
    expense_date, category, amount, allocation_rate, is_recurring, memo,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { error: '更新に失敗しました' }
  revalidatePath('/expenses')
  return { error: null }
}

export async function deleteExpense(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) return { error: '削除に失敗しました' }
  revalidatePath('/expenses')
  return { error: null }
}
```

- [ ] **Step 2: 定期経費の複製アクション**

同ファイルに追記。対象月（'YYYY-MM'）に、その前月の `is_recurring=true` 経費を当月1日付でコピー:

```ts
export async function copyRecurringFromPrevMonth(targetYearMonth: string) {
  // targetYearMonth: 'YYYY-MM'
  const [y, m] = targetYearMonth.split('-').map(Number)
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  const prevStart = `${prev}-01`
  const prevEndDay = new Date(Number(prev.slice(0, 4)), Number(prev.slice(5, 7)), 0).getDate()
  const prevEnd = `${prev}-${String(prevEndDay).padStart(2, '0')}`

  const supabase = await createClient()
  const { data: recurring, error: selErr } = await supabase.from('expenses')
    .select('category, amount, allocation_rate, memo')
    .eq('is_recurring', true)
    .gte('expense_date', prevStart).lte('expense_date', prevEnd)
  if (selErr) return { error: '前月分の取得に失敗しました' }
  if (!recurring || recurring.length === 0) return { error: '前月に定期経費がありません' }

  const targetDate = `${targetYearMonth}-01`
  const rows = recurring.map((r) => ({ ...r, expense_date: targetDate, is_recurring: true }))
  const { error } = await supabase.from('expenses').insert(rows)
  if (error) return { error: '複製に失敗しました' }
  revalidatePath('/expenses')
  return { error: null }
}
```

- [ ] **Step 3: データ取得 Server Component（仮UI）**

`app/(app)/expenses/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import type { Expense } from '@/lib/types'

export default async function ExpensesPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(200)
  const expenses = (data ?? []) as Expense[]
  return (
    <main>
      <h1>経費</h1>
      <ul>{expenses.map((e) => <li key={e.id}>{e.expense_date} {e.category} 計上 {e.allocated_amount}円</li>)}</ul>
    </main>
  )
}
```

- [ ] **Step 4: デザインブリーフを作成し claude design に渡す**

ブリーフ内容:
- 目的: 経費の登録・編集・削除と、定期経費の前月複製。
- 項目: expense_date（date・必須）、category（必須・例 wifi/rent/mobile を候補表示してよいが自由入力可）、amount（数値・必須）、allocation_rate（0〜1・既定1）、is_recurring（チェックボックス）、memo（任意）。allocated_amount は表示のみ（= amount×按分率、サーバ計算済み）。
- アクション: 追加・編集・削除＋「先月の定期経費を複製」ボタン（対象年月を渡して `copyRecurringFromPrevMonth`）。
- バリデーション: 日付・カテゴリ・金額必須。エラー `{ error }` 表示（「前月に定期経費がありません」等も表示）。
- 技術制約: Client Component。対象年月セレクタを持ち複製ボタンに渡す。

- [ ] **Step 5: claude design 製UIに差し替えて接続**

`createExpense` / `updateExpense` / `deleteExpense` / `copyRecurringFromPrevMonth` を接続。

- [ ] **Step 6: 手動確認**

定期経費を登録 → 翌月で複製ボタン → 当月1日付でコピーされ、`allocated_amount` が金額×按分率になっていることを確認。

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/expenses"
git commit -m "feat: add expense CRUD and recurring copy"
```

---

## Task 12: 月次サマリー画面

**Files:**
- Create: `app/(app)/summary/page.tsx`

`lib/summary.ts` の `buildMonthlySummary` を使い、年月指定で契約別請求と経費合計を表示。

- [ ] **Step 1: データ取得＋集計の Server Component（仮UI）**

`app/(app)/summary/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { buildMonthlySummary } from '@/lib/summary'
import type { Contract, WorkLog, Expense } from '@/lib/types'

export default async function SummaryPage({
  searchParams,
}: { searchParams: Promise<{ ym?: string }> }) {
  const { ym } = await searchParams
  const yearMonth = ym ?? new Date().toISOString().slice(0, 7) // 'YYYY-MM'
  const monthStart = `${yearMonth}-01`
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate()
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`

  const supabase = await createClient()
  const [{ data: contracts }, { data: logs }, { data: expenses }] = await Promise.all([
    supabase.from('contracts').select('*').eq('is_active', true),
    supabase.from('work_logs').select('*').gte('work_date', monthStart).lte('work_date', monthEnd),
    supabase.from('expenses').select('allocated_amount').gte('expense_date', monthStart).lte('expense_date', monthEnd),
  ])
  const expenseTotal = ((expenses ?? []) as Pick<Expense, 'allocated_amount'>[])
    .reduce((s, e) => s + (e.allocated_amount ?? 0), 0)

  const summary = buildMonthlySummary(
    yearMonth, (contracts ?? []) as Contract[], (logs ?? []) as WorkLog[], expenseTotal,
  )

  return (
    <main>
      <h1>{yearMonth} 月次サマリー</h1>
      <table>
        <tbody>
          {summary.rows.map((r) => (
            <tr key={r.contractId}>
              <td>{r.contractName}</td><td>{r.workedHours}h</td><td>{r.amount}円</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>経費合計: {summary.expenseTotal}円</p>
      <p>合計金額（請求合計）: {summary.totalBilling}円</p>
    </main>
  )
}
```

- [ ] **Step 2: 手動確認**

`/summary?ym=2026-06` で、登録済みの稼働・契約・経費から契約別請求・経費合計・合計金額が正しく出ることを確認（`lib/summary.test.ts` の期待と整合）。

- [ ] **Step 3: デザインブリーフを作成し claude design に渡す**

ブリーフ内容:
- 目的: 年月を選び、契約別の請求と月の経費合計・合計金額を確認。
- 表示項目（行）: クライアント名・契約名・実働時間合計・最低保証時間・請求対象時間・基本単価・超過単価・請求金額（`SummaryRow` の各値）。
- 月全体: 経費合計（別枠）・合計金額（請求合計）。
- 操作: 年月セレクタ（変更で `?ym=YYYY-MM` に遷移）。
- 技術制約: Server Component が `buildMonthlySummary` の結果を渡す。表示専用。
- データ整形: 金額は `toLocaleString('ja-JP')` で3桁区切り表示。

- [ ] **Step 4: claude design 製UIに差し替え**

`page.tsx` の仮テーブルを claude design 製の表に置換（`summary` をそのまま渡す）。

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/summary"
git commit -m "feat: add monthly summary page"
```

---

## Task 13: ダッシュボード

**Files:**
- Create: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: 当月集計の Server Component（仮UI）**

`app/(app)/dashboard/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { buildMonthlySummary } from '@/lib/summary'
import type { Contract, WorkLog, Expense } from '@/lib/types'

export default async function DashboardPage() {
  const yearMonth = new Date().toISOString().slice(0, 7)
  const monthStart = `${yearMonth}-01`
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate()
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`

  const supabase = await createClient()
  const [{ data: contracts }, { data: logs }, { data: expenses }] = await Promise.all([
    supabase.from('contracts').select('*').eq('is_active', true),
    supabase.from('work_logs').select('*').gte('work_date', monthStart).lte('work_date', monthEnd),
    supabase.from('expenses').select('allocated_amount').gte('expense_date', monthStart).lte('expense_date', monthEnd),
  ])
  const expenseTotal = ((expenses ?? []) as Pick<Expense, 'allocated_amount'>[])
    .reduce((s, e) => s + (e.allocated_amount ?? 0), 0)
  const summary = buildMonthlySummary(
    yearMonth, (contracts ?? []) as Contract[], (logs ?? []) as WorkLog[], expenseTotal,
  )
  const totalHours = summary.rows.reduce((s, r) => s + r.workedHours, 0)

  return (
    <main>
      <h1>{yearMonth} ダッシュボード</h1>
      <p>今月の稼働時間: {totalHours}h</p>
      <p>今月の請求見込み: {summary.totalBilling}円</p>
      <p>今月の経費合計: {summary.expenseTotal}円</p>
      <ul>{summary.rows.map((r) => <li key={r.contractId}>{r.contractName}: {r.workedHours}h / {r.amount}円</li>)}</ul>
    </main>
  )
}
```

- [ ] **Step 2: デザインブリーフを作成し claude design に渡す**

ブリーフ内容:
- 目的: 当月の要約を一目で確認。
- 表示: 今月の稼働時間（合計）・今月の請求見込み（`totalBilling`）・今月の経費合計・クライアント/契約別の稼働状況（`summary.rows`）。
- 操作: 各画面へのナビゲーション（clients/contracts/work-logs/expenses/summary）。
- 技術制約: Server Component が集計済みデータを渡す表示専用＋ナビ。

- [ ] **Step 3: claude design 製UIに差し替え**

カード/ナビUIに置換。

- [ ] **Step 4: 手動確認**

当月の値がサマリー画面と一致することを確認。

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dashboard"
git commit -m "feat: add dashboard"
```

---

## Task 14: 全テスト・ビルド確認とアプリ共通レイアウト

**Files:**
- Modify: `app/layout.tsx`
- Create: `app/(app)/layout.tsx`

- [ ] **Step 1: 認証グループ用レイアウト（ナビ枠・仮）**

`app/(app)/layout.tsx`:

```tsx
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}
```

（claude design が全体ナビ/シェルを設計したらここに反映。デザインブリーフ：左ナビ or 上部ナビで dashboard/clients/contracts/work-logs/expenses/summary へ遷移、ログアウトボタン。）

- [ ] **Step 2: ログアウト Server Action を追加**

`app/(app)/actions.ts`:

```ts
'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 3: 全テスト実行**

Run: `npm test`
Expected: PASS（billing 8件 + summary 6件）。

- [ ] **Step 4: 本番ビルド確認**

Run: `npm run build`
Expected: 型エラー・ビルドエラーなし。

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/layout.tsx" "app/(app)/actions.ts" app/layout.tsx
git commit -m "feat: add app layout shell and sign-out"
```

---

## Task 15: Vercel デプロイ

**Files:** なし（設定作業）

- [ ] **Step 1: GitHub リポジトリにプッシュ**

```bash
gh repo create freelance-manager --private --source=. --remote=origin --push
```

（`gh` 未認証なら `! gh auth login` を案内）

- [ ] **Step 2: Vercel にインポート**

1. https://vercel.com で「Add New → Project」から当リポジトリをインポート。
2. Framework Preset は Next.js（自動検出）。
3. Environment Variables に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定。
4. Deploy。

- [ ] **Step 3: Supabase の認証リダイレクト設定**

Supabase → Authentication → URL Configuration に Vercel の本番URLを Site URL / Redirect URLs として追加。

- [ ] **Step 4: 本番動作確認**

本番URLでログイン → ダッシュボード表示 → 各CRUD → 月次サマリーが動くことを確認。

- [ ] **Step 5: Commit（必要なら設定ファイル）**

```bash
git add -A && git commit -m "chore: deploy configuration" --allow-empty
```

---

## Phase 1 完了の定義
- `npm test` が全て PASS（billing / summary）。
- `npm run build` が成功。
- 本番URLでログインし、クライアント・契約・稼働・経費を登録でき、月次サマリーとダッシュボードに正しく集計が表示される。

## 次フェーズ
- Phase 2（請求書PDF）と Phase 3（手取り試算）は本計画完了後に、それぞれ別の実装計画として作成する。
```
