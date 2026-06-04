'use client'
import React from 'react'
import Link from 'next/link'
import { Icon } from '@/components/icon'
import { calculateTax, type TaxParams } from '@/lib/tax'

interface Props {
  year: number
  annualRevenue: number
  annualExpense: number
  params: TaxParams
}

const yen = (n: number) => Math.round(n).toLocaleString('ja-JP')

export function TaxUI({ year, annualRevenue, annualExpense, params }: Props) {
  // what-if 用の一時上書き（保存しない）
  const [revenue, setRevenue] = React.useState(annualRevenue)
  const [expense, setExpense] = React.useState(annualExpense)
  const [filingType, setFilingType] = React.useState(params.filingType)
  const [otherDeductions, setOtherDeductions] = React.useState(params.otherDeductions)

  const result = React.useMemo(
    () => calculateTax({
      annualRevenue: revenue,
      annualExpense: expense,
      params: { ...params, filingType, otherDeductions },
    }),
    [revenue, expense, filingType, otherDeductions, params],
  )

  const dirty = revenue !== annualRevenue || expense !== annualExpense
    || filingType !== params.filingType || otherDeductions !== params.otherDeductions

  const rows: [string, number][] = [
    ['事業所得', result.businessIncome],
    ['国民年金', result.nationalPension],
    ['国民健康保険', result.healthInsurance],
    ['課税所得（所得税）', result.taxableIncomeIncomeTax],
    ['所得税（復興税込み）', result.incomeTax],
    ['課税所得（住民税）', result.taxableIncomeResident],
    ['住民税', result.residentTax],
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

      <div className="errbox" style={{ marginBottom: 16 }}>
        概算です。正確な税額・保険料は税理士・自治体にご確認ください。
      </div>

      {/* what-if 入力 */}
      <div className="tablecard" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
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
            <select className="select" value={filingType}
              onChange={(e) => setFilingType(e.target.value === 'white' ? 'white' : 'blue')}>
              <option value="blue">青色申告</option>
              <option value="white">白色申告</option>
            </select>
          </div>
          <div className="field">
            <label>その他所得控除</label>
            <input className="input num" type="number" value={otherDeductions}
              onChange={(e) => setOtherDeductions(Number(e.target.value) || 0)} />
          </div>
        </div>
        <p style={{ fontSize: 'var(--small)', color: 'var(--text-faint)', marginTop: 12 }}>
          ここでの変更は保存されません（お試し計算）。確定値は
          <Link href="/settings/tax" style={{ textDecoration: 'underline', margin: '0 4px' }}>税試算パラメータ設定</Link>
          で編集してください。{dirty && '（現在お試し値で計算中）'}
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
            </tbody>
          </table>
        </div>
      </div>

      {/* 手取り + 取り置き目安 — 3 cards: override .summary-totals 2-col grid inline */}
      <div className="summary-totals" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="card totalcard totalcard--accent">
          <span className="lbl">年間手取り（可処分）</span>
          <span className="big num yen">{yen(result.netIncome)}</span>
          <span className="sub">売上 − 経費 − 税・保険合計</span>
        </div>
        <div className="card totalcard">
          <span className="lbl">毎月の取り置き目安</span>
          <span className="big num yen">{yen(result.reserve.monthlyReserve)}</span>
          <span className="sub">税・保険用に毎月確保（売上の約{Math.round(result.reserve.reserveRate * 100)}%）</span>
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
