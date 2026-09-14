import { createClient } from '@/lib/supabase/server'
import type { WorkLog, Contract, Client } from '@/lib/types'
import { WorkLogsUI } from './work-logs-ui'

export default async function WorkLogsPage() {
  const supabase = await createClient()
  const [{ data: logs }, { data: contracts }, { data: clients }] = await Promise.all([
    // 月別表示はクライアント側で絞り込むため、数ヶ月分さかのぼれる件数をまとめて取得する
    supabase.from('work_logs').select('*').order('work_date', { ascending: false }).limit(1000),
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
