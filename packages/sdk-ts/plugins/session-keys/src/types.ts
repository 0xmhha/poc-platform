import type { Address, Hex, LocalAccount } from 'viem'

/**
 * Session key configuration
 */
export interface SessionKeyConfig {
  /** The session key address */
  sessionKey: Address
  /** Timestamp when session becomes valid (unix timestamp) */
  validAfter: bigint
  /** Timestamp when session expires (unix timestamp) */
  validUntil: bigint
  /** Maximum ETH that can be spent in this session */
  spendingLimit: bigint
  /** Amount already spent */
  spentAmount: bigint
  /** Current nonce for replay protection */
  nonce: bigint
  /** Whether the session is active */
  isActive: boolean
}

/**
 * Permission for a specific target contract and function
 */
export interface Permission {
  /** Target contract address */
  target: Address
  /** Function selector (bytes4), use 0x00000000 for any selector */
  selector: Hex
  /** Maximum ETH value per call (0 = unlimited) */
  maxValue: bigint
  /** Whether this permission is allowed */
  allowed: boolean
}

/**
 * Session key executor configuration
 */
export interface SessionKeyExecutorConfig {
  /** The executor contract address */
  executorAddress: Address
  /** Chain ID */
  chainId: bigint
}

/**
 * Create session key parameters
 */
export interface CreateSessionKeyParams {
  /** The account that owns the session */
  account: Address
  /** The session key account */
  sessionKey: LocalAccount
  /** Session validity start (unix timestamp, default: now) */
  validAfter?: bigint
  /** Session validity end (unix timestamp, default: 1 hour from now) */
  validUntil?: bigint
  /** Maximum ETH spending limit */
  spendingLimit?: bigint
  /** Initial permissions to grant */
  permissions?: PermissionInput[]
}

/**
 * Permission input for creating/granting permissions
 */
export interface PermissionInput {
  /** Target contract address */
  target: Address
  /** Function selector (bytes4), use '0x00000000' for any function */
  selector?: Hex
  /** Maximum ETH value per call */
  maxValue?: bigint
}

/**
 * Execution request
 */
export interface ExecutionRequest {
  /** Target contract */
  target: Address
  /** ETH value to send */
  value: bigint
  /** Call data */
  data: Hex
}

/**
 * Session key state
 */
export interface SessionKeyState {
  /** Session configuration */
  config: SessionKeyConfig
  /** Remaining spending limit */
  remainingLimit: bigint
  /** Is session currently valid */
  isValid: boolean
  /** Time until expiration (in seconds, 0 if expired) */
  timeRemaining: bigint
}

/**
 * ABI for SessionKeyExecutor contract
 */
export { SESSION_KEY_EXECUTOR_ABI } from '@stablenet/core'
