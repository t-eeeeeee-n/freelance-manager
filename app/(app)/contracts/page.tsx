import { createClient } from '@/lib/supabase/server'
import type { Contract, Client } from '@/lib/types'

export default async function ContractsPage() {
  const supabase = await createClient()
  const [{ data: contracts }, { data: clients }] = await Promise.all([
    supabase.from('contracts').select('*').order('created_at', { ascending: false }),
    supabase.from('clients').select('*').eq('is_active', true).order('name'),
  ])
  const list = (contracts ?? []) as Contract[]
  const clientList = (clients ?? []) as Client[]
  const clientMap = Object.fromEntries(clientList.map((c) => [c.id, c.name]))
  return (
    <main style={{ padding: 24 }}>
      <h1>契約条件</h1>
      <table border={1} cellPadding={8}>
        <thead><tr><th>クライアント</th><th>契約名</th><th>種別</th><th>状態</th></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id}>
              <td>{clientMap[c.client_id] ?? c.client_id}</td>
              <td>{c.name}</td>
              <td>{c.billing_type}</td>
              <td>{c.is_active ? '有効' : '無効'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
