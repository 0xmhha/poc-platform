import type { PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { fetchSupportedTokens } from '../src/chain/contracts'

vi.mock('@stablenet/contracts', () => ({
  getDefaultTokens: () => [
    { address: '0x0000000000000000000000000000000000000000', symbol: 'NATIVE', decimals: 18 },
    { address: '0x0000000000000000000000000000000000000001', symbol: 'USDC', decimals: 6 },
  ],
}))

describe('ERC20Paymaster supported token discovery', () => {
  it('queries isTokenSupported for configured tokens and excludes native currency', async () => {
    const readContract = vi
      .fn()
      .mockImplementation(({ functionName }: { functionName: string }) => {
        if (functionName === 'isTokenSupported') return Promise.resolve(true)
        if (functionName === 'calculateTokenAmount') return Promise.resolve(1_000_000n)
        return Promise.reject(new Error(`Unexpected function ${functionName}`))
      })
    const tokens = await fetchSupportedTokens(
      { readContract } as unknown as PublicClient,
      '0x000000000000000000000000000000000000abcd',
      undefined,
      31337
    )
    expect(tokens.map((t) => t.symbol)).toEqual(['USDC'])
    expect(tokens[0].exchangeRate).toBe('1000000')
    expect(readContract).toHaveBeenCalledTimes(2)
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'isTokenSupported',
        args: ['0x0000000000000000000000000000000000000001'],
      })
    )
  })

  it('does not advertise a token when neither oracle nor paymaster can quote it', async () => {
    const readContract = vi
      .fn()
      .mockImplementation(({ functionName }: { functionName: string }) => {
        if (functionName === 'isTokenSupported') return Promise.resolve(true)
        return Promise.reject(new Error('quote unavailable'))
      })

    await expect(
      fetchSupportedTokens(
        { readContract } as unknown as PublicClient,
        '0x000000000000000000000000000000000000abce',
        undefined,
        31337
      )
    ).resolves.toEqual([])
  })
})
