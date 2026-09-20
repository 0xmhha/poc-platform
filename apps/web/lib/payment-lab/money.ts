export const decimals = { KRW: 0, USD: 2, USDC: 6 } as const
export type Asset = keyof typeof decimals
export function toMinor(value: string, asset: Asset): string {
  const d = decimals[asset]
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('올바른 금액을 입력해주세요.')
  const [whole = '0', fraction = ''] = value.split('.')
  if (fraction.length > d) throw new Error(`${asset}는 소수 ${d}자리까지 입력할 수 있습니다.`)
  const result = BigInt(whole) * 10n ** BigInt(d) + BigInt(fraction.padEnd(d, '0') || '0')
  if (result <= 0n || result > 999999999999999999n)
    throw new Error('금액이 허용 범위를 벗어났습니다.')
  return result.toString()
}
export function formatMinor(value: string, asset: Asset) {
  const d = decimals[asset],
    sign = value.startsWith('-') ? '-' : '',
    padded = value.replace(/^-/, '').padStart(d + 1, '0')
  return `${sign}${d ? padded.slice(0, -d) + '.' + padded.slice(-d) : padded} ${asset}`
}
