import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuditLogs } from '../useAuditLogs'
import { useExpenses } from '../useExpenses'
import { usePayroll } from '../usePayroll'
import { usePools } from '../usePools'
import { useTokens } from '../useTokens'
import { useTransactionHistory } from '../useTransactionHistory'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  client: { readContract: vi.fn(), multicall: vi.fn() },
}))
vi.mock('@/providers/StableNetProvider', () => ({
  useStableNetContext: () => ({
    chainId: 31337,
    indexerUrl: 'http://localhost:4000',
    publicClient: mocks.client,
  }),
}))
vi.mock('@/lib/contracts/deployment', () => ({
  optionalDeployment: (_chain: number, key: string) =>
    key === 'uniswapV2Router' ? '0x1111111111111111111111111111111111111111' : undefined,
}))
vi.mock('@stablenet/contracts', () => ({ getChainAddresses: () => ({ raw: {} }) }))

// useTokens imports useWallet from @/hooks/useWallet
vi.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({
    isConnected: true,
    address: '0x1234567890123456789012345678901234567890',
  }),
}))

// Mock constants for usePools
vi.mock('@/lib/constants', () => ({
  getServiceUrls: () => ({
    orderRouter: 'http://localhost:8087',
    bundler: 'http://localhost:4337',
    paymaster: 'http://localhost:4338',
    stealthServer: 'http://localhost:4339',
    indexer: 'http://localhost:4000',
  }),
}))

describe('usePools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.client.readContract.mockImplementation(async ({ functionName }) => {
      const values: Record<string, unknown> = {
        factory: '0x1111111111111111111111111111111111111111',
        allPairsLength: 1n,
        allPairs: '0x2222222222222222222222222222222222222222',
        token0: '0x3333333333333333333333333333333333333333',
        token1: '0x4444444444444444444444444444444444444444',
        getReserves: [1000n, 2000n, 0],
        totalSupply: 100n,
        balanceOf: 10n,
        name: 'Token',
        symbol: 'TOK',
        decimals: 6,
      }
      if (!(functionName in values)) throw Error(functionName)
      return values[functionName]
    })
  })
  it('reads actual reserves, token metadata and LP ownership', async () => {
    const { result } = renderHook(() => usePools())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.pools[0].reserve0).toBe(1000n)
    expect(result.current.positions[0]).toMatchObject({
      liquidity: 10n,
      token0Amount: 100n,
      token1Amount: 200n,
      shareOfPool: 10,
    })
  })
  it('surfaces RPC failure instead of fabricated pools', async () => {
    mocks.client.readContract.mockRejectedValue(Error('RPC unavailable'))
    const { result } = renderHook(() => usePools())
    await waitFor(() => expect(result.current.error?.message).toBe('RPC unavailable'))
    expect(result.current.pools).toEqual([])
  })
  it('refreshes on-chain state', async () => {
    const { result } = renderHook(() => usePools())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const count = mocks.client.readContract.mock.calls.length
    await act(() => result.current.refresh())
    expect(mocks.client.readContract.mock.calls.length).toBeGreaterThan(count)
  })
})

describe('useTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch tokens from registry', async () => {
    const mockTokens = [
      { address: '0x0', symbol: 'ETH', name: 'Ether', decimals: 18 },
      { address: '0x1', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    ]

    const mockFetchTokens = vi.fn().mockResolvedValue(mockTokens)

    const { result } = renderHook(() =>
      useTokens({
        fetchTokens: mockFetchTokens,
      })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.tokens).toHaveLength(2)
    expect(mockFetchTokens).toHaveBeenCalled()
  })
})

describe('usePayroll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch payroll entries', async () => {
    const mockPayroll = [
      {
        id: '1',
        recipient: '0x1234567890123456789012345678901234567890',
        amount: BigInt('1000000000'),
        token: { address: '0x1', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        frequency: 'monthly',
        nextPaymentDate: new Date('2025-02-01'),
        status: 'active',
      },
    ]

    const mockFetchPayroll = vi.fn().mockResolvedValue(mockPayroll)

    const { result } = renderHook(() =>
      usePayroll({
        fetchPayroll: mockFetchPayroll,
      })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.payrollEntries).toHaveLength(1)
    expect(result.current.payrollEntries[0].frequency).toBe('monthly')
  })

  it('should calculate summary statistics', async () => {
    const mockPayroll = [
      {
        id: '1',
        recipient: '0x1234',
        amount: BigInt('1000000000'), // 1000 USDC
        token: { address: '0x1', symbol: 'USDC', decimals: 6 },
        frequency: 'monthly',
        nextPaymentDate: new Date('2025-02-01'),
        status: 'active',
      },
      {
        id: '2',
        recipient: '0x5678',
        amount: BigInt('500000000'), // 500 USDC
        token: { address: '0x1', symbol: 'USDC', decimals: 6 },
        frequency: 'monthly',
        nextPaymentDate: new Date('2025-02-01'),
        status: 'active',
      },
    ]

    const mockFetchPayroll = vi.fn().mockResolvedValue(mockPayroll)

    const { result } = renderHook(() =>
      usePayroll({
        fetchPayroll: mockFetchPayroll,
      })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.summary.totalMonthly).toBe(1500) // 1000 + 500
    expect(result.current.summary.activeEmployees).toBe(2)
  })
})

