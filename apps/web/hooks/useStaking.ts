'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address, Hex } from 'viem'
import { encodeFunctionData, erc20Abi } from 'viem'
import { useAccount } from 'wagmi'
import { readStakingPool } from '@/lib/contracts/defiReads'
import { optionalDeployment } from '@/lib/contracts/deployment'
import { STAKING_MODULE_ABI as STAKING_EXECUTOR_ABI } from '@/lib/contracts/runtimeAbis'
import { useStableNetContext } from '@/providers'
import type { StakingAccountConfig, StakingPool, StakingPosition } from '@/types/defi'
import { useUserOp } from './useUserOp'

// ============================================================================
// Types
// ============================================================================

export interface UseStakingReturn {
  pools: StakingPool[]
  positions: StakingPosition[]
  accountConfig: StakingAccountConfig | null
  isLoading: boolean
  isExecuting: boolean
  error: string | null
  executorInstalled: boolean

  stake: (pool: Address, amount: bigint) => Promise<Hex | null>
  unstake: (pool: Address, amount: bigint) => Promise<Hex | null>
  claimRewards: (pool: Address) => Promise<Hex | null>
  compoundRewards: (pool: Address) => Promise<Hex | null>
  refetch: () => Promise<void>
  clearError: () => void
}

export function useStaking(): UseStakingReturn {
  const { address } = useAccount()
  const { publicClient, chainId } = useStableNetContext()
  const { sendUserOp } = useUserOp()
  const executorAddress = optionalDeployment(chainId, 'stakingExecutor')

  const [pools, setPools] = useState<StakingPool[]>([])
  const [positions, setPositions] = useState<StakingPosition[]>([])
  const [accountConfig, setAccountConfig] = useState<StakingAccountConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [executorInstalled, setExecutorInstalled] = useState(false)
  const fetchIdRef = useRef(0)
  const fetchAccountData = useCallback(async () => {
    const id = ++fetchIdRef.current
    setPools([])
    setPositions([])
    setAccountConfig(null)
    setExecutorInstalled(false)
    setError(null)
    setIsLoading(true)
    try {
      if (!address) return
      if (!executorAddress) throw Error(`Staking executor is not deployed on chain ${chainId}`)
      const [maxStakePerPool, dailyStakeLimit, dailyUsed, isActive, isPaused] =
        await publicClient.readContract({
          address: executorAddress,
          abi: STAKING_EXECUTOR_ABI,
          functionName: 'getAccountConfig',
          args: [address],
        })
      const allowed = await publicClient.readContract({
        address: executorAddress,
        abi: STAKING_EXECUTOR_ABI,
        functionName: 'getAllowedPools',
        args: [address],
      })
      const entries = await Promise.all(
        allowed.map((pool) => readStakingPool(publicClient, pool, address))
      )
      if (id !== fetchIdRef.current) return
      setAccountConfig({
        maxStakePerPool,
        dailyStakeLimit,
        dailyUsed,
        isActive,
        isPaused,
        lastResetTime: 0n,
      })
      setExecutorInstalled(isActive)
      setPools(entries.map((e) => e.pool))
      setPositions(
        entries.map((e) => e.position).filter((p) => p.stakedAmount > 0n || p.rewardsEarned > 0n)
      )
    } catch (err) {
      if (id === fetchIdRef.current)
        setError(err instanceof Error ? err.message : 'Unable to read staking state')
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

  // Send a staking executor operation via useUserOp
  const sendExecutorOp = useCallback(
    async (calldata: Hex): Promise<Hex | null> => {
      if (!address || !executorAddress) {
        setError('Wallet not connected')
        return null
      }
      if (!executorInstalled) {
        setError('Staking Executor module not installed. Install it from the Marketplace.')
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

  const stake = useCallback(
    async (pool: Address, amount: bigint) => {
      if (amount <= 0n) {
        setError('Amount must be positive')
        return null
      }
      const selected = pools.find((p) => p.address.toLowerCase() === pool.toLowerCase())
      if (!selected || !address || !executorInstalled || accountConfig?.isPaused) {
        setError('Staking pool or account is not available')
        return null
      }
      if (amount < selected.minStake || !selected.isRegistered) {
        setError('Amount is below the pool minimum or pool is inactive')
        return null
      }
      try {
        const allowance = await publicClient.readContract({
          address: selected.stakingToken.address,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, pool],
        })
        if (allowance < amount) {
          if (allowance > 0n) {
            const reset = await sendUserOp(address, {
              to: selected.stakingToken.address,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [pool, 0n],
              }),
            })
            if (!reset?.success) throw Error('Approval reset was not confirmed')
          }
          const approval = await sendUserOp(address, {
            to: selected.stakingToken.address,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [pool, amount],
            }),
          })
          if (!approval?.success) throw Error('Token approval was not confirmed')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Approval failed')
        return null
      }
      const calldata = encodeFunctionData({
        abi: STAKING_EXECUTOR_ABI,
        functionName: 'stake',
        args: [pool, amount],
      })
      return sendExecutorOp(calldata)
    },
    [sendExecutorOp, pools, address, executorInstalled, accountConfig, publicClient, sendUserOp]
  )

  const unstake = useCallback(
    async (pool: Address, amount: bigint) => {
      if (amount <= 0n) {
        setError('Amount must be positive')
        return null
      }
      const calldata = encodeFunctionData({
        abi: STAKING_EXECUTOR_ABI,
        functionName: 'unstake',
        args: [pool, amount],
      })
      return sendExecutorOp(calldata)
    },
    [sendExecutorOp]
  )

  const claimRewards = useCallback(
    async (pool: Address) => {
      const calldata = encodeFunctionData({
        abi: STAKING_EXECUTOR_ABI,
        functionName: 'claimRewards',
        args: [pool],
      })
      return sendExecutorOp(calldata)
    },
    [sendExecutorOp]
  )

  const compoundRewards = useCallback(
    async (pool: Address) => {
      const calldata = encodeFunctionData({
        abi: STAKING_EXECUTOR_ABI,
        functionName: 'compoundRewards',
        args: [pool],
      })
      return sendExecutorOp(calldata)
    },
    [sendExecutorOp]
  )

  return {
    pools,
    positions,
    accountConfig,
    isLoading,
    isExecuting,
    error,
    executorInstalled,
    stake,
    unstake,
    claimRewards,
    compoundRewards,
    refetch: fetchAccountData,
    clearError: () => setError(null),
  }
}
