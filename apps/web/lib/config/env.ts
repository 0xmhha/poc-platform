/**
 * Web App Environment Configuration
 *
 * Environment variables for the Next.js web application.
 * All client-side variables must be prefixed with NEXT_PUBLIC_
 *
 * Contract addresses are sourced exclusively from @stablenet/contracts.
 * Service URLs can be overridden via env vars or user settings (Settings page).
 *
 * Priority order for service URLs:
 * 1. User settings from localStorage (Settings page)
 * 2. Environment variables
 * 3. Default values
 */

import { getChainAddresses, getContractAddress, isChainSupported } from '@stablenet/contracts'

import { getRpcSettings } from '../utils'

/**
 * Environment variable names (service URLs and app config only)
 */
export const WEB_ENV_VARS = {
  // Local Service URLs
  LOCAL_RPC_URL: 'NEXT_PUBLIC_LOCAL_RPC_URL',
  LOCAL_BUNDLER_URL: 'NEXT_PUBLIC_LOCAL_BUNDLER_URL',
  LOCAL_PAYMASTER_URL: 'NEXT_PUBLIC_LOCAL_PAYMASTER_URL',
  LOCAL_STEALTH_SERVER_URL: 'NEXT_PUBLIC_LOCAL_STEALTH_SERVER_URL',
  LOCAL_EXPLORER_URL: 'NEXT_PUBLIC_LOCAL_EXPLORER_URL',
  LOCAL_INDEXER_URL: 'NEXT_PUBLIC_LOCAL_INDEXER_URL',
  LOCAL_ORDER_ROUTER_URL: 'NEXT_PUBLIC_LOCAL_ORDER_ROUTER_URL',

  // Testnet Service URLs
  TESTNET_RPC_URL: 'NEXT_PUBLIC_TESTNET_RPC_URL',
  TESTNET_BUNDLER_URL: 'NEXT_PUBLIC_TESTNET_BUNDLER_URL',
  TESTNET_PAYMASTER_URL: 'NEXT_PUBLIC_TESTNET_PAYMASTER_URL',
  TESTNET_STEALTH_SERVER_URL: 'NEXT_PUBLIC_TESTNET_STEALTH_SERVER_URL',
  TESTNET_EXPLORER_URL: 'NEXT_PUBLIC_TESTNET_EXPLORER_URL',
  TESTNET_INDEXER_URL: 'NEXT_PUBLIC_TESTNET_INDEXER_URL',
  TESTNET_ORDER_ROUTER_URL: 'NEXT_PUBLIC_TESTNET_ORDER_ROUTER_URL',

  // App Configuration
  DEFAULT_SLIPPAGE: 'NEXT_PUBLIC_DEFAULT_SLIPPAGE',
  MAX_SLIPPAGE: 'NEXT_PUBLIC_MAX_SLIPPAGE',
  TX_TIMEOUT: 'NEXT_PUBLIC_TX_TIMEOUT',
  DEFAULT_CHAIN_ID: 'NEXT_PUBLIC_DEFAULT_CHAIN_ID',
} as const

/**
 * Default service URLs
 */
const SERVICE_DEFAULTS = {
  // Local (StableNet Local - chainId 8283)
  LOCAL_RPC_URL: 'http://127.0.0.1:8501',
  LOCAL_BUNDLER_URL: 'http://127.0.0.1:4337',
  LOCAL_PAYMASTER_URL: 'http://127.0.0.1:4338',
  LOCAL_STEALTH_SERVER_URL: 'http://127.0.0.1:4339',
  LOCAL_EXPLORER_URL: 'http://127.0.0.1:3001',
  LOCAL_INDEXER_URL: 'http://127.0.0.1:8080/api',
  LOCAL_ORDER_ROUTER_URL: 'http://localhost:8087',

  // Testnet (StableNet Testnet - chainId 82830)
  TESTNET_RPC_URL: 'https://rpc.testnet.stablenet.dev',
  TESTNET_BUNDLER_URL: 'https://bundler.testnet.stablenet.dev',
  TESTNET_PAYMASTER_URL: 'https://paymaster.testnet.stablenet.dev',
  TESTNET_STEALTH_SERVER_URL: 'https://stealth.testnet.stablenet.dev',
  TESTNET_EXPLORER_URL: 'https://explorer.testnet.stablenet.dev',
  TESTNET_INDEXER_URL: 'https://indexer.testnet.stablenet.dev/api',
  TESTNET_ORDER_ROUTER_URL: 'http://localhost:8087',
} as const

