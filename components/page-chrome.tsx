import { Icon } from './icon'

const BILLING_LABEL: Record<string, string> = { hourly: '時給制', monthly_minimum: '月間最低保証', fixed: '固定報酬' }
const STATUS_LABEL: Record<string, string> = { planned: '予定', worked: '稼働済', billed: '請求済' }

export function PageHead({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="pagehead">
      <div><h1>{title}</h1>{desc && <p>{desc}</p>}</div>
      {children && <div className="bar-actions">{children}</div>}
    </div>
  )
}

export function StatusChip({ status }: { status: string }) {
  const cls = status === 'billed' ? 'chip--pos' : status === 'worked' ? 'chip--accent' : ''
  return <span className={`chip chip--dot ${cls}`}>{STATUS_LABEL[status] || status}</span>
}

export function BillingChip({ type }: { type: string }) {
  return <span className="chip">{BILLING_LABEL[type] || type}</span>
}

export function Empty({ icon = 'doc', text, action }: { icon?: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon"><Icon name={icon} size={22} /></div>
      <p>{text}</p>
      {action}
    </div>
  )
}
