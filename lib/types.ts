export type BillingType = 'hourly' | 'monthly_minimum' | 'fixed'
export type WorkLogStatus = 'planned' | 'worked' | 'billed'

export interface Client {
  id: string
  name: string
  memo: string | null
  is_active: boolean
}

export interface Contract {
  id: string
  client_id: string
  name: string
  billing_type: BillingType
  minimum_hours: number | null
  base_hourly_rate: number | null
  overtime_hourly_rate: number | null
  fixed_amount: number | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
}

export interface WorkLog {
  id: string
  client_id: string
  contract_id: string
  work_date: string
  planned_hours: number | null
  actual_hours: number | null
  actual_start_time: string | null  // 'HH:MM'
  actual_end_time: string | null    // 'HH:MM'
  break_minutes: number             // default 0
  memo: string | null
  status: WorkLogStatus
}

export interface Expense {
  id: string
  expense_date: string
  category: string
  amount: number
  allocation_rate: number
  allocated_amount: number
  memo: string | null
  is_recurring: boolean
}

export type TaxFilingType = 'blue' | 'white'

export interface TaxSettings {
  id: string
  filing_type: TaxFilingType
  blue_deduction: number
  basic_deduction_income: number
  basic_deduction_resident: number
  national_pension_annual: number
  health_insurance_rate: number
  health_insurance_fixed: number
  resident_tax_rate: number
  resident_tax_fixed: number
  other_deductions: number
}
