import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
export class Fault extends Error {
  constructor(
    public code: string,
    public status = 400
  ) {
    super(code)
  }
}
export const minor = z.string().regex(/^[1-9][0-9]{0,17}$/, 'Use positive integer minor units')
export const asset = z.enum(['KRW', 'USD', 'USDC'])
export const money = z.object({ asset, amount: minor }).strict()
export type Money = z.infer<typeof money>
export const kind = z.enum(['payment', 'onramp', 'offramp'])
export type Kind = z.infer<typeof kind>
export const scenario = z.enum([
  'success',
  'declined',
  'requires_action',
  'delayed',
  'timeout',
  'transfer_failed',
  'payout_failed',
])
export type Scenario = z.infer<typeof scenario>
export const quoteInput = z
  .object({ kind, input: money, fiatCurrency: z.enum(['KRW', 'USD']).default('KRW') })
  .strict()
export const createInput = z
  .object({
    quoteId: z.string().uuid(),
    customerId: z.string().min(1).max(100),
    reference: z.string().min(1).max(100),
    destination: z.string().max(200).optional(),
    paymentMethodToken: z
      .string()
      .regex(/^pm_[a-zA-Z0-9_-]{6,150}$/)
      .optional(),
    scenario: scenario.default('success'),
  })
  .strict()
export type CreateInput = z.infer<typeof createInput>
export interface Quote {
  id: string
  merchantId: string
  kind: Kind
  input: Money
  output: Money
  fee: Money
  rateNumerator: string
  rateDenominator: string
  expiresAt: number
  createdAt: number
}
export type Status =
  | 'created'
  | 'requires_action'
  | 'authorized'
  | 'payment_pending'
  | 'deposit_pending'
  | 'processing'
  | 'captured'
  | 'settled'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'refund_pending'
  | 'partially_refunded'
  | 'refunded'
  | 'review_required'
export interface Order {
  id: string
  merchantId: string
  customerId: string
  reference: string
  kind: Kind
  quote: Quote
  paymentMethodToken?: string
  destination?: string
  scenario: Scenario
  simulated: boolean
  provider: string
  providerRef?: string
  status: Status
  settledAmount?: string
  refunded: string
  version: number
  createdAt: number
  updatedAt: number
}
export type Action =
  | 'start'
  | 'authenticate'
  | 'capture'
  | 'settle'
  | 'cancel'
  | 'refund'
  | 'fund'
  | 'deposit'
  | 'transfer'
  | 'payout'
  | 'return_crypto'
export interface Command {
  id: string
  orderId: string
  merchantId: string
  action: Action
  amount?: string
  order: Order
}
export interface ProviderResult {
  operationId: string
  orderId: string
  providerRef: string
  status: 'succeeded' | 'pending' | 'declined' | 'requires_action'
  reason?: string
  evidence?: string
}
export const providerResult = z
  .object({
    operationId: z.string(),
    orderId: z.string(),
    providerRef: z.string().min(1).max(200),
    status: z.enum(['succeeded', 'pending', 'declined', 'requires_action']),
    reason: z.string().max(200).optional(),
    evidence: z.string().max(300).optional(),
  })
  .strict()
export interface Event {
  id: string
  merchantId: string
  orderId: string
  type: string
  version: number
  createdAt: number
  data: Order
}
export interface Job {
  id: string
  orderId: string
  merchantId: string
  action: Action
  amount?: string
  status: 'queued' | 'running' | 'waiting' | 'done' | 'dead'
  attempts: number
  availableAt: number
  leaseUntil: number
  lastError?: string
  result?: ProviderResult
}
export const id = () => randomUUID()
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    )
  return JSON.stringify(value) ?? 'null'
}
export const digest = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex')
export function makeQuote(merchantId: string, value: unknown, now: number): Quote {
  const q = quoteInput.parse(value)
  const amount = BigInt(q.input.amount)
  if (
    (q.kind === 'offramp' && q.input.asset !== 'USDC') ||
    (q.kind !== 'offramp' && q.input.asset === 'USDC')
  )
    throw new Fault('unsupported_pair')
  const currency = q.kind === 'offramp' ? q.fiatCurrency : q.input.asset
  // Explicit fixed simulation rate: USD 1.00 / USDC 1, KRW 1,350 / USDC 1.
  const rate = currency === 'USD' ? 100n : 1350n
  const fee = q.kind === 'payment' ? 0n : (amount * 100n + 9999n) / 10000n
  const net = amount - fee
  const numerator = q.kind === 'offramp' ? rate : q.kind === 'onramp' ? 1000000n : 1n
  const denominator = q.kind === 'offramp' ? 1000000n : q.kind === 'onramp' ? rate : 1n
  const output = (net * numerator) / denominator
  if (output <= 0n) throw new Fault('amount_below_minimum')
  return {
    id: id(),
    merchantId,
    kind: q.kind,
    input: q.input,
    output: {
      asset: q.kind === 'onramp' ? 'USDC' : (currency as 'KRW' | 'USD'),
      amount: output.toString(),
    },
    fee: { asset: q.input.asset, amount: fee.toString() },
    rateNumerator: numerator.toString(),
    rateDenominator: denominator.toString(),
    createdAt: now,
    expiresAt: now + 60000,
  }
}
