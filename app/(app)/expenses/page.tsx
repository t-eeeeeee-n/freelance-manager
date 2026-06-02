import { createClient } from '@/lib/supabase/server'
import type { Expense } from '@/lib/types'
import { ExpensesUI } from './expenses-ui'

export default async function ExpensesPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(500)
  return (
    <div className="page">
      <ExpensesUI expenses={(data ?? []) as Expense[]} />
    </div>
  )
}
