'use client'
import React from 'react'
import type { Expense } from '@/lib/types'
import { createExpense, updateExpense, deleteExpense, copyRecurringFromPrevMonth } from './actions'
import { useEditor, Drawer, EditorShell, Field } from '@/components/drawer'
import { useToast } from '@/components/toast'
import { Icon } from '@/components/icon'

const EXP_CATS = ['wifi', 'rent', 'mobile', 'saas', 'travel', 'book', 'tax']
const CAT_LABEL: Record<string, string> = { wifi: '通信(WiFi)', rent: '家賃', mobile: '携帯', saas: 'SaaS', travel: '交通費', book: '書籍', tax: '税理士' }

function shiftYm(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function prevYm(ym: string) { return shiftYm(ym, -1) }
function ymLabel(ym: string) { const [y, m] = ym.split('-'); return `${y}年${Number(m)}月` }
function dateLabel(d: string) { const t = new Date(d + 'T00:00'); const w = '日月火水木金土'[t.getDay()]; return `${t.getMonth() + 1}/${t.getDate()}(${w})` }
const CUR_YM = new Date().toISOString().slice(0, 7)

export function ExpensesUI({ expenses }: { expenses: Expense[] }) {
  const toast = useToast()
  const ed = useEditor()
  const [ym, setYm] = React.useState(CUR_YM)

  const list = expenses.filter((e) => e.expense_date.startsWith(ym)).sort((a, b) => a.expense_date < b.expense_date ? 1 : -1)
  const total = list.reduce((s, e) => s + (e.allocated_amount ?? 0), 0)

  const handleSave = async (formData: FormData) => {
    const res = ed.mode === 'edit' && ed.record
      ? await updateExpense(String(ed.record.id), formData)
      : await createExpense(formData)
    if (!res.error) { ed.close(); toast(ed.mode === 'edit' ? '経費を更新しました' : '経費を追加しました') }
    return res
  }

  const doCopy = async () => {
    const res = await copyRecurringFromPrevMonth(ym)
    if (res.error) toast(res.error, 'err')
    else toast(`前月(${ymLabel(prevYm(ym))})の定期経費を複製しました`)
  }

  return (
    <>
      <div className="pagehead">
        <div><h1>経費</h1><p>計上額 = 金額 × 按分率。定期経費は前月から複製できます。</p></div>
        <div className="bar-actions">
          <button className="btn btn--primary" onClick={ed.openCreate}><Icon name="plus" size={16} />経費を追加</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="ymselect">
          <button className="nav" onClick={() => setYm(shiftYm(ym, -1))} aria-label="前月"><Icon name="chevL" size={16} /></button>
          <span className="cur num">{ymLabel(ym)}</span>
          <button className="nav" onClick={() => setYm(shiftYm(ym, 1))} aria-label="翌月"><Icon name="chevR" size={16} /></button>
        </div>
        <span className="spacer" />
        <button className="btn btn--ghost" onClick={doCopy}><Icon name="copy" size={15} />先月の定期経費を複製</button>
      </div>

      <div className="tablecard">
        <div className="tablecard__head">
          <h2>{ymLabel(ym)}の経費</h2>
          <span className="count">{list.length}件</span>
          <span className="spacer" />
          <span className="dim" style={{ fontSize: 'var(--small)' }}>計上額合計</span>
          <span className="num yen" style={{ fontWeight: 700, fontSize: 'var(--h2)' }}>{total.toLocaleString('ja-JP')}</span>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th style={{ width: 110 }}>日付</th>
              <th>カテゴリ</th>
              <th className="ar" style={{ width: 110 }}>金額</th>
              <th className="ar" style={{ width: 80 }}>按分率</th>
              <th className="ar" style={{ width: 120 }}>計上額</th>
              <th style={{ width: 80 }}>定期</th>
              <th style={{ width: 90 }} className="ar">操作</th>
            </tr></thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={7}>
                  <div className="empty"><div className="empty__icon"><Icon name="wallet" size={22} /></div><p>{ymLabel(ym)}の経費はありません</p></div>
                </td></tr>
              )}
              {list.map((e) => (
                <tr key={e.id}>
                  <td className="num" style={{ fontWeight: 600 }}>{dateLabel(e.expense_date)}</td>
                  <td>
                    <span className="chip">{CAT_LABEL[e.category] ?? e.category}</span>
                    {e.memo && <span className="muted" style={{ fontSize: 'var(--small)', marginLeft: 6 }}>{e.memo}</span>}
                  </td>
                  <td className="ar num yen">{Math.round(e.amount).toLocaleString('ja-JP')}</td>
                  <td className="ar num dim">{Math.round((e.allocation_rate ?? 1) * 100)}%</td>
                  <td className="ar num yen" style={{ fontWeight: 700 }}>{Math.round(e.allocated_amount ?? 0).toLocaleString('ja-JP')}</td>
                  <td>{e.is_recurring ? <span className="chip chip--accent chip--dot">定期</span> : <span className="muted">—</span>}</td>
                  <td>
                    <div className="rowactions">
                      <button className="btn btn--icon btn--subtle" onClick={() => ed.openEdit(e as unknown as Record<string, unknown>)} title="編集"><Icon name="edit" size={15} /></button>
                      <button className="btn btn--icon btn--danger" onClick={async () => { const r = await deleteExpense(e.id); if (!r.error) toast('経費を削除しました', 'info') }} title="削除"><Icon name="trash" size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {ed.open && (
        <Drawer title="経費" onClose={ed.close}>
          <ExpenseForm mode={ed.mode} record={ed.record ? ed.record as unknown as Expense : null} defaultYm={ym} onSave={handleSave} onCancel={ed.close} />
        </Drawer>
      )}
    </>
  )
}

function ExpenseForm({ mode, record, defaultYm, onSave, onCancel }: {
  mode: 'create' | 'edit' | null; record: Expense | null; defaultYm: string
  onSave: (fd: FormData) => Promise<{ error: string | null }>; onCancel: () => void
}) {
  const [amount, setAmount] = React.useState(record?.amount ?? 0)
  const [rate, setRate] = React.useState(record?.allocation_rate ?? 1)
  const [isRecurring, setIsRecurring] = React.useState(record?.is_recurring ?? false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)
  const preview = Math.round((Number(amount) || 0) * (Number(rate) || 0))

  const submit = async () => {
    if (!formRef.current) return
    setBusy(true); setError(null)
    const fd = new FormData(formRef.current)
    // is_recurring as checkbox default 'on' when checked
    if (!isRecurring) fd.delete('is_recurring')
    const res = await onSave(fd)
    setBusy(false)
    if (res.error) setError(res.error)
  }

  return (
    <EditorShell mode={mode} title="経費" error={error} submitting={busy} onSubmit={submit} onCancel={onCancel}>
      <form ref={formRef} style={{ display: 'contents' }}>
        <Field label="日付" req>
          <input className="input" type="date" name="expense_date" defaultValue={record?.expense_date ?? defaultYm + '-01'} required />
        </Field>
        <Field label="カテゴリ" req hint="自由入力（候補から選択も可）">
          <input className="input" name="category" list="exp-cats" defaultValue={record?.category ?? ''} placeholder="wifi / rent / mobile …" required />
          <datalist id="exp-cats">{EXP_CATS.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}</datalist>
        </Field>
        <Field label="金額（円）" req>
          <input className="input num" type="number" name="amount" value={amount} onChange={(e) => setAmount(Number(e.target.value))} placeholder="5500" required />
        </Field>
        <Field label="按分率（0〜1）" hint="既定 1（全額計上）">
          <input className="input num" type="number" name="allocation_rate" value={rate} onChange={(e) => setRate(Number(e.target.value))} step="0.1" min="0" max="1" />
        </Field>
        <Field label="計上額（表示のみ）" full>
          <div className="input" style={{ background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-dim)' }}>
            <span style={{ fontSize: 'var(--small)' }}>金額 × 按分率</span>
            <span className="num yen" style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--h2)' }}>{preview.toLocaleString('ja-JP')}</span>
          </div>
        </Field>
        <Field full>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 'var(--base)', color: 'var(--text)' }}>
            <button type="button" className="toggle" data-on={String(isRecurring)} onClick={() => setIsRecurring(!isRecurring)} aria-pressed={isRecurring} />
            定期経費（毎月発生。翌月に複製対象）
            {isRecurring && <input type="hidden" name="is_recurring" value="on" />}
          </label>
        </Field>
        <Field label="メモ" full>
          <input className="input" name="memo" defaultValue={record?.memo ?? ''} placeholder="任意" />
        </Field>
      </form>
    </EditorShell>
  )
}
