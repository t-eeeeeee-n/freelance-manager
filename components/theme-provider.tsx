'use client'
import React from 'react'

export function ThemeInit() {
  return (
    <script dangerouslySetInnerHTML={{ __html: `
      (function(){
        var t = localStorage.getItem('fd_theme') || 'light';
        var a = localStorage.getItem('fd_accent') || 'green';
        var d = localStorage.getItem('fd_density') || 'comfortable';
        var r = localStorage.getItem('fd_radius') || 'soft';
        var el = document.documentElement;
        el.setAttribute('data-dir','c');
        el.setAttribute('data-theme',t);
        el.setAttribute('data-accent',a);
        el.setAttribute('data-density',d);
        el.setAttribute('data-radius',r);
      })()
    ` }} />
  )
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<'light'|'dark'>('light')
  React.useEffect(() => {
    const t = (localStorage.getItem('fd_theme') || 'light') as 'light'|'dark'
    setTheme(t)
  }, [])
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('fd_theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }
  return (
    <button className="themebtn" onClick={toggle} title={theme === 'light' ? 'ダークモードへ' : 'ライトモードへ'} aria-label="テーマ切替">
      <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {theme === 'light'
          ? <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          : <>
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
            </>
        }
      </svg>
    </button>
  )
}
