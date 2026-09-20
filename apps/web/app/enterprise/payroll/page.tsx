'use client'

import { useCallback, useRef, useState } from 'react'
import { type Address, formatUnits, parseUnits } from 'viem'
import { Button, ConnectWalletCard, PageHeader, useToast } from '@/components/common'
import {
  AddEmployeeModal,
  PayrollListCard,
  PayrollQuickActionsCard,
  PayrollSummaryCards,
} from '@/components/enterprise'
import type { EmployeeFormData } from '@/components/enterprise/cards/AddEmployeeModal'
import { useWallet } from '@/hooks'
import { useAuditLogs } from '@/hooks/useAuditLogs'
import { useEnterprisePayment } from '@/hooks/useEnterprisePayment'
import { usePayroll } from '@/hooks/usePayroll'
import { readToken } from '@/lib/contracts/defiReads'
import { requireDeployment } from '@/lib/contracts/deployment'
import { nextPayrollDate, tokenTotals } from '@/lib/enterprise/records'
import { useStableNetContext } from '@/providers'
import type { PayrollEntry } from '@/types'

export default function PayrollPage() {
  const { isConnected, address } = useWallet()
  const { payrollEntries, summary, isLoading, error, addEntry, updateEntry } = usePayroll()
  const { addToast, updateToast } = useToast()
  const { publicClient, chainId } = useStableNetContext()
  const pay = useEnterprisePayment()
  const { addLog } = useAuditLogs()
  const processing = useRef(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [editing, setEditing] = useState<PayrollEntry | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  const handleAddEmployee = useCallback(
    async (data: EmployeeFormData) => {
      try {
        const token = await readToken(publicClient, requireDeployment(chainId, 'usdc'))
        const entry: PayrollEntry = {
          id: editing?.id ?? crypto.randomUUID(),
          recipient: data.walletAddress as Address,
          amount: parseUnits(data.amount, token.decimals),
          token,
          frequency: data.frequency as PayrollEntry['frequency'],
          nextPaymentDate: editing?.nextPaymentDate ?? new Date(),
          status: editing?.status ?? 'active',
          payments: editing?.payments,
        }
        if (editing) updateEntry(editing.id, entry)
        else addEntry(entry)
        addToast({
          type: 'success',
          title: editing ? 'Employee Updated' : 'Employee Added',
          message: `${data.frequency} payments of ${data.amount} ${token.symbol}`,
        })
        setEditing(null)
        setIsAddModalOpen(false)
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Unable to save employee',
          message: err instanceof Error ? err.message : 'Save failed',
        })
      }
    },
    [publicClient, chainId, editing, addEntry, updateEntry, addToast]
  )

  const handleProcessPayments = useCallback(async () => {
    if (processing.current || !address) return
    const due = payrollEntries.filter(
      (e) => e.status === 'active' && e.nextPaymentDate.getTime() <= Date.now()
    )
    if (!due.length) {
      addToast({ type: 'info', title: 'No Payments', message: 'No payroll entries are due' })
      return
    }
    processing.current = true
    setIsProcessing(true)
    const toast = addToast({
      type: 'loading',
      title: 'Processing Payments',
      message: `Processing ${due.length} due payment(s)`,
      persistent: true,
    })
    let count = 0
    try {
      for (const entry of due) {
        const period = entry.nextPaymentDate.toISOString()
        const txHash = await pay(
          `payroll:${entry.id}:${period}`,
          entry.recipient,
          entry.amount,
          entry.token
        )
        updateEntry(entry.id, {
          nextPaymentDate: nextPayrollDate(entry.nextPaymentDate, entry.frequency),
          payments: [
            ...(entry.payments ?? []),
            { txHash, amount: entry.amount.toString(), paidAt: new Date().toISOString() },
          ],
        })
        addLog({
          id: `payroll:${entry.id}:${period}`,
          action: 'payroll.payment',
          actor: address,
          target: entry.recipient,
          details: `Paid ${formatUnits(entry.amount, entry.token.decimals)} ${entry.token.symbol}`,
          timestamp: new Date(),
          txHash,
        })
        count++
      }
      updateToast(toast, {
        type: 'success',
        title: 'Payroll Confirmed',
        message: `${count} payment(s) confirmed`,
        persistent: false,
      })
    } catch (err) {
      updateToast(toast, {
        type: 'error',
        title: 'Payroll Needs Attention',
        message: `${count} confirmed. ${err instanceof Error ? err.message : 'Payment failed'}`,
        persistent: false,
      })
    } finally {
      processing.current = false
      setIsProcessing(false)
    }
  }, [payrollEntries, address, pay, updateEntry, addLog, addToast, updateToast])

  const handleExportReport = useCallback(() => {
    if (payrollEntries.length === 0) {
      addToast({ type: 'info', title: 'No Data', message: 'No payroll data to export' })
      return
    }

    const headers = ['Recipient', 'Amount', 'Token', 'Frequency', 'Status', 'Next Payment']
    const rows = payrollEntries.map((entry) => [
      entry.recipient,
      formatUnits(entry.amount, entry.token.decimals),
      entry.token.symbol,
      entry.frequency,
      entry.status,
      entry.nextPaymentDate.toISOString(),
    ])
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `payroll-report-${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    addToast({
      type: 'success',
      title: 'Report Exported',
      message: 'Payroll report downloaded as CSV',
    })
  }, [payrollEntries, addToast])

  if (!isConnected) {
    return <ConnectWalletCard message="Please connect your wallet to manage payroll" />
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p style={{ color: 'rgb(var(--muted-foreground))' }}>Loading payroll...</p>
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

  const formatNextPayment = (date: Date | null) => {
    if (!date) return 'N/A'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader
          title="Payroll Management"
          description="Manage employee payments and schedules"
        />
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
          Add Employee
        </Button>
      </div>

      <PayrollSummaryCards
        monthlyPayroll={tokenTotals(
          payrollEntries
            .filter((e) => e.status === 'active')
            .map((e) => ({
              token: e.token,
              amount:
                e.frequency === 'weekly'
                  ? (e.amount * 52n) / 12n
                  : e.frequency === 'biweekly'
                    ? (e.amount * 26n) / 12n
                    : e.amount,
            }))
        )}
        activeEmployees={summary.activeEmployees}
        nextPayment={formatNextPayment(summary.nextPaymentDate)}
        ytdPayments={tokenTotals(
          payrollEntries.flatMap((e) =>
            (e.payments ?? [])
              .filter((p) => new Date(p.paidAt).getFullYear() === new Date().getFullYear())
              .map((p) => ({ token: e.token, amount: BigInt(p.amount) }))
          )
        )}
      />

      <PayrollListCard
        entries={payrollEntries}
        onEdit={(id) => {
          setEditing(payrollEntries.find((e) => e.id === id) ?? null)
          setIsAddModalOpen(true)
        }}
      />

      <PayrollQuickActionsCard
        onProcessPayments={handleProcessPayments}
        isProcessing={isProcessing}
        onExportReport={handleExportReport}
      />

      <AddEmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false)
          setEditing(null)
        }}
        initialValues={
          editing
            ? {
                walletAddress: editing.recipient,
                amount: formatUnits(editing.amount, editing.token.decimals),
                frequency: editing.frequency,
              }
            : undefined
        }
        onSubmit={handleAddEmployee}
      />
    </div>
  )
}
