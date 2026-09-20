import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { Engine } from '../src/engine'
import { Outbox } from '../src/outbox'
import { HTTPProvider, Simulator, signature, verifySignature } from '../src/providers'
import { Store } from '../src/store'

const key = 'test-operator-key-'.repeat(3),
  secret = 'test-webhook-secret-'.repeat(3)
const stores: Store[] = []
afterEach(() => {
  for (const s of stores.splice(0)) s.close()
})
function setup(provider = new Simulator()) {
  const store = new Store(':memory:')
  stores.push(store)
  let now = 1700000000000
  const engine = new Engine(store, provider, () => now),
    outbox = new Outbox(store, {}, () => now)
  const app = createApp(engine, outbox, {
    credentials: [
      { key, merchantId: 'm1', role: 'operator' },
      { key: 'merchant-key-'.repeat(4), merchantId: 'm2', role: 'merchant' },
    ],
    webhookSecret: secret,
  })
  const call = async (
    path: string,
    method = 'GET',
    body?: unknown,
    token = key,
    headers: Record<string, string> = {}
  ) =>
    app.fetch(
      new Request('http://localhost' + path, {
        method,
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    )
  return {
    store,
    engine,
    outbox,
    app,
    call,
    advance: () => {
      now += 100000
    },
  }
}
describe('HTTP boundary and adapters', () => {
  it('authenticates, scopes, validates and requires idempotency', async () => {
    const { call } = setup()
    expect((await call('/v1/orders', 'GET', undefined, 'bad')).status).toBe(401)
    expect(
      (await call('/v1/quotes', 'POST', { kind: 'payment', input: { asset: 'KRW', amount: '-1' } }))
        .status
    ).toBe(400)
    const q = await (
      await call('/v1/quotes', 'POST', { kind: 'payment', input: { asset: 'KRW', amount: '1000' } })
    ).json()
    const body = { quoteId: q.id, customerId: 'alice', reference: 'r1' }
    expect((await call('/v1/orders', 'POST', body)).status).toBe(400)
    const r = await call('/v1/orders', 'POST', body, key, { 'idempotency-key': 'create-00001' })
    expect(r.status).toBe(201)
    const o = await r.json()
    expect(
      (await call('/v1/orders/' + o.id, 'GET', undefined, 'merchant-key-'.repeat(4))).status
    ).toBe(404)
    expect(
      (
        await call(
          '/v1/simulation/kyc',
          'POST',
          { customerId: 'alice', status: 'approved' },
          'merchant-key-'.repeat(4)
        )
      ).status
    ).toBe(403)
  })
  it('verifies exact raw body, timestamp and persistent event identity', async () => {
    const { engine, call } = setup()
    const q = await engine.quote('m1', { kind: 'payment', input: { asset: 'KRW', amount: '100' } })
    const o = engine.create('m1', 'create-00001', {
      quoteId: q.id,
      customerId: 'alice',
      reference: 'r1',
      scenario: 'delayed',
    })
    await engine.workOne()
    const op = engine.store.jobs('m1', o.id)[0]!
    const body = {
      id: 'event-000001',
      data: { operationId: op.id, orderId: o.id, providerRef: 'sim_' + o.id, status: 'succeeded' },
    }
    const timestamp = String(engine.now() / 1000),
      sig = signature(secret, timestamp, JSON.stringify(body))
    expect(
      (
        await call('/webhooks/simulator', 'POST', body, '', {
          'x-webhook-timestamp': timestamp,
          'x-webhook-signature': sig,
        })
      ).status
    ).toBe(200)
    expect(
      (
        await call('/webhooks/simulator', 'POST', body, '', {
          'x-webhook-timestamp': timestamp,
          'x-webhook-signature': '00'.repeat(32),
        })
      ).status
    ).toBe(401)
    expect(
      verifySignature(secret, String(+timestamp - 301), JSON.stringify(body), sig, engine.now())
    ).toBe(false)
    expect(engine.store.get('m1', o.id).status).toBe('authorized')
  })
  it('accepts authenticated KYC provider notifications but rejects unsigned ones', async () => {
    const { call, engine, store } = setup()
    const body = {
      id: 'kyc-event-001',
      type: 'kyc.updated',
      data: {
        merchantId: 'm1',
        customerId: 'alice',
        status: 'approved',
        expiresAt: engine.now() + 86400000,
        version: 1,
      },
    }
    expect((await call('/webhooks/simulator', 'POST', body)).status).toBe(401)
    const timestamp = String(engine.now() / 1000)
    expect(
      (
        await call('/webhooks/simulator', 'POST', body, '', {
          'x-webhook-timestamp': timestamp,
          'x-webhook-signature': signature(secret, timestamp, JSON.stringify(body)),
        })
      ).status
    ).toBe(200)
    expect(store.db.prepare('SELECT status FROM kyc').get()).toMatchObject({ status: 'approved' })
  })
  it('delivers signed events with stable event id and retries after failure', async () => {
    const { engine, store, advance } = setup()
    const q = await engine.quote('m1', { kind: 'payment', input: { asset: 'USD', amount: '100' } })
    engine.create('m1', 'create-00001', { quoteId: q.id, customerId: 'alice', reference: 'r1' })
    const received: { body: string; headers: Headers }[] = []
    const request: typeof fetch = async (_url, init) => {
      received.push({ body: String(init?.body), headers: new Headers(init?.headers) })
      return new Response(null, { status: received.length === 1 ? 503 : 204 })
    }
    const outbox = new Outbox(
      store,
      { m1: { url: 'https://merchant.example/webhook', secret } },
      engine.now,
      request
    )
    await outbox.workOne()
    expect(outbox.list('m1')[0]).toMatchObject({ status: 'queued', attempts: 1 })
    advance()
    await outbox.workOne()
    expect(received).toHaveLength(2)
    expect(received[0]!.headers.get('x-event-id')).toBe(received[1]!.headers.get('x-event-id'))
    expect(
      verifySignature(
        secret,
        received[1]!.headers.get('x-webhook-timestamp'),
        received[1]!.body,
        received[1]!.headers.get('x-webhook-signature'),
        engine.now()
      )
    ).toBe(true)
    expect(outbox.list('m1')[0]).toMatchObject({ status: 'delivered', attempts: 2 })
  })
  it('passes provider idempotency and rejects mismatched confirmation ids', async () => {
    const { engine } = setup()
    const q = await engine.quote('m1', { kind: 'payment', input: { asset: 'USD', amount: '100' } })
    const order = engine.create('m1', 'create-00001', {
      quoteId: q.id,
      customerId: 'alice',
      reference: 'r1',
    })
    const job = engine.store.jobs('m1', order.id)[0]!
    let operationHeader = ''
    const mock: typeof fetch = async (_url, init) => {
      operationHeader = new Headers(init?.headers).get('idempotency-key') ?? ''
      return Response.json({
        operationId: job.id,
        orderId: order.id,
        providerRef: 'psp_ref',
        status: 'succeeded',
      })
    }
    const adapter = new HTTPProvider('gateway', 'https://psp.example', 'server-secret', mock)
    expect(
      (
        await adapter.execute({
          id: job.id,
          orderId: order.id,
          merchantId: 'm1',
          action: 'start',
          order,
        })
      ).status
    ).toBe('succeeded')
    expect(operationHeader).toBe(job.id)
    expect(() =>
      engine.webhook('simulator', 'event-000001', {
        operationId: job.id,
        orderId: 'wrong',
        providerRef: 'psp_ref',
        status: 'succeeded',
      })
    ).toThrow('provider_result_mismatch')
  })
  it('fails closed for provider errors and insecure configuration', async () => {
    expect(() => new HTTPProvider('gateway', 'http://example.com', 'token')).toThrow()
    const p = new HTTPProvider(
      'gateway',
      'https://example.com',
      'token',
      async () => new Response('', { status: 503 })
    )
    await expect(p.lookup('id')).rejects.toThrow('provider_http_503')
    expect(() => loadConfig({})).toThrow()
    expect(() =>
      loadConfig({
        PAYMENT_API_KEYS: JSON.stringify([{ key, merchantId: 'm1', role: 'operator' }]),
        PAYMENT_WEBHOOK_SECRET: secret,
        PAYMENT_MODE: 'provider',
        PAYMENT_WEBHOOK_TARGETS: JSON.stringify({ m1: { url: 'http://127.0.0.1/hook', secret } }),
      })
    ).toThrow('Webhook target')
  })
})