/**
 * App configuration defaults
 */
const APP_DEFAULTS = {
  DEFAULT_SLIPPAGE: 0.5, // 0.5%
  MAX_SLIPPAGE: 50, // 50%
  TX_TIMEOUT: 60000, // 60 seconds
  DEFAULT_CHAIN_ID: 8283, // StableNet Local
} as const

/**
 * Get environment variable with fallback (browser-safe)
 */
function getEnvString(name: string, defaultValue: string): string {
  if (typeof window === 'undefined') {
    return process.env[name] ?? defaultValue
  }
  const value = (process.env as Record<string, string | undefined>)[name]
  return value ?? defaultValue
}

/**
 * Get environment variable as number
 */
function getEnvNumber(name: string, defaultValue: number): number {
  const value = getEnvString(name, String(defaultValue))
  const num = Number(value)
  return Number.isNaN(num) ? defaultValue : num
}

/**
 * Get user's custom RPC settings from localStorage (if any)
 */
function getUserRpcSettings() {
  return getRpcSettings()
}

/**
 * Resolve contract addresses from @stablenet/contracts for a given chain.
 * Returns a flat object for backward compatibility with existing consumers.
 */
function resolveContracts(chainId: number) {
  if (!isChainSupported(chainId)) {
    return undefined
  }

  const addrs = getChainAddresses(chainId)

  const safeGetContractAddress = (key: string) => {
    try {
      return getContractAddress(chainId, key)
    } catch {
      return '0x0000000000000000000000000000000000000000' as `0x${string}`
    }
  }

  return {
    entryPoint: addrs.core.entryPoint,
    accountFactory: addrs.core.kernelFactory,
    paymaster: addrs.paymasters.verifyingPaymaster,
    stealthAnnouncer: addrs.privacy.stealthAnnouncer,
    stealthRegistry: addrs.privacy.stealthRegistry,
    sessionKeyManager: safeGetContractAddress('sessionKeyExecutor'),
    subscriptionManager: addrs.subscriptions.subscriptionManager,
    recurringPaymentManager: addrs.subscriptions.recurringPaymentExecutor,
    permissionManager: addrs.subscriptions.permissionManager,
  }
}

/**
 * Get Local configuration (StableNet Local - chainId 8283)
 * User settings from Settings page take priority over env vars and defaults
 */
export function getLocalConfig() {
  const userSettings = getUserRpcSettings()

  return {
    rpcUrl:
      userSettings?.rpcUrl ||
      getEnvString(WEB_ENV_VARS.LOCAL_RPC_URL, SERVICE_DEFAULTS.LOCAL_RPC_URL),
    bundlerUrl:
      userSettings?.bundlerUrl ||
      getEnvString(WEB_ENV_VARS.LOCAL_BUNDLER_URL, SERVICE_DEFAULTS.LOCAL_BUNDLER_URL),
    paymasterUrl:
      userSettings?.paymasterUrl ||
      getEnvString(WEB_ENV_VARS.LOCAL_PAYMASTER_URL, SERVICE_DEFAULTS.LOCAL_PAYMASTER_URL),
    stealthServerUrl: getEnvString(
      WEB_ENV_VARS.LOCAL_STEALTH_SERVER_URL,
      SERVICE_DEFAULTS.LOCAL_STEALTH_SERVER_URL
    ),
    explorerUrl: getEnvString(WEB_ENV_VARS.LOCAL_EXPLORER_URL, SERVICE_DEFAULTS.LOCAL_EXPLORER_URL),
    indexerUrl: getEnvString(WEB_ENV_VARS.LOCAL_INDEXER_URL, SERVICE_DEFAULTS.LOCAL_INDEXER_URL),
    orderRouterUrl: getEnvString(
      WEB_ENV_VARS.LOCAL_ORDER_ROUTER_URL,
      SERVICE_DEFAULTS.LOCAL_ORDER_ROUTER_URL
    ),
    contracts: resolveContracts(8283),
  }
}

