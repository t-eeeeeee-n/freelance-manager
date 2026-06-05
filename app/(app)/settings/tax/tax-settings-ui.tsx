'use client'
import React from 'react'
import { upsertTaxSettings } from './actions'
import { useToast } from '@/components/toast'
import { CustomSelect } from '@/components/custom-select'
import type { TaxSettings } from '@/lib/types'

const D = {
  blue_deduction: 650000, basic_deduction_income: 480000, basic_deduction_resident: 430000,
  national_pension_annual: 204000, health_insurance_rate: 0.10, health_insurance_fixed: 50000,
  resident_tax_rate: 0.10, resident_tax_fixed: 5000, other_deductions: 0,
}

export function TaxSettingsUI({ settings }: { settings: TaxSettings | null }) {
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [filingType, setFilingType] = React.useState(settings?.filing_type ?? 'blue')
  const formRef = React.useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formRef.current) return
    setBusy(true); setError(null)
    const res = await upsertTaxSettings(new FormData(formRef.current))
    setBusy(false)
    if (res.error) setError(res.error)
    else toast('税試算パラメータを保存しました')
  }

  const numField = (name: keyof typeof D, label: string, hint?: string, step = '1') => (
    <div className="field">
      <label>{label}</label>
      <input className="input num" type="number" step={step} name={name}
        defaultValue={String(settings?.[name as keyof TaxSettings] ?? D[name])} />
      {hint && <span style={{ fontSize: 'var(--small)', color: 'var(--text-faint)' }}>{hint}</span>}
    </div>
  )

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ maxWidth: 520 }}>
      {error && <div className="errbox" style={{ marginBottom: 16 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="field">
          <label>申告区分</label>
          <CustomSelect name="filing_type" value={filingType}
            onChange={(v) => setFilingType(v as 'blue' | 'white')}
            options={[{ value: 'blue', label: '青色申告' }, { value: 'white', label: '白色申告' }]} />
        </div>
        {numField('blue_deduction', '青色申告特別控除', '0 / 10万 / 55万 / 65万')}
        {numField('basic_deduction_income', '基礎控除（所得税）')}
        {numField('basic_deduction_resident', '基礎控除（住民税）')}
        {numField('national_pension_annual', '国民年金（年額）')}
        {numField('health_insurance_rate', '国保 所得比例分の率', '自治体差が大きい概算', '0.01')}
        {numField('health_insurance_fixed', '国保 定額分（均等割等）')}
        {numField('resident_tax_rate', '住民税 所得割の率', undefined, '0.01')}
        {numField('resident_tax_fixed', '住民税 均等割（定額）')}
        {numField('other_deductions', 'その他所得控除', 'iDeCo・小規模企業共済など')}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </form>
  )
}
