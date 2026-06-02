'use client'
import React from 'react'
import type { WorkLog, Client, Contract } from '@/lib/types'
import { createWorkLog, updateWorkLog, deleteWorkLog } from './actions'
import { useEditor, Drawer, EditorShell, Field } from '@/components/drawer'
import { useToast } from '@/components/toast'
import { Icon } from '@/components/icon'
import { StatusChip } from '@/components/page-chrome'

const dateLabel = (d: string) => {
  const t = new Date(d + 'T00:00')
  const w = '日月火水木金土'[t.getDay()]
  return `${t.getMonth() + 1}/${t.getDate()}(${w})`
}
const CUR_YM = new Date().toISOString().slice(0, 7)

export function WorkLogsUI({ logs, clients, contracts }: { logs: WorkLog[]; clients: Client[]; contracts: Contract[] }) {
  const toast = useToast()
  const ed = useEditor()
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c.name]))
  const contractMap = Object.fromEntries(contracts.map((c) => [c.id, c.name]))

  const sorted = [...logs].sort((a, b) => a.work_date < b.work_date ? 1 : -1)

  const handleSave = async (formData: FormData) => {
    const res = ed.mode === 'edit' && ed.record
      ? await updateWorkLog(String(ed.record.id), formData)
      : await createWorkLog(formData)
    if (!res.error) { ed.close(); toast(ed.mode === 'edit' ? '稼働を更新しました' : '稼働を記録しました') }
    return res
  }

  const handleDelete = async (l: WorkLog) => {
    const res = await deleteWorkLog(l.id)
    if (!res.error) toast('稼働ログを削除しました', 'info')
  }

  return (
    <>
      <div className="pagehead">
        <div><h1>稼働ログ</h1><p>1行 = 1日 × 1契約。日付の降順で表示します。</p></div>
        <div className="bar-actions">
          <button className="btn btn--primary" onClick={ed.openCreate}><Icon name="plus" size={16} />稼働を記録</button>
        </div>
      </div>

      <div className="tablecard">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th style={{ width: 110 }}>日付</th>
              <th>クライアント / 契約</th>
              <th style={{ width: 80 }} className="ar">予定</th>
              <th style={{ width: 80 }} className="ar">実績</th>
              <th style={{ width: 90 }}>状態</th>
              <th>メモ</th>
              <th style={{ width: 90 }} className="ar">操作</th>
            </tr></thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={7}>
                  <div className="empty"><div className="empty__icon"><Icon name="clock" size={22} /></div><p>稼働ログがありません</p></div>
                </td></tr>
              )}
              {sorted.map((l) => (
                <tr key={l.id}>
                  <td className="num" style={{ fontWeight: 600 }}>{dateLabel(l.work_date)}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{contractMap[l.contract_id] ?? '—'}</div>
                    <div className="muted" style={{ fontSize: 'var(--small)' }}>{clientMap[l.client_id] ?? '—'}</div>
                  </td>
                  <td className="ar num dim">{l.planned_hours != null ? `${l.planned_hours}h` : '—'}</td>
                  <td className="ar num" style={{ fontWeight: 600 }}>{l.actual_hours != null ? `${l.actual_hours}h` : '—'}</td>
                  <td><StatusChip status={l.status} /></td>
                  <td className="dim" style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 'var(--small)' }}>
                    {l.memo || <span className="muted">—</span>}
                  </td>
                  <td>
                    <div className="rowactions">
                      <button className="btn btn--icon btn--subtle" onClick={() => ed.openEdit(l as unknown as Record<string, unknown>)} title="編集"><Icon name="edit" size={15} /></button>
                      <button className="btn btn--icon btn--danger" onClick={() => handleDelete(l)} title="削除"><Icon name="trash" size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {ed.open && (
        <Drawer title="稼働ログ" onClose={ed.close}>
          <WorkLogForm mode={ed.mode} record={ed.record ? ed.record as unknown as WorkLog : null} clients={clients} contracts={contracts} onSave={handleSave} onCancel={ed.close} />
        </Drawer>
      )}
    </>
  )
}

function WorkLogForm({ mode, record, clients, contracts, onSave, onCancel }: {
  mode: 'create' | 'edit' | null; record: WorkLog | null
  clients: Client[]; contracts: Contract[]
  onSave: (fd: FormData) => Promise<{ error: string | null }>; onCancel: () => void
}) {
  const [clientId, setClientId] = React.useState(record?.client_id ?? '')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  const contractOpts = contracts.filter((c) => c.client_id === clientId && (c.is_active || c.id === record?.contract_id))
  const activeClients = clients.filter((c) => c.is_active || c.id === record?.client_id)

  const submit = async () => {
    if (!formRef.current) return
    setBusy(true); setError(null)
    const res = await onSave(new FormData(formRef.current))
    setBusy(false)
    if (res.error) setError(res.error)
  }

  return (
    <EditorShell mode={mode} title="稼働" error={error} submitting={busy} onSubmit={submit} onCancel={onCancel}>
      <form ref={formRef} style={{ display: 'contents' }}>
        <Field label="日付" req>
          <input className="input" type="date" name="work_date" defaultValue={record?.work_date ?? CUR_YM + '-01'} required />
        </Field>
        <Field label="状態">
          <select className="select" name="status" defaultValue={record?.status ?? 'worked'}>
            <option value="planned">予定</option>
            <option value="worked">稼働済</option>
            <option value="billed">請求済</option>
          </select>
        </Field>
        <Field label="クライアント" req>
          <select className="select" name="client_id" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">選択してください</option>
            {activeClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="契約" req hint={!clientId ? '先にクライアントを選択' : undefined}>
          <select className="select" name="contract_id" defaultValue={record?.contract_id ?? ''} disabled={!clientId} required>
            <option value="">{clientId ? '選択してください' : '—'}</option>
            {contractOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="予定時間（h）">
          <input className="input num" type="number" name="planned_hours" defaultValue={record?.planned_hours ?? ''} step="0.5" placeholder="6" />
        </Field>
        <Field label="実績時間（h）">
          <input className="input num" type="number" name="actual_hours" defaultValue={record?.actual_hours ?? ''} step="0.5" placeholder="6" />
        </Field>
        <Field label="メモ" full>
          <input className="input" name="memo" defaultValue={record?.memo ?? ''} placeholder="作業内容など（任意）" />
        </Field>
      </form>
    </EditorShell>
  )
}
