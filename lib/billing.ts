import type { BillingType } from './types'

export interface BillingInput {
  billingType: BillingType
  workedHours: number
  minimumHours: number | null
  baseHourlyRate: number | null
  overtimeHourlyRate: number | null
  fixedAmount: number | null
  isWithinContractPeriod: boolean
}

export interface BillingResult {
  billableHours: number | null
  amount: number
}

export function calculateBilling(input: BillingInput): BillingResult {
  const base = input.baseHourlyRate ?? 0
  const min = input.minimumHours ?? 0

  switch (input.billingType) {
    case 'hourly':
      return { billableHours: input.workedHours, amount: Math.round(input.workedHours * base) }

    case 'monthly_minimum': {
      const billableHours = Math.max(input.workedHours, min)
      if (input.overtimeHourlyRate != null) {
        const baseAmount = min * base
        const overtimeAmount = Math.max(input.workedHours - min, 0) * input.overtimeHourlyRate
        return { billableHours, amount: Math.round(baseAmount + overtimeAmount) }
      }
      return { billableHours, amount: Math.round(billableHours * base) }
    }

    case 'fixed':
      return {
        billableHours: null,
        amount: input.isWithinContractPeriod ? Math.round(input.fixedAmount ?? 0) : 0,
      }
  }
}
