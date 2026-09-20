import { type Address, decodeAbiParameters, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLendingMarket, readStakingPool } from '../contracts/defiReads'
import { assertConfirmed, assertSlippage, optionalDeployment } from '../contracts/deployment'
import { encodeRecoveryInit, recoveryParameters } from '../contracts/recovery'
import { clearSessionScope, retainSessionKey, signSessionHash } from '../sessionKeyVault'

const a = '0x1111111111111111111111111111111111111111' as Address
const b = '0x2222222222222222222222222222222222222222' as Address
const user = '0x3333333333333333333333333333333333333333' as Address
it('encodes the compiled validator layout with descending guardians and matching weights', () => {
  const init = encodeRecoveryInit(
    [
      { address: a, weight: 2 },
      { address: b, weight: 5 },
    ],
    6,
    3600,
    user
  )
  expect(
    decodeAbiParameters(
      [{ type: 'address[]' }, { type: 'uint24[]' }, { type: 'uint24' }, { type: 'uint48' }],
      init
    )
  ).toEqual([[b, a], [5, 2], 6, 3600])
})
it('rejects unusable recovery policies', () => {
  for (const threshold of [0, 4, 1.5])
    expect(() => recoveryParameters([{ address: a, weight: 3 }], threshold)).toThrow()
  expect(() =>
    recoveryParameters(
      [
        { address: a, weight: 1 },
        { address: a, weight: 2 },
      ],
      1
    )
  ).toThrow('Duplicate')
  expect(() => recoveryParameters([{ address: a, weight: 1 }], 1, 0, a)).toThrow()
})
it('does not use a deployment from a different chain or accept reverted transactions', () => {
  expect(optionalDeployment(999999, 'stakingExecutor')).toBeUndefined()
  expect(() => assertConfirmed({ status: 'reverted' })).toThrow()
  for (const value of [-1, 10000, NaN, 0.5]) expect(() => assertSlippage(value)).toThrow()
})
it('reads accrued lending positions and RAY annual rates without demo balances', async () => {
  const client = {
    readContract: vi.fn(
      async ({ functionName }: { functionName: string }) =>
        ({
          name: 'Token',
          symbol: 'TOK',
          decimals: 6,
          balanceOf: 200n,
          getDepositBalance: 110n,
          getBorrowBalance: 22n,
          getReserveData: {
            currentLiquidityRate: 3n * 10n ** 25n,
            currentBorrowRate: 5n * 10n ** 25n,
            totalDeposits: 400n,
            totalBorrows: 200n,
          },
        })[functionName as 'name']
    ),
  } as unknown as PublicClient
  const { market, position } = await readLendingMarket(client, a, b, user)
  expect(position.suppliedAmount).toBe(110n)
  expect(position.borrowedAmount).toBe(22n)
  expect(market.supplyAPY).toBe(3)
  expect(market.borrowAPY).toBe(5)
  expect(market.utilizationRate).toBe(50)
})
it('does not invent APR for rewards paid in a different token', async () => {
  const result: Record<string, unknown> = {
    stakingToken: a,
    rewardToken: b,
    name: 'Token',
    symbol: 'TOK',
    decimals: 18,
    getVaultConfig: {
      minStake: 1n,
      maxStake: 100n,
      rewardRate: 1n,
      isActive: true,
      lockPeriod: 30n,
      earlyWithdrawPenalty: 100n,
    },
    getVaultState: { totalStaked: 50n, rewardsRemaining: 1000n },
    getStakeInfo: { amount: 10n, stakedAt: 5n, lockUntil: 35n, penaltyAtStake: 100n },
    pendingRewards: 2n,
  }
  const client = {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => result[functionName]),
  } as unknown as PublicClient
  const { pool, position } = await readStakingPool(client, a, user)
  expect(pool.apr).toBeNull()
  expect(position.stakedAmount).toBe(10n)
  expect(position.rewardsEarned).toBe(2n)
})
describe('session signer isolation', () => {
  afterEach(() => {
    clearSessionScope('chain:alice')
    clearSessionScope('chain:bob')
  })
  it('binds each signer to its account and chain scope and removes it on disconnect', async () => {
    const key = `0x${'11'.repeat(32)}` as const
    const address = privateKeyToAccount(key).address
    const hash = `0x${'22'.repeat(32)}` as const
    retainSessionKey('chain:alice', address, key, BigInt(Math.floor(Date.now() / 1000) + 600))
    expect(await signSessionHash('chain:alice', address, hash)).toMatch(/^0x[0-9a-f]{130}$/)
    await expect(signSessionHash('chain:bob', address, hash)).rejects.toThrow('no longer available')
    clearSessionScope('chain:alice')
    await expect(signSessionHash('chain:alice', address, hash)).rejects.toThrow(
      'no longer available'
    )
  })
})
