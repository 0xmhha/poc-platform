'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { formatUnits, parseUnits, zeroAddress } from 'viem'
import { useChainId } from 'wagmi'
import { InfoBanner } from '@/components/common/InfoBanner'
import { PageHeader } from '@/components/common/PageHeader'
import { useToast } from '@/components/common/Toast'
import { useSubscription } from '@/hooks/useSubscription'
import { useSubscriptionEvents } from '@/hooks/useSubscriptionEvents'
import { useWallet } from '@/hooks/useWallet'
import { requireDeployment } from '@/lib/contracts/deployment'
import type { PlanDisplayInfo } from '@/types/subscription'
import { INTERVAL_PRESETS } from '@/types/subscription'
import { MerchantStatsCards } from './cards/MerchantStatsCards'
import { PaymentAnalyticsCard } from './cards/PaymentAnalyticsCard'
import { RecentTransactionsCard } from './cards/RecentTransactionsCard'
import { SubscriptionPlansCard } from './cards/SubscriptionPlansCard'

// ---------- Local types (matching child card prop shapes) ----------

interface MerchantStats {
  totalRevenue: number
  revenueChange: number
  activeSubscriptions: number
  subscriptionChange: number
  successfulPayments: number
  avgTransactionValue: number
  avgValueChange: number
  revenueUnit: string | null
}

interface PaymentData {
  date: string
  successful: number
  failed: number
  revenue: number
}

interface Transaction {
  id: string
  subscriptionId: string
  subscriberAddress: string
  amount: number
  token: string
  status: 'success' | 'failed' | 'pending' | 'refunded'
  txHash?: string
  createdAt: Date
  errorMessage?: string
}

interface SubscriptionPlan {
  id: string
  name: string
  description: string
  price: number
  token: string
  interval: 'daily' | 'weekly' | 'monthly' | 'yearly'
  activeSubscribers: number
  totalRevenue: number
  isActive: boolean
  createdAt: Date
}

type TabId = 'overview' | 'plans' | 'webhooks' | 'api-keys'

interface Tab {
  id: TabId
  label: string
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'plans', label: 'Plans' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'api-keys', label: 'API Keys' },
]

// ---------- Constants ----------

const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  ETH: 18,
}

// ---------- Helpers ----------

function mapInterval(seconds: bigint): 'daily' | 'weekly' | 'monthly' | 'yearly' {
  const s = Number(seconds)
  if (s === 86400) return 'daily'
  if (s === 604800) return 'weekly'
  if (s === 2592000) return 'monthly'
  if (s === 31536000) return 'yearly'
  return 'monthly'
}

function toCardPlan(p: PlanDisplayInfo): SubscriptionPlan {
  return {
    id: p.id.toString(),
    name: p.name,
    description: p.description,
    price: Number(formatUnits(p.price, p.tokenDecimals)),
    token: p.tokenSymbol,
    interval: mapInterval(p.interval),
    activeSubscribers: Number(p.subscriberCount),
    totalRevenue: 0,
    isActive: p.isActive,
    createdAt: new Date(Number(p.createdAt) * 1000),
  }
}

// ---------- Component ----------

