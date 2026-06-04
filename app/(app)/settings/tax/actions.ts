'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function upsertTaxSettings(formData: FormData) {
  const num = (key: string, fallback: number) => {
    const v = formData.get(key)
    if (v == null || String(v).trim() === '') return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  const filing_type = String(formData.get('filing_type') ?? 'blue') === 'white' ? 'white' : 'blue'
  const row = {
    filing_type,
    blue_deduction: num('blue_deduction', 650000),
    basic_deduction_income: num('basic_deduction_income', 480000),
    basic_deduction_resident: num('basic_deduction_resident', 430000),
    national_pension_annual: num('national_pension_annual', 204000),
    health_insurance_rate: num('health_insurance_rate', 0.10),
    health_insurance_fixed: num('health_insurance_fixed', 50000),
    resident_tax_rate: num('resident_tax_rate', 0.10),
    resident_tax_fixed: num('resident_tax_fixed', 5000),
    other_deductions: num('other_deductions', 0),
  }

  const supabase = await createClient()
  const { data: existing } = await supabase.from('tax_settings').select('id').limit(1).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('tax_settings')
      .update({ ...row, updated_at: new Date().toISOString() }).eq('id', existing.id)
    if (error) return { error: '保存に失敗しました' }
  } else {
    const { error } = await supabase.from('tax_settings').insert(row)
    if (error) return { error: '保存に失敗しました' }
  }
  revalidatePath('/settings/tax')
  revalidatePath('/tax')
  return { error: null }
}
