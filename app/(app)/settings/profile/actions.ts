'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function upsertProfile(formData: FormData) {
  const display_name = String(formData.get('display_name') ?? '').trim() || null
  const address = String(formData.get('address') ?? '').trim() || null
  const email = String(formData.get('email') ?? '').trim() || null
  const phone = String(formData.get('phone') ?? '').trim() || null
  const bank_info = String(formData.get('bank_info') ?? '').trim() || null

  const supabase = await createClient()

  // profile は1ユーザー1行 — 既存があれば update、なければ insert
  const { data: existing } = await supabase.from('profile').select('id').limit(1).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('profile')
      .update({ display_name, address, email, phone, bank_info, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return { error: '保存に失敗しました' }
  } else {
    const { error } = await supabase.from('profile')
      .insert({ display_name, address, email, phone, bank_info })
    if (error) return { error: '保存に失敗しました' }
  }
  revalidatePath('/settings/profile')
  return { error: null }
}
