import { createClient } from '@/lib/supabase/server'
import type { WorkLog, Contract, Client } from '@/lib/types'
import { WorkLogsUI } from './work-logs-ui'

export default async function WorkLogsPage() {
  const supabase = await createClient()
  const [{ data: logs }, { data: contracts }, { data: clients }] = await Promise.all([
    supabase.from('work_logs').select('*').order('work_date', { ascending: false }).limit(200),
    supabase.from('contracts').select('*').eq('is_active', true),
    supabase.from('clients').select('*').eq('is_active', true),
  ])
  return (
    <div className="page">
      <WorkLogsUI
        logs={(logs ?? []) as WorkLog[]}
        clients={(clients ?? []) as Client[]}
        contracts={(contracts ?? []) as Contract[]}
      />
    </div>
  )
}
