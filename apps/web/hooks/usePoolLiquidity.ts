'use client'

import { useCallback, useState } from 'react'
import type { Address, Hex } from 'viem'
import { encodeFunctionData, parseUnits } from 'viem'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { assertConfirmed, assertSlippage, optionalDeployment } from '@/lib/contracts/deployment'
import {
  amountsForLiquidity,
  liquidityForAmounts,
  PAIR_ABI,
  POSITION_ABI,
  V3_POOL_ABI,
} from '@/lib/contracts/liquidity'
import { sqrtRatioAtTick } from '@/lib/contracts/tickMath'
import { useStableNetContext } from '@/providers'
import type { Pool } from '@/types'

// Uniswap V2-style Router ABI for liquidity operations
const ROUTER_ABI = [
  {
    name: 'addLiquidity',
    type: 'function',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'amountADesired', type: 'uint256' },
      { name: 'amountBDesired', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
    ],
  },
  {
    name: 'removeLiquidity',
    type: 'function',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
    ],
  },
] as const

const ERC20_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export type LiquidityStep =
  | 'idle'
  | 'approving-token0'
  | 'approving-token1'
  | 'adding'
  | 'removing'
  | 'confirmed'
  | 'failed'

interface AddLiquidityParams {
  pool: Pool
  amount0: string
  amount1: string
  slippageBps?: number // basis points, default 50 (0.5%)
}

interface RemoveLiquidityParams {
  tokenId?: bigint
  pool: Pool
  liquidity: bigint
  amount0Min?: bigint
  amount1Min?: bigint
  slippageBps?: number
}

interface UsePoolLiquidityReturn {
  addLiquidity: (params: AddLiquidityParams) => Promise<Hex | null>
  removeLiquidity: (params: RemoveLiquidityParams) => Promise<Hex | null>
  step: LiquidityStep
  isLoading: boolean
  error: string | null
  clearError: () => void
}

