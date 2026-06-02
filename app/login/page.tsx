'use client'
import { useActionState } from 'react'
import { signIn } from './actions'
import { Icon } from '@/components/icon'
import { Field } from '@/components/drawer'

export default function LoginPage() {
  const [error, action, pending] = useActionState(signIn, null)
  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <div className="login__mark">F</div>
          <div className="login__title">FreeDesk</div>
        </div>
        <p className="login__sub">稼働・請求・経費を、ひとりで回す。</p>
        <form className="login__form" action={action}>
          {error && (
            <div className="errbox">
              <Icon name="x" size={15} style={{ marginTop: 1 }} />
              {error}
            </div>
          )}
          <Field label="メールアドレス" req>
            <input className="input" type="email" name="email" placeholder="you@example.com" required autoComplete="email" />
          </Field>
          <Field label="パスワード" req>
            <input className="input" type="password" name="password" placeholder="••••••••" required autoComplete="current-password" />
          </Field>
          <button type="submit" className="btn btn--primary" style={{ height: 42, marginTop: 4 }} disabled={pending}>
            {pending ? 'サインイン中…' : 'サインイン'}
          </button>
        </form>
        <div className="login__hint">本人専用の管理ツールです。</div>
      </div>
    </div>
  )
}
