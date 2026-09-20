'use client'

import { useCallback, useState } from 'react'
import { type Hex, TransactionReceiptNotFoundError } from 'viem'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'

export interface UseTransactionManagerReturn {
  speedUpTransaction: (txHash: Hex) => Promise<Hex>
  cancelTransaction: (txHash: Hex) => Promise<Hex>
  isSpeedingUp: boolean
  isCancelling: boolean
  error: string | null
  clearError: () => void
}

const bump = (fee: bigint) =>
  (fee * GAS_BUMP_PERCENT + GAS_BUMP_BASE - 1n) / GAS_BUMP_BASE + (fee === 0n ? 1n : 0n)

// Gas bump percentage (10% increase, matching wallet-extension behavior)
const GAS_BUMP_PERCENT = 110n
const GAS_BUMP_BASE = 100n

export function useTransactionManager(): UseTransactionManagerReturn {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const [isSpeedingUp, setIsSpeedingUp] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const speedUpTransaction = useCallback(
    async (txHash: Hex): Promise<Hex> => {
      if (!walletClient || !publicClient || !address) {
        throw new Error('Wallet not connected')
      }

      setIsSpeedingUp(true)
      setError(null)

      try {
        // 1. Fetch original transaction
        const tx = await publicClient.getTransaction({ hash: txHash })

        if (!tx) {
          throw new Error('Transaction not found')
        }

        if (tx.from.toLowerCase() !== address.toLowerCase())
          throw new Error('Transaction belongs to another account')
        // 2. Check if already confirmed
        const receipt = await publicClient
          .getTransactionReceipt({ hash: txHash })
          .catch((error: unknown) => {
            if (error instanceof TransactionReceiptNotFoundError) return null
            throw error
          })
        if (receipt) {
          throw new Error('Transaction already confirmed')
        }

        // 3. Bump gas by 10%
        const gasParams: Record<string, bigint> = {}

        if (tx.maxFeePerGas != null && tx.maxPriorityFeePerGas != null) {
          // EIP-1559 transaction
          gasParams.maxFeePerGas = bump(tx.maxFeePerGas)
          gasParams.maxPriorityFeePerGas = bump(tx.maxPriorityFeePerGas)
        } else if (tx.gasPrice != null) {
          // Legacy transaction
          gasParams.gasPrice = bump(tx.gasPrice)
        }

        // 4. Resend with same nonce and bumped gas
        const newHash = await walletClient.sendTransaction({
          to: tx.to!,
          value: tx.value,
          data: tx.input as Hex,
          nonce: tx.nonce,
          gas: tx.gas,
          ...gasParams,
        })

        return newHash
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Speed up failed'
        setError(message)
        throw err
      } finally {
        setIsSpeedingUp(false)
      }
    },
    [walletClient, publicClient, address]
  )

  const cancelTransaction = useCallback(
    async (txHash: Hex): Promise<Hex> => {
      if (!walletClient || !publicClient || !address) {
        throw new Error('Wallet not connected')
      }

      setIsCancelling(true)
      setError(null)

      try {
        // 1. Fetch original transaction
        const tx = await publicClient.getTransaction({ hash: txHash })

        if (!tx) {
          throw new Error('Transaction not found')
        }

        if (tx.from.toLowerCase() !== address.toLowerCase())
          throw new Error('Transaction belongs to another account')
        // 2. Check if already confirmed
        const receipt = await publicClient
          .getTransactionReceipt({ hash: txHash })
          .catch((error: unknown) => {
            if (error instanceof TransactionReceiptNotFoundError) return null
            throw error
          })
        if (receipt) {
          throw new Error('Transaction already confirmed, cannot cancel')
        }

        // 3. Bump gas by 10%
        const gasParams: Record<string, bigint> = {}

        if (tx.maxFeePerGas != null && tx.maxPriorityFeePerGas != null) {
          gasParams.maxFeePerGas = bump(tx.maxFeePerGas)
          gasParams.maxPriorityFeePerGas = bump(tx.maxPriorityFeePerGas)
        } else if (tx.gasPrice != null) {
          gasParams.gasPrice = bump(tx.gasPrice)
        }

        // 4. Self-transfer with 0 value to replace original tx
        const cancelHash = await walletClient.sendTransaction({
          to: address,
          value: 0n,
          data: '0x' as Hex,
          nonce: tx.nonce,

          ...gasParams,
        })

        return cancelHash
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Cancel failed'
        setError(message)
        throw err
      } finally {
        setIsCancelling(false)
      }
    },
    [walletClient, publicClient, address]
  )

  return {
    speedUpTransaction,
    cancelTransaction,
    isSpeedingUp,
    isCancelling,
    error,
    clearError: () => setError(null),
  }
}
