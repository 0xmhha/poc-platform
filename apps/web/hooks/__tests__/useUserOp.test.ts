import { getEntryPoint } from '@stablenet/contracts'
import { act, renderHook } from '@testing-library/react'
import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserOp } from '../useUserOp'

// ============================================================================
// Mocks — vi.hoisted ensures these are available during vi.mock hoisting
// ============================================================================

const {
  mockSendTransaction,
  mockWaitReceipt,
  mockRequest,
  mockGetProvider,
  mockTxReceipt,
  connector,
} = vi.hoisted(() => {
  const mockGetProvider = vi.fn()
  return {
    mockSendTransaction: vi.fn(),
    mockWaitReceipt: vi.fn().mockResolvedValue({
      success: true,
      receipt: { transactionHash: `0x${'ee'.repeat(32)}` },
    }),
    mockRequest: vi.fn(),
    mockGetProvider,
    connector: { getProvider: mockGetProvider },
    mockTxReceipt: vi.fn(),
  }
})

// Mock wallet-sdk: only createBundlerClient is still used directly
vi.mock('@stablenet/wallet-sdk', () => ({
  createBundlerClient: vi.fn(() => ({
    waitForUserOperationReceipt: mockWaitReceipt,
  })),
}))

// Mock wagmi: useAccount returns a connector with getProvider()
vi.mock('wagmi', () => ({
  useAccount: () => ({
    connector,
  }),
}))

// Mock context provider
vi.mock('@/providers', () => ({
  useStableNetContext: () => ({
    bundlerUrl: 'http://localhost:4337',
    chainId: 8283,
    isReady: true,
    publicClient: { waitForTransactionReceipt: mockTxReceipt },
    entryPoint: getEntryPoint(8283) as Address,
  }),
}))

const SENDER = '0x1234567890123456789012345678901234567890' as Address
const RECIPIENT = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address
const TX_HASH = `0x${'aa'.repeat(32)}` as Hex

// ============================================================================
// Tests
// ============================================================================

