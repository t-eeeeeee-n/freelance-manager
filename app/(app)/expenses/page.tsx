import { createClient } from '@/lib/supabase/server'
import type { Expense } from '@/lib/types'

export default async function ExpensesPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('expenses')
    .select('*').order('expense_date', { ascending: false }).limit(200)
  const expenses = (data ?? []) as Expense[]
  return (
    <main style={{ padding: 24 }}>
      <h1>経費</h1>
      <table border={1} cellPadding={8}>
        <thead>
          <tr><th>日付</th><th>カテゴリ</th><th>金額</th><th>按分率</th><th>計上額</th><th>定期</th></tr>
        </thead>
        <tbody>
          {expenses.map((e) => (
            <tr key={e.id}>
              <td>{e.expense_date}</td>
              <td>{e.category}</td>
              <td>{e.amount.toLocaleString('ja-JP')}円</td>
              <td>{e.allocation_rate}</td>
              <td>{e.allocated_amount.toLocaleString('ja-JP')}円</td>
              <td>{e.is_recurring ? '◎' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
