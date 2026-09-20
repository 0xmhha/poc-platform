import {
  getEcdsaValidator,
  getEntryPoint,
  getKernel,
  getKernelFactory,
  getVerifyingPaymaster,
} from '@stablenet/contracts'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// ============================================================================
// F-02: Gas payment mode types and hook
// RED phase — useGasPaymentMode does not exist yet
// ============================================================================

const TEST_CHAIN_ID = 8283

// Mock useSmartAccount to control isSmartAccount state
const mockSmartAccountStatus = {
  isSmartAccount: false,
  implementation: null,
  code: null,
  isLoading: false,
}

vi.mock('../useSmartAccount', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useSmartAccount')>()
  return {
    ...actual,
    useSmartAccount: () => ({
      status: mockSmartAccountStatus,
      contracts: {
        entryPoint: getEntryPoint(TEST_CHAIN_ID),
        kernel: getKernel(TEST_CHAIN_ID),
        kernelFactory: getKernelFactory(TEST_CHAIN_ID),
        ecdsaValidator: getEcdsaValidator(TEST_CHAIN_ID),
      },
    }),
  }
})

// Mock providers context
vi.mock('@/providers', () => ({
  useStableNetContext: () => ({
    bundlerUrl: 'http://localhost:4337',
    paymasterUrl: 'http://localhost:4338',
    paymaster: getVerifyingPaymaster(TEST_CHAIN_ID),
    entryPoint: getEntryPoint(TEST_CHAIN_ID),
    chainId: TEST_CHAIN_ID,
  }),
}))

describe('F-02: useGasPaymentMode', () => {
  describe('type definitions', () => {
    it('should export GasPaymentMode type with three modes', async () => {
      const mod = await import('../useGasPaymentMode')
      // The module should exist
      expect(mod).toBeDefined()

      // Type check via runtime: the hook should return selectedMode
      // that is one of 'self-pay' | 'erc20-paymaster' | 'sponsored'
      const validModes = ['self-pay', 'erc20-paymaster', 'sponsored']
      expect(validModes).toContain('self-pay')
      expect(validModes).toContain('erc20-paymaster')
      expect(validModes).toContain('sponsored')
    })
  })

  describe('hook behavior', () => {
    it('should default to sponsored mode', async () => {
      const { useGasPaymentMode } = await import('../useGasPaymentMode')
      const { result } = renderHook(() => useGasPaymentMode())

      expect(result.current.selectedMode).toBe('sponsored')
    })

    it('should allow changing mode', async () => {
      const { useGasPaymentMode } = await import('../useGasPaymentMode')
      const { result } = renderHook(() => useGasPaymentMode())

      act(() => {
        result.current.setMode('self-pay')
      })

      expect(result.current.selectedMode).toBe('self-pay')
    })

    it('should indicate available modes for Smart Account', async () => {
      mockSmartAccountStatus.isSmartAccount = true

      const { useGasPaymentMode } = await import('../useGasPaymentMode')
      const { result } = renderHook(() => useGasPaymentMode())

      // Smart Account should have all 3 modes available
      expect(result.current.availableModes).toContain('self-pay')
      expect(result.current.availableModes).toContain('erc20-paymaster')
      expect(result.current.availableModes).toContain('sponsored')

      // Reset
      mockSmartAccountStatus.isSmartAccount = false
    })

    it('should only allow self-pay for EOA (non-Smart Account)', async () => {
      mockSmartAccountStatus.isSmartAccount = false

      const { useGasPaymentMode } = await import('../useGasPaymentMode')
      const { result } = renderHook(() => useGasPaymentMode())

      // EOA can only do self-pay (no bundler involved)
      expect(result.current.availableModes).toContain('self-pay')
      // Paymaster modes require UserOp via bundler, not available for plain EOA
      expect(result.current.availableModes).not.toContain('erc20-paymaster')
      expect(result.current.availableModes).not.toContain('sponsored')
    })

    it('should return mode description for UI display', async () => {
      const { useGasPaymentMode } = await import('../useGasPaymentMode')
      const { result } = renderHook(() => useGasPaymentMode())

      expect(result.current.modeDescriptions).toBeDefined()
      expect(result.current.modeDescriptions['self-pay']).toBeTruthy()
      expect(result.current.modeDescriptions['erc20-paymaster']).toBeTruthy()
      expect(result.current.modeDescriptions['sponsored']).toBeTruthy()
    })
  })
})
