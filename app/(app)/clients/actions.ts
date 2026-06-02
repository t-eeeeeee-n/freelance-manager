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
