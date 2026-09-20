'use client'

import { renderHook, waitFor } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTransactionHistory } from '../useTransactionHistory'

// Mock publicClient with getLogs, getBlockNumber, getBlock, readContract
const { mockNativeTransactions } = vi.hoisted(() => ({ mockNativeTransactions: vi.fn() }))
vi.mock('@stablenet/core', () => ({
  createIndexerClient: () => ({ getTransactionsByAddress: mockNativeTransactions }),
}))
const mockGetLogs = vi.fn()
const mockGetBlockNumber = vi.fn()
const mockGetBlock = vi.fn()
const mockReadContract = vi.fn()

// Stable reference to avoid re-render loops from useCallback dependencies
const mockPublicClient = {
  getLogs: mockGetLogs,
  getBlockNumber: mockGetBlockNumber,
  getBlock: mockGetBlock,
  readContract: mockReadContract,
}

const mockContextValue = {
  chainId: 8283,
  indexerUrl: 'http://localhost:4000',
  publicClient: mockPublicClient,
}

vi.mock('@/providers/StableNetProvider', () => ({
  useStableNetContext: () => mockContextValue,
}))

// Mock @stablenet/contracts
vi.mock('@stablenet/contracts', () => ({
  getDefaultTokens: (chainId: number) => {
    if (chainId === 8283) {
      return [
        {
          address: '0x085ee10cc10be8fb2ce51feb13e809a0c3f98699',
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: 6,
        },
      ]
    }
    return []
  },
}))

describe('useTransactionHistory — on-chain path', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address

  beforeEach(() => {
    vi.clearAllMocks()
    mockNativeTransactions.mockResolvedValue({ nodes: [] })
    mockGetBlockNumber.mockResolvedValue(10000n)
    mockGetBlock.mockResolvedValue({ timestamp: 1705881n })
  })

  it('should fetch Transfer logs and map to transactions', async () => {
    const sentLogs = [
      {
        address: '0x085ee10cc10be8fb2ce51feb13e809a0c3f98699',
        args: {
          from: testAddress,
          to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          value: 5000000n,
        },
        transactionHash: '0xabc123',
        blockNumber: 9999n,
        logIndex: 0,
      },
    ]

    mockGetLogs
      .mockResolvedValueOnce(sentLogs) // sent
      .mockResolvedValueOnce([]) // received

    const { result } = renderHook(() => useTransactionHistory({ address: testAddress }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.transactions).toHaveLength(1)
    expect(result.current.error).toBeNull()

    const tx = result.current.transactions[0]
    expect(tx.hash).toBe('0xabc123')
    expect(tx.tokenTransfer).toBeDefined()
    expect(tx.tokenTransfer!.value).toBe(5000000n)
    expect(tx.tokenTransfer!.symbol).toBe('USDC')
    expect(tx.tokenTransfer!.decimals).toBe(6)
  })

  it('should deduplicate logs appearing in both sent and received', async () => {
    const log = {
      address: '0x085ee10cc10be8fb2ce51feb13e809a0c3f98699',
      args: {
        from: testAddress,
        to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        value: 1000000n,
      },
      transactionHash: '0xdup123',
      blockNumber: 9999n,
      logIndex: 0,
    }

    mockGetLogs
      .mockResolvedValueOnce([log]) // sent
      .mockResolvedValueOnce([log]) // received (same log)

    const { result } = renderHook(() => useTransactionHistory({ address: testAddress }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.transactions).toHaveLength(1)
  })

  it('should handle getLogs failure gracefully', async () => {
    mockGetLogs.mockRejectedValue(new Error('RPC error'))

    const { result } = renderHook(() => useTransactionHistory({ address: testAddress }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.transactions).toHaveLength(0)
    expect(result.current.error).toBeTruthy()
  })

  it('should return empty when no address is provided', () => {
    const { result } = renderHook(() => useTransactionHistory({ address: undefined }))

    expect(result.current.transactions).toHaveLength(0)
    expect(result.current.isLoading).toBe(false)
  })

  it('should use external fetch when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue([
      {
        hash: '0xext1',
        from: testAddress,
        to: '0x0000000000000000000000000000000000000001' as Address,
        value: 1000000000000000000n,
        chainId: 8283,
        status: 'confirmed',
        timestamp: 1705881600,
      },
    ])

    const { result } = renderHook(() =>
      useTransactionHistory({ address: testAddress, fetchTransactions: mockFetch })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockFetch).toHaveBeenCalledWith(testAddress)
    expect(result.current.transactions).toHaveLength(1)
    // publicClient should not be called when external fetch is used
    expect(mockGetLogs).not.toHaveBeenCalled()
  })
  it('includes native transfers and failed calls without Transfer logs', async () => {
    mockGetLogs.mockResolvedValue([])
    mockNativeTransactions.mockResolvedValue({
      nodes: [
        {
          hash: '0xnative',
          from: testAddress,
          to: testAddress,
          value: '123',
          status: 1,
          timestamp: 2000,
        },
        {
          hash: '0xfailed',
          from: testAddress,
          to: testAddress,
          value: '0',
          status: 0,
          timestamp: 1000,
        },
      ],
    })
    const { result } = renderHook(() => useTransactionHistory({ address: testAddress }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.transactions.map((tx) => [tx.hash, tx.status, tx.value])).toEqual([
      ['0xnative', 'confirmed', 123n],
      ['0xfailed', 'failed', 0n],
    ])
  })
})
