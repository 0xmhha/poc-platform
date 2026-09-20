'use client'

import { createBundlerClient } from '@stablenet/wallet-sdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Address, EIP1193Provider, Hex } from 'viem'
import { parseEther } from 'viem'
import { useAccount } from 'wagmi'
import { useStableNetContext } from '@/providers'

// ============================================================================
// Types
// ============================================================================

export type GasPaymentType = 'none' | 'sponsor' | 'erc20' | 'permit2'

export interface GasPaymentContext {
  type: GasPaymentType
  tokenAddress?: Address
  permitSignature?: Hex
}

interface SendUserOpParams {
  to: Address
  value?: bigint
  data?: Hex
  gasPayment?: GasPaymentContext
}

type UserOpStatus = 'submitted' | 'confirmed' | 'failed'
export type SubmissionFailure = 'rejected' | 'unknown' | null

interface UserOpResult {
  userOpHash: Hex
  transactionHash?: Hex
  success: boolean
  status: UserOpStatus
}

// ============================================================================
// Pending UserOp localStorage (for re-checking timed-out submissions)
// ============================================================================

const PENDING_OPS_KEY = 'stablenet:pending-user-ops'

export interface PendingUserOp {
  userOpHash: Hex
  timestamp: number
  to?: string
  chainId?: number
  sender?: Address
  kind?: 'userOp' | 'transaction'
}

function loadPendingOps(): PendingUserOp[] {
  try {
    const stored = localStorage.getItem(PENDING_OPS_KEY)
    if (!stored) return []
    const ops = JSON.parse(stored) as PendingUserOp[]
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return ops.filter((op) => op.timestamp > cutoff)
  } catch {
    return []
  }
}