describe('useUserOp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockTxReceipt.mockResolvedValue({ status: 'success', transactionHash: TX_HASH })
    mockSendTransaction.mockResolvedValue(TX_HASH)
    mockRequest.mockResolvedValue(TX_HASH)
    // Mock connector.getProvider() to return provider with sendTransaction
    mockGetProvider.mockResolvedValue({
      sendTransaction: mockSendTransaction,
      request: mockRequest,
    })
  })

  it('does not turn receipt timeout into confirmed success', async () => {
    mockTxReceipt.mockRejectedValueOnce(Error('timeout'))
    const { result } = renderHook(() => useUserOp())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.sendUserOp(SENDER, { to: RECIPIENT, value: 1n, data: '0x' })
    })
    expect(outcome).toMatchObject({ status: 'submitted', success: false })
  })
  it('reports reverted transactions as failures', async () => {
    mockTxReceipt.mockResolvedValueOnce({ status: 'reverted', transactionHash: TX_HASH })
    const { result } = renderHook(() => useUserOp())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.sendUserOp(SENDER, { to: RECIPIENT, value: 1n, data: '0x' })
    })
    expect(outcome).toMatchObject({ status: 'failed', success: false })
  })
  it('distinguishes a user cancellation from an unknown submission failure', async () => {
    mockRequest.mockRejectedValueOnce({ code: 4001, message: 'User rejected the request' })
    const { result } = renderHook(() => useUserOp())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    await act(async () => {
      await result.current.sendUserOp(SENDER, { to: RECIPIENT, value: 1n, data: '0x' })
    })
    expect(result.current.getLastSubmissionFailure()).toBe('rejected')

    mockRequest.mockRejectedValueOnce(Error('transport disconnected'))
    await act(async () => {
      await result.current.sendUserOp(SENDER, { to: RECIPIENT, value: 1n, data: '0x' })
    })
    expect(result.current.getLastSubmissionFailure()).toBe('unknown')
  })

  describe('sendUserOp', () => {
    it('should send transaction through wallet provider', async () => {
      const { result } = renderHook(() => useUserOp())

      // Wait for provider resolution from connector
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10))
      })

      let opResult: unknown
      await act(async () => {
        opResult = await result.current.sendUserOp(SENDER, {
          to: RECIPIENT,
          value: 1000000000000000000n, // 1 ETH
          data: '0x' as Hex,
        })
      })

      // Should call provider.request with EIP-1193 eth_sendTransaction
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'eth_sendTransaction',
        params: [
          {
            from: SENDER,
            to: RECIPIENT,
            value: '0xde0b6b3a7640000', // 1 ETH in hex wei
            data: '0x',
          },
        ],
      })

      // Should return confirmed result
      expect(opResult).toEqual({
        userOpHash: TX_HASH,
        transactionHash: TX_HASH,
        success: true,
        status: 'confirmed',
      })
    })

    it('should send custom calldata (staking, swap, etc.)', async () => {
      const { result } = renderHook(() => useUserOp())
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10))
      })

      const customCalldata = '0xa9059cbb000000000000000000000000abcdef' as Hex

      await act(async () => {
        await result.current.sendUserOp(SENDER, {
          to: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as Address,
          data: customCalldata,
        })
      })

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'eth_sendTransaction',
        params: [
          expect.objectContaining({
            from: SENDER,
            to: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
            data: customCalldata,
          }),
        ],
      })
    })

    it('should set isLoading during transaction', async () => {
      // Make request hang
      mockRequest.mockImplementation(() => new Promise((r) => setTimeout(() => r(TX_HASH), 100)))

      const { result } = renderHook(() => useUserOp())
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10))
      })

      expect(result.current.isLoading).toBe(false)

      let sendPromise: Promise<unknown>
      act(() => {
        sendPromise = result.current.sendUserOp(SENDER, {
          to: RECIPIENT,
          data: '0x' as Hex,
        })
      })

      // isLoading should be true during send
      expect(result.current.isLoading).toBe(true)

      await act(async () => {
        await sendPromise
      })

      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('sendTransaction helper', () => {
    it('should parse ETH value and send through provider', async () => {
      const { result } = renderHook(() => useUserOp())
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10))
      })

      await act(async () => {
        await result.current.sendTransaction(SENDER, RECIPIENT, '1.5')
      })

      // Should convert '1.5' ETH to wei (hex)
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'eth_sendTransaction',
        params: [
          expect.objectContaining({
            from: SENDER,
            to: RECIPIENT,
            value: '0x14d1120d7b160000', // 1.5 ETH in hex wei
            data: '0x',
          }),
        ],
      })
    })
  })

  describe('error handling', () => {
    it('should handle provider.request errors', async () => {
      mockRequest.mockRejectedValueOnce(new Error('AA21 did not pay prefund'))

      const { result } = renderHook(() => useUserOp())
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10))
      })

      let opResult: unknown
      await act(async () => {
        opResult = await result.current.sendUserOp(SENDER, {
          to: RECIPIENT,
          data: '0x' as Hex,
        })
      })

      expect(opResult).toBeNull()
      expect(result.current.error).toBeTruthy()
      expect(result.current.error?.message).toContain('AA21 did not pay prefund')
    })

    it('should handle user rejection', async () => {
      mockRequest.mockRejectedValueOnce(new Error('User rejected the request'))

      const { result } = renderHook(() => useUserOp())
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10))
      })

      let opResult: unknown
      await act(async () => {
        opResult = await result.current.sendUserOp(SENDER, {
          to: RECIPIENT,
          data: '0x' as Hex,
        })
      })

      expect(opResult).toBeNull()
      expect(result.current.error?.message).toContain('User rejected')
    })

    it('should return null when connector has no provider', async () => {
      // Override getProvider to return null
      mockGetProvider.mockResolvedValueOnce(null)

      const { result } = renderHook(() => useUserOp())
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10))
      })

      let opResult: unknown
      await act(async () => {
        opResult = await result.current.sendUserOp(SENDER, {
          to: RECIPIENT,
          data: '0x' as Hex,
        })
      })

      expect(opResult).toBeNull()
      expect(result.current.error?.message).toContain('wallet not detected')
    })

    it('should clear error with clearError', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Some error'))

      const { result } = renderHook(() => useUserOp())
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10))
      })

      await act(async () => {
        await result.current.sendUserOp(SENDER, {
          to: RECIPIENT,
          data: '0x' as Hex,
        })
      })

      expect(result.current.error).toBeTruthy()

      act(() => {
        result.current.clearError()
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('recheckUserOp', () => {
    it('should poll bundler for receipt of previously submitted op', async () => {
      const { result } = renderHook(() => useUserOp())

      const userOpHash = `0x${'bb'.repeat(32)}` as Hex
      let checkResult: unknown
      await act(async () => {
        checkResult = await result.current.recheckUserOp(userOpHash)
      })

      expect(checkResult).toEqual(
        expect.objectContaining({
          userOpHash,
          success: true,
          status: 'confirmed',
        })
      )
    })
  })
})