describe('useAuditLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch audit logs from blockchain events', async () => {
    const mockLogs = [
      {
        id: '1',
        action: 'PayrollExecuted',
        actor: '0x1234567890123456789012345678901234567890',
        target: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        details: 'Paid 1000 USDC',
        timestamp: new Date('2025-01-20'),
        txHash: '0xabc123',
      },
    ]

    const mockFetchLogs = vi.fn().mockResolvedValue(mockLogs)

    const { result } = renderHook(() =>
      useAuditLogs({
        fetchLogs: mockFetchLogs,
      })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.logs).toHaveLength(1)
    expect(result.current.logs[0].action).toBe('PayrollExecuted')
  })

  it('should support filtering by action type', async () => {
    const mockLogs = [
      { id: '1', action: 'PayrollExecuted', actor: '0x1234', timestamp: new Date() },
      { id: '2', action: 'ExpenseApproved', actor: '0x5678', timestamp: new Date() },
    ]

    const mockFetchLogs = vi.fn().mockResolvedValue(mockLogs)

    const { result } = renderHook(() =>
      useAuditLogs({
        fetchLogs: mockFetchLogs,
        filter: { action: 'PayrollExecuted' },
      })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.logs).toHaveLength(1)
    expect(result.current.logs[0].action).toBe('PayrollExecuted')
  })
})

describe('useExpenses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch expenses', async () => {
    const mockExpenses = [
      {
        id: '1',
        description: 'Cloud services',
        amount: BigInt('500000000'),
        token: { address: '0x1', symbol: 'USDC', decimals: 6 },
        category: 'infrastructure',
        submitter: '0x1234567890123456789012345678901234567890',
        status: 'pending',
        submittedAt: new Date('2025-01-15'),
      },
    ]

    const mockFetchExpenses = vi.fn().mockResolvedValue(mockExpenses)

    const { result } = renderHook(() =>
      useExpenses({
        fetchExpenses: mockFetchExpenses,
      })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.expenses).toHaveLength(1)
    expect(result.current.expenses[0].category).toBe('infrastructure')
  })

  it('should filter by status', async () => {
    const mockExpenses = [
      { id: '1', status: 'pending', category: 'software' },
      { id: '2', status: 'approved', category: 'travel' },
    ]

    const mockFetchExpenses = vi.fn().mockResolvedValue(mockExpenses)

    const { result } = renderHook(() =>
      useExpenses({
        fetchExpenses: mockFetchExpenses,
        filter: { status: 'pending' },
      })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.expenses).toHaveLength(1)
    expect(result.current.expenses[0].status).toBe('pending')
  })
})

describe('useTransactionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch transaction history', async () => {
    const mockTransactions = [
      {
        hash: '0xabc123',
        from: '0x1234567890123456789012345678901234567890',
        to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        value: BigInt('1000000000000000000'),
        chainId: 31337,
        status: 'confirmed',
        timestamp: 1705881600,
      },
    ]

    const mockFetchTransactions = vi.fn().mockResolvedValue(mockTransactions)

    const { result } = renderHook(() =>
      useTransactionHistory({
        address: '0x1234567890123456789012345678901234567890',
        fetchTransactions: mockFetchTransactions,
      })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.transactions).toHaveLength(1)
    expect(result.current.transactions[0].status).toBe('confirmed')
  })

  it('should return empty array when no address provided', async () => {
    const mockFetchTransactions = vi.fn().mockResolvedValue([])

    const { result } = renderHook(() =>
      useTransactionHistory({
        address: undefined,
        fetchTransactions: mockFetchTransactions,
      })
    )

    expect(result.current.transactions).toHaveLength(0)
    expect(mockFetchTransactions).not.toHaveBeenCalled()
  })
})

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x1111111111111111111111111111111111111111' }),
  useChainId: () => 8283,
}))
