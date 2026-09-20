'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Address, Hex } from 'viem'
import { erc20Abi as ERC20_ABI, encodeFunctionData, isAddress } from 'viem'
import { getServiceUrls } from '@/lib/constants'
import { assertSlippage, optionalDeployment } from '@/lib/contracts/deployment'
import { validateSwapCall } from '@/lib/contracts/swap'
import { useStableNetContext } from '@/providers'
import type { SwapQuote, Token } from '@/types'
import type { GasPaymentContext } from './useUserOp'

interface SwapParams {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  slippage?: number
}

interface SwapOptions {
  gasPayment?: GasPaymentContext
  slippage?: number
}

interface UseSwapConfig {
  orderRouterUrl?: string
  sendUserOp?: (
    sender: Address,
    params: {
      to: Address
      value?: bigint
      data: Hex
      minAmountOut?: bigint
      gasPayment?: GasPaymentContext
    }
  ) => Promise<{ userOpHash: Hex; transactionHash?: Hex; success: boolean } | null>
  readContract?: (params: {
    address: Address
    abi: readonly unknown[]
    functionName: string
    args: readonly unknown[]
  }) => Promise<bigint>
  routerAddress?: Address
  defaultSlippage?: number
}

const DEFAULT_SLIPPAGE = 0.5 // 0.5%
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