function removePendingOp(userOpHash: Hex): void {
  try {
    const ops = loadPendingOps().filter((op) => op.userOpHash !== userOpHash)
    localStorage.setItem(PENDING_OPS_KEY, JSON.stringify(ops))
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Send transactions through the StableNet wallet extension.
 *
 * The extension's handler.ts handles all UserOp logic:
 * - Kernel v3 execute calldata wrapping (ERC-7579)
 * - Nonce fetching from EntryPoint
 * - Gas estimation via bundler
 * - Signing with the wallet's private key
 * - Bundler submission and receipt polling
 *
 * The DApp only needs to specify {to, value, data} — no direct
 * bundler communication, UserOp construction, or signing required.
 */
export function useUserOp() {
  const { bundlerUrl, entryPoint, publicClient, chainId, isReady } = useStableNetContext()
  const { connector, address } = useAccount()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [provider, setProvider] = useState<EIP1193Provider | null>(null)
  const lastSubmissionFailure = useRef<SubmissionFailure>(null)

  // Get provider from wagmi connector (shared with useWallet)
  // Note: wagmi connector returns the inpage EIP-1193 provider, not
  // the wallet-sdk StableNetProvider class. Use request() only.
  useEffect(() => {
    let active = true
    setProvider(null)
    if (!connector) {
      setProvider(null)
      return
    }

    connector
      .getProvider()
      .then((p) => {
        if (p && active) setProvider(p as EIP1193Provider)
      })
      .catch(() => {
        if (active) setProvider(null)
      })
    return () => {
      active = false
    }
  }, [connector])

  // Bundler client — only for recheckUserOp (receipt polling of old submissions)
  const bundlerClient = useMemo(
    () => (bundlerUrl ? createBundlerClient({ url: bundlerUrl, entryPoint }) : null),
    [bundlerUrl, entryPoint]
  )

  const remember = useCallback(
    (hash: Hex, sender: Address, to: Address, kind: 'userOp' | 'transaction') => {
      try {
        const ops = loadPendingOps().filter((x) => x.userOpHash !== hash)
        ops.push({ userOpHash: hash, sender, chainId, to, kind, timestamp: Date.now() })
        localStorage.setItem(PENDING_OPS_KEY, JSON.stringify(ops))
      } catch {
        /* storage may be unavailable */
      }
    },
    [chainId]
  )
  const confirm = useCallback(
    async (hash: Hex, kind: 'userOp' | 'transaction'): Promise<UserOpResult> => {
      try {
        if (kind === 'userOp') {
          if (!bundlerClient) throw Error('Bundler unavailable')
          const r = await bundlerClient.waitForUserOperationReceipt(hash, {
            timeout: 60000,
            pollingInterval: 1000,
          })
          removePendingOp(hash)
          return {
            userOpHash: hash,
            transactionHash: r.receipt?.transactionHash,
            success: r.success === true,
            status: r.success ? 'confirmed' : 'failed',
          }
        }
        const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 60000 })
        removePendingOp(hash)
        return {
          userOpHash: hash,
          transactionHash: r.transactionHash,
          success: r.status === 'success',
          status: r.status === 'success' ? 'confirmed' : 'failed',
        }
      } catch {
        return {
          userOpHash: hash,
          transactionHash: kind === 'transaction' ? hash : undefined,
          success: false,
          status: 'submitted',
        }
      }
    },
    [bundlerClient, publicClient]
  )
  /**
   * Send a transaction through the wallet extension.
   *
   * When gasPayment is provided (sponsor/erc20/permit2), sends via
   * eth_sendUserOperation which triggers the extension's ERC-7677
   * sponsorAndSign flow. Otherwise falls back to eth_sendTransaction.
   */
  const sendUserOp = useCallback(
    async (sender: Address, params: SendUserOpParams): Promise<UserOpResult | null> => {
      if (!provider) {
        setError(new Error('StableNet wallet not detected. Please install the extension.'))
        return null
      }

      if (isReady === false || (address && address.toLowerCase() !== sender.toLowerCase())) {
        setError(new Error('Account or chain is not ready'))
        return null
      }
      setIsLoading(true)
      setError(null)
      lastSubmissionFailure.current = null

      try {
        const hasPaymaster = params.gasPayment && params.gasPayment.type !== 'none'

        if (hasPaymaster) {
          // Use eth_sendUserOperation — extension handles Kernel calldata wrapping,
          // nonce, gas estimation, sponsorAndSign, and bundler submission
          const hash = (await provider.request({
            method: 'eth_sendUserOperation' as 'eth_sendTransaction',
            params: [
              {
                sender,
                target: params.to,
                value: params.value ? `0x${params.value.toString(16)}` : '0x0',
                data: params.data ?? '0x',
                gasPayment: params.gasPayment,
              },
              entryPoint,
            ] as unknown as [{ from: Address; to: Address }],
          })) as Hex

          remember(hash, sender, params.to, 'userOp')
          return await confirm(hash, 'userOp')
        }

        // Fallback: regular eth_sendTransaction (extension auto-detects smart account)
        // Use provider.request() directly since the wagmi connector returns the
        // inpage EIP-1193 provider, not the wallet-sdk StableNetProvider class.
        const txHash = (await provider.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: sender,
              to: params.to,
              value: params.value ? `0x${params.value.toString(16)}` : '0x0',
              data: params.data ?? '0x',
            },
          ],
        })) as Hex

        remember(txHash, sender, params.to, 'transaction')
        return await confirm(txHash, 'transaction')
      } catch (err) {
        const opError = err instanceof Error ? err : new Error('Transaction failed')
        const code = (err as { code?: unknown } | null)?.code
        lastSubmissionFailure.current =
          code === 4001 ||
          code === '4001' ||
          /user (?:rejected|denied|cancel)/i.test(opError.message)
            ? 'rejected'
            : 'unknown'
        setError(opError)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [provider, entryPoint, isReady, address, remember, confirm]
  )

  /**
   * Simple ETH transfer helper
   */
  const sendTransaction = useCallback(
    async (
      sender: Address,
      to: Address,
      value: string,
      gasPayment?: GasPaymentContext
    ): Promise<UserOpResult | null> => {
      return sendUserOp(sender, {
        to,
        value: parseEther(value),
        data: '0x',
        gasPayment,
      })
    },
    [sendUserOp]
  )

  /**
   * Re-check a previously submitted UserOp that timed out.
   * Uses bundler client directly for receipt polling.
   */
  const recheckUserOp = useCallback(
    async (userOpHash: Hex): Promise<UserOpResult> => {
      const saved = loadPendingOps().find((x) => x.userOpHash === userOpHash)
      if (
        saved &&
        (saved.chainId !== chainId ||
          (saved.sender && saved.sender.toLowerCase() !== address?.toLowerCase()))
      ) {
        return { userOpHash, success: false, status: 'submitted' }
      }
      return confirm(userOpHash, saved?.kind ?? 'userOp')
    },
    [confirm, chainId, address]
  )

  return {
    sendUserOp,
    sendTransaction,
    recheckUserOp,
    getPendingUserOps: () =>
      loadPendingOps().filter(
        (x) => x.chainId === chainId && x.sender?.toLowerCase() === address?.toLowerCase()
      ),
    removePendingUserOp: removePendingOp,
    getLastSubmissionFailure: () => lastSubmissionFailure.current,
    isLoading,
    error,
    clearError: () => setError(null),
  }
}
