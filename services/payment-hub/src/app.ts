import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { ZodError, z } from 'zod'
import type { Action } from './domain'
import { Fault } from './domain'
import type { Engine } from './engine'
import type { Outbox } from './outbox'
import { verifySignature } from './providers'
export interface Credential {
  key: string
  merchantId: string
  role: 'merchant' | 'operator'
}
export interface AppConfig {
  credentials: Credential[]
  webhookSecret: string
  rateLimit?: number
}
const sum = (v: string) => createHash('sha256').update(v).digest()
export function createApp(engine: Engine, outbox: Outbox, config: AppConfig) {
  const buckets = new Map<string, { count: number; expires: number }>()
  const metrics = { requests: 0, errors: 0 }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  return {
    async fetch(request: Request): Promise<Response> {
      const requestId = randomUUID()
      metrics.requests++
      try {
        const url = new URL(request.url),
          path = url.pathname.split('/').filter(Boolean)
        if (url.pathname === '/health')
          return json({
            status: 'ok',
            service: 'payment-hub',
            simulated: engine.provider.simulated,
          })
        if (url.pathname === '/ready') {
          engine.store.db.prepare('SELECT 1').get()
          return json({ status: 'ready' })
        }
        const raw = ['POST', 'PUT', 'PATCH'].includes(request.method) ? await request.text() : ''
        if (Buffer.byteLength(raw) > 65536) throw new Fault('request_too_large', 413)
        if (
          path[0] === 'webhooks' &&
          path[1] === engine.provider.name &&
          path.length === 2 &&
          request.method === 'POST'
        ) {
          if (
            !verifySignature(
              config.webhookSecret,
              request.headers.get('x-webhook-timestamp'),
              raw,
              request.headers.get('x-webhook-signature'),
              engine.now()
            )
          )
            throw new Fault('invalid_signature', 401)
          const event = z
            .object({
              id: z.string().min(8).max(150),
              type: z.enum(['operation.updated', 'kyc.updated']).default('operation.updated'),
              data: z.unknown(),
            })
            .strict()
            .parse(JSON.parse(raw))
          return json(
            event.type === 'kyc.updated'
              ? engine.kycWebhook(event.id, event.data)
              : engine.webhook(path[1], event.id, event.data)
          )
        }
        const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? ''
        const user = config.credentials.find((c) => timingSafeEqual(sum(c.key), sum(token)))
        if (!user) throw new Fault('unauthorized', 401)
        const now = engine.now(),
          bucket = buckets.get(user.key)
        if (!bucket || bucket.expires <= now)
          buckets.set(user.key, { count: 1, expires: now + 60000 })
        else if (++bucket.count > (config.rateLimit ?? 300)) throw new Fault('rate_limited', 429)
        const operator = () => {
          if (user.role !== 'operator') throw new Fault('operator_required', 403)
        }
        const body = () => (raw ? JSON.parse(raw) : {})
        const key = () => request.headers.get('idempotency-key') ?? ''
        const merchant = user.merchantId
        if (path[0] !== 'v1') throw new Fault('not_found', 404)
        if (url.pathname === '/v1/capabilities' && request.method === 'GET')
          return json({
            provider: engine.provider.name,
            simulated: engine.provider.simulated,
            kinds: ['payment', 'onramp', 'offramp'],
            assets: { KRW: 0, USD: 2, USDC: 6 },
            scenarios: engine.provider.simulated
              ? [
                  'success',
                  'declined',
                  'requires_action',
                  'delayed',
                  'timeout',
                  'transfer_failed',
                  'payout_failed',
                ]
              : [],
          })
        if (url.pathname === '/v1/metrics' && request.method === 'GET') {
          operator()
          return json(metrics)
        }
        if (url.pathname === '/v1/quotes' && request.method === 'POST')
          return json(await engine.quote(merchant, body()), 201)
        if (url.pathname === '/v1/orders' && request.method === 'POST')
          return json(engine.create(merchant, key(), body()), 201)
        if (url.pathname === '/v1/orders' && request.method === 'GET') {
          const limit = z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .parse(url.searchParams.get('limit') ?? 50)
          return json({ orders: engine.store.list(merchant, limit) })
        }
        if (path[1] === 'orders' && path[2]) {
          const orderId = path[2]
          engine.store.get(merchant, orderId)
          if (path.length === 3 && request.method === 'GET')
            return json({
              order: engine.store.get(merchant, orderId),
              operations: engine.store.jobs(merchant, orderId),
            })
          if (path.length === 4 && request.method === 'GET' && path[3] === 'events')
            return json({ events: engine.store.events(merchant, orderId) })
          if (path.length === 4 && request.method === 'GET' && path[3] === 'ledger')
            return json({ entries: engine.store.journal(merchant, orderId) })
          if (path.length === 5 && path[3] === 'actions' && request.method === 'POST') {
            const action = z
              .enum(['authenticate', 'capture', 'settle', 'cancel', 'refund', 'fund', 'deposit'])
              .parse(path[4])
            return json(engine.action(merchant, orderId, key(), action as Action, body()), 202)
          }
        }
        if (url.pathname === '/v1/reconciliation' && request.method === 'GET')
          return json(engine.store.reconcile(merchant))
        if (
          path[1] === 'operations' &&
          path[2] &&
          ['reconcile', 'retry'].includes(path[3] ?? '') &&
          path.length === 4 &&
          request.method === 'POST'
        ) {
          operator()
          return json(
            path[3] === 'retry'
              ? engine.retryOperation(merchant, path[2])
              : await engine.reconcileOperation(merchant, path[2])
          )
        }
        if (url.pathname === '/v1/simulation/kyc' && request.method === 'POST') {
          operator()
          const b = z
            .object({
              customerId: z.string().min(1).max(100),
              status: z.enum(['approved', 'rejected']),
            })
            .strict()
            .parse(body())
          engine.setKYC(merchant, b.customerId, b.status)
          return json({ status: b.status, simulated: true })
        }
        if (
          path[1] === 'simulation' &&
          path[2] === 'operations' &&
          path[3] &&
          path.length === 4 &&
          request.method === 'POST'
        ) {
          operator()
          const b = z
            .object({ status: z.enum(['succeeded', 'declined']) })
            .strict()
            .parse(body())
          return json(engine.simulate(merchant, path[3], b.status))
        }
        if (url.pathname === '/v1/deliveries' && request.method === 'GET') {
          operator()
          return json({ deliveries: outbox.list(merchant) })
        }
        if (
          path[1] === 'deliveries' &&
          path[2] &&
          path[3] === 'retry' &&
          path.length === 4 &&
          request.method === 'POST'
        ) {
          operator()
          if (!outbox.retry(merchant, path[2])) throw new Fault('dead_delivery_not_found', 404)
          return json({ queued: true })
        }
        throw new Fault('not_found', 404)
      } catch (error) {
        metrics.errors++
        const code =
          error instanceof Fault
            ? error.code
            : error instanceof ZodError
              ? 'invalid_request'
              : error instanceof SyntaxError
                ? 'invalid_json'
                : 'internal_error'
        const status =
          error instanceof Fault
            ? error.status
            : error instanceof ZodError || error instanceof SyntaxError
              ? 400
              : 500
        return json({ error: { code, requestId } }, status)
      }
    },
  }
}
