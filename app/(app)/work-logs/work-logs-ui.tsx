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
          {/* テーブルヘッダー + 記録ボタン（右寄せ） */}
          <div className="tablecard">
            <div className="tablecard__head">
              <h2>稼働履歴</h2>
              <span className="count">{contractLogs.length}件</span>
              <span className="spacer" />
              {!showForm && !editingLog && (
                <button className="btn btn--primary btn--sm" onClick={() => setShowForm(true)}>
                  <Icon name="plus" size={14} />稼働を記録
                </button>
              )}
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

          {/* パネル外クリックでスライドアウト */}
          {(showForm || !!editingLog) && (
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 39 }}
              onClick={() => { setShowForm(false); setEditingLog(null) }}
            />
          )}

          {/* 右端スライドインパネル */}
          <div className="wl-panel-fixed" data-open={String(showForm || !!editingLog)}>
            {/* パネルヘッダー：タイトル＋×ボタン */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
              position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
            }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--h2)' }}>
                {editingLog ? '稼働を編集' : '稼働を記録'}
              </span>
              <button
                className="btn btn--icon btn--subtle"
                onClick={() => { setShowForm(false); setEditingLog(null) }}
                aria-label="閉じる"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            {(showForm || editingLog) && (
              <QuickForm
                key={editingLog ? 'edit-' + editingLog.id : activeContractId}
                contractId={editingLog?.contract_id ?? activeContractId}
                clientId={editingLog?.client_id ?? activeContract.client_id}
                initialDate={editingLog?.work_date}
                existing={editingLog ?? undefined}
                onSave={editingLog
                  ? (fd) => handleUpdate(editingLog.id, fd)
                  : handleSave}
                onCancel={() => { setShowForm(false); setEditingLog(null) }}
              />
            )}
          </div>
        </>
      )}
    </>
  )
}

// ── Quick inline form ─────────────────────────────────────────────
function QuickForm({
  contractId, clientId, initialDate, existing, onSave, onCancel,
}: {
  contractId: string; clientId: string
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
    <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 行1: 日付 */}
        <div className="field">
          <label>日付</label>
          <CustomDatePicker value={date} onChange={setDate} required />
        </div>

        {/* 行2: 開始・終了・休憩・状態・実働 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
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
          <div className="field" style={{ width: 120, flexShrink: 0 }}>
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
        {/* 行3: メモ */}
        <div className="field">
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
  )
}
