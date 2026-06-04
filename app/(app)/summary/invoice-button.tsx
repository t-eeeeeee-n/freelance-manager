'use client'
import React from 'react'
import { generateInvoicePdf } from './invoice-actions'
import { useToast } from '@/components/toast'
import { Icon } from '@/components/icon'

export function InvoiceButton({ clientId, yearMonth }: { clientId: string; yearMonth: string }) {
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)

  const handleClick = async () => {
    setBusy(true)
    const res = await generateInvoicePdf(clientId, yearMonth)
    setBusy(false)
    if (res.error) {
      toast(res.error, 'err')
      return
    }
    const bytes = Uint8Array.from(atob(res.base64!), c => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.filename!
    a.click()
    URL.revokeObjectURL(url)
    toast(`請求書 ${res.invoiceNo} を発行しました`)
  }

  return (
    <button className="btn btn--ghost btn--sm" onClick={handleClick} disabled={busy}>
      <Icon name="doc" size={14} />
      {busy ? '生成中…' : 'PDF発行'}
    </button>
  )
}
