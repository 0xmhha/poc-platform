import { act, renderHook } from '@testing-library/react'
import { type Address, encodeFunctionData } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SWAP_ROUTER_ABI } from '@/lib/contracts/swap'
import type { SwapQuote, Token } from '@/types'
import { useSwap } from '../useSwap'

vi.mock('@/providers', () => ({ useStableNetContext: () => ({ chainId: 8283 }) }))
const tokenIn: Token = {
  address: '0x1111111111111111111111111111111111111111',
  name: 'Input',
  symbol: 'IN',
  decimals: 18,
}
const tokenOut: Token = {
  address: '0x2222222222222222222222222222222222222222',
  name: 'Output',
  symbol: 'OUT',
  decimals: 6,
}
const router = '0x3333333333333333333333333333333333333333' as Address
const recipient = '0x4444444444444444444444444444444444444444' as Address
const hash = `0x${'aa'.repeat(32)}` as const
const quoteResponse = () => ({
  amountOut: '2000000',
  amountIn: '100',
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  priceImpact: 0.1,
  route: { hops: [{ tokenOut }] },
  gasEstimate: 150000,
})
const swapData = (minimum = 1990000n, to = recipient) =>
  encodeFunctionData({
    abi: SWAP_ROUTER_ABI,
    functionName: 'swapExactTokensForTokens',
    args: [
      100n,
      minimum,
      [tokenIn.address, tokenOut.address],
      to,
      BigInt(Math.floor(Date.now() / 1000) + 600),
    ],
  })
const response = (data: unknown) => ({ ok: true, json: async () => data }) as Response
async function setup(allowance = 100n) {
  const send = vi.fn().mockResolvedValue({ userOpHash: hash, transactionHash: hash, success: true })
  const read = vi.fn().mockResolvedValue(allowance)
  const hook = renderHook(() =>
    useSwap({
      orderRouterUrl: 'http://localhost:4340',
      routerAddress: router,
      sendUserOp: send,
      readContract: read,
    })
  )
  vi.mocked(fetch).mockResolvedValueOnce(response(quoteResponse()))
  let quote!: SwapQuote
  await act(async () => {
    quote = (await hook.result.current.getQuote({ tokenIn, tokenOut, amountIn: 100n }))!
  })
  return { ...hook, quote, send, read }
}
beforeEach(() => {
  vi.clearAllMocks()
})
describe('swap API and transaction integrity', () => {
  it('uses the deployed GET quote endpoint and parses hop objects', async () => {
    const { quote } = await setup()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/quote?tokenIn='),
      expect.objectContaining({ signal: expect.anything() })
    )
    expect(quote.route).toEqual([tokenIn.address, tokenOut.address])
    expect(quote.amountOut).toBe(2000000n)
  })
  it('builds via the server, validates calldata, and waits for confirmed execution', async () => {
    const { result, quote, send } = await setup()
    vi.mocked(fetch).mockResolvedValueOnce(response({ to: router, data: swapData(), value: '0' }))
    let receipt: unknown
    await act(async () => {
      receipt = await result.current.executeSwap(quote, recipient, {
        gasPayment: { type: 'sponsor' },
      })
    })
    expect(receipt).toEqual({ transactionHash: hash })
    expect(send).toHaveBeenCalledWith(
      recipient,
      expect.objectContaining({
        to: router,
        minAmountOut: 1990000n,
        gasPayment: { type: 'sponsor' },
      })
    )
  })
  it('resets insufficient nonzero allowance before an exact approval', async () => {
    const { result, quote, send } = await setup(1n)
    vi.mocked(fetch).mockResolvedValueOnce(response({ to: router, data: swapData(), value: '0' }))
    await act(async () => {
      await result.current.executeSwap(quote, recipient)
    })
    expect(send).toHaveBeenCalledTimes(3)
  })
  it.each([
    'recipient',
    'minimum',
    'router',
    'value',
  ])('rejects a changed %s before requesting any signature', async (change) => {
    const { result, quote, send } = await setup()
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        to: change === 'router' ? recipient : router,
        data: swapData(
          change === 'minimum' ? 1n : 1990000n,
          change === 'recipient' ? router : recipient
        ),
        value: change === 'value' ? '1' : '0',
      })
    )
    await act(async () => {
      expect(await result.current.executeSwap(quote, recipient)).toBeNull()
    })
    expect(send).not.toHaveBeenCalled()
    expect(result.current.error).toBeTruthy()
  })
  it('rejects unknown or expired quotes and unbounded slippage', async () => {
    const { result, quote, send } = await setup()
    await act(async () => {
      expect(await result.current.executeSwap({ ...quote }, recipient)).toBeNull()
    })
    await act(async () => {
      expect(await result.current.executeSwap(quote, recipient, { slippage: 100 })).toBeNull()
    })
    expect(send).not.toHaveBeenCalled()
  })
  it('does not report a submitted or reverted transaction as complete', async () => {
    const { result, quote, send } = await setup()
    send.mockResolvedValueOnce({ userOpHash: hash, success: false })
    vi.mocked(fetch).mockResolvedValueOnce(response({ to: router, data: swapData(), value: '0' }))
    await act(async () => {
      expect(await result.current.executeSwap(quote, recipient)).toBeNull()
    })
  })
  it('clears an old quote when the next request fails', async () => {
    const { result } = await setup()
    vi.mocked(fetch).mockRejectedValueOnce(Error('Network unavailable'))
    await act(async () => {
      await result.current.getQuote({ tokenIn, tokenOut, amountIn: 200n })
    })
    expect(result.current.quote).toBeNull()
    expect(result.current.error?.message).toBe('Network unavailable')
  })
})
