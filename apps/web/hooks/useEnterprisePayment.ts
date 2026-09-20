'use client'
import { useCallback } from 'react'
import { type Address, encodeFunctionData, erc20Abi, type Hex, zeroAddress } from 'viem'
import { useAccount, useChainId } from 'wagmi'
import { enterpriseStorageKey, validateAmount } from '@/lib/enterprise/records'
import type { Token } from '@/types'
import { useUserOp } from './useUserOp'

type Record = {
  status: 'signing' | 'unknown' | 'submitted' | 'confirmed' | 'failed'
  hash?: Hex
  txHash?: Hex
  fingerprint: string
  startedAt: string
  updatedAt: string
}

function readRecord(key: string): Record | undefined {
  const raw = localStorage.getItem(key)
  if (!raw) return undefined
  try {
    const value = JSON.parse(raw) as Partial<Record>
    if (
      !value.fingerprint ||
      !value.status ||
      !['signing', 'unknown', 'submitted', 'confirmed', 'failed'].includes(value.status)
    )
      throw Error('invalid journal')
    const now = new Date().toISOString()
    return {
      ...value,
      startedAt: value.startedAt ?? now,
      updatedAt: value.updatedAt ?? now,
    } as Record
  } catch {
    throw Error('Payment journal is damaged; review browser storage before retrying')
  }
}

function saveRecord(key: string, record: Record): void {
  localStorage.setItem(key, JSON.stringify({ ...record, updatedAt: new Date().toISOString() }))
}

export function useEnterprisePayment() {
  const { address } = useAccount()
  const chainId = useChainId()
  const { sendUserOp, recheckUserOp, getLastSubmissionFailure } = useUserOp()
  return useCallback(
    async (id: string, recipient: Address, amount: bigint, token: Token): Promise<Hex> => {
      validateAmount(amount, token)
      const scope = enterpriseStorageKey('enterprise-payments', chainId, address)
      if (!scope || !address) throw Error('Connect a wallet to make a payment')
      const key = `${scope}:${id}`
      const fingerprint = `${recipient.toLowerCase()}:${token.address.toLowerCase()}:${amount}`
      const execute = async () => {
        let record = readRecord(key)
        if (record && record.fingerprint !== fingerprint)
          throw Error('Payment details changed; reconcile the existing payment first')
        if (record?.status === 'confirmed' && record.txHash) return record.txHash
        if (record?.status === 'signing' || record?.status === 'unknown')
          throw Error(
            'A previous submission has an unknown result. Check transaction history before allowing another payment'
          )
        if (record?.hash && record.status !== 'failed') {
          const receipt = await recheckUserOp(record.hash)
          if (receipt.status === 'failed') {
            saveRecord(key, { ...record, status: 'failed' })
            throw Error('Previous payment reverted. Retry to create a new payment attempt')
          }
          if (!receipt.success || !receipt.transactionHash)
            throw Error('Previous payment is still pending confirmation')
          record = { ...record, status: 'confirmed', txHash: receipt.transactionHash }
          saveRecord(key, record)
          return receipt.transactionHash
        }
        const now = new Date().toISOString()
        saveRecord(key, { status: 'signing', fingerprint, startedAt: now, updatedAt: now })
        const result = await sendUserOp(
          address,
          token.address === zeroAddress
            ? { to: recipient, value: amount }
            : {
                to: token.address,
                data: encodeFunctionData({
                  abi: erc20Abi,
                  functionName: 'transfer',
                  args: [recipient, amount],
                }),
              }
        )
        if (!result) {
          if (getLastSubmissionFailure() === 'rejected') {
            localStorage.removeItem(key)
            throw Error('Payment was cancelled before submission')
          }
          saveRecord(key, {
            status: 'unknown',
            fingerprint,
            startedAt: now,
            updatedAt: now,
          })
          throw Error(
            'Payment submission result is unknown. Check transaction history before retrying'
          )
        }
        record = {
          fingerprint,
          status:
            result.status === 'confirmed'
              ? 'confirmed'
              : result.status === 'failed'
                ? 'failed'
                : 'submitted',
          hash: result.userOpHash,
          txHash: result.transactionHash,
          startedAt: now,
          updatedAt: now,
        }
        saveRecord(key, record)
        if (!result.success || !result.transactionHash)
          throw Error(
            result.status === 'failed'
              ? 'Payment reverted'
              : 'Payment submitted; confirm it before retrying'
          )
        return result.transactionHash
      }
      if (!navigator.locks) throw Error('This browser cannot safely coordinate payment submissions')
      return navigator.locks.request(key, execute)
    },
    [address, chainId, sendUserOp, recheckUserOp, getLastSubmissionFailure]
  )
}
