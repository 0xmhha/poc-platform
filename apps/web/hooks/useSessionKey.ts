'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address, Hash, Hex } from 'viem'
import { encodeAbiParameters, isAddress, keccak256 } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'
import { assertConfirmed, optionalDeployment } from '@/lib/contracts/deployment'
import { SESSION_EXECUTOR_ABI as sessionKeyManager_ABI } from '@/lib/contracts/runtimeAbis'
import {
  clearSessionScope,
  forgetSessionKey,
  retainSessionKey,
  signSessionHash,
} from '@/lib/sessionKeyVault'

// Session key states
export type SessionKeyState = 'active' | 'expired' | 'revoked' | 'unknown'

// Session key info
export interface SessionKeyInfo {
  /** Session key address */
  sessionKey: Address
  /** Current state */
  state: SessionKeyState
  /** Expiry timestamp (0 = no expiry) */
  expiry: bigint
  /** Remaining spending limit */
  remainingLimit: bigint
  /** Total spending limit */
  totalLimit: bigint
  /** Permissions granted to this session key */
  permissions: SessionKeyPermission[]
  /** Creation timestamp */
  createdAt: bigint
}

// Permission granted to a session key
export interface SessionKeyPermission {
  /** Target contract address */
  target: Address
  /** Function selector */
  selector: Hex
  /** Whether permission is active */
  active: boolean
}

// Parameters for creating a session key
export interface CreateSessionKeyParams {
  /** Optional public key of a signer managed outside this browser. */
  sessionKey?: Address
  /** Expiry timestamp (0 = no expiry) */
  expiry?: bigint
  /** Native value spending limit (0 disables native transfers). ERC-20 amounts are governed by permissions. */
  spendingLimit?: bigint
  /** Initial permissions to grant */
  permissions?: Array<{
    target: Address
    selector: Hex
  }>
}

// Permission to grant to a session key
export interface Permission {
  /** Target contract address */
  target: Address
  /** Function selector (4 bytes) */
  selector: Hex
  /** Maximum value per call */
  maxValue?: bigint
}

export interface UseSessionKeyReturn {
  // State
  sessionKeys: SessionKeyInfo[]
  isLoading: boolean
  error: string | null

  // Loading states for individual operations
  isCreating: boolean
  isRevoking: boolean
  isGranting: boolean

  // Operations
  createSessionKey: (params: CreateSessionKeyParams) => Promise<{
    sessionKey: Address
    txHash: Hash
  } | null>
  revokeSessionKey: (sessionKey: Address) => Promise<{ txHash: Hash } | null>
  grantPermission: (sessionKey: Address, permission: Permission) => Promise<{ txHash: Hash } | null>
  revokePermission: (
    sessionKey: Address,
    target: Address,
    selector: Hex
  ) => Promise<{ txHash: Hash } | null>

  executeSessionCall: (
    sessionKey: Address,
    target: Address,
    value: bigint,
    data: Hex
  ) => Promise<{ txHash: Hash } | null>

  // Queries
  getSessionKeyState: (sessionKey: Address) => Promise<SessionKeyInfo | null>
  checkPermission: (sessionKey: Address, target: Address, selector: Hex) => Promise<boolean>

  // Helpers
  refresh: () => Promise<void>
  clearError: () => void
}

/**
 * Hook for managing ERC-7715 session keys
 * Allows creating, revoking, and managing permissions for session keys
 */