export function usePoolLiquidity(): UsePoolLiquidityReturn {
  const { chainId } = useStableNetContext()
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [step, setStep] = useState<LiquidityStep>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const v2Router = optionalDeployment(chainId, 'uniswapV2Router')
  const positionManager = optionalDeployment(chainId, 'nftPositionManager')

  const ensureAllowance = useCallback(
    async (token: Address, amount: bigint, stepLabel: LiquidityStep, routerAddress: Address) => {
      if (!publicClient || !walletClient || !address || !routerAddress)
        throw Error('Wallet not connected')

      const allowance = await publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, routerAddress],
      })

      if (allowance < amount) {
        setStep(stepLabel)
        if (allowance > 0n) {
          const reset = await walletClient.sendTransaction({
            to: token,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: 'approve',
              args: [routerAddress, 0n],
            }),
          })
          assertConfirmed(await publicClient.waitForTransactionReceipt({ hash: reset }))
        }
        const hash = await walletClient.sendTransaction({
          to: token,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [routerAddress, amount],
          }),
        })
        assertConfirmed(await publicClient.waitForTransactionReceipt({ hash }))
      }
    },
    [publicClient, walletClient, address]
  )

  const addLiquidity = useCallback(
    async (params: AddLiquidityParams): Promise<Hex | null> => {
      const routerAddress = params.pool.protocol === 'uniswap_v3' ? positionManager : v2Router
      if (!walletClient || !publicClient || !address || !routerAddress) {
        setError('Wallet not connected or router not configured')
        return null
      }

      const { pool, amount0, amount1, slippageBps = 50 } = params

      setIsLoading(true)
      setError(null)
      setStep('idle')

      try {
        assertSlippage(slippageBps)
        const amountA = parseUnits(amount0, pool.token0.decimals)
        const amountB = parseUnits(amount1, pool.token1.decimals)
        if (amountA <= 0n || amountB <= 0n) throw Error('Both token amounts must be positive')
        const amountAMin = amountA - (amountA * BigInt(slippageBps)) / 10000n
        const amountBMin = amountB - (amountB * BigInt(slippageBps)) / 10000n
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800) // 30 minutes

        const [actual0, actual1] = await Promise.all([
          publicClient.readContract({
            address: pool.address,
            abi: PAIR_ABI,
            functionName: 'token0',
          }),
          publicClient.readContract({
            address: pool.address,
            abi: PAIR_ABI,
            functionName: 'token1',
          }),
        ])
        if (
          actual0.toLowerCase() !== pool.token0.address.toLowerCase() ||
          actual1.toLowerCase() !== pool.token1.address.toLowerCase()
        )
          throw Error('Pool token metadata does not match chain')

        // Approve token0 if needed
        await ensureAllowance(pool.token0.address, amountA, 'approving-token0', routerAddress)

        // Approve token1 if needed
        await ensureAllowance(pool.token1.address, amountB, 'approving-token1', routerAddress)

        if (pool.protocol === 'uniswap_v3') {
          const [slot, spacing, fee] = await Promise.all([
            publicClient.readContract({
              address: pool.address,
              abi: V3_POOL_ABI,
              functionName: 'slot0',
            }),
            publicClient.readContract({
              address: pool.address,
              abi: V3_POOL_ABI,
              functionName: 'tickSpacing',
            }),
            publicClient.readContract({
              address: pool.address,
              abi: V3_POOL_ABI,
              functionName: 'fee',
            }),
          ])
          if (spacing <= 0 || slot[0] === 0n) throw Error('Pool is not initialized')
          const tickLower = Math.ceil(-887272 / spacing) * spacing,
            tickUpper = Math.floor(887272 / spacing) * spacing
          const lower = sqrtRatioAtTick(tickLower),
            upper = sqrtRatioAtTick(tickUpper)
          const liquidity = liquidityForAmounts(slot[0], lower, upper, amountA, amountB)
          if (liquidity <= 0n) throw Error('Amounts are too small for this pool')
          const expected = amountsForLiquidity(slot[0], lower, upper, liquidity)
          setStep('adding')
          const hash = await walletClient.sendTransaction({
            to: routerAddress,
            data: encodeFunctionData({
              abi: POSITION_ABI,
              functionName: 'mint',
              args: [
                {
                  token0: pool.token0.address,
                  token1: pool.token1.address,
                  fee,
                  tickLower,
                  tickUpper,
                  amount0Desired: amountA,
                  amount1Desired: amountB,
                  amount0Min: (expected.amount0 * (10000n - BigInt(slippageBps))) / 10000n,
                  amount1Min: (expected.amount1 * (10000n - BigInt(slippageBps))) / 10000n,
                  recipient: address,
                  deadline,
                },
              ],
            }),
          })
          assertConfirmed(await publicClient.waitForTransactionReceipt({ hash }))
          setStep('confirmed')
          return hash
        }

        // Execute addLiquidity
        setStep('adding')
        const calldata = encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: 'addLiquidity',
          args: [
            pool.token0.address,
            pool.token1.address,
            amountA,
            amountB,
            amountAMin,
            amountBMin,
            address,
            deadline,
          ],
        })

        const hash = await walletClient.sendTransaction({
          to: routerAddress,
          data: calldata,
        })

        assertConfirmed(await publicClient.waitForTransactionReceipt({ hash }))
        setStep('confirmed')
        return hash
      } catch (err) {
        setStep('failed')
        const msg = err instanceof Error ? err.message : 'Failed to add liquidity'
        setError(msg)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [walletClient, publicClient, address, v2Router, positionManager, ensureAllowance]
  )

  const removeLiquidity = useCallback(
    async (params: RemoveLiquidityParams): Promise<Hex | null> => {
      const routerAddress = params.pool.protocol === 'uniswap_v3' ? positionManager : v2Router
      if (!walletClient || !publicClient || !address || !routerAddress) {
        setError('Wallet not connected or router not configured')
        return null
      }

      const { pool, liquidity, slippageBps = 50 } = params

      setIsLoading(true)
      setError(null)

      try {
        assertSlippage(slippageBps)
        if (pool.protocol === 'uniswap_v3') {
          if (params.tokenId === undefined) throw Error('A V3 position NFT is required')
          const [owner, p, slot] = await Promise.all([
            publicClient.readContract({
              address: routerAddress,
              abi: POSITION_ABI,
              functionName: 'ownerOf',
              args: [params.tokenId],
            }),
            publicClient.readContract({
              address: routerAddress,
              abi: POSITION_ABI,
              functionName: 'positions',
              args: [params.tokenId],
            }),
            publicClient.readContract({
              address: pool.address,
              abi: V3_POOL_ABI,
              functionName: 'slot0',
            }),
          ])
          if (
            owner.toLowerCase() !== address.toLowerCase() ||
            p[2].toLowerCase() !== pool.token0.address.toLowerCase() ||
            p[3].toLowerCase() !== pool.token1.address.toLowerCase() ||
            p[4] !== pool.feeTier
          )
            throw Error('Position does not belong to the connected account and pool')
          if (liquidity < 0n || liquidity > p[7]) throw Error('Invalid position liquidity')
          const expected = amountsForLiquidity(
            slot[0],
            sqrtRatioAtTick(p[5]),
            sqrtRatioAtTick(p[6]),
            liquidity
          )
          const calls: Hex[] = []
          if (liquidity > 0n)
            calls.push(
              encodeFunctionData({
                abi: POSITION_ABI,
                functionName: 'decreaseLiquidity',
                args: [
                  {
                    tokenId: params.tokenId,
                    liquidity,
                    amount0Min: (expected.amount0 * (10000n - BigInt(slippageBps))) / 10000n,
                    amount1Min: (expected.amount1 * (10000n - BigInt(slippageBps))) / 10000n,
                    deadline: BigInt(Math.floor(Date.now() / 1000) + 1200),
                  },
                ],
              })
            )
          calls.push(
            encodeFunctionData({
              abi: POSITION_ABI,
              functionName: 'collect',
              args: [
                {
                  tokenId: params.tokenId,
                  recipient: address,
                  amount0Max: (1n << 128n) - 1n,
                  amount1Max: (1n << 128n) - 1n,
                },
              ],
            })
          )
          setStep('removing')
          const hash = await walletClient.sendTransaction({
            to: routerAddress,
            data: encodeFunctionData({
              abi: POSITION_ABI,
              functionName: 'multicall',
              args: [calls],
            }),
          })
          assertConfirmed(await publicClient.waitForTransactionReceipt({ hash }))
          setStep('confirmed')
          return hash
        }
        if (liquidity <= 0n) throw Error('Liquidity must be positive')
        const [reserves, totalLiquidity, balance] = await Promise.all([
          publicClient.readContract({
            address: pool.address,
            abi: PAIR_ABI,
            functionName: 'getReserves',
          }),
          publicClient.readContract({
            address: pool.address,
            abi: PAIR_ABI,
            functionName: 'totalSupply',
          }),
          publicClient.readContract({
            address: pool.address,
            abi: PAIR_ABI,
            functionName: 'balanceOf',
            args: [address],
          }),
        ])
        if (totalLiquidity <= 0n || liquidity > balance) throw Error('Insufficient LP balance')
        const expectedAmount0 = (reserves[0] * liquidity) / totalLiquidity
        const expectedAmount1 = (reserves[1] * liquidity) / totalLiquidity

        const amount0Min =
          params.amount0Min ?? expectedAmount0 - (expectedAmount0 * BigInt(slippageBps)) / 10000n
        const amount1Min =
          params.amount1Min ?? expectedAmount1 - (expectedAmount1 * BigInt(slippageBps)) / 10000n
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800)

        // Approve LP token (pool address is the LP token for V2 pairs)
        await ensureAllowance(pool.address, liquidity, 'approving-token0', routerAddress)

        setStep('removing')
        const calldata = encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: 'removeLiquidity',
          args: [
            pool.token0.address,
            pool.token1.address,
            liquidity,
            amount0Min,
            amount1Min,
            address,
            deadline,
          ],
        })

        const hash = await walletClient.sendTransaction({
          to: routerAddress,
          data: calldata,
        })

        assertConfirmed(await publicClient.waitForTransactionReceipt({ hash }))
        setStep('confirmed')
        return hash
      } catch (err) {
        setStep('failed')
        const msg = err instanceof Error ? err.message : 'Failed to remove liquidity'
        setError(msg)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [walletClient, publicClient, address, v2Router, positionManager, ensureAllowance]
  )

  return {
    addLiquidity,
    removeLiquidity,
    step,
    isLoading,
    error,
    clearError: () => setError(null),
  }
}
