'use client'

import { createContext, type ReactNode, useContext, useMemo } from 'react'
import { createPublicClient, custom, http, type PublicClient, zeroAddress } from 'viem'
import { useAccount, useChainId } from 'wagmi'
import { anvilLocal, getConfigByChainId, stablenetLocal, stablenetTestnet } from '@/lib/chains'
import { getContractAddresses, getServiceUrls } from '@/lib/constants'

interface StableNetContextValue {
  publicClient: PublicClient
  chainId: number
  bundlerUrl: string
  paymasterUrl: string
  stealthServerUrl: string
  indexerUrl: string
  entryPoint: `0x${string}`
  accountFactory: `0x${string}`
  paymaster: `0x${string}`
  stealthAnnouncer: `0x${string}`
  stealthRegistry: `0x${string}`
  isReady: boolean
}

const StableNetContext = createContext<StableNetContextValue | null>(null)

interface StableNetProviderProps {
  children: ReactNode
}

export function StableNetProvider({ children }: StableNetProviderProps) {
  const chainId = useChainId()
  const { isConnected } = useAccount()

  // Default to StableNet Local (8283) if no chain connected
  const currentChainId = chainId || 8283

  // Memoize publicClient separately so it is not recreated when isConnected toggles
  const publicClient = useMemo(() => {
    const networkConfig = getConfigByChainId(currentChainId)

    // Use the correct chain definition for the current chainId
    const chain =
      currentChainId === 82830
        ? stablenetTestnet
        : currentChainId === 31337
          ? anvilLocal
          : currentChainId === 8283
            ? stablenetLocal
            : undefined

    return createPublicClient({
      chain,
      transport:
        networkConfig && chain
          ? http(networkConfig.rpcUrl)
          : custom({
              async request() {
                throw new Error(`Unsupported chain ${currentChainId}`)
              },
            }),
    })
  }, [currentChainId])

  const value = useMemo<StableNetContextValue>(() => {
    const contracts = getContractAddresses(currentChainId)
    const services = getServiceUrls(currentChainId)

    return {
      publicClient,
      chainId: currentChainId,
      bundlerUrl: services?.bundler ?? '',
      paymasterUrl: services?.paymaster ?? '',
      stealthServerUrl: services?.stealthServer ?? '',
      indexerUrl: services?.indexer ?? '',
      entryPoint: contracts?.entryPoint ?? zeroAddress,
      accountFactory: contracts?.accountFactory ?? zeroAddress,
      paymaster: contracts?.paymaster ?? zeroAddress,
      stealthAnnouncer: contracts?.stealthAnnouncer ?? zeroAddress,
      stealthRegistry: contracts?.stealthRegistry ?? zeroAddress,
      isReady: isConnected && !!contracts && !!services && !!getConfigByChainId(currentChainId),
    }
  }, [currentChainId, isConnected, publicClient])

  return <StableNetContext.Provider value={value}>{children}</StableNetContext.Provider>
}

export function useStableNetContext(): StableNetContextValue {
  const context = useContext(StableNetContext)
  if (!context) {
    throw new Error('useStableNetContext must be used within StableNetProvider')
  }
  return context
}
