'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address, Hex } from 'viem'
import { encodeFunctionData } from 'viem'
import { useAccount } from 'wagmi'
import { readLendingMarket } from '@/lib/contracts/defiReads'
import { optionalDeployment } from '@/lib/contracts/deployment'
import {
  LENDING_MODULE_ABI as LENDING_EXECUTOR_ABI,
  LENDING_POOL_ABI,
} from '@/lib/contracts/runtimeAbis'
import { useStableNetContext } from '@/providers'
import type {
  HealthFactorInfo,
  LendingAccountConfig,
  LendingMarket,
  LendingPosition,
} from '@/types/defi'
import { useUserOp } from './useUserOp'

// ============================================================================
// Types
// ============================================================================

export interface UseLendingReturn {
  markets: LendingMarket[]
  positions: LendingPosition[]
  accountConfig: LendingAccountConfig | null
  healthFactor: bigint | null
  healthFactorInfo: HealthFactorInfo | null
  isLoading: boolean
  isExecuting: boolean
  error: string | null
  executorInstalled: boolean

  supply: (asset: Address, amount: bigint) => Promise<Hex | null>
  withdraw: (asset: Address, amount: bigint) => Promise<Hex | null>
  borrow: (asset: Address, amount: bigint) => Promise<Hex | null>
  repay: (asset: Address, amount: bigint) => Promise<Hex | null>
  refetch: () => Promise<void>
  clearError: () => void
}

export function useLending(): UseLendingReturn {
  const { address } = useAccount()
  const { publicClient, chainId } = useStableNetContext()
  const { sendUserOp } = useUserOp()
  const executorAddress = optionalDeployment(chainId, 'lendingExecutor')

  const [markets, setMarkets] = useState<LendingMarket[]>([])
  const [positions, setPositions] = useState<LendingPosition[]>([])
  const [accountConfig, setAccountConfig] = useState<LendingAccountConfig | null>(null)
  const [healthFactor, setHealthFactor] = useState<bigint | null>(null)
  const [healthFactorInfo, setHealthFactorInfo] = useState<HealthFactorInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [executorInstalled, setExecutorInstalled] = useState(false)
  const fetchIdRef = useRef(0)
  const fetchAccountData = useCallback(async () => {
    const id = ++fetchIdRef.current
    setMarkets([])
    setPositions([])
    setAccountConfig(null)
    setHealthFactor(null)
    setHealthFactorInfo(null)
    setExecutorInstalled(false)
    setError(null)
    setIsLoading(true)
    try {
      if (!address) return
      if (!executorAddress) throw Error(`Lending executor is not deployed on chain ${chainId}`)
      const [config, assets, pool] = await Promise.all([
        publicClient.readContract({
          address: executorAddress,
          abi: LENDING_EXECUTOR_ABI,
          functionName: 'getAccountConfig',
          args: [address],
        }),
        publicClient.readContract({
          address: executorAddress,
          abi: LENDING_EXECUTOR_ABI,
          functionName: 'getAllowedAssets',
          args: [address],
        }),
        publicClient.readContract({
          address: executorAddress,
          abi: LENDING_EXECUTOR_ABI,
          functionName: 'getLendingPool',
        }),
      ])
      const [entries, account] = await Promise.all([
        Promise.all(assets.map((asset) => readLendingMarket(publicClient, pool, asset, address))),
        publicClient.readContract({
          address: pool,
          abi: LENDING_POOL_ABI,
          functionName: 'getAccountData',
          args: [address],
        }),
      ])
      if (id !== fetchIdRef.current) return
      const [minHealthFactor, maxBorrowLimit, totalBorrowed, isActive] = config
      setAccountConfig({ minHealthFactor, maxBorrowLimit, totalBorrowed, isActive })
      setExecutorInstalled(isActive)
      setHealthFactor(account.healthFactor)
      setMarkets(entries.map((e) => e.market))
      setPositions(
        entries.map((e) => e.position).filter((p) => p.suppliedAmount > 0n || p.borrowedAmount > 0n)
      )
    } catch (err) {
      if (id === fetchIdRef.current)
        setError(err instanceof Error ? err.message : 'Unable to read lending state')
    } finally {
      if (id === fetchIdRef.current) setIsLoading(false)
    }
  }, [address, publicClient, executorAddress, chainId])
  useEffect(() => {
    void fetchAccountData()
    return () => {
      fetchIdRef.current++
    }
  }, [fetchAccountData])

  const sendExecutorOp = useCallback(
    async (calldata: Hex): Promise<Hex | null> => {
      if (!address || !executorAddress) {
        setError('Wallet not connected')
        return null
      }
      if (!executorInstalled) {
        setError('Lending Executor module not installed. Install it from the Marketplace.')
        return null
      }

      setIsExecuting(true)
      setError(null)
      try {
        const result = await sendUserOp(address, {
          to: executorAddress,
          value: 0n,
          data: calldata,
        })

        if (!result?.success) {
          throw new Error(
            result?.status === 'submitted'
              ? 'Transaction submitted; confirmation pending'
              : 'Transaction failed'
          )
        }

        await fetchAccountData()
        return result.transactionHash ?? result.userOpHash
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Operation failed'
        setError(msg)
        return null
      } finally {
        setIsExecuting(false)
      }
    },
    [address, executorAddress, executorInstalled, sendUserOp, fetchAccountData]
  )

  const supply = useCallback(
    async (asset: Address, amount: bigint) => {
      if (amount <= 0n) {
        setError('Amount must be positive')
        return null
      }
      const calldata = encodeFunctionData({
        abi: LENDING_EXECUTOR_ABI,
        functionName: 'supply',
        args: [asset, amount],
      })
      return sendExecutorOp(calldata)
    },
    [sendExecutorOp]
  )

  const withdraw = useCallback(
    async (asset: Address, amount: bigint) => {
      if (amount <= 0n) {
        setError('Amount must be positive')
        return null
      }
      const calldata = encodeFunctionData({
        abi: LENDING_EXECUTOR_ABI,
        functionName: 'withdraw',
        args: [asset, amount],
      })
      return sendExecutorOp(calldata)
    },
    [sendExecutorOp]
  )

  const borrow = useCallback(
    async (asset: Address, amount: bigint) => {
      if (amount <= 0n) {
        setError('Amount must be positive')
        return null
      }
      const calldata = encodeFunctionData({
        abi: LENDING_EXECUTOR_ABI,
        functionName: 'borrow',
        args: [asset, amount],
      })
      return sendExecutorOp(calldata)
    },
    [sendExecutorOp]
  )

  const repay = useCallback(
    async (asset: Address, amount: bigint) => {
      if (amount <= 0n) {
        setError('Amount must be positive')
        return null
      }
      const calldata = encodeFunctionData({
        abi: LENDING_EXECUTOR_ABI,
        functionName: 'repay',
        args: [asset, amount],
      })
      return sendExecutorOp(calldata)
    },
    [sendExecutorOp]
  )

  return {
    markets,
    positions,
    accountConfig,
    healthFactor,
    healthFactorInfo,
    isLoading,
    isExecuting,
    error,
    executorInstalled,
    supply,
    withdraw,
    borrow,
    repay,
    refetch: fetchAccountData,
    clearError: () => setError(null),
  }
}
