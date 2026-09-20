import {
  ENTRY_POINT_ADDRESS,
  getEcdsaValidator,
  getEntryPoint,
  getKernel,
  getKernelFactory,
  isChainSupported,
} from '@stablenet/contracts'
import { describe, expect, it } from 'vitest'

// ============================================================================
// F-01: Dynamic contract address resolution
// Validates getSmartAccountAddresses resolves from @stablenet/contracts
// ============================================================================

describe('F-01: Dynamic contract address resolution', () => {
  describe('getSmartAccountAddresses', () => {
    it('should return StableNet Local addresses for chain 8283', async () => {
      const mod = await import('../useSmartAccount')
      const fn = (mod as Record<string, unknown>).getSmartAccountAddresses as
        | ((chainId: number) => {
            entryPoint: string
            kernel: string
            kernelFactory: string
            ecdsaValidator: string
          })
        | undefined

      expect(fn).toBeDefined()
      if (!fn) return

      const addresses = fn(8283)

      // Must match @stablenet/contracts values (not hardcoded)
      expect(addresses.entryPoint).toBe(getEntryPoint(8283))
      expect(addresses.kernel).toBe(getKernel(8283))
      expect(addresses.kernelFactory).toBe(getKernelFactory(8283))
      expect(addresses.ecdsaValidator).toBe(getEcdsaValidator(8283))
    })

    it('should return Anvil addresses for chain 31337 from @stablenet/contracts', async () => {
      const mod = await import('../useSmartAccount')
      const fn = (mod as Record<string, unknown>).getSmartAccountAddresses as
        | ((chainId: number) => {
            entryPoint: string
            kernel: string
            kernelFactory: string
            ecdsaValidator: string
          })
        | undefined

      expect(fn).toBeDefined()
      if (!fn) return

      // Chain 31337 should be registered in @stablenet/contracts
      expect(isChainSupported(31337)).toBe(true)

      const addresses = fn(31337)
      expect(addresses.entryPoint).toBe(getEntryPoint(31337))
      expect(addresses.kernel).toBe(getKernel(31337))
      expect(addresses.kernelFactory).toBe(getKernelFactory(31337))
      expect(addresses.ecdsaValidator).toBe(getEcdsaValidator(31337))
    })

    it('should return fallback addresses for unsupported chain', async () => {
      const mod = await import('../useSmartAccount')
      const fn = (mod as Record<string, unknown>).getSmartAccountAddresses as
        | ((chainId: number) => {
            entryPoint: string
            kernel: string
            kernelFactory: string
            ecdsaValidator: string
          })
        | undefined

      expect(fn).toBeDefined()
      if (!fn) return

      // Should not throw for unsupported chain — returns canonical fallback
      const addresses = fn(99999)
      expect(addresses.entryPoint).toBe(ENTRY_POINT_ADDRESS)
      expect(addresses.kernel).toBeDefined()
    })
  })
})
