'use client'
import React from 'react'
import type { Client, Contract } from '@/lib/types'
import { createContract, updateContract, setContractActive } from './actions'
import { useEditor, Drawer, EditorShell, Field } from '@/components/drawer'
import { useToast } from '@/components/toast'
import { Icon } from '@/components/icon'
import { BillingChip } from '@/components/page-chrome'
import { CustomSelect } from '@/components/custom-select'

type BT = 'hourly' | 'monthly_minimum' | 'fixed'

export function ContractsUI({ contracts, clients }: { contracts: Contract[]; clients: Client[] }) {
  const toast = useToast()
  const ed = useEditor()

  const condText = (c: Contract) => {
    if (c.billing_type === 'hourly') return `時給 ¥${(c.base_hourly_rate ?? 0).toLocaleString('ja-JP')}`
    if (c.billing_type === 'monthly_minimum') return `最低${c.minimum_hours}h・¥${(c.base_hourly_rate ?? 0).toLocaleString('ja-JP')}/h${c.overtime_hourly_rate ? `・超過¥${c.overtime_hourly_rate.toLocaleString('ja-JP')}` : ''}`
    return `固定 ¥${(c.fixed_amount ?? 0).toLocaleString('ja-JP')}`
  }

  const handleSave = async (formData: FormData) => {
    const res = ed.mode === 'edit' && ed.record
      ? await updateContract(String(ed.record.id), formData)
      : await createContract(formData)
    if (!res.error) { ed.close(); toast(ed.mode === 'edit' ? '契約を更新しました' : '契約を追加しました') }
    return res
  }

  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c.name]))

  return (
    <>
      <div className="pagehead">
        <div><h1>契約条件</h1><p>クライアントごとの請求条件。請求形態で入力項目が切り替わります。</p></div>
        <div className="bar-actions">
          <button className="btn btn--primary" onClick={ed.openCreate}><Icon name="plus" size={16} />契約を追加</button>
        </div>
      </div>

      <div className="tablecard">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>クライアント / 契約名</th>
              <th style={{ width: 130 }}>請求形態</th>
              <th>条件</th>
              <th style={{ width: 80 }}>状態</th>
              <th style={{ width: 70 }} className="ar">操作</th>
            </tr></thead>
            <tbody>
              {contracts.length === 0 && (
                <tr><td colSpan={5}>
                  <div className="empty"><div className="empty__icon"><Icon name="doc" size={22} /></div><p>契約がありません</p></div>
                </td></tr>
              )}
              {contracts.map((c) => (
                <tr key={c.id} className={c.is_active ? '' : 'inactive-row'}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: 'var(--small)' }}>{clientMap[c.client_id] ?? '—'}</div>
                  </td>
                  <td><BillingChip type={c.billing_type} /></td>
                  <td className="num dim" style={{ fontSize: 'var(--small)' }}>{condText(c)}</td>
                  <td>
                    <button className="toggle" data-on={String(c.is_active)} onClick={async () => {
                      const res = await setContractActive(c.id, !c.is_active)
                      if (!res.error) toast(c.is_active ? '契約を無効にしました' : '契約を有効にしました', 'info')
                    }} />
                  </td>
                  <td>
                    <div className="rowactions">
                      <button className="btn btn--icon btn--subtle" onClick={() => ed.openEdit(c as unknown as Record<string, unknown>)}>
                        <Icon name="edit" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {ed.open && (
        <Drawer title="契約条件" onClose={ed.close}>
          <ContractForm mode={ed.mode} record={ed.record ? ed.record as unknown as Contract : null} clients={clients} onSave={handleSave} onCancel={ed.close} />
        </Drawer>
      )}
    </>
  )
}

function ContractForm({ mode, record, clients, onSave, onCancel }: {
  mode: 'create' | 'edit' | null; record: Contract | null; clients: Client[]
  onSave: (fd: FormData) => Promise<{ error: string | null }>; onCancel: () => void
}) {
  const [bt, setBt] = React.useState<BT>((record?.billing_type as BT) ?? 'hourly')
  const [clientId, setClientId] = React.useState(record?.client_id ?? '')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)
  const activeClients = clients.filter((c) => c.is_active || c.id === record?.client_id)

  const submit = async () => {
    if (!formRef.current) return
    setBusy(true); setError(null)
    const fd = new FormData(formRef.current)
    fd.set('billing_type', bt)
    const res = await onSave(fd)
    setBusy(false)
    if (res.error) setError(res.error)
  }

  return (
    <EditorShell mode={mode} title="契約条件" error={error} submitting={busy} onSubmit={submit} onCancel={onCancel}>
      <form ref={formRef} style={{ display: 'contents' }}>
        <Field label="クライアント" req>
          <CustomSelect
            name="client_id"
            value={clientId}
            onChange={(v) => setClientId(v)}
            placeholder="選択してください"
            options={activeClients.map((c) => ({ value: c.id, label: c.name + (c.is_active ? '' : '（無効）') }))}
          />
        </Field>
        <Field label="契約名" req>
          <input className="input" name="name" defaultValue={record?.name ?? ''} placeholder="Webアプリ開発 等" required />
        </Field>
        <Field label="請求形態" req full>
          <CustomSelect
            value={bt}
            onChange={(v) => setBt(v as BT)}
            options={[
              { value: 'hourly', label: '時給制' },
              { value: 'monthly_minimum', label: '月間最低保証' },
              { value: 'fixed', label: '固定報酬' },
            ]}
          />
        </Field>
        {bt === 'hourly' && (
          <Field label="基本時給（円）" req>
            <input className="input num" type="number" name="base_hourly_rate" defaultValue={record?.base_hourly_rate ?? ''} placeholder="6000" />
          </Field>
        )}
        {bt === 'monthly_minimum' && (<>
          <Field label="最低保証時間（h）" req>
            <input className="input num" type="number" name="minimum_hours" defaultValue={record?.minimum_hours ?? ''} placeholder="40" />
          </Field>
          <Field label="基本時給（円）" req>
            <input className="input num" type="number" name="base_hourly_rate" defaultValue={record?.base_hourly_rate ?? ''} placeholder="5500" />
          </Field>
          <Field label="超過時給（円）" hint="任意。未入力なら基本時給を適用。">
            <input className="input num" type="number" name="overtime_hourly_rate" defaultValue={record?.overtime_hourly_rate ?? ''} placeholder="6500" />
          </Field>
        </>)}
        {bt === 'fixed' && (
          <Field label="固定報酬額（円）" req>
            <input className="input num" type="number" name="fixed_amount" defaultValue={record?.fixed_amount ?? ''} placeholder="480000" />
          </Field>
        )}
        <Field label="開始日">
          <input className="input" type="date" name="start_date" defaultValue={record?.start_date ?? ''} />
        </Field>
        <Field label="終了日" hint="未入力なら継続中">
          <input className="input" type="date" name="end_date" defaultValue={record?.end_date ?? ''} />
        </Field>
      </form>
    </EditorShell>
  )
}
