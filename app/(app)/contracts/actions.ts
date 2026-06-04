'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { BillingType } from '@/lib/types'

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').trim()
  return s === '' ? null : Number(s)
}

function validate(billingType: BillingType, base: number | null, min: number | null, fixed: number | null): string | null {
  if (billingType === 'hourly' && base == null) return '時給制は基本単価が必須です'
  if (billingType === 'monthly_minimum' && (base == null || min == null)) return '月間最低制は最低稼働時間と基本単価が必須です'
  if (billingType === 'fixed' && fixed == null) return '固定報酬は固定報酬額が必須です'
  return null
}

export async function createContract(formData: FormData) {
  const client_id = String(formData.get('client_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const billing_type = String(formData.get('billing_type') ?? '') as BillingType
  if (!client_id || !name) return { error: 'クライアントと契約名は必須です' }

  const base_hourly_rate = numOrNull(formData.get('base_hourly_rate'))
  const minimum_hours = numOrNull(formData.get('minimum_hours'))
  const overtime_hourly_rate = numOrNull(formData.get('overtime_hourly_rate'))
  const fixed_amount = numOrNull(formData.get('fixed_amount'))
  const start_date = String(formData.get('start_date') ?? '') || null
  const end_date = String(formData.get('end_date') ?? '') || null
  const withholding = formData.get('withholding') === 'on'

  const v = validate(billing_type, base_hourly_rate, minimum_hours, fixed_amount)
  if (v) return { error: v }

  const supabase = await createClient()
  const { error } = await supabase.from('contracts').insert({
    client_id, name, billing_type, base_hourly_rate, minimum_hours,
    overtime_hourly_rate, fixed_amount, start_date, end_date, withholding,
  })
  if (error) return { error: '保存に失敗しました' }
  revalidatePath('/contracts')
  return { error: null }
}

export async function updateContract(id: string, formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const billing_type = String(formData.get('billing_type') ?? '') as BillingType
  if (!name) return { error: '契約名は必須です' }

  const base_hourly_rate = numOrNull(formData.get('base_hourly_rate'))
  const minimum_hours = numOrNull(formData.get('minimum_hours'))
  const overtime_hourly_rate = numOrNull(formData.get('overtime_hourly_rate'))
  const fixed_amount = numOrNull(formData.get('fixed_amount'))
  const start_date = String(formData.get('start_date') ?? '') || null
  const end_date = String(formData.get('end_date') ?? '') || null
  const withholding = formData.get('withholding') === 'on'

  const v = validate(billing_type, base_hourly_rate, minimum_hours, fixed_amount)
  if (v) return { error: v }

  const supabase = await createClient()
  const { error } = await supabase.from('contracts').update({
    name, billing_type, base_hourly_rate, minimum_hours, overtime_hourly_rate,
    fixed_amount, start_date, end_date, withholding, updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { error: '更新に失敗しました' }
  revalidatePath('/contracts')
  return { error: null }
}

export async function setContractActive(id: string, isActive: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from('contracts')
    .update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: '更新に失敗しました' }
  revalidatePath('/contracts')
  return { error: null }
}
