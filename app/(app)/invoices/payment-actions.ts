'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { todayYMD } from '@/lib/ym'

export async function markPaid(id: string) {
  const supabase = await createClient()
  const paid_date = todayYMD()
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

export async function deleteInvoice(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) return { error: '削除に失敗しました' }
  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  return { error: null }
}
