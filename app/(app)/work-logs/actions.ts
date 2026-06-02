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
  const status = String(formData.get('status') ?? 'planned') as WorkLogStatus
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
  const status = String(formData.get('status') ?? 'planned') as WorkLogStatus
  const memo = String(formData.get('memo') ?? '').trim() || null

  const supabase = await createClient()
  const { error } = await supabase.from('work_logs').update({
    work_date, planned_hours, actual_hours, status, memo,
    updated_at: new Date().toISOString(),
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
