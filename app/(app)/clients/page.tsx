import { createClient } from '@/lib/supabase/server'
import type { Client } from '@/lib/types'
import { ClientsUI } from './clients-ui'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
  return (
    <div className="page">
      <ClientsUI clients={(data ?? []) as Client[]} />
    </div>
  )
}
