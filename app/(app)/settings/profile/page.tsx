import { createClient } from '@/lib/supabase/server'
import { ProfileUI } from './profile-ui'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profile').select('*').limit(1).maybeSingle()
  return (
    <>
      <p style={{ fontSize: 'var(--small)', color: 'var(--text-faint)', marginBottom: 16 }}>請求書に表示される発行者情報</p>
      <ProfileUI profile={profile ?? null} />
    </>
  )
}
