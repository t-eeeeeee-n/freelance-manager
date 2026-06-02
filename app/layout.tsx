import type { Metadata } from 'next'
import './globals.css'
import { ThemeInit } from '@/components/theme-provider'
import { ToastProvider } from '@/components/toast'

export const metadata: Metadata = { title: 'FreeDesk', description: '稼働・請求・経費管理' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" data-dir="c" suppressHydrationWarning>
      <head>
        <ThemeInit />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
