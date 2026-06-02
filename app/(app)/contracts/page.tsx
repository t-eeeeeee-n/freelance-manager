import { createClient } from '@/lib/supabase/server'
import type { Contract, Client } from '@/lib/types'
import { ContractsUI } from './contracts-ui'

export default async function ContractsPage() {
  const supabase = await createClient()
  const [{ data: contracts }, { data: clients }] = await Promise.all([
    supabase.from('contracts').select('*').order('created_at', { ascending: false }),
    supabase.from('clients').select('*').eq('is_active', true).order('name'),
  ])
  return (
    <div className="page">
      <ContractsUI contracts={(contracts ?? []) as Contract[]} clients={(clients ?? []) as Client[]} />
    </div>
  )
}
