'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import type { WorkLog, Contract, Client, WorkLogStatus } from '@/lib/types'
import { createWorkLog, updateWorkLog, deleteWorkLog } from './actions'
import { useToast } from '@/components/toast'
import { Icon } from '@/components/icon'
import { StatusChip } from '@/components/page-chrome'
import { CustomSelect } from '@/components/custom-select'
import { CustomTimePicker } from '@/components/custom-time-picker'
import { CustomDatePicker } from '@/components/custom-date-picker'

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function calcHours(start: string, end: string, breakMins: number) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let total = (eh * 60 + em) - (sh * 60 + sm) - breakMins
  if (total <= 0) total += 24 * 60
  if (total <= 0) return null
  return Math.round(total / 6) / 10
}

export function WorkLogsUI({ logs, contracts, clients }: { logs: WorkLog[]; contracts: Contract[]; clients: Client[] }) {
  const toast = useToast()
  const router = useRouter()
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]))
  const [activeContractId, setActiveContractId] = React.useState(contracts[0]?.id ?? '')
  const [showForm, setShowForm] = React.useState(false)
  const [editingLog, setEditingLog] = React.useState<WorkLog | null>(null)

  const activeContract = contracts.find(c => c.id === activeContractId)
  const contractLogs = logs.filter(l => l.contract_id === activeContractId)
    .sort((a, b) => a.work_date < b.work_date ? 1 : -1)

  // Switch tabs: close form and editing
  const switchTab = (contractId: string) => {
    setActiveContractId(contractId)
    setShowForm(false)
    setEditingLog(null)
  }

  const handleSave = async (formData: FormData) => {
    const res = await createWorkLog(formData)
    if (!res.error) {
      setShowForm(false)
      toast('稼働を記録しました')
      router.refresh()
    } else {
      toast(res.error, 'err')
    }
  }

  const handleUpdate = async (id: string, formData: FormData) => {
    const res = await updateWorkLog(id, formData)
    if (!res.error) {
      setEditingLog(null)
      toast('稼働を更新しました')
      router.refresh()
    } else {
      toast(res.error, 'err')
    }
  }

  const handleDelete = async (l: WorkLog) => {
    const res = await deleteWorkLog(l.id)
    if (!res.error) {
      toast('稼働ログを削除しました', 'info')
      router.refresh()
    }
  }

  return (
    <>
      <div className="pagehead">
        <div><h1>稼働ログ</h1></div>
      </div>

      {/* ── Contract tabs ── */}
      {contracts.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 'var(--small)' }}>有効な契約がありません</p>
      ) : (
        <div className="ctabs">
          {contracts.map(c => (
            <button
              key={c.id}
              className="ctab"
              data-active={String(c.id === activeContractId)}
              onClick={() => switchTab(c.id)}
            >
              {c.name}
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.65 }}>
                {clientMap[c.client_id] ?? ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Tab content ── */}
      {activeContract && (
        <>
          {/* 記録ボタン（パネルが閉じているときのみ） */}
          {!showForm && !editingLog && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn--primary" onClick={() => setShowForm(true)}>
                <Icon name="plus" size={16} />稼働を記録
              </button>
            </div>
          )}

          {/* テーブル ＋ 右パネル */}
          <div className="wl-layout">
            {/* History table */}
            <div className="wl-main">
            <div className="tablecard">
            <div className="tablecard__head">
              <h2>稼働履歴</h2>
              <span className="count">{contractLogs.length}件</span>
            </div>
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 120 }}>日付</th>
                    <th style={{ width: 150 }} className="ar">時刻</th>
                    <th style={{ width: 80 }} className="ar">実働</th>
                    <th style={{ width: 90 }}>状態</th>
                    <th>メモ</th>
                    <th style={{ width: 80 }} className="ar">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {contractLogs.length === 0 && (
                    <tr><td colSpan={6}>
                      <div className="empty">
                        <div className="empty__icon"><Icon name="clock" size={22} /></div>
                        <p>まだ稼働が記録されていません</p>
                      </div>
                    </td></tr>
                  )}
                  {contractLogs.map(l => (
                    <tr key={l.id}>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {l.work_date.slice(5).replace('-', '/')}
                      </td>
                      <td className="ar num dim" style={{ fontSize: 'var(--small)' }}>
                        {l.actual_start_time && l.actual_end_time
                          ? `${l.actual_start_time.slice(0, 5)} 〜 ${l.actual_end_time.slice(0, 5)}`
                          : '—'}
                      </td>
                      <td className="ar num" style={{ fontWeight: 600 }}>
                        {l.actual_hours != null ? `${l.actual_hours}h` : '—'}
                      </td>
                      <td><StatusChip status={l.status} /></td>
                      <td className="dim" style={{ fontSize: 'var(--small)', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {l.memo || <span className="muted">—</span>}
                      </td>
                      <td>
                        <div className="rowactions">
                          <button
                            className="btn btn--icon btn--subtle"
                            onClick={() => { setShowForm(false); setEditingLog(l) }}
                            title="編集"
                          ><Icon name="edit" size={15} /></button>
                          <button
                            className="btn btn--icon btn--danger"
                            onClick={() => handleDelete(l)}
                            title="削除"
                          ><Icon name="trash" size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
            </div>

            {/* 右パネル：スライドイン */}
            <div className="wl-panel" data-open={String(showForm || !!editingLog)}>
              <div className="wl-panel-inner">
                {(showForm || editingLog) && (
                  <QuickForm
                    key={editingLog ? 'edit-' + editingLog.id : activeContractId}
                    contractId={editingLog?.contract_id ?? activeContractId}
                    clientId={editingLog?.client_id ?? activeContract.client_id}
                    contractName={activeContract.name}
                    clientName={clientMap[activeContract.client_id] ?? ''}
                    initialDate={editingLog?.work_date}
                    existing={editingLog ?? undefined}
                    onSave={editingLog
                      ? (fd) => handleUpdate(editingLog.id, fd)
                      : handleSave}
                    onCancel={() => { setShowForm(false); setEditingLog(null) }}
                  />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── Quick inline form ─────────────────────────────────────────────
function QuickForm({
  contractId, clientId, contractName, clientName, initialDate, existing, onSave, onCancel,
}: {
  contractId: string; clientId: string; contractName: string; clientName: string
  initialDate?: string; existing?: WorkLog
  onSave: (fd: FormData) => Promise<void>; onCancel: () => void
}) {
  const [date, setDate] = React.useState(existing?.work_date ?? initialDate ?? toYMD(new Date()))
  const [startTime, setStartTime] = React.useState(existing?.actual_start_time?.slice(0, 5) ?? '')
  const [endTime, setEndTime] = React.useState(existing?.actual_end_time?.slice(0, 5) ?? '')
  const [breakMins, setBreakMins] = React.useState(existing?.break_minutes ?? 0)
  const [memo, setMemo] = React.useState(existing?.memo ?? '')
  const [status, setStatus] = React.useState<WorkLogStatus>(existing?.status ?? 'worked')
  const [busy, setBusy] = React.useState(false)

  const previewHours = React.useMemo(() => {
    if (!startTime || !endTime) return null
    return calcHours(startTime, endTime, breakMins)
  }, [startTime, endTime, breakMins])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const fd = new FormData()
    fd.set('client_id', clientId)
    fd.set('contract_id', contractId)
    fd.set('work_date', date)
    fd.set('actual_start_time', startTime)
    fd.set('actual_end_time', endTime)
    fd.set('break_minutes', String(breakMins))
    fd.set('memo', memo)
    fd.set('status', status)
    fd.set('actual_hours', String(previewHours ?? ''))
    await onSave(fd)
    setBusy(false)
  }

  return (
    <div className="card">
      <div style={{
        padding: '12px var(--pad)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent-soft)',
      }}>
        <Icon name="clock" size={15} style={{ color: 'var(--accent-text)' }} />
        <span style={{ fontWeight: 700, color: 'var(--accent-text)', fontSize: 'var(--small)' }}>{contractName}</span>
        <span style={{ fontSize: 'var(--small)', color: 'var(--accent-text)', opacity: 0.7 }}>{clientName}</span>
      </div>
      <form onSubmit={handleSubmit} style={{ padding: 'var(--pad)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ width: 175, flexShrink: 0 }}>
            <label>日付</label>
            <CustomDatePicker value={date} onChange={setDate} required />
          </div>
          <div className="field" style={{ width: 118, flexShrink: 0 }}>
            <label>開始時刻</label>
            <CustomTimePicker value={startTime} onChange={setStartTime} placeholder="--:--" name="actual_start_time" />
          </div>
          <div className="field" style={{ width: 118, flexShrink: 0 }}>
            <label>終了時刻</label>
            <CustomTimePicker value={endTime} onChange={setEndTime} placeholder="--:--" name="actual_end_time" />
          </div>
          <div className="field" style={{ width: 90, flexShrink: 0 }}>
            <label>休憩（分）</label>
            <input className="input num" type="number" value={breakMins}
              onChange={e => setBreakMins(Number(e.target.value))} min="0" step="15" placeholder="0" />
          </div>
          <div className="field" style={{ width: 130, flexShrink: 0 }}>
            <label>状態</label>
            <CustomSelect name="status" value={status} onChange={v => setStatus(v as WorkLogStatus)}
              options={[
                { value: 'planned', label: '予定' },
                { value: 'worked', label: '稼働済' },
                { value: 'billed', label: '請求済' },
              ]} />
          </div>
          <div style={{ paddingBottom: 10, marginLeft: 'auto', fontSize: 'var(--small)', color: 'var(--text-faint)', whiteSpace: 'nowrap', alignSelf: 'flex-end' }}>
            {previewHours != null ? `実働 ${previewHours}h` : ''}
          </div>
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>メモ（任意）</label>
          <input className="input" value={memo} onChange={e => setMemo(e.target.value)} placeholder="作業内容など" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>キャンセル</button>
          <button type="submit" className="btn btn--primary" disabled={busy || !startTime || !endTime}>
            {busy ? '保存中…' : existing ? '更新する' : '記録する'}
          </button>
        </div>
      </form>
    </div>
  )
}
