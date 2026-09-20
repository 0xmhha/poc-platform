'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { type Address, parseUnits } from 'viem'
import { Button, ConnectWalletCard, PageHeader, useToast } from '@/components/common'
import { ExpenseListCard, ExpenseSummaryCards, SubmitExpenseModal } from '@/components/enterprise'
import type { ExpenseFormData } from '@/components/enterprise/cards/SubmitExpenseModal'
import { useWallet } from '@/hooks'
import { useAuditLogs } from '@/hooks/useAuditLogs'
import { useEnterprisePayment } from '@/hooks/useEnterprisePayment'
import { useExpenses } from '@/hooks/useExpenses'
import { readToken } from '@/lib/contracts/defiReads'
import { requireDeployment } from '@/lib/contracts/deployment'
import { tokenTotals } from '@/lib/enterprise/records'
import { useStableNetContext } from '@/providers'

export default function ExpensesPage() {
  const { isConnected, address } = useWallet()
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const filter = useMemo(() => {
    if (filterStatus === 'all') return undefined
    return { status: filterStatus as 'pending' | 'approved' | 'rejected' | 'paid' }
  }, [filterStatus])

  const { addToast, updateToast } = useToast()
  const { expenses: allExpenses, isLoading, error, addExpense, updateExpense } = useExpenses()
  const expenses = useMemo(
    () => allExpenses.filter((e) => !filter || e.status === filter.status),
    [allExpenses, filter]
  )
  const { publicClient, chainId } = useStableNetContext()
  const pay = useEnterprisePayment()
  const { addLog } = useAuditLogs()
  const paying = useRef(new Set<string>())
  const totalPending = tokenTotals(allExpenses.filter((e) => e.status === 'pending'))
  const totalApproved = tokenTotals(allExpenses.filter((e) => e.status === 'approved'))
  const now = new Date()
  const totalPaidMTD = tokenTotals(
    allExpenses.filter(
      (e) =>
        e.status === 'paid' &&
        e.paidAt &&
        new Date(e.paidAt).getFullYear() === now.getFullYear() &&
        new Date(e.paidAt).getMonth() === now.getMonth()
    )
  )
  const handleSubmitExpense = useCallback(
    async (data: ExpenseFormData) => {
      try {
        if (!address) throw Error('Connect a wallet')
        const token = await readToken(publicClient, requireDeployment(chainId, 'usdc'))
        if (data.documentationUrl && !/^https?:\/\//.test(data.documentationUrl))
          throw Error('Receipt URL must use HTTP or HTTPS')
        addExpense({
          id: crypto.randomUUID(),
          description: data.description,
          amount: parseUnits(data.amount, token.decimals),
          token,
          category: data.category,
          submitter: (data.recipient || address) as Address,
          status: 'pending',
          submittedAt: new Date(),
          documentationUrl: data.documentationUrl,
        })
        addToast({
          type: 'success',
          title: 'Expense Submitted',
          message: `${data.amount} ${token.symbol}`,
        })
        setIsAddModalOpen(false)
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Unable to save expense',
          message: err instanceof Error ? err.message : 'Save failed',
        })
      }
    },
    [address, publicClient, chainId, addExpense, addToast]
  )
  const review = useCallback(
    (id: string, status: 'approved' | 'rejected') => {
      try {
        const expense = allExpenses.find((e) => e.id === id)
        if (!address || !expense || expense.status !== 'pending')
          throw Error('Only pending expenses can be reviewed')
        updateExpense(id, { status, approver: address })
        addLog({
          id: crypto.randomUUID(),
          action: `expense.${status}`,
          actor: address,
          target: expense.submitter,
          details: expense.description,
          timestamp: new Date(),
        })
        addToast({
          type: 'success',
          title: status === 'approved' ? 'Expense Approved' : 'Expense Rejected',
          message: expense.description,
        })
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Review failed',
          message: err instanceof Error ? err.message : 'Review failed',
        })
      }
    },
    [address, allExpenses, updateExpense, addLog, addToast]
  )
  const handleApprove = useCallback((id: string) => review(id, 'approved'), [review])
  const handleReject = useCallback((id: string) => review(id, 'rejected'), [review])
  const handlePay = useCallback(
    async (id: string) => {
      if (paying.current.has(id)) return
      const expense = allExpenses.find((e) => e.id === id)
      if (!address || !expense || expense.status !== 'approved') return
      paying.current.add(id)
      const toast = addToast({
        type: 'loading',
        title: 'Processing Payment',
        message: expense.description,
        persistent: true,
      })
      try {
        const txHash = await pay(`expense:${id}`, expense.submitter, expense.amount, expense.token)
        updateExpense(id, {
          status: 'paid',
          paymentTxHash: txHash,
          paidAt: new Date().toISOString(),
        })
        addLog({
          id: `expense:${id}:paid`,
          action: 'expense.paid',
          actor: address,
          target: expense.submitter,
          details: expense.description,
          txHash,
          timestamp: new Date(),
        })
        updateToast(toast, {
          type: 'success',
          title: 'Expense Paid',
          message: 'Transaction confirmed',
          persistent: false,
        })
      } catch (err) {
        updateToast(toast, {
          type: 'error',
          title: 'Payment Needs Attention',
          message: err instanceof Error ? err.message : 'Payment failed',
          persistent: false,
        })
      } finally {
        paying.current.delete(id)
      }
    },
    [address, allExpenses, pay, updateExpense, addLog, addToast, updateToast]
  )

  if (!isConnected) {
    return <ConnectWalletCard message="Please connect your wallet to manage expenses" />
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p style={{ color: 'rgb(var(--muted-foreground))' }}>Loading expenses...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p style={{ color: 'rgb(var(--destructive))' }}>Error: {error.message}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader title="Expense Management" description="Track and approve business expenses" />
        <Button onClick={() => setIsAddModalOpen(true)}>
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Submit Expense
        </Button>
      </div>

      <ExpenseSummaryCards
        totalPending={totalPending}
        totalApproved={totalApproved}
        totalPaidMTD={totalPaidMTD}
        totalExpenses={allExpenses.length}
      />

      <ExpenseListCard
        expenses={expenses}
        filterStatus={filterStatus}
        onFilterChange={setFilterStatus}
        onApprove={handleApprove}
        onReject={handleReject}
        onPay={handlePay}
      />

      <SubmitExpenseModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleSubmitExpense}
      />
    </div>
  )
}
