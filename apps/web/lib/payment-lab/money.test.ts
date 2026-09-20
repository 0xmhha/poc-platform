import { describe, expect, it } from 'vitest'
import { formatMinor, toMinor } from './money'

describe('payment amount entry', () => {
  it('preserves smallest units without floating point', () => {
    expect(toMinor('0.01', 'USD')).toBe('1')
    expect(toMinor('0.000001', 'USDC')).toBe('1')
    expect(toMinor('9007199254740993', 'KRW')).toBe('9007199254740993')
    expect(formatMinor('1', 'USDC')).toBe('0.000001 USDC')
    expect(formatMinor('-1', 'USDC')).toBe('-0.000001 USDC')
  })
  it('rejects excess precision, negatives, scientific notation and zero', () => {
    for (const v of ['1.001', '-1', '1e3', '0']) expect(() => toMinor(v, 'USD')).toThrow()
    expect(() => toMinor('1.1', 'KRW')).toThrow()
  })
})
