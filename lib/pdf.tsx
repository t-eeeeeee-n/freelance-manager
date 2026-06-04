import path from 'node:path'
import { Document, Page, Text, View, StyleSheet, Font, pdf } from '@react-pdf/renderer'
import type { SummaryRow } from './summary'

// Server-side: resolve font from filesystem.
const FONT_DIR = path.join(process.cwd(), 'public', 'fonts')
const FONT_REGULAR = path.join(FONT_DIR, 'NotoSansJP-Regular.otf')
const FONT_BOLD = path.join(FONT_DIR, 'NotoSansJP-Bold.otf')

Font.register({
  family: 'NotoSansJP',
  fonts: [
    { src: FONT_REGULAR, fontWeight: 400 },
    { src: FONT_BOLD, fontWeight: 700 },
  ],
})

const S = StyleSheet.create({
  page: { fontFamily: 'NotoSansJP', fontSize: 10, padding: 40, color: '#1a1a1a' },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 6 },
  section: { marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderColor: '#e0e0e0' },
  bold: { fontWeight: 700 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderColor: '#1a1a1a', marginTop: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, backgroundColor: '#f5f5f5', paddingHorizontal: 6 },
  meta: { fontSize: 9, color: '#555', marginBottom: 2 },
  h2: { fontSize: 12, fontWeight: 700, marginBottom: 8 },
})

const yen = (n: number | null) => n == null ? '—' : `¥${Math.round(n).toLocaleString('ja-JP')}`
const hrs = (n: number | null) => n == null ? '—' : `${n}h`

export interface InvoiceData {
  invoiceNo: string
  issueDate: string
  yearMonth: string
  clientName: string
  rows: SummaryRow[]
  totalAmount: number
  memo?: string
  profile: {
    display_name: string | null
    address: string | null
    email: string | null
    phone: string | null
    bank_info: string | null
  }
}

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  const [y, m] = data.yearMonth.split('-')
  const ymLabel = `${y}年${Number(m)}月`
  return (
    <Document title={`請求書 ${data.invoiceNo}`}>
      <Page size="A4" style={S.page}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }}>
          <Text style={S.title}>請求書</Text>
          <View>
            <Text style={S.meta}>請求番号: {data.invoiceNo}</Text>
            <Text style={S.meta}>発行日: {data.issueDate}</Text>
            <Text style={S.meta}>対象月: {ymLabel}</Text>
          </View>
        </View>

        <View style={S.section}>
          <Text style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{data.clientName} 御中</Text>
        </View>

        <View style={{ alignItems: 'flex-end', marginBottom: 20 }}>
          {data.profile.display_name ? <Text style={{ fontWeight: 700, fontSize: 11 }}>{data.profile.display_name}</Text> : null}
          {data.profile.address ? <Text style={S.meta}>{data.profile.address}</Text> : null}
          {data.profile.email ? <Text style={S.meta}>{data.profile.email}</Text> : null}
          {data.profile.phone ? <Text style={S.meta}>{data.profile.phone}</Text> : null}
        </View>

        <View style={S.section}>
          <Text style={S.h2}>請求内容</Text>
          <View style={S.headerRow}>
            <Text style={[S.bold, { flex: 3 }]}>品目</Text>
            <Text style={[S.bold, { flex: 1, textAlign: 'right' }]}>時間</Text>
            <Text style={[S.bold, { flex: 1, textAlign: 'right' }]}>単価</Text>
            <Text style={[S.bold, { flex: 1, textAlign: 'right' }]}>金額</Text>
          </View>
          {data.rows.map((r) => (
            <View key={r.contractId} style={S.row}>
              <Text style={{ flex: 3 }}>{r.contractName}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{r.billableHours != null ? hrs(r.billableHours) : '—'}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{r.baseRate != null ? yen(r.baseRate) : '—'}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{yen(r.amount)}</Text>
            </View>
          ))}
          <View style={S.totalRow}>
            <Text style={[S.bold, { flex: 4 }]}>合計</Text>
            <Text style={[S.bold, { flex: 1, textAlign: 'right', fontSize: 13 }]}>{yen(data.totalAmount)}</Text>
          </View>
        </View>

        {data.profile.bank_info ? (
          <View style={[S.section, { marginTop: 20 }]}>
            <Text style={S.h2}>振込先</Text>
            <Text style={S.meta}>{data.profile.bank_info}</Text>
          </View>
        ) : null}

        {data.memo ? (
          <View style={S.section}>
            <Text style={S.h2}>備考</Text>
            <Text style={S.meta}>{data.memo}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  )
}

/** Server側でPDFバイト列を生成する（Server Action から呼ぶ） */
export async function renderInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const instance = pdf(<InvoiceDocument data={data} />)
  const blob = await instance.toBlob()
  return new Uint8Array(await blob.arrayBuffer())
}
