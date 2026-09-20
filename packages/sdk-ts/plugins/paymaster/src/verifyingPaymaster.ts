import {
  computePaymasterDomainSeparator,
  computePaymasterHash,
  computeUserOpCoreHash,
  encodePaymasterData,
  encodePaymasterDataWithSignature,
  encodeVerifyingPayload,
  PaymasterType,
} from '@stablenet/core'
import type {
  PaymasterClient,
  PaymasterData,
  PaymasterStubData,
  UserOperation,
} from '@stablenet/sdk-types'
import type { Address, Hex } from 'viem'
import { concat, pad, toHex } from 'viem'
import type { VerifyingPaymasterConfig } from './types'
import { DEFAULT_VALIDITY_SECONDS } from './types'

// Default gas limits for paymaster operations
const DEFAULT_PAYMASTER_VERIFICATION_GAS_LIMIT = 100_000n
const DEFAULT_PAYMASTER_POST_OP_GAS_LIMIT = 50_000n

// Stub signature for gas estimation (65 bytes of zeros)
const STUB_SIGNATURE: Hex = `0x${'00'.repeat(65)}`

/**
 * Pack a UserOperation's fields into the format needed by computeUserOpCoreHash.
 * Converts unpacked v0.7 UserOperation fields into packed Hex fields.
 */
function packUserOpForHash(userOp: UserOperation): {
  sender: Address
  nonce: bigint
  initCode: Hex
  callData: Hex
  accountGasLimits: Hex
  preVerificationGas: bigint
  gasFees: Hex
} {
  const initCode =
    userOp.factory && userOp.factoryData
      ? concat([userOp.factory, userOp.factoryData])
      : ('0x' as Hex)

  const accountGasLimits = concat([
    pad(toHex(userOp.verificationGasLimit), { size: 16 }),
    pad(toHex(userOp.callGasLimit), { size: 16 }),
  ]) as Hex

  const gasFees = concat([
    pad(toHex(userOp.maxPriorityFeePerGas), { size: 16 }),
    pad(toHex(userOp.maxFeePerGas), { size: 16 }),
  ]) as Hex

  return {
    sender: userOp.sender,
    nonce: userOp.nonce,
    initCode,
    callData: userOp.callData,
    accountGasLimits,
    preVerificationGas: userOp.preVerificationGas,
    gasFees,
  }
}

/**
 * Create a Verifying Paymaster client
 *
 * The VerifyingPaymaster uses an off-chain signature to approve gas sponsorship.
 * The signer signs a hash of the user operation data to determine which operations to sponsor.
 *
 * Data is encoded in envelope format (version byte 0x01) with type-specific payloads.
 *
 * @example
 * ```ts
 * import { createVerifyingPaymaster } from '@stablenet/plugin-paymaster'
 * import { privateKeyToAccount } from 'viem/accounts'
 *
 * const signer = privateKeyToAccount('0x...')
 * // Read senderNonce from the deployed paymaster for each signed operation.
 * const paymaster = createVerifyingPaymaster({
 *   getSenderNonce: (sender) => publicClient.readContract({
 *     address: paymasterAddress, abi: paymasterAbi, functionName: 'senderNonce', args: [sender],
 *   }),
 *   paymasterAddress: '0x...',
 *   signer,
 *   chainId: 1n,
 * })
 * ```
 */
