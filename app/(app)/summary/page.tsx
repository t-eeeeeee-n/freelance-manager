import { createClient } from '@/lib/supabase/server'
import { buildMonthlySummary } from '@/lib/summary'
import type { Contract, WorkLog, Expense } from '@/lib/types'

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>
}) {
  const { ym } = await searchParams
  const yearMonth = ym ?? new Date().toISOString().slice(0, 7)
  const monthStart = `${yearMonth}-01`
  const lastDay = new Date(
    Number(yearMonth.slice(0, 4)),
    Number(yearMonth.slice(5, 7)),
    0,
  ).getDate()
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`

  const supabase = await createClient()
  const [{ data: contracts }, { data: logs }, { data: expenses }] = await Promise.all([
    supabase.from('contracts').select('*').eq('is_active', true),
    supabase
      .from('work_logs')
      .select('*')
      .gte('work_date', monthStart)
      .lte('work_date', monthEnd),
    supabase
      .from('expenses')
      .select('allocated_amount')
      .gte('expense_date', monthStart)
      .lte('expense_date', monthEnd),
  ])

  const expenseTotal = ((expenses ?? []) as Pick<Expense, 'allocated_amount'>[]).reduce(
    (s, e) => s + (e.allocated_amount ?? 0),
    0,
  )

  const summary = buildMonthlySummary(
    yearMonth,
    (contracts ?? []) as Contract[],
    (logs ?? []) as WorkLog[],
    expenseTotal,
  )

  return (
    <main style={{ padding: 24 }}>
      <h1>{yearMonth} 月次サマリー</h1>
      <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr>
            <th>契約</th>
            <th>実働時間</th>
            <th>最低保証</th>
            <th>請求対象</th>
            <th>基本単価</th>
            <th>超過単価</th>
            <th>請求金額</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((r) => (
            <tr key={r.contractId}>
              <td>{r.contractName}</td>
              <td>{r.workedHours}h</td>
              <td>{r.minimumHours != null ? `${r.minimumHours}h` : '-'}</td>
              <td>{r.billableHours != null ? `${r.billableHours}h` : '-'}</td>
              <td>{r.baseRate != null ? r.baseRate.toLocaleString('ja-JP') : '-'}</td>
              <td>{r.overtimeRate != null ? r.overtimeRate.toLocaleString('ja-JP') : '-'}</td>
              <td>{r.amount.toLocaleString('ja-JP')}円</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>経費合計（別枠）: {summary.expenseTotal.toLocaleString('ja-JP')}円</p>
      <p>合計金額（請求合計）: {summary.totalBilling.toLocaleString('ja-JP')}円</p>
    </main>
  )
}
