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

export async function copyRecurringFromPrevMonth(targetYearMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(targetYearMonth)) return { error: '年月の形式が正しくありません' }
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
