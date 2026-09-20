import { getChainAddresses } from '@stablenet/contracts'
import { type Address, isAddress, zeroAddress } from 'viem'
/** Never redirect an unsupported chain or missing deployment to a development address. */
export function optionalDeployment(chainId: number, key: string): Address | undefined {
  try {
    const address = getChainAddresses(chainId).raw[key]
    return address && isAddress(address) && address.toLowerCase() !== zeroAddress
      ? address
      : undefined
  } catch {
    return undefined
  }
}
export function requireDeployment(chainId: number, key: string): Address {
  const address = optionalDeployment(chainId, key)
  if (!address) throw new Error(`${key} is not deployed on chain ${chainId}`)
  return address
}
export function assertConfirmed(receipt: { status: string }) {
  if (receipt.status !== 'success') throw new Error('Transaction reverted')
}
export function assertSlippage(bps: number) {
  if (!Number.isInteger(bps) || bps < 0 || bps >= 10000)
    throw new Error('Slippage must be between 0 and 9999 basis points')
}
