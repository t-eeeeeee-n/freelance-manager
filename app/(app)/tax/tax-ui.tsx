'use client'
import React from 'react'
import Link from 'next/link'
import { Icon } from '@/components/icon'
import { CustomSelect } from '@/components/custom-select'
import { calculateTax, type TaxParams } from '@/lib/tax'

interface Props {
  year: number
  actualRevenue: number
  projectedRevenue: number
  annualExpense: number
  params: TaxParams
  withholdingActual: number
  withholdingProjected: number
  employmentType: 'freelance' | 'salaried'
  salaryIncome: number
}

const yen = (n: number) => Math.round(n).toLocaleString('ja-JP')

export function TaxUI({ year, actualRevenue, projectedRevenue, annualExpense, params, withholdingActual, withholdingProjected, employmentType, salaryIncome }: Props) {
  // what-if 用の一時上書き（保存しない）
  const [basis, setBasis] = React.useState<'actual' | 'projected'>('projected')
  const basisRevenue = basis === 'projected' ? projectedRevenue : actualRevenue
  const basisWithholding = basis === 'projected' ? withholdingProjected : withholdingActual
  const [revenue, setRevenue] = React.useState(basisRevenue)
  const [expense, setExpense] = React.useState(annualExpense)
  const [filingType, setFilingType] = React.useState(params.filingType)
  const [otherDeductions, setOtherDeductions] = React.useState(params.otherDeductions)
  const [empType, setEmpType] = React.useState<'freelance' | 'salaried'>(employmentType)
  const [salaryRev, setSalaryRev] = React.useState(salaryIncome)

  const onBasis = (b: 'actual' | 'projected') => {
    setBasis(b)
    setRevenue(b === 'projected' ? projectedRevenue : actualRevenue)
  }

  const result = React.useMemo(
    () => calculateTax({
      annualRevenue: revenue,
      annualExpense: expense,
      annualWithholding: basisWithholding,
      params: { ...params, filingType, otherDeductions },
      employmentType: empType,
      salaryIncome: salaryRev,
    }),
    [revenue, expense, filingType, otherDeductions, params, basisWithholding, empType, salaryRev],
  )

  const dirty = revenue !== basisRevenue || expense !== annualExpense
    || filingType !== params.filingType || otherDeductions !== params.otherDeductions
    || empType !== employmentType || salaryRev !== salaryIncome

  const rows: [string, number][] = empType === 'salaried'
    ? [
        ['給与所得', result.salaryEarnings],
        ['事業所得（副業）', result.businessIncome],
        ['副業による追加所得税', result.incomeTax],
        ['副業による追加住民税', result.residentTax],
        ['源泉徴収（前払い所得税）', result.withholding],
      ]
    : [
        ['事業所得', result.businessIncome],
        ['国民年金', result.nationalPension],
        ['国民健康保険', result.healthInsurance],
        ['課税所得（所得税）', result.taxableIncomeIncomeTax],
        ['所得税（復興税込み）', result.incomeTax],
        ['課税所得（住民税）', result.taxableIncomeResident],
        ['住民税', result.residentTax],
        ['源泉徴収（前払い所得税）', result.withholding],
      ]

  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>年間手取り試算</h1><p>対象年の売上・経費から税・保険・手取りを概算します。</p></div>
        <div className="ymselect">
          <Link href={`/tax?y=${year - 1}`} className="nav" aria-label="前年"><Icon name="chevL" size={16} /></Link>
          <span className="cur num">{year}年</span>
          <Link href={`/tax?y=${year + 1}`} className="nav" aria-label="翌年"><Icon name="chevR" size={16} /></Link>
        </div>
      </div>

      <div className="ctabs" style={{ marginBottom: 16 }}>
        <button className="ctab" data-active={String(basis === 'projected')} onClick={() => onBasis('projected')}>着地見込み</button>
        <button className="ctab" data-active={String(basis === 'actual')} onClick={() => onBasis('actual')}>実績(YTD)</button>
      </div>

      <div className="errbox" style={{ marginBottom: 16 }}>
        概算です。正確な税額・保険料は税理士・自治体にご確認ください。
      </div>

      {/* what-if 入力 */}
      <div className="tablecard" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="field">
            <label>就業形態</label>
            <CustomSelect value={empType}
              onChange={(v) => setEmpType(v as 'freelance' | 'salaried')}
              options={[
                { value: 'freelance', label: '専業フリーランス' },
                { value: 'salaried', label: '給与あり（副業）' },
              ]} />
          </div>
          <div className="field">
            <label>年間売上（お試し上書き）</label>
            <input className="input num" type="number" value={revenue}
              onChange={(e) => setRevenue(Number(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>年間経費（お試し上書き）</label>
            <input className="input num" type="number" value={expense}
              onChange={(e) => setExpense(Number(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>申告区分</label>
            <CustomSelect value={filingType}
              onChange={(v) => setFilingType(v === 'white' ? 'white' : 'blue')}
              options={[{ value: 'blue', label: '青色申告' }, { value: 'white', label: '白色申告' }]} />
          </div>
          <div className="field">
            <label>その他所得控除</label>
            <input className="input num" type="number" value={otherDeductions}
              onChange={(e) => setOtherDeductions(Number(e.target.value) || 0)} />
          </div>
          {empType === 'salaried' && (
            <div className="field">
              <label>本業の給与収入（お試し上書き）</label>
              <input className="input num" type="number" value={salaryRev}
                onChange={(e) => setSalaryRev(Number(e.target.value) || 0)} />
            </div>
          )}
        </div>
        <p style={{ fontSize: 'var(--small)', color: 'var(--text-faint)', marginTop: 12 }}>
          ここでの変更は保存されません（お試し計算）。確定値は
          <Link href="/settings/tax" style={{ textDecoration: 'underline', margin: '0 4px' }}>税試算パラメータ設定</Link>
          で編集してください。{dirty && '（現在お試し値で計算中）'}
        </p>
        <p style={{ fontSize: 'var(--small)', color: 'var(--text-faint)', marginTop: 6 }}>
          着地見込みは売上のみ年換算し、経費・源泉徴収は実績ベースです。そのため年の途中ほど税・取り置きは高め（取りすぎ方向）に出ます。売上を手動上書きしても源泉年額は基準値のまま固定です。
          {empType === 'salaried' && ' 給与ありモード: 副業分の追加税のみ表示。本業の年末調整済み税額は含みません。'}
        </p>
      </div>

      {/* 内訳 */}
      <div className="tablecard">
        <div className="tablewrap">
          <table className="tbl">
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="ar num yen">{yen(value)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                <td style={{ fontWeight: 700 }}>税・保険合計</td>
                <td className="ar num yen" style={{ fontWeight: 800 }}>{yen(result.totalTaxAndInsurance)}</td>
              </tr>
              {result.withholding > 0 && (
                <tr>
                  <td style={{ fontWeight: 600 }}>{result.incomeTaxRefund > 0 ? '還付見込み' : '確定申告での追加納付'}</td>
                  <td className="ar num yen" style={{ fontWeight: 700, color: result.incomeTaxRefund > 0 ? 'var(--pos)' : 'inherit' }}>
                    {result.incomeTaxRefund > 0 ? yen(result.incomeTaxRefund) : yen(result.incomeTaxDue)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 手取り + 取り置き目安 — 3 cards: override .summary-totals 2-col grid inline */}
      <div className="summary-totals summary-totals--three">
        <div className="card totalcard totalcard--accent">
          <span className="lbl">年間手取り（可処分）</span>
          <span className="big num yen">{yen(result.netIncome)}</span>
          <span className="sub">売上 − 経費 − 税・保険合計</span>
        </div>
        <div className="card totalcard">
          <span className="lbl">毎月の取り置き目安</span>
          <span className="big num yen">{yen(result.reserve.monthlyReserve)}</span>
          <span className="sub">税・保険用に毎月確保（源泉控除後・売上の約{Math.round(result.reserve.reserveRate * 100)}%）</span>
        </div>
        <div className="card totalcard">
          <span className="lbl">月に使っていい手取り</span>
          <span className="big num yen">{yen(result.reserve.monthlyDisposable)}</span>
          <span className="sub">手取り ÷ 12 の目安</span>
        </div>
      </div>
    </div>
  )
}
