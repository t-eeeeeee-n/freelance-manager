'use client'
import { useActionState } from 'react'
import { signIn } from './actions'

export default function LoginPage() {
  const [error, action, pending] = useActionState(signIn, null)
  return (
    <main style={{ maxWidth: 400, margin: '100px auto', padding: '0 16px' }}>
      <h1>ログイン</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form action={action}>
        <div>
          <label htmlFor="email">メールアドレス</label><br />
          <input id="email" name="email" type="email" required autoComplete="email" style={{ width: '100%', marginBottom: 12 }} />
        </div>
        <div>
          <label htmlFor="password">パスワード</label><br />
          <input id="password" name="password" type="password" required autoComplete="current-password" style={{ width: '100%', marginBottom: 12 }} />
        </div>
        <button type="submit" disabled={pending}>
          {pending ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </main>
  )
}
