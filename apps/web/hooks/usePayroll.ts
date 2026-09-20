'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { enterpriseStorageKey, validatePayroll } from '@/lib/enterprise/records'
import type { PayrollEntry } from '@/types'

interface UsePayrollConfig {
  fetchPayroll?: () => Promise<PayrollEntry[]>
  autoFetch?: boolean
}

interface PayrollSummary {
  totalMonthly: number
  activeEmployees: number
  nextPaymentDate: Date | null
  ytdTotal: number
}

interface UsePayrollReturn {
  payrollEntries: PayrollEntry[]
  summary: PayrollSummary
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<void>
  addEntry: (entry: PayrollEntry) => void
  updateEntry: (id: string, updates: Partial<PayrollEntry>) => void
  removeEntry: (id: string) => void
}

function serializeEntries(entries: PayrollEntry[]): string {
  return JSON.stringify(
    entries.map((e) => ({
      ...e,
      amount: e.amount.toString(),
      nextPaymentDate: e.nextPaymentDate.toISOString(),
      token: {
        ...e.token,
        balance: e.token.balance !== undefined ? e.token.balance.toString() : undefined,
      },
    }))
  )
}

function deserializeEntries(json: string): PayrollEntry[] {
  const raw = JSON.parse(json) as Array<Record<string, unknown>>
  return raw.map((e) => ({
    ...(e as unknown as PayrollEntry),
    amount: BigInt(e.amount as string),
    nextPaymentDate: new Date(e.nextPaymentDate as string),
    token: {
      ...(e.token as Record<string, unknown>),
      balance:
        (e.token as Record<string, unknown>).balance != null
          ? BigInt((e.token as Record<string, unknown>).balance as string)
          : undefined,
    },
  })) as PayrollEntry[]
}

function loadFromStorage(storageKey: string | null): PayrollEntry[] {
  if (typeof window === 'undefined' || !storageKey) return []
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return []
    return deserializeEntries(stored)
  } catch {
    return []
  }
}

function saveToStorage(storageKey: string | null, entries: PayrollEntry[]): void {
  if (typeof window === 'undefined' || !storageKey)
    throw Error('Connect a wallet to save enterprise records')
  try {
    localStorage.setItem(storageKey, serializeEntries(entries))
  } catch {
    throw Error('Unable to persist enterprise record')
  }
}

export function usePayroll(config: UsePayrollConfig = {}): UsePayrollReturn {
  const { address } = useAccount()
  const chainId = useChainId()
  const storageKey = enterpriseStorageKey('payroll', chainId, address)
  const { fetchPayroll, autoFetch = true } = config
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const fetchIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const id = ++fetchIdRef.current

    // Use external fetch if provided (DI override)
    if (fetchPayroll) {
      setIsLoading(true)
      setError(null)
      try {
        const result = await fetchPayroll()
        if (id !== fetchIdRef.current) return
        setPayrollEntries(result)
      } catch (err) {
        if (id !== fetchIdRef.current) return
        const fetchError = err instanceof Error ? err : new Error('Failed to fetch payroll')
        setError(fetchError)
        setPayrollEntries([])
      } finally {
        if (id === fetchIdRef.current) {
          setIsLoading(false)
        }
      }
      return
    }

    // Default: load from localStorage
    const entries = loadFromStorage(storageKey)
    if (id !== fetchIdRef.current) return
    setPayrollEntries(entries)
    setIsLoading(false)
  }, [fetchPayroll, storageKey])

  useEffect(() => {
    setPayrollEntries([])
    if (autoFetch) {
      refresh()
    }
    return () => {
      fetchIdRef.current++
    }
  }, [autoFetch, refresh])

  const addEntry = useCallback(
    (entry: PayrollEntry) => {
      const next = [...loadFromStorage(storageKey).filter((e) => e.id !== entry.id), entry]
      next.forEach(validatePayroll)
      saveToStorage(storageKey, next)
      setPayrollEntries(next)
    },
    [storageKey]
  )

  const updateEntry = useCallback(
    (id: string, updates: Partial<PayrollEntry>) => {
      const next = loadFromStorage(storageKey).map((e) => (e.id === id ? { ...e, ...updates } : e))
      next.forEach(validatePayroll)
      saveToStorage(storageKey, next)
      setPayrollEntries(next)
    },
    [storageKey]
  )

  const removeEntry = useCallback(
    (id: string) => {
      const next = loadFromStorage(storageKey).filter((e) => e.id !== id)
      next.forEach(validatePayroll)
      saveToStorage(storageKey, next)
      setPayrollEntries(next)
    },
    [storageKey]
  )

  const summary = useMemo<PayrollSummary>(() => {
    const activeEntries = payrollEntries.filter((e) => e.status === 'active')

    // Calculate total monthly (converting from token amount)
    const totalMonthly =
      new Set(activeEntries.map((e) => e.token.address.toLowerCase())).size > 1
        ? 0
        : activeEntries.reduce((sum, entry) => {
            const decimals = entry.token?.decimals ?? 6
            const amount = Number(entry.amount) / 10 ** decimals

            // Convert to monthly equivalent
            switch (entry.frequency) {
              case 'weekly':
                return sum + amount * 4.33 // ~4.33 weeks per month
              case 'biweekly':
                return sum + amount * 2.17 // ~2.17 bi-weeks per month
              default:
                return sum + amount
            }
          }, 0)

    // Find next payment date
    const nextPaymentDate = activeEntries.reduce<Date | null>((nearest, entry) => {
      if (!entry.nextPaymentDate) return nearest
      if (!nearest) return entry.nextPaymentDate
      return entry.nextPaymentDate < nearest ? entry.nextPaymentDate : nearest
    }, null)

    const year = new Date().getFullYear()
    const ytdTotal =
      new Set(payrollEntries.map((e) => e.token.address.toLowerCase())).size > 1
        ? 0
        : payrollEntries.reduce(
            (sum, e) =>
              sum +
              (e.payments ?? [])
                .filter((p) => new Date(p.paidAt).getFullYear() === year)
                .reduce((paid, p) => paid + Number(BigInt(p.amount)) / 10 ** e.token.decimals, 0),
            0
          )

    return {
      totalMonthly,
      activeEmployees: activeEntries.length,
      nextPaymentDate,
      ytdTotal,
    }
  }, [payrollEntries])

  return {
    payrollEntries,
    summary,
    isLoading,
    error,
    refresh,
    addEntry,
    updateEntry,
    removeEntry,
  }
}
