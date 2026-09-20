'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/common/Card'

interface PaymentData {
  date: string
  successful: number
  revenue: number
}

interface PaymentAnalyticsCardProps {
  data: PaymentData[]
  timeRange: '7d' | '30d' | '90d'
  onTimeRangeChange: (range: '7d' | '30d' | '90d') => void
  revenueUnit: string | null
}

export function PaymentAnalyticsCard({
  data,
  timeRange,
  onTimeRangeChange,
  revenueUnit,
}: PaymentAnalyticsCardProps) {
  const [activeTab, setActiveTab] = useState<'payments' | 'revenue'>('payments')

  const totalSuccessful = data.reduce((sum, d) => sum + d.successful, 0)
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0)

  const maxValue = Math.max(
    ...data.map((d) => (activeTab === 'payments' ? d.successful : d.revenue)),
    0
  )

  const formatRevenue = (amount: number) =>
    revenueUnit
      ? `${amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${revenueUnit}`
      : 'Unavailable'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Payment Analytics</CardTitle>
            <CardDescription>Track payment performance and revenue over time</CardDescription>
          </div>
          <div className="flex gap-2">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                type="button"
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className="px-3 py-1 text-sm rounded-md transition-colors"
                style={{
                  backgroundColor:
                    timeRange === range ? 'rgb(var(--primary))' : 'rgb(var(--secondary))',
                  color: timeRange === range ? 'white' : 'rgb(var(--muted-foreground))',
                }}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div
            className="text-center p-3 rounded-lg"
            style={{ backgroundColor: 'rgb(var(--secondary))' }}
          >
            <p className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
              {totalSuccessful.toLocaleString()}
            </p>
            <p className="text-sm" style={{ color: 'rgb(var(--muted-foreground))' }}>
              Processed
            </p>
          </div>
          <div
            className="text-center p-3 rounded-lg"
            style={{ backgroundColor: 'rgb(var(--secondary))' }}
          >
            <p className="text-2xl font-bold" style={{ color: 'rgb(var(--success))' }}>
              —
            </p>
            <p className="text-sm" style={{ color: 'rgb(var(--muted-foreground))' }}>
              Failure tracking unavailable
            </p>
          </div>
          <div
            className="text-center p-3 rounded-lg"
            style={{ backgroundColor: 'rgb(var(--secondary))' }}
          >
            <p className="text-2xl font-bold" style={{ color: 'rgb(var(--primary))' }}>
              {formatRevenue(totalRevenue)}
            </p>
            <p className="text-sm" style={{ color: 'rgb(var(--muted-foreground))' }}>
              Revenue
            </p>
          </div>
        </div>

        {/* Chart Tabs */}
        <div className="flex mb-4" style={{ borderBottom: '1px solid rgb(var(--border))' }}>
          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              borderBottom:
                activeTab === 'payments'
                  ? '2px solid rgb(var(--primary))'
                  : '2px solid transparent',
              color:
                activeTab === 'payments' ? 'rgb(var(--primary))' : 'rgb(var(--muted-foreground))',
            }}
          >
            Payments
          </button>
          <button
            type="button"
            onClick={() => revenueUnit && setActiveTab('revenue')}
            disabled={!revenueUnit}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              borderBottom:
                activeTab === 'revenue' ? '2px solid rgb(var(--primary))' : '2px solid transparent',
              color:
                activeTab === 'revenue' ? 'rgb(var(--primary))' : 'rgb(var(--muted-foreground))',
            }}
          >
            Revenue
          </button>
        </div>

        {/* Simple Bar Chart */}
        <div className="h-64 flex items-end gap-1">
          {data.map((d, index) => {
            const value = activeTab === 'payments' ? d.successful : d.revenue
            const height = maxValue > 0 ? (value / maxValue) * 100 : 0
            const successHeight =
              activeTab === 'payments' && maxValue > 0 ? (d.successful / maxValue) * 100 : height

            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: dates can repeat across ranges
                key={`${d.date}-${index}`}
                className="flex-1 flex flex-col items-center group relative"
              >
                {/* Tooltip */}
                <div
                  className="absolute bottom-full mb-2 hidden group-hover:block text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10"
                  style={{ backgroundColor: 'rgb(var(--foreground))' }}
                >
                  {d.date}
                  <br />
                  {activeTab === 'payments' ? (
                    <>Processed: {d.successful}</>
                  ) : (
                    <>Revenue: {formatRevenue(d.revenue)}</>
                  )}
                </div>

                {/* Bar */}
                <div className="w-full flex flex-col" style={{ height: '200px' }}>
                  <div className="flex-1" />
                  {activeTab === 'payments' ? (
                    <div
                      className="w-full rounded-t-sm"
                      style={{
                        height: `${successHeight}%`,
                        backgroundColor: 'rgb(var(--success))',
                      }}
                    />
                  ) : (
                    <div
                      className="w-full rounded-t-sm"
                      style={{ height: `${height}%`, backgroundColor: 'rgb(var(--primary))' }}
                    />
                  )}
                </div>

                {/* Label */}
                <span
                  className="text-xs mt-1 transform -rotate-45 origin-top-left"
                  style={{ color: 'rgb(var(--muted-foreground) / 0.7)' }}
                >
                  {d.date.split('-').slice(1).join('/')}
                </span>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-4">
          {activeTab === 'payments' ? (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgb(var(--success))' }} />
              <span className="text-sm" style={{ color: 'rgb(var(--muted-foreground))' }}>
                Processed
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgb(var(--primary))' }} />
              <span className="text-sm" style={{ color: 'rgb(var(--muted-foreground))' }}>
                Revenue
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
