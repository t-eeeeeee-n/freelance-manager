'use client'
import React from 'react'
import { createPortal } from 'react-dom'

interface CustomDatePickerProps {
  value: string        // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void
  name?: string
  required?: boolean
  placeholder?: string
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseYMD(s: string): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00')
  return isNaN(d.getTime()) ? null : d
}

function formatDisplay(ymd: string): string {
  const d = parseYMD(ymd)
  if (!d) return ''
  const w = WEEKDAYS[d.getDay()]
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}（${w}）`
}

const CALENDAR_STYLES = `
.cdp__popup {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: var(--shadow-pop); padding: 12px; width: 272px;
  animation: cselOpen 0.15s cubic-bezier(0.2,0.8,0.3,1) both;
  font-family: var(--font-sans);
}
.cdp__nav {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
}
.cdp__nav-title {
  font-size: var(--base); font-weight: 700; color: var(--text);
}
.cdp__nav-btn {
  width: 28px; height: 28px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong);
  background: var(--surface); color: var(--text-dim); cursor: pointer;
  display: grid; place-items: center; transition: all 0.12s;
}
.cdp__nav-btn:hover { background: var(--surface-2); color: var(--text); }
.cdp__weekdays {
  display: grid; grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
}
.cdp__weekday {
  text-align: center; font-size: 11px; font-weight: 600;
  color: var(--text-faint); padding: 4px 0;
}
.cdp__weekday:first-child { color: oklch(0.58 0.15 25); }
.cdp__weekday:last-child { color: oklch(0.55 0.13 255); }
.cdp__days {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;
}
.cdp__day {
  aspect-ratio: 1; border-radius: var(--radius-sm); border: 0;
  background: transparent; cursor: pointer; font-family: var(--font-sans);
  font-size: var(--small); color: var(--text); transition: all 0.1s;
  display: grid; place-items: center;
}
.cdp__day:hover:not([disabled]) { background: var(--surface-2); }
.cdp__day[data-today="true"] { font-weight: 700; color: var(--accent-text); }
.cdp__day[data-selected="true"] {
  background: var(--accent); color: var(--accent-contrast, #fff); font-weight: 700;
}
.cdp__day[data-selected="true"]:hover { background: var(--accent-hover); }
.cdp__day[disabled] { opacity: 0.25; cursor: not-allowed; }
.cdp__day[data-other-month="true"] { color: var(--text-faint); }
.cdp__day[data-sun="true"]:not([data-selected="true"]) { color: oklch(0.55 0.15 25); }
.cdp__day[data-sat="true"]:not([data-selected="true"]) { color: oklch(0.52 0.12 255); }
.cdp__today-btn {
  width: 100%; margin-top: 8px; padding: 6px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: transparent; cursor: pointer;
  font-family: var(--font-sans); font-size: var(--small); color: var(--text-dim);
  transition: all 0.12s;
}
.cdp__today-btn:hover { background: var(--surface-2); color: var(--text); }
`

export function CustomDatePicker({
  value, onChange, name, required, placeholder = '日付を選択'
}: CustomDatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [viewYear, setViewYear] = React.useState(() => {
    const d = parseYMD(value)
    return d ? d.getFullYear() : new Date().getFullYear()
  })
  const [viewMonth, setViewMonth] = React.useState(() => {
    const d = parseYMD(value)
    return d ? d.getMonth() : new Date().getMonth()
  })
  const [pos, setPos] = React.useState({ top: 0, left: 0 })
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const popupRef = React.useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => { setMounted(true) }, [])

  // Sync view to value when it changes externally
  React.useEffect(() => {
    const d = parseYMD(value)
    if (d) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()) }
  }, [value])

  const openCalendar = () => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    // Position below or above depending on available space
    const spaceBelow = window.innerHeight - r.bottom
    const popupH = 320
    const top = spaceBelow > popupH
      ? r.bottom + window.scrollY + 5
      : r.top + window.scrollY - popupH - 5
    setPos({ top, left: r.left + window.scrollX })
    setOpen(true)
  }

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || popupRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const daysInPrev = new Date(viewYear, viewMonth, 0).getDate()
  const todayYMD = toYMD(new Date())

  const cells: { ymd: string; day: number; otherMonth: boolean }[] = []
  // Previous month tail
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = new Date(viewYear, viewMonth - 1, daysInPrev - i)
    cells.push({ ymd: toYMD(d), day: daysInPrev - i, otherMonth: true })
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ ymd: `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d, otherMonth: false })
  }
  // Next month head
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const dt = new Date(viewYear, viewMonth + 1, d)
    cells.push({ ymd: toYMD(dt), day: d, otherMonth: true })
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const select = (ymd: string) => { onChange(ymd); setOpen(false) }

  const popup = mounted && open ? createPortal(
    <div
      ref={popupRef}
      className="cdp__popup"
      style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 9999 }}
    >
      <style>{CALENDAR_STYLES}</style>
      <div className="cdp__nav">
        <button type="button" className="cdp__nav-btn" onClick={prevMonth}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
        </button>
        <span className="cdp__nav-title">{viewYear}年{viewMonth + 1}月</span>
        <button type="button" className="cdp__nav-btn" onClick={nextMonth}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </button>
      </div>
      <div className="cdp__weekdays">
        {WEEKDAYS.map(w => <div key={w} className="cdp__weekday">{w}</div>)}
      </div>
      <div className="cdp__days">
        {cells.map((c, i) => {
          const dow = i % 7
          return (
            <button
              key={c.ymd + i}
              type="button"
              className="cdp__day"
              data-selected={String(c.ymd === value)}
              data-today={String(c.ymd === todayYMD)}
              data-other-month={String(c.otherMonth)}
              data-sun={String(dow === 0)}
              data-sat={String(dow === 6)}
              onClick={() => select(c.ymd)}
            >
              {c.day}
            </button>
          )
        })}
      </div>
      <button type="button" className="cdp__today-btn" onClick={() => { select(todayYMD); setViewYear(new Date().getFullYear()); setViewMonth(new Date().getMonth()) }}>
        今日
      </button>
    </div>,
    document.body
  ) : null

  return (
    <div className="csel">
      <style>{CALENDAR_STYLES}</style>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        ref={triggerRef}
        type="button"
        className="csel__trigger"
        data-open={String(open)}
        onClick={() => open ? setOpen(false) : openCalendar()}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={'csel__val' + (value ? '' : ' csel__placeholder')}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto', color: 'var(--text-faint)' }}>
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
      </button>
      {popup}
    </div>
  )
}
