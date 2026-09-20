import { describe, expect, it } from 'vitest'
import { amountsForLiquidity, liquidityForAmounts, Q96 } from '../contracts/liquidity'
import { sqrtRatioAtTick } from '../contracts/tickMath'
import {
  enterpriseStorageKey,
  nextPayrollDate,
  tokenTotals,
  validateAmount,
} from '../enterprise/records'

const token = {
  address: '0x1111111111111111111111111111111111111111' as const,
  name: 'USD',
  symbol: 'USD',
  decimals: 6,
}
describe('enterprise records and liquidity precision', () => {
  it('isolates account and chain journals', () => {
    expect(enterpriseStorageKey('payroll', 1, token.address)).not.toBe(
      enterpriseStorageKey('payroll', 2, token.address)
    )
    expect(enterpriseStorageKey('payroll', 1)).toBeNull()
  })
  it('preserves bigint precision and never adds unlike assets', () => {
    expect(
      tokenTotals([
        { amount: 9007199254740993n, token },
        { amount: 1n, token },
        {
          amount: 5n,
          token: { ...token, address: '0x2222222222222222222222222222222222222222', symbol: 'EUR' },
        },
      ])
    ).toBe('9007199254.740994 USD + 0.000005 EUR')
  })
  it('keeps end-of-month payments within the next calendar month', () => {
    expect(nextPayrollDate(new Date('2028-01-31T10:00:00Z'), 'monthly').toISOString()).toBe(
      '2028-02-29T10:00:00.000Z'
    )
  })
  it('rejects nonpositive and overflowing token amounts', () => {
    for (const amount of [0n, -1n, 1n << 256n])
      expect(() => validateAmount(amount, token)).toThrow()
  })
  it('matches canonical V3 tick bounds and spot price', () => {
    expect(sqrtRatioAtTick(0)).toBe(Q96)
    expect(sqrtRatioAtTick(-887272)).toBe(4295128739n)
    expect(sqrtRatioAtTick(887272)).toBe(1461446703485210103287273052203988822378723970342n)
  })
  it('never rounds required V3 token amounts above the offered amounts', () => {
    const lower = sqrtRatioAtTick(-120),
      upper = sqrtRatioAtTick(120)
    const liquidity = liquidityForAmounts(Q96, lower, upper, 1000000n, 2000000n)
    const amounts = amountsForLiquidity(Q96, lower, upper, liquidity)
    expect(liquidity).toBeGreaterThan(0n)
    expect(amounts.amount0).toBeLessThanOrEqual(1000000n)
    expect(amounts.amount1).toBeLessThanOrEqual(2000000n)
  })
})
