import { getChainAddresses, isChainSupported } from '@stablenet/contracts'
import type { Address } from 'viem'
import {
  getAppConfig as getAppConfigFromEnv,
  getContractAddresses as getContractAddressesFromEnv,
  getServiceUrls as getServiceUrlsFromEnv,
} from './config'

/**
 * Contract addresses type
 */
export type ContractAddresses = {
  entryPoint: Address
  accountFactory: Address
  paymaster: Address
  stealthAnnouncer: Address
  stealthRegistry: Address
}

/**
 * Service URLs type
 */
export type ServiceUrls = {
  bundler: string
  paymaster: string
  stealthServer: string
  indexer: string
  orderRouter: string
}

/**
 * Resolve contract addresses from @stablenet/contracts for a given chain
 */
function resolveContractAddressesForChain(chainId: number): ContractAddresses | undefined {
  if (!isChainSupported(chainId)) return undefined

  const addrs = getChainAddresses(chainId)
  return {
    entryPoint: addrs.core.entryPoint,
    accountFactory: addrs.core.kernelFactory,
    paymaster: addrs.paymasters.verifyingPaymaster,
    stealthAnnouncer: addrs.privacy.stealthAnnouncer,
    stealthRegistry: addrs.privacy.stealthRegistry,
  }
}

/**
 * Get contract addresses for a chain
 */
export function getContractAddresses(chainId: number): ContractAddresses | undefined {
  // Try env-based resolution first (includes service URL overrides)
  const addresses = getContractAddressesFromEnv(chainId)
  if (addresses) {
    return addresses as ContractAddresses
  }
  // Fall back to @stablenet/contracts directly
  return resolveContractAddressesForChain(chainId)
}

/**
 * Get service URLs for a chain (with environment override support)
 */
export function getServiceUrls(chainId: number): ServiceUrls | undefined {
  const urls = getServiceUrlsFromEnv(chainId)
  if (urls) {
    return urls as ServiceUrls
  }
  return undefined
}

/**
 * Get app configuration (with environment override support)
 */
export function getAppConfigValue() {
  return getAppConfigFromEnv()
}

/**
 * App configuration
 * @deprecated Use getAppConfigValue() instead for environment override support
 */
export const APP_CONFIG = getAppConfigFromEnv()
