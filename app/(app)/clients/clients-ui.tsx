'use client'
import React from 'react'
import type { Client } from '@/lib/types'
import { createClientRecord, updateClientRecord, setClientActive } from './actions'
import { useEditor, Drawer, EditorShell, Field } from '@/components/drawer'
import { useToast } from '@/components/toast'
import { Icon } from '@/components/icon'

export function ClientsUI({ clients }: { clients: Client[] }) {
  const toast = useToast()
  const ed = useEditor()
  const [q, setQ] = React.useState('')

  const list = clients.filter((c) => c.name.includes(q) || (c.memo ?? '').includes(q))

  const handleSave = async (formData: FormData) => {
    const res = ed.mode === 'edit' && ed.record
      ? await updateClientRecord(String(ed.record.id), formData)
      : await createClientRecord(formData)
    if (!res.error) {
      ed.close()
      toast(ed.mode === 'edit' ? 'クライアントを更新しました' : 'クライアントを追加しました')
    }
    return res
  }

  const handleToggle = async (c: Client) => {
    const res = await setClientActive(c.id, !c.is_active)
    if (!res.error) toast(c.is_active ? `「${c.name}」を無効にしました` : `「${c.name}」を有効にしました`, 'info')
  }

  return (
    <>
      <div className="pagehead">
        <div><h1>クライアント</h1><p>業務委託先の管理。有効/無効で一覧の絞り込みに反映されます。</p></div>
        <div className="bar-actions">
          <button className="btn btn--primary" onClick={ed.openCreate}><Icon name="plus" size={16} />クライアントを追加</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="searchbox">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・メモで検索" />
        </div>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 'var(--small)' }}>{list.filter((c) => c.is_active).length}件が有効</span>
      </div>

      <div className="tablecard">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th style={{ width: '26%' }}>名前</th>
              <th>メモ</th>
              <th style={{ width: 90 }}>状態</th>
              <th style={{ width: 90 }} className="ar">操作</th>
            </tr></thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={4}>
                  <div className="empty"><div className="empty__icon"><Icon name="users" size={22} /></div><p>クライアントがいません</p></div>
                </td></tr>
              )}
              {list.map((c) => (
                <tr key={c.id} className={c.is_active ? '' : 'inactive-row'}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="dim" style={{ maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.memo || <span className="muted">—</span>}
                  </td>
                  <td>
                    <button className="toggle" data-on={String(c.is_active)} onClick={() => handleToggle(c)} title={c.is_active ? '有効' : '無効'} />
                  </td>
                  <td>
                    <div className="rowactions">
                      <button className="btn btn--icon btn--subtle" onClick={() => ed.openEdit(c as unknown as Record<string, unknown>)} title="編集">
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
        <Drawer title="クライアント" onClose={ed.close}>
          <ClientForm mode={ed.mode} record={ed.record ? ed.record as unknown as Client : null} onSave={handleSave} onCancel={ed.close} />
        </Drawer>
      )}
    </>
  )
}

function ClientForm({ mode, record, onSave, onCancel }: {
  mode: 'create' | 'edit' | null
  record: Client | null
  onSave: (fd: FormData) => Promise<{ error: string | null }>
  onCancel: () => void
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  const submit = async () => {
    if (!formRef.current) return
    setBusy(true); setError(null)
    const res = await onSave(new FormData(formRef.current))
    setBusy(false)
    if (res.error) setError(res.error)
  }

  return (
    <EditorShell mode={mode} title="クライアント" error={error} submitting={busy} onSubmit={submit} onCancel={onCancel}>
      <form ref={formRef} style={{ display: 'contents' }}>
        <Field label="名前" req full>
          <input className="input" name="name" defaultValue={record?.name ?? ''} placeholder="株式会社○○" autoFocus required />
        </Field>
        <Field label="メモ" hint="連絡方法・締め日など。任意。" full>
          <textarea className="textarea" name="memo" defaultValue={record?.memo ?? ''} placeholder="請求は月末締め翌月末払い 等" rows={3} />
        </Field>
      </form>
    </EditorShell>
  )
}
