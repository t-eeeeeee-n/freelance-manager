'use client'
import React from 'react'
import { Icon } from './icon'

type ToastType = 'ok' | 'info' | 'err'
interface Toast { id: string; msg: string; type: ToastType }

const ToastCtx = React.createContext<(msg: string, type?: ToastType) => void>(() => {})
export const useToast = () => React.useContext(ToastCtx)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([])
  const push = React.useCallback((msg: string, type: ToastType = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setItems((arr) => [...arr, { id, msg, type }])
    setTimeout(() => setItems((arr) => arr.filter((x) => x.id !== id)), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      <style>{`
        .toast-host{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:10px;z-index:60;align-items:center;pointer-events:none}
        .toast{display:flex;align-items:center;gap:10px;padding:11px 16px 11px 13px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:999px;box-shadow:var(--shadow-pop);font-size:var(--small);font-weight:600;animation:toastin 0.26s cubic-bezier(0.2,0.8,0.2,1);pointer-events:auto;max-width:460px;font-family:var(--font-sans)}
        @keyframes toastin{from{opacity:0;transform:translateY(14px) scale(0.96)}}
        .toast__ic{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;color:#fff}
        .toast--ok .toast__ic{background:var(--accent);color:var(--accent-contrast)}
        .toast--info .toast__ic{background:var(--text-faint)}
        .toast--err .toast__ic{background:oklch(0.58 0.2 25)}
      `}</style>
      {children}
      <div className="toast-host">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <span className="toast__ic"><Icon name={t.type === 'err' ? 'x' : 'check'} size={13} /></span>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
