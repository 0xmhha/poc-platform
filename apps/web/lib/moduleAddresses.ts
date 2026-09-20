import { getChainAddresses } from '@stablenet/contracts'
import type { ModuleType } from '@stablenet/types'
import { MODULE_TYPE } from '@stablenet/types'
import type { Address, Hex } from 'viem'

// ============================================================================
// Module Registry
// ============================================================================

export interface ModuleRegistryEntry {
  address: Address
  moduleType: ModuleType
  defaultInitData: Hex
}

const DEFAULT_CHAIN_ID = 8283

/**
 * Build the module registry for a given chain.
 * Addresses sourced from @stablenet/contracts.
 */
function buildRegistry(chainId: number): Record<string, ModuleRegistryEntry> {
  let raw: Record<string, Address>
  try {
    raw = getChainAddresses(chainId).raw as Record<string, Address>
  } catch {
    return {}
  }
  // Only actual ERC-7579 modules with a deployed address belong in this registry.
  // A DEX router or privacy bank is not an installable executor/fallback.
  const definitions: [string, string, ModuleType][] = [
    ['ecdsa-validator', 'ecdsaValidator', MODULE_TYPE.VALIDATOR],
    ['webauthn-validator', 'webAuthnValidator', MODULE_TYPE.VALIDATOR],
    ['session-key-validator', 'sessionKeyValidator', MODULE_TYPE.VALIDATOR],
    ['session-key-executor', 'sessionKeyExecutor', MODULE_TYPE.EXECUTOR],
    ['subscription-executor', 'recurringPaymentExecutor', MODULE_TYPE.EXECUTOR],
    ['spending-limit-hook', 'spendingLimitHook', MODULE_TYPE.HOOK],
    ['social-recovery', 'weightedEcdsaValidator', MODULE_TYPE.VALIDATOR],
    ['multisig-validator', 'multiSigValidator', MODULE_TYPE.VALIDATOR],
    ['token-receiver-fallback', 'tokenReceiverFallback', MODULE_TYPE.FALLBACK],
  ]
  return Object.fromEntries(
    definitions.flatMap(([id, key, moduleType]) => {
      const address = raw[key]
      return address && /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/i.test(address)
        ? [[id, { address, moduleType, defaultInitData: '0x' as Hex }]]
        : []
    })
  )
}

// Cache to avoid rebuilding on every call
const registryCache = new Map<number, Record<string, ModuleRegistryEntry>>()

function getRegistry(chainId: number): Record<string, ModuleRegistryEntry> {
  let registry = registryCache.get(chainId)
  if (!registry) {
    registry = buildRegistry(chainId)
    registryCache.set(chainId, registry)
  }
  return registry
}

/**
 * @deprecated Use getModuleEntry(moduleId, chainId) instead.
 * Kept for backward compatibility — defaults to chain 8283.
 */
export const MODULE_REGISTRY: Record<string, ModuleRegistryEntry> = buildRegistry(DEFAULT_CHAIN_ID)

/**
 * Look up a module's registry entry by marketplace ID.
 * Returns undefined if the module ID is not recognized.
 */
export function getModuleEntry(
  moduleId: string,
  chainId: number = DEFAULT_CHAIN_ID
): ModuleRegistryEntry | undefined {
  return getRegistry(chainId)[moduleId]
}

/**
 * Get all registered module IDs.
 */
export function getRegisteredModuleIds(): string[] {
  return Object.keys(MODULE_REGISTRY)
}
