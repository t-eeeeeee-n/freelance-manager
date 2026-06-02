import { createClient } from '@/lib/supabase/server'
import type { Client } from '@/lib/types'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
  const clients = (data ?? []) as Client[]
  return (
    <main style={{ padding: 24 }}>
      <h1>クライアント</h1>
      <table border={1} cellPadding={8}>
        <thead><tr><th>名前</th><th>メモ</th><th>状態</th></tr></thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.memo ?? ''}</td>
              <td>{c.is_active ? '有効' : '無効'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
