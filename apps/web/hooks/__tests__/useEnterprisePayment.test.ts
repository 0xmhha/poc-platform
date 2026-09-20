import { renderHook } from '@testing-library/react'
import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEnterprisePayment } from '../useEnterprisePayment'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  recheck: vi.fn(),
  failure: vi.fn(),
}))

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x1111111111111111111111111111111111111111' }),
  useChainId: () => 31337,
}))

vi.mock('../useUserOp', () => ({
  useUserOp: () => ({
    sendUserOp: mocks.send,
    recheckUserOp: mocks.recheck,
    getLastSubmissionFailure: mocks.failure,
  }),
}))

const recipient = '0x2222222222222222222222222222222222222222' as Address
const token = {
  address: '0x3333333333333333333333333333333333333333' as Address,
  name: 'USD Coin',
  symbol: 'USDC',
  decimals: 6,
}
const hash = `0x${'ab'.repeat(32)}` as Hex
const storageKey =
  'stablenet:enterprise-payments:31337:0x1111111111111111111111111111111111111111:expense:1'

describe('useEnterprisePayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const values = new Map<string, string>()
    vi.mocked(localStorage.getItem).mockImplementation((key) => values.get(key) ?? null)
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => values.set(key, value))
    vi.mocked(localStorage.removeItem).mockImplementation((key) => {
      values.delete(key)
    })
    vi.mocked(localStorage.clear).mockImplementation(() => values.clear())
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: (_key: string, callback: () => Promise<Hex>) => callback() },
    })
  })

  it('clears the journal when the user cancels before submission', async () => {
    mocks.send.mockResolvedValue(null)
    mocks.failure.mockReturnValue('rejected')
    const { result } = renderHook(() => useEnterprisePayment())

    await expect(result.current('expense:1', recipient, 1_000_000n, token)).rejects.toThrow(
      'cancelled before submission'
    )
    expect(localStorage.getItem(storageKey)).toBeFalsy()
  })

  it('keeps an unknown submission blocked to prevent a duplicate payment', async () => {
    mocks.send.mockResolvedValue(null)
    mocks.failure.mockReturnValue('unknown')
    const { result } = renderHook(() => useEnterprisePayment())

    await expect(result.current('expense:1', recipient, 1_000_000n, token)).rejects.toThrow(
      'result is unknown'
    )
    await expect(result.current('expense:1', recipient, 1_000_000n, token)).rejects.toThrow(
      'previous submission has an unknown result'
    )
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '{}')).toMatchObject({
      status: 'unknown',
    })
  })

  it('allows a new attempt after a confirmed revert', async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        status: 'failed',
        fingerprint: `${recipient.toLowerCase()}:${token.address.toLowerCase()}:1000000`,
        hash,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    )
    mocks.send.mockResolvedValue({
      userOpHash: hash,
      transactionHash: hash,
      success: true,
      status: 'confirmed',
    })
    const { result } = renderHook(() => useEnterprisePayment())

    await expect(result.current('expense:1', recipient, 1_000_000n, token)).resolves.toBe(hash)
    expect(mocks.recheck).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
})
