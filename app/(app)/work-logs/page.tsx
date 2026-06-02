import { createClient } from '@/lib/supabase/server'
import type { WorkLog, Contract, Client } from '@/lib/types'

export default async function WorkLogsPage() {
  const supabase = await createClient()
  const [{ data: logs }, { data: contracts }, { data: clients }] = await Promise.all([
    supabase.from('work_logs').select('*').order('work_date', { ascending: false }).limit(100),
    supabase.from('contracts').select('*').eq('is_active', true),
    supabase.from('clients').select('*').eq('is_active', true),
  ])
  const logList = (logs ?? []) as WorkLog[]
  const contractMap = Object.fromEntries(((contracts ?? []) as Contract[]).map((c) => [c.id, c.name]))
  const clientMap = Object.fromEntries(((clients ?? []) as Client[]).map((c) => [c.id, c.name]))
  return (
    <main style={{ padding: 24 }}>
      <h1>稼働ログ</h1>
      <table border={1} cellPadding={8}>
        <thead><tr><th>日付</th><th>クライアント</th><th>契約</th><th>予定</th><th>実働</th><th>状態</th></tr></thead>
        <tbody>
          {logList.map((l) => (
            <tr key={l.id}>
              <td>{l.work_date}</td>
              <td>{clientMap[l.client_id] ?? '-'}</td>
              <td>{contractMap[l.contract_id] ?? '-'}</td>
              <td>{l.planned_hours != null ? `${l.planned_hours}h` : '-'}</td>
              <td>{l.actual_hours != null ? `${l.actual_hours}h` : '-'}</td>
              <td>{l.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
