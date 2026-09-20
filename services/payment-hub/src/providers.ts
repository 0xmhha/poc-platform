import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { Command, ProviderResult, Quote } from './domain'
import { Fault, makeQuote, money, providerResult } from './domain'

/** Business code depends on this port, never on a PSP's statuses or payload layout. */
export interface Provider {
  readonly name: string
  readonly simulated: boolean
  quote(merchant: string, input: unknown, now: number): Promise<Quote>
  execute(command: Command): Promise<ProviderResult>
  lookup(operationId: string): Promise<ProviderResult | undefined>
}
export class Simulator implements Provider {
  readonly name = 'simulator'
  readonly simulated = true
  async quote(merchant: string, input: unknown, now: number) {
    return makeQuote(merchant, input, now)
  }
  async lookup(_operationId: string): Promise<ProviderResult | undefined> {
    return undefined
  }
  async execute(c: Command): Promise<ProviderResult> {
    const s = c.order.scenario
    const base = { operationId: c.id, orderId: c.orderId, providerRef: `sim_${c.orderId}` }
    if (s === 'timeout') throw new Error('simulated_provider_timeout')
    if (s === 'delayed' && c.action === 'start') return { ...base, status: 'pending' }
    if (s === 'declined' && ['start', 'authenticate'].includes(c.action))
      return { ...base, status: 'declined', reason: 'simulated_decline' }
    if (s === 'requires_action' && c.action === 'start' && c.order.kind === 'payment')
      return { ...base, status: 'requires_action' }
    if (
      (s === 'transfer_failed' && c.action === 'transfer') ||
      (s === 'payout_failed' && c.action === 'payout')
    )
      return { ...base, status: 'declined', reason: `simulated_${c.action}_failure` }
    return { ...base, status: 'succeeded', evidence: `simulation:${c.id}` }
  }
}
const quoteSchema = z
  .object({
    id: z.string().uuid(),
    merchantId: z.string(),
    kind: z.enum(['payment', 'onramp', 'offramp']),
    input: money,
    output: money,
    fee: z.object({
      asset: z.enum(['KRW', 'USD', 'USDC']),
      amount: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
    }),
    rateNumerator: z.string().regex(/^[1-9][0-9]*$/),
    rateDenominator: z.string().regex(/^[1-9][0-9]*$/),
    expiresAt: z.number().int(),
    createdAt: z.number().int(),
  })
  .strict()
/** Normalized HTTPS gateway. A vendor mapper implements these three endpoints.
 * It must honor operationId as its provider idempotency key, including after timeouts.
 */
export class HTTPProvider implements Provider {
  readonly simulated = false
  constructor(
    readonly name: string,
    private baseURL: string,
    private token: string,
    private request: typeof fetch = fetch,
    allowLoopbackTest = false
  ) {
    const u = new URL(baseURL)
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      (!allowLoopbackTest && u.protocol !== 'https:') ||
      !token
    )
      throw new Error('HTTPS provider URL and token required')
  }
  private async call(path: string, method: string, body?: unknown, key?: string) {
    const res = await this.request(`${this.baseURL.replace(/\/$/, '')}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        ...(key ? { 'idempotency-key': key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 404 && method === 'GET') return undefined
    if (!res.ok) throw new Error(`provider_http_${res.status}`)
    const text = await res.text()
    if (text.length > 65536) throw new Error('provider_response_too_large')
    return JSON.parse(text)
  }
  async quote(merchant: string, input: unknown, now: number): Promise<Quote> {
    const q = quoteSchema.parse(
      await this.call('/quotes', 'POST', { merchantId: merchant, ...(input as object) })
    )
    if (q.merchantId !== merchant || q.expiresAt <= now || q.expiresAt > now + 15 * 60 * 1000)
      throw new Fault('invalid_provider_quote', 502)
    return q
  }
  async execute(c: Command) {
    return providerResult.parse(await this.call('/operations', 'POST', c, c.id))
  }
  async lookup(id: string) {
    const r = await this.call(`/operations/${encodeURIComponent(id)}`, 'GET')
    return r === undefined ? undefined : providerResult.parse(r)
  }
}
export function signature(secret: string, timestamp: string, body: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}
export function verifySignature(
  secret: string,
  timestamp: string | null,
  body: string,
  provided: string | null,
  now: number
) {
  if (
    !timestamp ||
    !provided ||
    !/^[0-9]{10,13}$/.test(timestamp) ||
    !/^[a-f0-9]{64}$/i.test(provided)
  )
    return false
  if (Math.abs(now - Number(timestamp) * 1000) > 300000) return false
  const expected = Buffer.from(signature(secret, timestamp, body), 'hex')
  return timingSafeEqual(expected, Buffer.from(provided, 'hex'))
}
