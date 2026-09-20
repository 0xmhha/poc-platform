import { formatUnits, isAddress } from 'viem'
import type { Expense, PayrollEntry, Token } from '@/types'
export function enterpriseStorageKey(kind: string, chainId: number, address?: string) {
  return address ? `stablenet:${kind}:${chainId}:${address.toLowerCase()}` : null
}
export function validateAmount(amount: bigint, token: Token) {
  if (
    amount <= 0n ||
    amount >= 1n << 256n ||
    !isAddress(token.address) ||
    !Number.isInteger(token.decimals) ||
    token.decimals < 0 ||
    token.decimals > 255
  )
    throw Error('Invalid token amount')
}
export function validatePayroll(entry: PayrollEntry) {
  validateAmount(entry.amount, entry.token)
  if (
    !entry.id ||
    !isAddress(entry.recipient) ||
    !['weekly', 'biweekly', 'monthly'].includes(entry.frequency) ||
    !Number.isFinite(entry.nextPaymentDate.getTime())
  )
    throw Error('Invalid payroll entry')
}
export function validateExpense(entry: Expense) {
  validateAmount(entry.amount, entry.token)
  if (
    !entry.id ||
    !entry.description.trim() ||
    !isAddress(entry.submitter) ||
    !Number.isFinite(entry.submittedAt.getTime())
  )
    throw Error('Invalid expense')
  if (entry.status === 'paid' && (!entry.paymentTxHash || !entry.paidAt))
    throw Error('Paid expenses require a confirmed transaction')
}
export function tokenTotals(entries: Array<{ amount: bigint; token: Token }>): string {
  const totals = new Map<string, { amount: bigint; token: Token }>()
  for (const entry of entries) {
    const key = entry.token.address.toLowerCase()
    const old = totals.get(key)
    totals.set(key, { amount: (old?.amount ?? 0n) + entry.amount, token: entry.token })
  }
  return (
    [...totals.values()]
      .map(({ amount, token }) => `${formatUnits(amount, token.decimals)} ${token.symbol}`)
      .join(' + ') || '0'
  )
}
export function nextPayrollDate(date: Date, frequency: PayrollEntry['frequency']): Date {
  const next = new Date(date)
  if (frequency === 'monthly') {
    const day = next.getUTCDate()
    next.setUTCDate(1)
    next.setUTCMonth(next.getUTCMonth() + 1)
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
    next.setUTCDate(Math.min(day, last))
  } else next.setUTCDate(next.getUTCDate() + (frequency === 'weekly' ? 7 : 14))
  return next
}
