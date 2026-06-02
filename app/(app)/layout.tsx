import { RailNav, MobileNav } from '@/components/rail-nav'
import { Topstrip } from '@/components/topstrip'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="appwin">
      <RailNav />
      <div className="appmain">
        <Topstrip />
        <div className="scroll">
          {children}
        </div>
      </div>
      <MobileNav />
    </div>
  )
}