export function createVerifyingPaymaster(config: VerifyingPaymasterConfig): PaymasterClient {
  const { paymasterAddress, signer, chainId, validitySeconds = DEFAULT_VALIDITY_SECONDS } = config

  /**
   * Get stub data for gas estimation
   * Uses placeholder signature since actual signature isn't needed for estimation
   */
  const getPaymasterStubData = async (
    _userOperation: UserOperation,
    entryPoint: Address,
    _chainId: bigint
  ): Promise<PaymasterStubData> => {
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + validitySeconds)
    const validAfter = 0n

    // Build an empty verifying payload (no policy for stub)
    const payload = encodeVerifyingPayload({
      policyId: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
      sponsor: '0x0000000000000000000000000000000000000000' as Address,
      maxCost: (1n << 256n) - 1n,
      verifierExtra: '0x',
    })

    // Encode the envelope
    const envelope = encodePaymasterData({
      paymasterType: PaymasterType.VERIFYING,
      flags: 0,
      validUntil,
      validAfter,
      nonce: 0n,
      payload,
    })

    // Concatenate envelope with stub signature
    const paymasterData = encodePaymasterDataWithSignature(envelope, STUB_SIGNATURE)

    return {
      paymaster: paymasterAddress,
      paymasterData,
      paymasterVerificationGasLimit: DEFAULT_PAYMASTER_VERIFICATION_GAS_LIMIT,
      paymasterPostOpGasLimit: DEFAULT_PAYMASTER_POST_OP_GAS_LIMIT,
    }
  }

  /**
   * Get paymaster data with actual signature
   */
  const getPaymasterData = async (
    userOperation: UserOperation,
    entryPoint: Address,
    _chainId: bigint
  ): Promise<PaymasterData> => {
    if (!config.getSenderNonce)
      throw new Error('getSenderNonce is required for signed paymaster data')
    const nonce = await config.getSenderNonce(userOperation.sender)
    if (nonce < 0n || nonce > 0xffffffffffffffffn) throw new Error('Invalid paymaster nonce')
    // Set validity window (configurable, default: 1 hour)
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + validitySeconds)
    const validAfter = 0n

    // Build verifying payload
    const payload = encodeVerifyingPayload({
      policyId: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
      sponsor: '0x0000000000000000000000000000000000000000' as Address,
      maxCost:
        (userOperation.callGasLimit +
          userOperation.verificationGasLimit +
          userOperation.preVerificationGas +
          (userOperation.paymasterVerificationGasLimit ??
            DEFAULT_PAYMASTER_VERIFICATION_GAS_LIMIT) +
          (userOperation.paymasterPostOpGasLimit ?? DEFAULT_PAYMASTER_POST_OP_GAS_LIMIT)) *
        userOperation.maxFeePerGas,
      verifierExtra: '0x',
    })

    // Encode the envelope (without signature)
    const envelope = encodePaymasterData({
      paymasterType: PaymasterType.VERIFYING,
      flags: 0,
      validUntil,
      validAfter,
      nonce,
      payload,
    })

    // Compute the hash using the 3-step core approach
    const domainSeparator = computePaymasterDomainSeparator(chainId, entryPoint, paymasterAddress)
    const packedOp = packUserOpForHash(userOperation)
    const userOpCoreHash = computeUserOpCoreHash(packedOp)
    const hash = computePaymasterHash(domainSeparator, userOpCoreHash, envelope)

    // Sign the hash
    const signature = await signer.signMessage({
      message: { raw: hash },
    })

    // Encode paymaster data with real signature
    const paymasterData = encodePaymasterDataWithSignature(envelope, signature)

    return {
      paymaster: paymasterAddress,
      paymasterData,
    }
  }

  return {
    getPaymasterStubData,
    getPaymasterData,
  }
}

/**
 * Create a verifying paymaster from a private key
 */
export async function createVerifyingPaymasterFromPrivateKey(config: {
  paymasterAddress: Address
  privateKey: Hex
  getSenderNonce?: (sender: Address) => Promise<bigint>
  chainId: bigint
  entryPoint?: Address
}): Promise<PaymasterClient> {
  const { privateKeyToAccount } = await import('viem/accounts')
  const signer = privateKeyToAccount(config.privateKey)

  return createVerifyingPaymaster({
    paymasterAddress: config.paymasterAddress,
    signer,
    getSenderNonce: config.getSenderNonce,
    chainId: config.chainId,
    entryPoint: config.entryPoint,
  })
}
