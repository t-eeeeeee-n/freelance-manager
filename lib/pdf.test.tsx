import { describe, it, expect } from 'vitest'
import { renderInvoicePdf } from './pdf'

describe('renderInvoicePdf', () => {
  it('generates a valid PDF with Japanese text', async () => {
    const bytes = await renderInvoicePdf({
      invoiceNo: '2026-06-001',
      issueDate: '2026-06-30',
      yearMonth: '2026-06',
      clientName: 'テスト株式会社',
      rows: [{
        clientId: 'c1', contractId: 'ct1', contractName: 'Webアプリ開発',
        billingType: 'hourly', workedHours: 80, minimumHours: null,
        billableHours: 80, baseRate: 5000, overtimeRate: null, amount: 400000,
      }],
      totalAmount: 400000,
      profile: {
        display_name: '山田 太郎', address: '東京都', email: 'test@example.com',
        phone: '090-0000-0000', bank_info: '〇〇銀行 普通 1234567',
      },
    })
    expect(bytes.length).toBeGreaterThan(1000)
    // PDF magic bytes: %PDF
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF')
  }, 30000)

  it('消費税あり・構造化した振込先でもPDFを生成できる', async () => {
    const bytes = await renderInvoicePdf({
      invoiceNo: '2026-06-003', issueDate: '2026-07-01', yearMonth: '2026-06',
      clientName: 'テスト株式会社',
      rows: [{
        clientId: 'c1', contractId: 'ct1', contractName: 'CMS開発',
        billingType: 'hourly', workedHours: 113, minimumHours: null,
        billableHours: 113, baseRate: 4000, overtimeRate: null, amount: 452000,
      }],
      totalAmount: 452000, consumptionTax: 45200,
      profile: {
        display_name: '荒井天匠', address: '東京', email: 'a@b.c', phone: '090',
        bank_name: '三井住友銀行', bank_branch: '桶川支店',
        account_type: '普通', account_number: '7476613', account_holder: 'アライ　テンショウ',
      },
    })
    expect(bytes.length).toBeGreaterThan(1000)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF')
  }, 30000)

  it('源泉徴収ありでもPDFを生成できる', async () => {
    const bytes = await renderInvoicePdf({
      invoiceNo: '2026-06-002', issueDate: '2026-06-30', yearMonth: '2026-06',
      clientName: 'テスト株式会社',
      rows: [{
        clientId: 'c1', contractId: 'ct1', contractName: '開発',
        billingType: 'hourly', workedHours: 100, minimumHours: null,
        billableHours: 100, baseRate: 5000, overtimeRate: null, amount: 500000,
      }],
      totalAmount: 500000, withholdingAmount: 51050,
      profile: { display_name: '山田', address: '東京', email: 'a@b.c', phone: '090', bank_info: '〇〇銀行' },
    })
    expect(bytes.length).toBeGreaterThan(1000)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF')
  }, 30000)
})