export function useSwap(config: UseSwapConfig = {}) {
  const { chainId, publicClient } = useStableNetContext()
  const serviceUrls = useMemo(() => getServiceUrls(chainId), [chainId])

  const {
    orderRouterUrl = serviceUrls?.orderRouter,
    sendUserOp,
    readContract,
    routerAddress = optionalDeployment(chainId, 'uniswapV2Router') ??
      optionalDeployment(chainId, 'swapRouter'),
    defaultSlippage = DEFAULT_SLIPPAGE,
  } = config

  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchIdRef = useRef(0)
  const quoteTimes = useRef(new WeakMap<SwapQuote, number>())
  const clearQuote = useCallback(() => {
    fetchIdRef.current++
    quoteTimes.current = new WeakMap()
    setQuote(null)
    setIsLoading(false)
  }, [])
  const previousChain = useRef(chainId)
  useEffect(() => {
    if (previousChain.current !== chainId) {
      clearQuote()
      previousChain.current = chainId
    }
  }, [chainId, clearQuote])

  /**
   * Calculate minimum amount out with slippage
   */
  const calculateMinAmountOut = useCallback((amountOut: bigint, slippage: number): bigint => {
    const bps = Math.round(slippage * 100)
    assertSlippage(bps)
    const slippageBps = BigInt(bps)
    return amountOut - (amountOut * slippageBps) / BigInt(10000)
  }, [])

  /**
   * Get swap quote from order router
   */
  const getQuote = useCallback(
    async (params: SwapParams): Promise<SwapQuote | null> => {
      const id = ++fetchIdRef.current
      setIsLoading(true)
      setQuote(null)
      setError(null)

      try {
        const { tokenIn, tokenOut, amountIn } = params

        if (!orderRouterUrl) throw Error('Order router is not configured for this chain')
        if (
          amountIn <= 0n ||
          !isAddress(tokenIn.address) ||
          !isAddress(tokenOut.address) ||
          tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase()
        )
          throw Error('Invalid swap pair or amount')
        const bps = Math.round((params.slippage ?? defaultSlippage) * 100)
        assertSlippage(bps)
        const query = new URLSearchParams({
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn: amountIn.toString(),
          slippage: String(bps),
        })
        const response = await fetch(`${orderRouterUrl.replace(/\/$/, '')}/api/v1/quote?${query}`, {
          signal: AbortSignal.timeout(10000),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to get quote from order router')
        }

        const result = await response.json()

        if (id !== fetchIdRef.current) return null

        const swapQuote: SwapQuote = {
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: BigInt(result.amountOut),
          priceImpact: result.priceImpact,
          route: result.route?.hops?.length
            ? [
                tokenIn.address,
                ...result.route.hops.map(
                  (hop: { tokenOut: { address: Address } }) => hop.tokenOut.address
                ),
              ]
            : [tokenIn.address, tokenOut.address],
          gasEstimate: BigInt(result.gasEstimate || '150000'),
        }

        if (swapQuote.amountOut <= 0n) throw Error('No output liquidity')
        const expiresAt = result.expiresAt ? Date.parse(result.expiresAt) : Date.now() + 60000
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw Error('Quote is expired')
        quoteTimes.current.set(swapQuote, Math.min(expiresAt, Date.now() + 300000))
        setQuote(swapQuote)
        return swapQuote
      } catch (err) {
        if (id !== fetchIdRef.current) return null
        const swapError = err instanceof Error ? err : new Error('Failed to get quote')
        setError(swapError)
        return null
      } finally {
        if (id === fetchIdRef.current) {
          setIsLoading(false)
        }
      }
    },
    [orderRouterUrl, defaultSlippage]
  )

  /**
   * Execute swap via UserOperation
   */
  const executeSwap = useCallback(
    async (
      swapQuote: SwapQuote,
      recipient: Address,
      options: SwapOptions = {}
    ): Promise<{ transactionHash: string } | null> => {
      if (!sendUserOp) {
        setError(new Error('sendUserOp function not provided'))
        return null
      }

      if (!routerAddress) {
        setError(new Error('routerAddress not configured'))
        return null
      }

      setIsLoading(true)
      setError(null)

      try {
        const slippage = options.slippage ?? defaultSlippage
        const minAmountOut = calculateMinAmountOut(swapQuote.amountOut, slippage)
        if ((quoteTimes.current.get(swapQuote) ?? 0) <= Date.now())
          throw Error('Request a fresh quote before swapping')
        const response = await fetch(`${orderRouterUrl?.replace(/\/$/, '')}/api/v1/swap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            tokenIn: swapQuote.tokenIn.address,
            tokenOut: swapQuote.tokenOut.address,
            amountIn: swapQuote.amountIn.toString(),
            amountOutMin: minAmountOut.toString(),
            recipient,
            slippage: Math.round(slippage * 100),
            deadline: Math.floor(Date.now() / 1000) + 1200,
          }),
        })
        const transaction = await response.json()
        if (!response.ok) throw Error(transaction.message ?? 'Unable to build swap')
        if (
          !isAddress(transaction.to) ||
          transaction.to.toLowerCase() !== routerAddress.toLowerCase()
        )
          throw Error('Swap router is not an approved deployment')
        const calldata = transaction.data as Hex
        const value = BigInt(transaction.value)
        validateSwapCall(calldata, value, swapQuote, recipient, minAmountOut)
        const isETHIn = swapQuote.tokenIn.address.toLowerCase() === ETH_ADDRESS.toLowerCase()

        // ERC-20: Check allowance and approve if needed
        if (!isETHIn) {
          const currentAllowance = await (readContract ?? publicClient.readContract)({
            address: swapQuote.tokenIn.address as Address,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [recipient, routerAddress],
          })

          if (currentAllowance < swapQuote.amountIn) {
            if (currentAllowance > 0n) {
              const reset = await sendUserOp(recipient, {
                to: swapQuote.tokenIn.address,
                data: encodeFunctionData({
                  abi: ERC20_ABI,
                  functionName: 'approve',
                  args: [routerAddress, 0n],
                }),
                gasPayment: options.gasPayment,
              })
              if (!reset?.success) throw Error('Approval reset not confirmed')
            }
            const approveData = encodeFunctionData({
              abi: ERC20_ABI,
              functionName: 'approve',
              args: [routerAddress, swapQuote.amountIn],
            })

            const approveResult = await sendUserOp(recipient, {
              to: swapQuote.tokenIn.address as Address,
              data: approveData,
              gasPayment: options.gasPayment,
            })

            if (!approveResult || !approveResult.success) {
              throw new Error('ERC-20 approve failed')
            }
          }
        }

        if ((quoteTimes.current.get(swapQuote) ?? 0) <= Date.now())
          throw Error('Quote expired while approving tokens; request a fresh quote')
        validateSwapCall(calldata, value, swapQuote, recipient, minAmountOut)
        quoteTimes.current.delete(swapQuote)
        const result = await sendUserOp(recipient, {
          to: routerAddress,
          value,
          gasPayment: options.gasPayment,
          data: calldata,
          minAmountOut,
        })

        if (!result || !result.success) {
          throw new Error('UserOperation failed')
        }

        return {
          transactionHash: result.transactionHash || result.userOpHash,
        }
      } catch (err) {
        const swapError = err instanceof Error ? err : new Error('Failed to execute swap')
        setError(swapError)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [
      sendUserOp,
      readContract,
      routerAddress,
      defaultSlippage,
      calculateMinAmountOut,
      orderRouterUrl,
      publicClient,
    ]
  )

  return {
    quote,
    getQuote,
    executeSwap,
    isLoading,
    error,
    clearQuote,
    clearError: () => setError(null),
  }
}
