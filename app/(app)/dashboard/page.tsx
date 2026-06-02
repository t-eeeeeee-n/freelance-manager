import { createClient } from '@/lib/supabase/server'
import { buildMonthlySummary } from '@/lib/summary'
import type { Contract, WorkLog, Expense } from '@/lib/types'

export default async function DashboardPage() {
  const yearMonth = new Date().toISOString().slice(0, 7)
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

  const totalHours = summary.rows.reduce((s, r) => s + r.workedHours, 0)

  return (
    <main style={{ padding: 24 }}>
      <h1>{yearMonth} ダッシュボード</h1>
      <ul>
        <li>今月の稼働時間: {totalHours}h</li>
        <li>今月の請求見込み: {summary.totalBilling.toLocaleString('ja-JP')}円</li>
        <li>今月の経費合計: {summary.expenseTotal.toLocaleString('ja-JP')}円</li>
      </ul>
      <h2>クライアント/契約別</h2>
      <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr><th>契約</th><th>稼働時間</th><th>請求額</th></tr>
        </thead>
        <tbody>
          {summary.rows.map((r) => (
            <tr key={r.contractId}>
              <td>{r.contractName}</td>
              <td>{r.workedHours}h</td>
              <td>{r.amount.toLocaleString('ja-JP')}円</td>
            </tr>
          ))}
          {summary.rows.length === 0 && (
            <tr><td colSpan={3} style={{ textAlign: 'center' }}>稼働データがありません</td></tr>
          )}
        </tbody>
      </table>
      <p style={{ marginTop: 16 }}>
        <a href="/clients">クライアント</a>{' | '}
        <a href="/contracts">契約条件</a>{' | '}
        <a href="/work-logs">稼働ログ</a>{' | '}
        <a href="/expenses">経費</a>{' | '}
        <a href="/summary">月次サマリー</a>
      </p>
    </main>
  )
}
