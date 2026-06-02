'use client'
import React from 'react'
import { Icon } from './icon'

export function useEditor() {
  const [state, setState] = React.useState<{ open: boolean; mode: 'create' | 'edit' | null; record: Record<string, unknown> | null }>({ open: false, mode: null, record: null })
  return {
    ...state,
    openCreate: () => setState({ open: true, mode: 'create', record: null }),
    openEdit: (record: Record<string, unknown>) => setState({ open: true, mode: 'edit', record }),
    close: () => setState({ open: false, mode: null, record: null }),
  }
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="drawer-scrim" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        {children}
      </div>
    </div>
  )
}

export function EditorShell({ mode, title, error, submitting, onSubmit, onCancel, submitLabel, children }: {
  mode: 'create' | 'edit' | null; title: string; error: string | null; submitting: boolean;
  onSubmit: () => void; onCancel: () => void; submitLabel?: string; children: React.ReactNode
}) {
  const heading = (mode === 'edit' ? '編集' : '追加') + '：' + title
  return (
    <form style={{ display: 'flex', flexDirection: 'column', flex: 1 }} onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      <div className="editor__drawerhead">
        <h2>{heading}</h2>
        <button type="button" className="btn btn--icon btn--subtle" onClick={onCancel} aria-label="閉じる"><Icon name="x" size={16} /></button>
      </div>
      <div className="editor__body">
        {error && <div className="errbox" style={{ marginBottom: 16 }}><Icon name="x" size={15} style={{ marginTop: 1 }} />{error}</div>}
        <div className="formgrid">{children}</div>
      </div>
      <div className="editor__foot">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>キャンセル</button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? '保存中…' : (submitLabel || (mode === 'edit' ? '更新する' : '追加する'))}
        </button>
      </div>
    </form>
  )
}

export function Field({ label, req, hint, children, full }: { label?: string; req?: boolean; hint?: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={'field' + (full ? ' col-2' : '')}>
      {label && <label>{label}{req && <span className="req">*</span>}</label>}
      {children}
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  )
}
