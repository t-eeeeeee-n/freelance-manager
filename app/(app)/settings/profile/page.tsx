import { createClient } from '@/lib/supabase/server'
import { ProfileUI } from './profile-ui'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profile').select('*').limit(1).maybeSingle()
  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>プロフィール設定</h1><p>請求書に表示される発行者情報</p></div>
      </div>
      <ProfileUI profile={profile ?? null} />
    </div>
  )
}
