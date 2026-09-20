'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { enterpriseStorageKey, validateExpense } from '@/lib/enterprise/records'
import type { Expense } from '@/types'

interface ExpenseFilter {
  status?: 'pending' | 'approved' | 'rejected' | 'paid'
  category?: string
  submitter?: string
}

interface UseExpensesConfig {
  fetchExpenses?: () => Promise<Expense[]>
  filter?: ExpenseFilter
  autoFetch?: boolean
}

interface UseExpensesReturn {
  expenses: Expense[]
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<void>
  addExpense: (expense: Expense) => void
  updateExpense: (id: string, updates: Partial<Expense>) => void
  removeExpense: (id: string) => void
}

function serializeExpenses(expenses: Expense[]): string {
  return JSON.stringify(
    expenses.map((e) => ({
      ...e,
      amount: e.amount.toString(),
      submittedAt: e.submittedAt.toISOString(),
      token: {
        ...e.token,
        balance: e.token.balance !== undefined ? e.token.balance.toString() : undefined,
      },
    }))
  )
}

function deserializeExpenses(json: string): Expense[] {
  const raw = JSON.parse(json) as Array<Record<string, unknown>>
  return raw.map((e) => ({
    ...(e as unknown as Expense),
    amount: BigInt(e.amount as string),
    submittedAt: new Date(e.submittedAt as string),
    token: {
      ...(e.token as Record<string, unknown>),
      balance:
        (e.token as Record<string, unknown>).balance != null
          ? BigInt((e.token as Record<string, unknown>).balance as string)
          : undefined,
    },
  })) as Expense[]
}

function loadFromStorage(storageKey: string | null): Expense[] {
  if (typeof window === 'undefined' || !storageKey) return []
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return []
    return deserializeExpenses(stored)
  } catch {
    return []
  }
}

function saveToStorage(storageKey: string | null, expenses: Expense[]): void {
  if (typeof window === 'undefined' || !storageKey)
    throw Error('Connect a wallet to save enterprise records')
  try {
    localStorage.setItem(storageKey, serializeExpenses(expenses))
  } catch {
    throw Error('Unable to persist enterprise record')
  }
}

export function useExpenses(config: UseExpensesConfig = {}): UseExpensesReturn {
  const { address } = useAccount()
  const chainId = useChainId()
  const storageKey = enterpriseStorageKey('expenses', chainId, address)
  const { fetchExpenses, filter, autoFetch = true } = config
  const [allExpenses, setAllExpenses] = useState<Expense[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const fetchIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const id = ++fetchIdRef.current

    // Use external fetch if provided (DI override)
    if (fetchExpenses) {
      setIsLoading(true)
      setError(null)
      try {
        const result = await fetchExpenses()
        if (id !== fetchIdRef.current) return
        setAllExpenses(result)
      } catch (err) {
        if (id !== fetchIdRef.current) return
        const fetchError = err instanceof Error ? err : new Error('Failed to fetch expenses')
        setError(fetchError)
        setAllExpenses([])
      } finally {
        if (id === fetchIdRef.current) {
          setIsLoading(false)
        }
      }
      return
    }

    // Default: load from localStorage
    const expenses = loadFromStorage(storageKey)
    if (id !== fetchIdRef.current) return
    setAllExpenses(expenses)
    setIsLoading(false)
  }, [fetchExpenses, storageKey])

  useEffect(() => {
    setAllExpenses([])
    if (autoFetch) {
      refresh()
    }
    return () => {
      fetchIdRef.current++
    }
  }, [autoFetch, refresh])

  const addExpense = useCallback(
    (expense: Expense) => {
      const next = [...loadFromStorage(storageKey).filter((e) => e.id !== expense.id), expense]
      next.forEach(validateExpense)
      saveToStorage(storageKey, next)
      setAllExpenses(next)
    },
    [storageKey]
  )

  const updateExpense = useCallback(
    (id: string, updates: Partial<Expense>) => {
      const next = loadFromStorage(storageKey).map((e) => (e.id === id ? { ...e, ...updates } : e))
      next.forEach(validateExpense)
      saveToStorage(storageKey, next)
      setAllExpenses(next)
    },
    [storageKey]
  )

  const removeExpense = useCallback(
    (id: string) => {
      const next = loadFromStorage(storageKey).filter((e) => e.id !== id)
      next.forEach(validateExpense)
      saveToStorage(storageKey, next)
      setAllExpenses(next)
    },
    [storageKey]
  )

  const expenses = useMemo(() => {
    if (!filter) return allExpenses

    return allExpenses.filter((expense) => {
      if (filter.status && expense.status !== filter.status) return false
      if (filter.category && expense.category !== filter.category) return false
      if (filter.submitter && expense.submitter !== filter.submitter) return false
      return true
    })
  }, [allExpenses, filter])

  return {
    expenses,
    isLoading,
    error,
    refresh,
    addExpense,
    updateExpense,
    removeExpense,
  }
}