export function MerchantDashboard() {
  const router = useRouter()
  const chainId = useChainId()
  const { isConnected, address } = useWallet()
  const { merchantPlans, merchantStats, loadMerchantPlans, createPlan } = useSubscription()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d')

  // On-chain event data for analytics
  const {
    paymentData: eventPaymentData,
    transactions: eventTransactions,
    stats: eventStats,
  } = useSubscriptionEvents(timeRange)

  // Load merchant plans on mount
  useEffect(() => {
    if (isConnected && address) {
      loadMerchantPlans()
    }
  }, [isConnected, address, loadMerchantPlans])

  // Map contract data to card-compatible types
  const plans: SubscriptionPlan[] = merchantPlans.map(toCardPlan)

  // Merge on-chain plan data with event-based stats
  const totalSubscribers = plans.reduce((sum, p) => sum + p.activeSubscribers, 0)

  const stats: MerchantStats = {
    totalRevenue: eventStats.totalRevenue,
    revenueChange: eventStats.revenueChange,
    activeSubscriptions: merchantStats?.activeSubscribers ?? totalSubscribers,
    subscriptionChange: eventStats.subscriptionChange,
    successfulPayments: eventStats.totalPayments,
    avgTransactionValue: eventStats.avgTransactionValue,
    avgValueChange: eventStats.avgValueChange,
    revenueUnit: eventStats.revenueUnit,
  }

  // Use event-based data for analytics and transaction history
  const transactions: Transaction[] = eventTransactions
  const paymentData: PaymentData[] = eventPaymentData

  // ---------- Plan Handlers ----------

  const handleCreatePlan = async (
    plan: Omit<SubscriptionPlan, 'id' | 'activeSubscribers' | 'totalRevenue' | 'createdAt'>
  ) => {
    const tokenAddress = plan.token === 'ETH' ? zeroAddress : requireDeployment(chainId, 'usdc')
    const decimals = TOKEN_DECIMALS[plan.token] ?? 6
    const priceWei = parseUnits(plan.price.toString(), decimals)
    const intervalSeconds =
      INTERVAL_PRESETS[plan.interval as keyof typeof INTERVAL_PRESETS] ?? INTERVAL_PRESETS.monthly

    try {
      await createPlan({
        name: plan.name,
        description: plan.description,
        price: priceWei,
        interval: intervalSeconds,
        token: tokenAddress,
      })
      await loadMerchantPlans()
      addToast({
        type: 'success',
        title: 'Plan Created',
        message: `"${plan.name}" created successfully`,
      })
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Create Plan Failed',
        message: err instanceof Error ? err.message : 'Failed to create plan',
      })
    }
  }

  const handleUpdatePlan = async (_id: string, _updates: Partial<SubscriptionPlan>) => {
    addToast({
      type: 'info',
      title: 'Not Supported',
      message: 'Plan update requires a contract upgrade',
    })
  }

  const handleTogglePlan = async (_id: string, _isActive: boolean) => {
    addToast({
      type: 'info',
      title: 'Not Supported',
      message: 'Plan toggle requires a contract upgrade',
    })
  }

  // ---------- Render ----------

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'rgb(var(--background))' }}>
      <PageHeader
        title="Merchant Dashboard"
        description="Manage your subscriptions, payments, and integrations"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tabs */}
        <div className="mb-6" style={{ borderBottom: '1px solid rgb(var(--border))' }}>
          <nav className="flex gap-8" aria-label="Tabs">
            {TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="pb-4 px-1 border-b-2 font-medium text-sm transition-colors"
                style={{
                  borderColor: activeTab === tab.id ? 'rgb(var(--primary))' : 'transparent',
                  color:
                    activeTab === tab.id ? 'rgb(var(--primary))' : 'rgb(var(--muted-foreground))',
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <MerchantStatsCards stats={stats} />
            <PaymentAnalyticsCard
              data={paymentData}
              revenueUnit={eventStats.revenueUnit}
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
            />
            <RecentTransactionsCard
              transactions={transactions}
              onViewAll={() => router.push('/payment/history')}
              onRetry={async (_id) => {
                addToast({
                  type: 'info',
                  title: 'Not Supported',
                  message: 'Retry is not yet supported',
                })
              }}
            />
          </div>
        )}

        {activeTab === 'plans' && (
          <SubscriptionPlansCard
            plans={plans}
            onCreatePlan={handleCreatePlan}
            onUpdatePlan={handleUpdatePlan}
            onTogglePlan={handleTogglePlan}
          />
        )}

        {activeTab === 'webhooks' && (
          <InfoBanner
            variant="warning"
            title="Webhook service is not configured"
            description="Webhook endpoints and signing secrets must be stored and delivered by a server. Browser-generated secrets are disabled because they cannot authenticate real deliveries."
          />
        )}

        {activeTab === 'api-keys' && (
          <InfoBanner
            variant="warning"
            title="API key service is not configured"
            description="Usable API keys require server-side hashing, authorization, rotation, and revocation. Local test strings are no longer presented as credentials."
          />
        )}
      </div>
    </div>
  )
}
