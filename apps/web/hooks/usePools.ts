'use client'
import { getChainAddresses } from '@stablenet/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type Address, erc20Abi, zeroAddress } from 'viem'
import { useWallet } from '@/hooks/useWallet'
import { readToken } from '@/lib/contracts/defiReads'
import { optionalDeployment } from '@/lib/contracts/deployment'
import { amountsForLiquidity, PAIR_ABI, POSITION_ABI, V3_POOL_ABI } from '@/lib/contracts/liquidity'
import { sqrtRatioAtTick } from '@/lib/contracts/tickMath'
import { useStableNetContext } from '@/providers'
import type { LiquidityPosition, Pool } from '@/types'
export function usePools() {
  const { chainId, publicClient } = useStableNetContext()
  const { address } = useWallet()
  const [pools, setPools] = useState<Pool[]>([]),
    [positions, setPositions] = useState<LiquidityPosition[]>([])
  const [isLoading, setIsLoading] = useState(false),
    [error, setError] = useState<Error | null>(null)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++generation.current
    setPools([])
    setPositions([])
    setError(null)
    setIsLoading(true)
    try {
      const result: Pool[] = [],
        owned: LiquidityPosition[] = []
      const v2router = optionalDeployment(chainId, 'uniswapV2Router')
      if (v2router) {
        const factory = await publicClient.readContract({
          address: v2router,
          abi: PAIR_ABI,
          functionName: 'factory',
        })
        const count = await publicClient.readContract({
          address: factory,
          abi: PAIR_ABI,
          functionName: 'allPairsLength',
        })
        if (count > 1000n)
          throw Error('Pool discovery requires pagination for more than 1000 pools')
        for (let index = 0n; index < count; index++) {
          const poolAddress = await publicClient.readContract({
            address: factory,
            abi: PAIR_ABI,
            functionName: 'allPairs',
            args: [index],
          })
          const [a, b, reserves, total, balance] = await Promise.all([
            publicClient.readContract({
              address: poolAddress,
              abi: PAIR_ABI,
              functionName: 'token0',
            }),
            publicClient.readContract({
              address: poolAddress,
              abi: PAIR_ABI,
              functionName: 'token1',
            }),
            publicClient.readContract({
              address: poolAddress,
              abi: PAIR_ABI,
              functionName: 'getReserves',
            }),
            publicClient.readContract({
              address: poolAddress,
              abi: PAIR_ABI,
              functionName: 'totalSupply',
            }),
            address
              ? publicClient.readContract({
                  address: poolAddress,
                  abi: PAIR_ABI,
                  functionName: 'balanceOf',
                  args: [address],
                })
              : Promise.resolve(0n),
          ])
          const [token0, token1] = await Promise.all([
            readToken(publicClient, a),
            readToken(publicClient, b),
          ])
          result.push({
            address: poolAddress,
            protocol: 'uniswap_v2',
            metricsAvailable: false,
            token0,
            token1,
            reserve0: reserves[0],
            reserve1: reserves[1],
            fee: 0.3,
            tvl: 0,
            apr: 0,
          })
          if (balance > 0n && total > 0n)
            owned.push({
              poolAddress,
              token0,
              token1,
              liquidity: balance,
              token0Amount: (reserves[0] * balance) / total,
              token1Amount: (reserves[1] * balance) / total,
              shareOfPool: Number((balance * 1000000n) / total) / 10000,
            })
        }
      }
      const poolAddresses = new Set<Address>()
      for (const [key, value] of Object.entries(getChainAddresses(chainId).raw))
        if (/(?:uniswap.*pool|wkrcUsdcPool)/i.test(key) && value !== zeroAddress)
          poolAddresses.add(value)
      const manager = optionalDeployment(chainId, 'nftPositionManager')
      const nfts: Array<{
        id: bigint
        pool: Address
        position: readonly [
          bigint,
          Address,
          Address,
          Address,
          number,
          number,
          number,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
        ]
      }> = []
      if (manager && address) {
        const factory = await publicClient.readContract({
          address: manager,
          abi: POSITION_ABI,
          functionName: 'factory',
        })
        const count = await publicClient.readContract({
          address: manager,
          abi: POSITION_ABI,
          functionName: 'balanceOf',
          args: [address],
        })
        if (count > 1000n)
          throw Error('Position discovery requires pagination for more than 1000 NFTs')
        for (let i = 0n; i < count; i++) {
          const tokenId = await publicClient.readContract({
            address: manager,
            abi: POSITION_ABI,
            functionName: 'tokenOfOwnerByIndex',
            args: [address, i],
          })
          const position = await publicClient.readContract({
            address: manager,
            abi: POSITION_ABI,
            functionName: 'positions',
            args: [tokenId],
          })
          const pool = await publicClient.readContract({
            address: factory,
            abi: V3_POOL_ABI,
            functionName: 'getPool',
            args: [position[2], position[3], position[4]],
          })
          if (pool !== zeroAddress) {
            poolAddresses.add(pool)
            nfts.push({ id: tokenId, pool, position })
          }
        }
      }
      for (const poolAddress of poolAddresses) {
        const [a, b, feeTier, tickSpacing, slot] = await Promise.all([
          publicClient.readContract({
            address: poolAddress,
            abi: V3_POOL_ABI,
            functionName: 'token0',
          }),
          publicClient.readContract({
            address: poolAddress,
            abi: V3_POOL_ABI,
            functionName: 'token1',
          }),
          publicClient.readContract({
            address: poolAddress,
            abi: V3_POOL_ABI,
            functionName: 'fee',
          }),
          publicClient.readContract({
            address: poolAddress,
            abi: V3_POOL_ABI,
            functionName: 'tickSpacing',
          }),
          publicClient.readContract({
            address: poolAddress,
            abi: V3_POOL_ABI,
            functionName: 'slot0',
          }),
        ])
        const [token0, token1, reserve0, reserve1] = await Promise.all([
          readToken(publicClient, a),
          readToken(publicClient, b),
          publicClient.readContract({
            address: a,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [poolAddress],
          }),
          publicClient.readContract({
            address: b,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [poolAddress],
          }),
        ])
        result.push({
          address: poolAddress,
          protocol: 'uniswap_v3',
          metricsAvailable: false,
          token0,
          token1,
          reserve0,
          reserve1,
          fee: feeTier / 10000,
          feeTier,
          tickSpacing,
          sqrtPriceX96: slot[0],
          tvl: 0,
          apr: 0,
        })
        for (const nft of nfts.filter((n) => n.pool.toLowerCase() === poolAddress.toLowerCase())) {
          const p = nft.position
          const amounts = amountsForLiquidity(
            slot[0],
            sqrtRatioAtTick(p[5]),
            sqrtRatioAtTick(p[6]),
            p[7]
          )
          if (p[7] > 0n || p[10] > 0n || p[11] > 0n)
            owned.push({
              poolAddress,
              token0,
              token1,
              tokenId: nft.id,
              tickLower: p[5],
              tickUpper: p[6],
              liquidity: p[7],
              token0Amount: amounts.amount0 + p[10],
              token1Amount: amounts.amount1 + p[11],
              shareOfPool: 0,
            })
        }
      }
      if (id === generation.current) {
        setPools(result)
        setPositions(owned)
      }
    } catch (err) {
      if (id === generation.current)
        setError(err instanceof Error ? err : Error('Pool discovery failed'))
    } finally {
      if (id === generation.current) setIsLoading(false)
    }
  }, [chainId, publicClient, address])
  useEffect(() => {
    void refresh()
    return () => {
      generation.current++
    }
  }, [refresh])
  return { pools, positions, isLoading, isLoadingPositions: isLoading, error, refresh }
}
