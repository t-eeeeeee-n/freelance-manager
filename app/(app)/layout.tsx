import { signOut } from './actions'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav style={{ padding: '8px 24px', borderBottom: '1px solid #ccc', display: 'flex', gap: 16, alignItems: 'center' }}>
        <a href="/dashboard">ダッシュボード</a>
        <a href="/clients">クライアント</a>
        <a href="/contracts">契約条件</a>
        <a href="/work-logs">稼働ログ</a>
        <a href="/expenses">経費</a>
        <a href="/summary">月次サマリー</a>
        <form action={signOut} style={{ marginLeft: 'auto' }}>
          <button type="submit">ログアウト</button>
        </form>
      </nav>
      {children}
    </div>
  )
}

