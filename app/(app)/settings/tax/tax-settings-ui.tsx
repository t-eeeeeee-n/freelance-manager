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
  const [employmentType, setEmploymentType] = React.useState<'freelance' | 'salaried'>(settings?.employment_type ?? 'freelance')
  const [salaryIncome, setSalaryIncome] = React.useState(settings?.salary_income ?? 0)
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
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: 'var(--small)', color: 'var(--text-dim)', lineHeight: 1.7 }}>
          ここは<strong>税金の計算ルール</strong>の設定です。売上・経費はここには入れません（試算画面で「対象年」の記録から自動集計されます）。<br />
          {employmentType === 'salaried'
            ? <>給与ありモード: <strong>国保・国民年金は除外</strong>し、副業分の追加所得税・住民税のみ算出します。本業の給与収入を入力してください。</>
            : <>専業モード: 基本はデフォルトのまま。「申告区分」「その他控除（iDeCo等）」、こだわるなら「国保率」を自分に合わせてください。</>}
        </div>
        <div className="field">
          <label>就業形態</label>
          <CustomSelect name="employment_type" value={employmentType}
            onChange={(v) => setEmploymentType(v as 'freelance' | 'salaried')}
            options={[
              { value: 'freelance', label: '専業フリーランス' },
              { value: 'salaried', label: '給与あり（副業）' },
            ]} />
          <span style={{ fontSize: 'var(--small)', color: 'var(--text-faint)' }}>
            給与ありの場合、国保・年金は除外し副業分の追加税のみ算出します
          </span>
        </div>
        <div className="field">
          <label>申告区分</label>
          <CustomSelect name="filing_type" value={filingType}
            onChange={(v) => setFilingType(v as 'blue' | 'white')}
            options={[{ value: 'blue', label: '青色申告' }, { value: 'white', label: '白色申告' }]} />
          <span style={{ fontSize: 'var(--small)', color: 'var(--text-faint)' }}>青色（複式簿記+e-Taxで65万控除）か白色か</span>
        </div>
        {employmentType === 'salaried' && (
          <div className="field">
            <label>本業の給与収入（年収見込み）</label>
            <input className="input num" type="number" name="salary_income"
              value={salaryIncome} onChange={(e) => setSalaryIncome(Number(e.target.value) || 0)} />
            <span style={{ fontSize: 'var(--small)', color: 'var(--text-faint)' }}>
              昨年の源泉徴収票「支払金額」が目安。なければ月給 × 12（＋賞与）の概算でも可
            </span>
          </div>
        )}
        {numField('blue_deduction', '青色申告特別控除', '青色: 65万/55万/10万 ・ 白色: 0')}
        {numField('basic_deduction_income', '基礎控除（所得税）', '法定値。通常そのまま')}
        {numField('basic_deduction_resident', '基礎控除（住民税）', '法定値。通常そのまま')}
        {numField('national_pension_annual', '国民年金（年額）', '年額の概算。通常そのまま')}
        {numField('health_insurance_rate', '国保 所得比例分の率', '自治体差大。市区町村の料率に合わせると精度↑', '0.01')}
        {numField('health_insurance_fixed', '国保 定額分（均等割等）', '自治体差あり・概算')}
        {numField('resident_tax_rate', '住民税 所得割の率', '概ね10%。通常そのまま', '0.01')}
        {numField('resident_tax_fixed', '住民税 均等割（定額）', '概ね5,000円')}
        {numField('other_deductions', 'その他所得控除', 'iDeCo・小規模企業共済・各種保険料控除など年額。無ければ0')}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </form>
  )
}
