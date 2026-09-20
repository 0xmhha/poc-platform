/**
 * Static chain definitions for non-generated chains
 *
 * These chains are NOT auto-generated from deployment outputs.
 * - Testnet (82830): Known deployed addresses, updated manually after testnet deployment
 * - Anvil (31337): Deterministic local dev addresses from `forge script`
 *
 * For auto-generated chains (e.g., 8283), see `generated/addresses.ts`.
 */

import type { Address } from 'viem'
import type { ChainAddresses, ServiceUrls, TokenDefinition } from './types'

const ZERO: Address = '0x0000000000000000000000000000000000000000'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createChainAddresses(
  chainId: number,
  overrides: {
    core?: Partial<ChainAddresses['core']>
    validators?: Partial<ChainAddresses['validators']>
    paymasters?: Partial<ChainAddresses['paymasters']>
  }
): ChainAddresses {
  const core = {
    entryPoint: overrides.core?.entryPoint ?? ZERO,
    kernel: overrides.core?.kernel ?? ZERO,
    kernelFactory: overrides.core?.kernelFactory ?? ZERO,
    factoryStaker: overrides.core?.factoryStaker ?? ZERO,
  }
  const validators = {
    ecdsaValidator: overrides.validators?.ecdsaValidator ?? ZERO,
    webAuthnValidator: overrides.validators?.webAuthnValidator ?? ZERO,
    multiChainValidator: overrides.validators?.multiChainValidator ?? ZERO,
    multiSigValidator: overrides.validators?.multiSigValidator ?? ZERO,
    weightedEcdsaValidator: overrides.validators?.weightedEcdsaValidator ?? ZERO,
  }
  const paymasters = {
    verifyingPaymaster: overrides.paymasters?.verifyingPaymaster ?? ZERO,
    erc20Paymaster: overrides.paymasters?.erc20Paymaster ?? ZERO,
    permit2Paymaster: overrides.paymasters?.permit2Paymaster ?? ZERO,
    sponsorPaymaster: overrides.paymasters?.sponsorPaymaster ?? ZERO,
  }

  const raw: Record<string, Address> = {
    entryPoint: core.entryPoint,
    kernel: core.kernel,
    kernelFactory: core.kernelFactory,
    factoryStaker: core.factoryStaker,
    ecdsaValidator: validators.ecdsaValidator,
    webAuthnValidator: validators.webAuthnValidator,
    multiChainValidator: validators.multiChainValidator,
    multiSigValidator: validators.multiSigValidator,
    weightedEcdsaValidator: validators.weightedEcdsaValidator,
    verifyingPaymaster: paymasters.verifyingPaymaster,
    erc20Paymaster: paymasters.erc20Paymaster,
    permit2Paymaster: paymasters.permit2Paymaster,
    sponsorPaymaster: paymasters.sponsorPaymaster,
  }

  return {
    chainId,
    core,
    validators,
    executors: { sessionKeyExecutor: ZERO },
    hooks: { spendingLimitHook: ZERO },
    paymasters,
    privacy: { stealthAnnouncer: ZERO, stealthRegistry: ZERO },
    compliance: { kycRegistry: ZERO, regulatoryRegistry: ZERO, auditHook: ZERO, auditLogger: ZERO },
    subscriptions: {
      subscriptionManager: ZERO,
      recurringPaymentExecutor: ZERO,
      permissionManager: ZERO,
    },
    tokens: { wkrc: ZERO, usdc: ZERO },
    defi: {
      lendingPool: ZERO,
      stakingVault: ZERO,
      priceOracle: ZERO,
      proofOfReserve: ZERO,
      privateBank: ZERO,
      permit2: ZERO,
    },
    uniswap: {
      factory: ZERO,
      swapRouter: ZERO,
      quoter: ZERO,
      nftPositionManager: ZERO,
      wkrcUsdcPool: ZERO,
    },
    fallbacks: { flashLoanFallback: ZERO, tokenReceiverFallback: ZERO },
    delegatePresets: [],
    raw,
  }
}

// ─── StableNet Testnet (chain 82830) ─────────────────────────────────────────

export const TESTNET_CHAIN_ADDRESSES: ChainAddresses = createChainAddresses(82830, {
  core: {
    entryPoint: '0xEf6817fe73741A8F10088f9511c64b666a338A14' as Address,
  },
})

export const TESTNET_SERVICE_URLS: ServiceUrls = {
  bundler: 'https://bundler.testnet.stablenet.dev',
  paymaster: 'https://paymaster.testnet.stablenet.dev',
  stealthServer: 'https://stealth.testnet.stablenet.dev',
}

export const TESTNET_DEFAULT_TOKENS: TokenDefinition[] = [
  {
    address: ZERO,
    name: 'Wrapped KRW Coin',
    symbol: 'WKRC',
    decimals: 18,
  },
]

// ─── Anvil Local Dev (chain 31337) ───────────────────────────────────────────
// Deterministic addresses from `forge script` against fresh Anvil instance.

export const ANVIL_CHAIN_ADDRESSES: ChainAddresses = {
  ...createChainAddresses(31337, {
    core: {
      entryPoint: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address,
      kernel: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address,
      kernelFactory: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9' as Address,
    },
    validators: {
      ecdsaValidator: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as Address,
    },
  }),
  delegatePresets: [
    {
      name: 'Kernel (Anvil)',
      description: 'Kernel Smart Account for local Anvil development',
      address: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address,
      features: ['ERC-7579', 'Modular'],
    },
  ],
}

export const ANVIL_SERVICE_URLS: ServiceUrls = {
  bundler: 'http://localhost:4337',
  paymaster: 'http://localhost:4338',
  stealthServer: 'http://localhost:4339',
}

export const ANVIL_DEFAULT_TOKENS: TokenDefinition[] = [
  {
    address: ZERO,
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
]

// ─── Aggregated exports ──────────────────────────────────────────────────────

export const STATIC_CHAIN_ADDRESSES: Record<number, ChainAddresses> = {
  82830: TESTNET_CHAIN_ADDRESSES,
  31337: ANVIL_CHAIN_ADDRESSES,
}

export const STATIC_SERVICE_URLS: Record<number, ServiceUrls> = {
  82830: TESTNET_SERVICE_URLS,
  31337: ANVIL_SERVICE_URLS,
}

export const STATIC_DEFAULT_TOKENS: Record<number, TokenDefinition[]> = {
  82830: TESTNET_DEFAULT_TOKENS,
  31337: ANVIL_DEFAULT_TOKENS,
}
