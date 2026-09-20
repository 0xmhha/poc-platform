'use client'

import { formatUSD } from '@/lib/utils'
import { SummaryStatCard } from '../SummaryStatCard'

interface ExpenseSummaryCardsProps {
  totalPending: number | string
  totalApproved: number | string
  totalPaidMTD: number | string
  totalExpenses: number
}

export function ExpenseSummaryCards({
  totalPending,
  totalApproved,
  totalPaidMTD,
  totalExpenses,
}: ExpenseSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <SummaryStatCard
        label="Total Pending"
        value={typeof totalPending === 'string' ? totalPending : formatUSD(totalPending)}
        valueClassName="text-yellow-600"
      />
      <SummaryStatCard
        label="Approved (Not Paid)"
        value={typeof totalApproved === 'string' ? totalApproved : formatUSD(totalApproved)}
        valueClassName="text-blue-600"
      />
      <SummaryStatCard
        label="Paid (MTD)"
        value={typeof totalPaidMTD === 'string' ? totalPaidMTD : formatUSD(totalPaidMTD)}
        valueClassName="text-green-600"
      />
      <SummaryStatCard label="Total Expenses" value={totalExpenses} />
    </div>
  )
}
