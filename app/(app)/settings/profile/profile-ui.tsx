'use client'
import React from 'react'
import { upsertProfile } from './actions'
import { useToast } from '@/components/toast'

interface Profile {
  display_name: string | null
  address: string | null
  email: string | null
  phone: string | null
  bank_info: string | null
}

export function ProfileUI({ profile }: { profile: Profile | null }) {
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const formRef = React.useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formRef.current) return
    setBusy(true); setError(null)
    const res = await upsertProfile(new FormData(formRef.current))
    setBusy(false)
    if (res.error) setError(res.error)
    else toast('プロフィールを保存しました')
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ maxWidth: 520 }}>
      {error && <div className="errbox" style={{ marginBottom: 16 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="field">
          <label>氏名 / 屋号</label>
          <input className="input" name="display_name" defaultValue={profile?.display_name ?? ''} placeholder="山田 太郎 / 山田デザイン事務所" />
        </div>
        <div className="field">
          <label>住所</label>
          <textarea className="textarea" name="address" defaultValue={profile?.address ?? ''} placeholder="〒000-0000 東京都…" rows={2} />
        </div>
        <div className="field">
          <label>メールアドレス</label>
          <input className="input" type="email" name="email" defaultValue={profile?.email ?? ''} placeholder="you@example.com" />
        </div>
        <div className="field">
          <label>電話番号</label>
          <input className="input" name="phone" defaultValue={profile?.phone ?? ''} placeholder="090-0000-0000" />
        </div>
        <div className="field">
          <label>振込先</label>
          <textarea className="textarea" name="bank_info" defaultValue={profile?.bank_info ?? ''} placeholder="〇〇銀行 △△支店 普通 1234567 ヤマダ タロウ" rows={3} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </form>
  )
}
