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
  const actual_start_time = String(formData.get('actual_start_time') ?? '').trim() || null
  const actual_end_time = String(formData.get('actual_end_time') ?? '').trim() || null
  const break_minutes = Number(String(formData.get('break_minutes') ?? '0').trim() || '0')

  // Auto-calculate actual_hours from times if both are provided
  let computedHours = hoursOrNull(formData.get('actual_hours'))
  if (actual_start_time && actual_end_time) {
    const [sh, sm] = actual_start_time.split(':').map(Number)
    const [eh, em] = actual_end_time.split(':').map(Number)
    const totalMins = (eh * 60 + em) - (sh * 60 + sm) - break_minutes
    computedHours = Math.round(totalMins / 6) / 10  // round to 1 decimal
  }

  const status = String(formData.get('status') ?? 'planned') as WorkLogStatus
  const memo = String(formData.get('memo') ?? '').trim() || null

  const supabase = await createClient()
  const { error } = await supabase.from('work_logs').insert({
    client_id, contract_id, work_date, planned_hours, actual_hours: computedHours,
    actual_start_time, actual_end_time, break_minutes, status, memo,
  })
  if (error) return { error: '保存に失敗しました' }
  revalidatePath('/work-logs')
  return { error: null }
}

export async function updateWorkLog(id: string, formData: FormData) {
  const work_date = String(formData.get('work_date') ?? '')
  if (!work_date) return { error: '日付は必須です' }

  const planned_hours = hoursOrNull(formData.get('planned_hours'))
  const actual_start_time = String(formData.get('actual_start_time') ?? '').trim() || null
  const actual_end_time = String(formData.get('actual_end_time') ?? '').trim() || null
  const break_minutes = Number(String(formData.get('break_minutes') ?? '0').trim() || '0')

  // Auto-calculate actual_hours from times if both are provided
  let computedHours = hoursOrNull(formData.get('actual_hours'))
  if (actual_start_time && actual_end_time) {
    const [sh, sm] = actual_start_time.split(':').map(Number)
    const [eh, em] = actual_end_time.split(':').map(Number)
    const totalMins = (eh * 60 + em) - (sh * 60 + sm) - break_minutes
    computedHours = Math.round(totalMins / 6) / 10  // round to 1 decimal
  }

  const status = String(formData.get('status') ?? 'planned') as WorkLogStatus
  const memo = String(formData.get('memo') ?? '').trim() || null

  const supabase = await createClient()
  const { error } = await supabase.from('work_logs').update({
    work_date, planned_hours, actual_hours: computedHours,
    actual_start_time, actual_end_time, break_minutes, status, memo,
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