export function useSessionKey(account?: Address): UseSessionKeyReturn {
  const { address: connectedAddress, isConnected } = useAccount()
  const chainId = useChainId()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  // Use provided account or connected address
  const targetAccount = account || connectedAddress

  const sessionKeyManager = optionalDeployment(chainId, 'sessionKeyExecutor')
  const scope = `${chainId}:${targetAccount?.toLowerCase()}`
  useEffect(() => () => clearSessionScope(scope), [scope])

  // State
  const [sessionKeys, setSessionKeys] = useState<SessionKeyInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Loading states for operations
  const [isCreating, setIsCreating] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [isGranting, setIsGranting] = useState(false)

  const fetchIdRef = useRef(0)

  // Clear error helper
  const clearError = useCallback(() => setError(null), [])

  // Fetch session key state from contract
  const getSessionKeyState = useCallback(
    async (sessionKey: Address): Promise<SessionKeyInfo | null> => {
      if (!targetAccount || !publicClient || !sessionKeyManager) return null

      try {
        const result = await publicClient.readContract({
          address: sessionKeyManager,
          abi: sessionKeyManager_ABI,
          functionName: 'getSessionKey',
          args: [targetAccount, sessionKey],
        })

        const { validUntil, validAfter, spendingLimit, spentAmount, isActive } = result
        const expiry = BigInt(validUntil)
        const totalLimit = spendingLimit
        const remainingLimit = spendingLimit > spentAmount ? spendingLimit - spentAmount : 0n
        const createdAt = BigInt(validAfter)

        // Fetch permissions for this session key
        const permResult = await publicClient.readContract({
          address: sessionKeyManager,
          abi: sessionKeyManager_ABI,
          functionName: 'getPermissions',
          args: [targetAccount, sessionKey],
        })

        const permissions: SessionKeyPermission[] = permResult.map((p) => ({
          target: p.target,
          selector: p.selector,
          active: p.allowed,
        }))

        // Determine state
        let state: SessionKeyState = 'unknown'
        if (!isActive) {
          state = 'revoked'
        } else if (expiry < BigInt(Math.floor(Date.now() / 1000))) {
          state = 'expired'
        } else {
          state = 'active'
        }

        return {
          sessionKey,
          state,
          expiry,
          remainingLimit,
          totalLimit,
          permissions,
          createdAt,
        }
      } catch {
        // Session key state fetch failed, return null
        return null
      }
    },
    [targetAccount, publicClient, sessionKeyManager]
  )

  // Check if session key has specific permission
  const checkPermission = useCallback(
    async (sessionKey: Address, target: Address, selector: Hex): Promise<boolean> => {
      if (!targetAccount || !publicClient || !sessionKeyManager) return false

      try {
        const result = await publicClient.readContract({
          address: sessionKeyManager,
          abi: sessionKeyManager_ABI,
          functionName: 'hasPermission',
          args: [targetAccount, sessionKey, target, selector],
        })

        return result as boolean
      } catch {
        // Permission check failed, assume no permission
        return false
      }
    },
    [targetAccount, publicClient, sessionKeyManager]
  )

  // Refresh all session keys for the account
  const refresh = useCallback(async () => {
    const id = ++fetchIdRef.current
    setSessionKeys([])
    if (!targetAccount || !publicClient || !sessionKeyManager) {
      setIsLoading(false)
      if (targetAccount && !sessionKeyManager)
        setError(`Session executor is not deployed on chain ${chainId}`)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Get all session keys for the account
      const result = await publicClient.readContract({
        address: sessionKeyManager,
        abi: sessionKeyManager_ABI,
        functionName: 'getActiveSessionKeys',
        args: [targetAccount],
      })

      const sessionKeyAddresses = result as Address[]

      // Fetch state for each session key
      const keys: SessionKeyInfo[] = []
      for (const sk of sessionKeyAddresses) {
        const info = await getSessionKeyState(sk)
        if (info) {
          keys.push(info)
        }
      }

      if (id !== fetchIdRef.current) return
      setSessionKeys(keys)
    } catch (err) {
      if (id !== fetchIdRef.current) return
      const message = err instanceof Error ? err.message : 'Failed to fetch session keys'
      setError(message)
      setSessionKeys([])
    } finally {
      if (id === fetchIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [targetAccount, publicClient, getSessionKeyState, sessionKeyManager, chainId])

  // Load session keys on mount and when account changes
  useEffect(() => {
    if (isConnected && targetAccount) {
      refresh()
    } else {
      fetchIdRef.current++
      setSessionKeys([])
      setIsLoading(false)
    }
    return () => {
      fetchIdRef.current++
    }
  }, [isConnected, targetAccount, refresh])

  // Create a new session key
  const createSessionKey = useCallback(
    async (
      params: CreateSessionKeyParams
    ): Promise<{ sessionKey: Address; txHash: Hash } | null> => {
      if (
        !walletClient ||
        !publicClient ||
        !targetAccount ||
        !sessionKeyManager ||
        targetAccount.toLowerCase() !== connectedAddress?.toLowerCase()
      ) {
        setError('Wallet not connected')
        return null
      }

      setIsCreating(true)
      setError(null)

      try {
        const expiry = params.expiry && params.expiry > 0n ? params.expiry : (1n << 48n) - 1n
        const spendingLimit = params.spendingLimit ?? 0n
        if (expiry <= BigInt(Math.floor(Date.now() / 1000)) || expiry >= 1n << 48n)
          throw Error('Expiry must be a future uint48 timestamp')
        if (spendingLimit < 0n || spendingLimit >= 1n << 256n)
          throw Error('Invalid native spending limit')
        for (const p of params.permissions ?? [])
          if (!isAddress(p.target) || !/^0x[0-9a-fA-F]{8}$/.test(p.selector))
            throw Error('Invalid permission')
        const privateKey = params.sessionKey ? undefined : generatePrivateKey()
        const sessionKey = params.sessionKey ?? privateKeyToAccount(privateKey!).address
        if (!isAddress(sessionKey)) throw Error('Invalid session key address')
        const txHash = await walletClient.writeContract({
          address: sessionKeyManager,
          abi: sessionKeyManager_ABI,
          functionName: 'addSessionKey',
          args: [sessionKey, 0, Number(expiry), spendingLimit],
        })
        assertConfirmed(await publicClient.waitForTransactionReceipt({ hash: txHash }))
        if (privateKey) retainSessionKey(scope, sessionKey, privateKey, expiry)

        // Grant initial permissions if provided
        if (params.permissions && params.permissions.length > 0) {
          for (const perm of params.permissions) {
            const permissionHash = await walletClient.writeContract({
              address: sessionKeyManager,
              abi: sessionKeyManager_ABI,
              functionName: 'grantPermission',
              args: [sessionKey, perm.target, perm.selector, BigInt(0)],
            })
            assertConfirmed(await publicClient.waitForTransactionReceipt({ hash: permissionHash }))
          }
        }

        // Refresh session keys
        await refresh()

        return { sessionKey, txHash }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create session key'
        setError(message)
        return null
      } finally {
        setIsCreating(false)
      }
    },
    [walletClient, publicClient, targetAccount, connectedAddress, refresh, sessionKeyManager, scope]
  )

  // Revoke a session key
  const revokeSessionKey = useCallback(
    async (sessionKey: Address): Promise<{ txHash: Hash } | null> => {
      if (
        !walletClient ||
        !publicClient ||
        !targetAccount ||
        !sessionKeyManager ||
        targetAccount.toLowerCase() !== connectedAddress?.toLowerCase()
      ) {
        setError('Wallet not connected')
        return null
      }

      setIsRevoking(true)
      setError(null)

      try {
        const txHash = await walletClient.writeContract({
          address: sessionKeyManager,
          abi: sessionKeyManager_ABI,
          functionName: 'revokeSessionKey',
          args: [sessionKey],
        })

        assertConfirmed(await publicClient.waitForTransactionReceipt({ hash: txHash }))
        forgetSessionKey(scope, sessionKey)
        // Refresh session keys
        await refresh()

        return { txHash }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to revoke session key'
        setError(message)
        return null
      } finally {
        setIsRevoking(false)
      }
    },
    [walletClient, publicClient, targetAccount, connectedAddress, refresh, sessionKeyManager, scope]
  )

  // Grant permission to a session key
  const grantPermission = useCallback(
    async (sessionKey: Address, permission: Permission): Promise<{ txHash: Hash } | null> => {
      if (
        !walletClient ||
        !publicClient ||
        !targetAccount ||
        !sessionKeyManager ||
        targetAccount.toLowerCase() !== connectedAddress?.toLowerCase()
      ) {
        setError('Wallet not connected')
        return null
      }

      setIsGranting(true)
      setError(null)

      try {
        const txHash = await walletClient.writeContract({
          address: sessionKeyManager,
          abi: sessionKeyManager_ABI,
          functionName: 'grantPermission',
          args: [
            sessionKey,
            permission.target,
            permission.selector,
            permission.maxValue ?? BigInt(0),
          ],
        })

        assertConfirmed(await publicClient.waitForTransactionReceipt({ hash: txHash }))
        // Refresh session keys
        await refresh()

        return { txHash }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to grant permission'
        setError(message)
        return null
      } finally {
        setIsGranting(false)
      }
    },
    [walletClient, publicClient, targetAccount, connectedAddress, refresh, sessionKeyManager]
  )

  // Revoke permission from a session key
  const revokePermission = useCallback(
    async (
      sessionKey: Address,
      target: Address,
      selector: Hex
    ): Promise<{ txHash: Hash } | null> => {
      if (
        !walletClient ||
        !publicClient ||
        !targetAccount ||
        !sessionKeyManager ||
        targetAccount.toLowerCase() !== connectedAddress?.toLowerCase()
      ) {
        setError('Wallet not connected')
        return null
      }

      setIsGranting(true)
      setError(null)

      try {
        const txHash = await walletClient.writeContract({
          address: sessionKeyManager,
          abi: sessionKeyManager_ABI,
          functionName: 'revokePermission',
          args: [sessionKey, target, selector],
        })

        assertConfirmed(await publicClient.waitForTransactionReceipt({ hash: txHash }))
        // Refresh session keys
        await refresh()

        return { txHash }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to revoke permission'
        setError(message)
        return null
      } finally {
        setIsGranting(false)
      }
    },
    [walletClient, publicClient, targetAccount, connectedAddress, refresh, sessionKeyManager]
  )

  const executeSessionCall = useCallback(
    async (
      sessionKey: Address,
      target: Address,
      value: bigint,
      data: Hex
    ): Promise<{ txHash: Hash } | null> => {
      try {
        if (!publicClient || !walletClient || !targetAccount || !sessionKeyManager)
          throw Error('Wallet not connected')
        if (value < 0n || !isAddress(target) || !/^0x([0-9a-fA-F]{2})*$/.test(data))
          throw Error('Invalid session call')
        const session = await publicClient.readContract({
          address: sessionKeyManager,
          abi: sessionKeyManager_ABI,
          functionName: 'getSessionKey',
          args: [targetAccount, sessionKey],
        })
        const digest = keccak256(
          encodeAbiParameters(
            [
              { type: 'uint256' },
              { type: 'address' },
              { type: 'address' },
              { type: 'address' },
              { type: 'uint256' },
              { type: 'bytes' },
              { type: 'uint256' },
            ],
            [BigInt(chainId), sessionKeyManager, targetAccount, target, value, data, session.nonce]
          )
        )
        const signature = await signSessionHash(scope, sessionKey, digest)
        const txHash = await walletClient.writeContract({
          address: sessionKeyManager,
          abi: sessionKeyManager_ABI,
          functionName: 'executeOnBehalf',
          args: [targetAccount, target, value, data, session.nonce, signature],
        })
        assertConfirmed(await publicClient.waitForTransactionReceipt({ hash: txHash }))
        await refresh()
        return { txHash }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Session execution failed')
        return null
      }
    },
    [publicClient, walletClient, targetAccount, sessionKeyManager, chainId, scope, refresh]
  )

  return {
    // State
    sessionKeys,
    isLoading,
    error,

    // Loading states
    isCreating,
    isRevoking,
    isGranting,

    // Operations
    createSessionKey,
    revokeSessionKey,
    grantPermission,
    revokePermission,

    executeSessionCall,
    // Queries
    getSessionKeyState,
    checkPermission,

    // Helpers
    refresh,
    clearError,
  }
}
