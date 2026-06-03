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

// ── Helpers ──────────────────────────────────────────────────────
function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shiftDay(ymd: string, n: number) {
  const d = new Date(ymd + 'T00:00')
  d.setDate(d.getDate() + n)
  return toYMD(d)
}
function dateLabel(ymd: string) {
  const d = new Date(ymd + 'T00:00')
  const w = '日月火水木金土'[d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日（${w}）`
}
function calcHours(start: string, end: string, breakMins: number) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let total = (eh * 60 + em) - (sh * 60 + sm) - breakMins
  if (total <= 0) total += 24 * 60  // 日またぎ
  if (total <= 0) return null
  return Math.round(total / 6) / 10
}

// ── Main component ────────────────────────────────────────────────
export function WorkLogsUI({ logs, contracts, clients }: { logs: WorkLog[]; contracts: Contract[]; clients: Client[] }) {
  const toast = useToast()
  const router = useRouter()
  const today = toYMD(new Date())
  const [selectedContractId, setSelectedContractId] = React.useState<string | null>(null)
  const [editingLog, setEditingLog] = React.useState<WorkLog | null>(null)

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]))
  const contractMap = Object.fromEntries(contracts.map(c => [c.id, c.name]))

  // 今日分のみカードの済バッジ表示に使う
  const todayLogs = logs.filter(l => l.work_date === today)
  const loggedContractIds = new Set(todayLogs.map(l => l.contract_id))

  const handleCardClick = (contractId: string) => {
    setEditingLog(null)
    setSelectedContractId(prev => prev === contractId ? null : contractId)
  }

  const handleSave = async (formData: FormData) => {
    const res = await createWorkLog(formData)
    if (!res.error) {
      setSelectedContractId(null)
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

  const selectedContract = contracts.find(c => c.id === selectedContractId)

  return (
    <>
      <div className="pagehead">
        <div><h1>稼働ログ</h1><p>契約を選んで稼働を記録</p></div>
      </div>
      <div className="quick" style={{ marginBottom: 'var(--gap)' }}>
        {contracts.map(c => {
          const isLogged = loggedContractIds.has(c.id)
          const isSelected = selectedContractId === c.id
          return (
            <button
              key={c.id}
              className="quickcard"
              onClick={() => handleCardClick(c.id)}
              style={{
                borderColor: isSelected ? 'var(--accent)' : isLogged ? 'var(--pos)' : undefined,
                background: isSelected ? 'var(--accent-soft)' : undefined,
                position: 'relative',
              }}
            >
              <span
                className="quickcard__ic"
                style={{
                  background: isLogged ? 'oklch(0.92 0.05 150 / 0.4)' : undefined,
                  color: isLogged ? 'var(--pos)' : undefined,
                }}
              >
                <Icon name={isLogged ? 'check' : 'clock'} size={19} />
              </span>
              <span>
                <span className="quickcard__t">{c.name}</span>
                <span className="quickcard__d">{clientMap[c.client_id] ?? '—'}</span>
              </span>
              {isLogged && (
                <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 11, fontWeight: 700, color: 'var(--pos)' }}>
                  {todayLogs.filter(l => l.contract_id === c.id).reduce((s, l) => s + (l.actual_hours ?? 0), 0)}h済
                </span>
              )}
            </button>
          )
        })}
        {contracts.length === 0 && (
          <p style={{ color: 'var(--text-faint)', fontSize: 'var(--small)' }}>有効な契約がありません</p>
        )}
      </div>

      {/* ── Inline quick form (create) ── */}
      {selectedContractId && !editingLog && selectedContract && (
        <QuickForm
          key={selectedContractId}
          contractId={selectedContractId}
          clientId={selectedContract.client_id}
          contractName={contractMap[selectedContractId] ?? ''}
          clientName={clientMap[selectedContract.client_id] ?? ''}
          onSave={handleSave}
          onCancel={() => setSelectedContractId(null)}
        />
      )}

      {/* ── Edit form ── */}
      {editingLog && (
        <QuickForm
          key={'edit-' + editingLog.id}
          contractId={editingLog.contract_id}
          clientId={editingLog.client_id}
          contractName={contractMap[editingLog.contract_id] ?? ''}
          clientName={clientMap[editingLog.client_id] ?? ''}
          initialDate={editingLog.work_date}
          existing={editingLog}
          onSave={(fd) => handleUpdate(editingLog.id, fd)}
          onCancel={() => setEditingLog(null)}
        />
      )}

      {/* ── Log history ── */}
      <div className="tablecard">
        <div className="tablecard__head">
          <h2>稼働履歴</h2>
          <span className="count">{logs.length}件</span>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 120 }}>日付</th>
                <th>契約 / クライアント</th>
                <th style={{ width: 140 }} className="ar">時刻</th>
                <th style={{ width: 80 }} className="ar">実働</th>
                <th style={{ width: 90 }}>状態</th>
                <th style={{ width: 80 }} className="ar">操作</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      <div className="empty__icon"><Icon name="clock" size={22} /></div>
                      <p>稼働ログがありません</p>
                    </div>
                  </td>
                </tr>
              )}
              {logs.map(l => (
                <tr key={l.id}>
                  <td className="num" style={{ fontWeight: 600 }}>{l.work_date.slice(5).replace('-', '/')}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{contractMap[l.contract_id] ?? '—'}</div>
                    <div className="muted" style={{ fontSize: 'var(--small)' }}>{clientMap[l.client_id] ?? '—'}</div>
                  </td>
                  <td className="ar num dim" style={{ fontSize: 'var(--small)' }}>
                    {l.actual_start_time && l.actual_end_time
                      ? `${l.actual_start_time.slice(0, 5)} 〜 ${l.actual_end_time.slice(0, 5)}`
                      : '—'}
                  </td>
                  <td className="ar num" style={{ fontWeight: 600 }}>{l.actual_hours != null ? `${l.actual_hours}h` : '—'}</td>
                  <td><StatusChip status={l.status} /></td>
                  <td>
                    <div className="rowactions">
                      <button
                        className="btn btn--icon btn--subtle"
                        onClick={() => { setSelectedContractId(null); setEditingLog(l) }}
                        title="編集"
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        className="btn btn--icon btn--danger"
                        onClick={() => handleDelete(l)}
                        title="削除"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ── Quick inline form ─────────────────────────────────────────────
function QuickForm({
  contractId, clientId, contractName, clientName, initialDate, existing, onSave, onCancel,
}: {
  contractId: string
  clientId: string
  contractName: string
  clientName: string
  initialDate?: string
  existing?: WorkLog
  onSave: (fd: FormData) => Promise<void>
  onCancel: () => void
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
    <div className="card" style={{ marginBottom: 'var(--gap)', overflow: 'hidden' }}>
      <div style={{
        padding: '14px var(--pad)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--accent-soft)',
      }}>
        <Icon name="clock" size={16} style={{ color: 'var(--accent-text)' }} />
        <span style={{ fontWeight: 700, color: 'var(--accent-text)' }}>{contractName}</span>
        <span style={{ fontSize: 'var(--small)', color: 'var(--accent-text)', opacity: 0.75 }}>{clientName}</span>
      </div>
      <form onSubmit={handleSubmit} style={{ padding: 'var(--pad)' }}>
        {/* 日付 + 時刻 + 実働 + 休憩 + 状態 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ width: 140, flexShrink: 0 }}>
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
            <input
              className="input num"
              type="number"
              value={breakMins}
              onChange={e => setBreakMins(Number(e.target.value))}
              min="0"
              step="15"
              placeholder="0"
            />
          </div>
          <div className="field" style={{ width: 130, flexShrink: 0 }}>
            <label>状態</label>
            <CustomSelect
              name="status"
              value={status}
              onChange={(v) => setStatus(v as WorkLogStatus)}
              options={[
                { value: 'planned', label: '予定' },
                { value: 'worked', label: '稼働済' },
                { value: 'billed', label: '請求済' },
              ]}
            />
          </div>
          <div style={{ paddingBottom: 10, marginLeft: 'auto', fontSize: 'var(--small)', color: 'var(--text-faint)', whiteSpace: 'nowrap', alignSelf: 'flex-end' }}>
            {previewHours != null ? `実働 ${previewHours}h` : ''}
          </div>
        </div>

        {/* 2行目：メモ */}
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
