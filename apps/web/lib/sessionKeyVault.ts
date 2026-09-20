import type { Address, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { SecureKeyStore } from './secureKeyStore'

// Independent, memory-only vaults. Session material never overwrites 7702 signing material.
const keys = new Map<string, SecureKeyStore>()
function id(scope: string, address: Address) {
  return `${scope}:${address.toLowerCase()}`
}
export function retainSessionKey(
  scope: string,
  address: Address,
  privateKey: Hex,
  expiresAt: bigint
) {
  const key = id(scope, address)
  keys.get(key)?.clear()
  const vault = new SecureKeyStore()
  vault.onClear(() => keys.delete(key))
  vault.store(
    privateKey,
    Math.max(1, Math.min(24 * 60 * 60 * 1000, Number(expiresAt) * 1000 - Date.now()))
  )
  keys.set(key, vault)
}
export function forgetSessionKey(scope: string, address: Address) {
  keys.get(id(scope, address))?.clear()
}
export function clearSessionScope(scope: string) {
  for (const [key, vault] of keys) if (key.startsWith(`${scope}:`)) vault.clear()
}
export async function signSessionHash(scope: string, address: Address, hash: Hex): Promise<Hex> {
  const privateKey = keys.get(id(scope, address))?.retrieve() as Hex | undefined
  if (!privateKey) throw Error('Session signing key is no longer available in this browser session')
  return privateKeyToAccount(privateKey).signMessage({ message: { raw: hash } })
}