/**
 * @deprecated Use getLocalConfig instead
 */
export const getDevnetConfig = getLocalConfig

/**
 * Get Testnet configuration (StableNet Testnet - chainId 82830)
 * User settings from Settings page take priority over env vars and defaults
 */
export function getTestnetConfig() {
  const userSettings = getUserRpcSettings()

  return {
    rpcUrl:
      userSettings?.rpcUrl ||
      getEnvString(WEB_ENV_VARS.TESTNET_RPC_URL, SERVICE_DEFAULTS.TESTNET_RPC_URL),
    bundlerUrl:
      userSettings?.bundlerUrl ||
      getEnvString(WEB_ENV_VARS.TESTNET_BUNDLER_URL, SERVICE_DEFAULTS.TESTNET_BUNDLER_URL),
    paymasterUrl:
      userSettings?.paymasterUrl ||
      getEnvString(WEB_ENV_VARS.TESTNET_PAYMASTER_URL, SERVICE_DEFAULTS.TESTNET_PAYMASTER_URL),
    stealthServerUrl: getEnvString(
      WEB_ENV_VARS.TESTNET_STEALTH_SERVER_URL,
      SERVICE_DEFAULTS.TESTNET_STEALTH_SERVER_URL
    ),
    explorerUrl: getEnvString(
      WEB_ENV_VARS.TESTNET_EXPLORER_URL,
      SERVICE_DEFAULTS.TESTNET_EXPLORER_URL
    ),
    indexerUrl: getEnvString(
      WEB_ENV_VARS.TESTNET_INDEXER_URL,
      SERVICE_DEFAULTS.TESTNET_INDEXER_URL
    ),
    orderRouterUrl: getEnvString(
      WEB_ENV_VARS.TESTNET_ORDER_ROUTER_URL,
      SERVICE_DEFAULTS.TESTNET_ORDER_ROUTER_URL
    ),
    contracts: resolveContracts(82830),
  }
}

/**
 * Get app configuration
 */
export function getAppConfig() {
  return {
    name: 'StableNet',
    description: 'StableNet Smart Account Platform',
    defaultSlippage: getEnvNumber(WEB_ENV_VARS.DEFAULT_SLIPPAGE, APP_DEFAULTS.DEFAULT_SLIPPAGE),
    maxSlippage: getEnvNumber(WEB_ENV_VARS.MAX_SLIPPAGE, APP_DEFAULTS.MAX_SLIPPAGE),
    txTimeout: getEnvNumber(WEB_ENV_VARS.TX_TIMEOUT, APP_DEFAULTS.TX_TIMEOUT),
    defaultChainId: getEnvNumber(WEB_ENV_VARS.DEFAULT_CHAIN_ID, APP_DEFAULTS.DEFAULT_CHAIN_ID),
  }
}

/**
 * Get configuration by chain ID
 */
export function getConfigByChainId(chainId: number) {
  switch (chainId) {
    case 8283:
      return getLocalConfig()
    case 82830:
      return getTestnetConfig()
    default:
      return undefined
  }
}

/**
 * Get contract addresses by chain ID
 */
export function getContractAddresses(chainId: number) {
  return resolveContracts(chainId)
}

/**
 * Get service URLs by chain ID
 */
export function getServiceUrls(chainId: number) {
  const config = getConfigByChainId(chainId)
  if (!config) return undefined
  return {
    bundler: config.bundlerUrl,
    paymaster: config.paymasterUrl,
    stealthServer: config.stealthServerUrl,
    indexer: config.indexerUrl,
    orderRouter: config.orderRouterUrl,
  }
}
