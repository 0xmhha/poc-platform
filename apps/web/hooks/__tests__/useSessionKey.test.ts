import { act, renderHook, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionKey } from '../useSessionKey'

// Mock wagmi hooks — stable references to prevent infinite re-render loops
const mockWriteContract = vi.fn().mockResolvedValue('0xtxhash')
const mockReadContract = vi.fn().mockResolvedValue([])

const mockAccountReturn = {
  address: '0x1234567890123456789012345678901234567890',
  isConnected: true,
}
const mockWalletClientData = { writeContract: mockWriteContract }
const mockWalletClientReturn = { data: mockWalletClientData }
const mockReceipt = vi.fn().mockResolvedValue({ status: 'success' })
const mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockReceipt }

vi.mock('wagmi', () => ({
  useAccount: () => mockAccountReturn,
  useChainId: () => 8283,
  useWalletClient: () => mockWalletClientReturn,
  usePublicClient: () => mockPublicClient,
}))

vi.mock('@/lib/contracts/deployment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/contracts/deployment')>()),
  optionalDeployment: () => '0x5555555555555555555555555555555555555555',
}))
const mockStore = vi.fn()
vi.mock('@/lib/sessionKeyVault', () => ({
  retainSessionKey: (...args: unknown[]) => mockStore(...args),
  clearSessionScope: vi.fn(),
  forgetSessionKey: vi.fn(),
  signSessionHash: vi.fn(),
}))

// Mock viem/accounts
const mockGeneratePrivateKey = vi.fn()
const mockPrivateKeyToAccount = vi.fn()
vi.mock('viem/accounts', () => ({
  generatePrivateKey: (...args: unknown[]) => mockGeneratePrivateKey(...args),
  privateKeyToAccount: (...args: unknown[]) => mockPrivateKeyToAccount(...args),
}))

describe('useSessionKey - keypair generation', () => {
  const MOCK_PRIVATE_KEY = '0x' + 'ab'.repeat(32)
  const MOCK_SESSION_ADDRESS = '0x' + 'cd'.repeat(20)

  beforeEach(() => {
    vi.clearAllMocks()
    mockGeneratePrivateKey.mockReturnValue(MOCK_PRIVATE_KEY)
    mockPrivateKeyToAccount.mockReturnValue({ address: MOCK_SESSION_ADDRESS })
    mockReadContract.mockResolvedValue([])
    mockWriteContract.mockResolvedValue('0xtxhash')
    mockReceipt.mockResolvedValue({ status: 'success' })
  })

  it('should use generatePrivateKey to create session key', async () => {
    const { result } = renderHook(() => useSessionKey())

    // Wait for initial mount effect (refresh) to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.createSessionKey({})
    })

    expect(mockGeneratePrivateKey).toHaveBeenCalled()
  })

  it('should derive address from private key', async () => {
    const { result } = renderHook(() => useSessionKey())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.createSessionKey({})
    })

    expect(mockPrivateKeyToAccount).toHaveBeenCalledWith(MOCK_PRIVATE_KEY)
  })

  it('should isolate the signer by account and chain', async () => {
    const { result } = renderHook(() => useSessionKey())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.createSessionKey({})
    })

    expect(mockStore).toHaveBeenCalledWith(
      `8283:${mockAccountReturn.address}`,
      MOCK_SESSION_ADDRESS,
      MOCK_PRIVATE_KEY,
      (1n << 48n) - 1n
    )
  })

  it('should use derived address for session key registration', async () => {
    const { result } = renderHook(() => useSessionKey())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // biome-ignore lint/suspicious/noExplicitAny: test variable reassigned in act() callback
    let res: any = null
    await act(async () => {
      res = await result.current.createSessionKey({})
    })

    // The returned sessionKey address should match privateKeyToAccount result
    expect(res?.sessionKey).toBe(MOCK_SESSION_ADDRESS)
  })
  it('registers the actual executor ABI with zero native spending by default', async () => {
    const { result } = renderHook(() => useSessionKey())
    await act(async () => {
      await result.current.createSessionKey({})
    })
    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'addSessionKey',
        args: [MOCK_SESSION_ADDRESS, 0, 2 ** 48 - 1, 0n],
      })
    )
  })
  it('does not retain a signer or report success after a reverted registration', async () => {
    mockReceipt.mockResolvedValueOnce({ status: 'reverted' })
    const { result } = renderHook(() => useSessionKey())
    await act(async () => {
      expect(await result.current.createSessionKey({})).toBeNull()
    })
    expect(mockStore).not.toHaveBeenCalled()
  })
})
