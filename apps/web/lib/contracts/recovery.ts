import { type Address, encodeAbiParameters, isAddress, zeroAddress } from 'viem'

export interface WeightedGuardian {
  address: Address
  weight: number
  label?: string
}
export const GUARDIAN_SENTINEL = '0xffffffffffffffffffffffffffffffffffffffff' as Address
const UINT24_MAX = 0xffffff

export function recoveryParameters(
  guardians: WeightedGuardian[],
  threshold: number,
  delay = 0,
  account?: Address
) {
  if (!guardians.length || guardians.length > 256)
    throw Error('Provide between 1 and 256 guardians')
  const sorted = [...guardians].sort((a, b) => (BigInt(a.address) > BigInt(b.address) ? -1 : 1))
  const seen = new Set<string>()
  let total = 0
  for (const guardian of sorted) {
    const key = guardian.address.toLowerCase()
    if (
      !isAddress(guardian.address) ||
      key === zeroAddress ||
      key === GUARDIAN_SENTINEL ||
      key === account?.toLowerCase()
    )
      throw Error('Invalid guardian address')
    if (seen.has(key)) throw Error('Duplicate guardian')
    seen.add(key)
    if (!Number.isInteger(guardian.weight) || guardian.weight <= 0 || guardian.weight > UINT24_MAX)
      throw Error('Invalid guardian weight')
    total += guardian.weight
  }
  if (total > UINT24_MAX) throw Error('Total guardian weight exceeds uint24')
  if (!Number.isInteger(threshold) || threshold <= 0 || threshold > total)
    throw Error('Threshold must be positive and cannot exceed total weight')
  if (!Number.isSafeInteger(delay) || delay < 0 || delay > 2 ** 48 - 1)
    throw Error('Invalid recovery delay')
  return [sorted.map((g) => g.address), sorted.map((g) => g.weight), threshold, delay] as const
}
export function encodeRecoveryInit(
  guardians: WeightedGuardian[],
  threshold: number,
  delay = 0,
  account?: Address
) {
  return encodeAbiParameters(
    [{ type: 'address[]' }, { type: 'uint24[]' }, { type: 'uint24' }, { type: 'uint48' }],
    recoveryParameters(guardians, threshold, delay, account)
  )
}
