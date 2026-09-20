import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { type Command, makeQuote, type ProviderResult } from '../src/domain'
import { Engine } from '../src/engine'
import { HTTPProvider } from '../src/providers'
import { Store } from '../src/store'

const children: ChildProcess[] = [],
  servers: Server[] = [],
  dirs: string[] = []
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Shutdown timed out'))
    }, 18000)
    child.once('exit', (code) => {
      clearTimeout(timer)
      code === 0 ? resolve() : reject(new Error(`Exit ${code}`))
    })
    child.kill('SIGTERM')
  })
}
afterEach(async () => {
  for (const child of children.splice(0)) await stop(child)
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()))
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as { port: number }).port
}
it('serves PG and both ramps over HTTP, preserves state across process restart', async () => {
  const reservation = createServer()
  const port = await listen(reservation)
  await new Promise<void>((resolve) => reservation.close(() => resolve()))
  const dir = mkdtempSync(join(tmpdir(), 'payment-http-'))
  dirs.push(dir)
  const key = randomUUID() + randomUUID()
  const start = async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        PAYMENT_DATABASE: join(dir, 'db.sqlite'),
        PAYMENT_MODE: 'simulator',
        PAYMENT_API_KEYS: JSON.stringify([{ key, merchantId: 'm1', role: 'operator' }]),
        PAYMENT_WEBHOOK_SECRET: randomUUID() + randomUUID(),
        PAYMENT_WEBHOOK_TARGETS: '{}',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.push(child)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 15000)
      child.stdout!.on('data', (chunk) => {
        if (String(chunk).includes('listening')) {
          clearTimeout(timer)
          resolve()
        }
      })
      child.once('exit', () => {
        clearTimeout(timer)
        reject(new Error('Startup failed'))
      })
    })
    return child
  }
  const call = async (path: string, body?: unknown, id = randomUUID()) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'idempotency-key': id,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await r.json()
    expect(r.ok, JSON.stringify(data)).toBe(true)
    return data
  }
  const state = async (id: string, wanted: string) => {
    for (let i = 0; i < 100; i++) {
      const d = await call('/v1/orders/' + id)
      if (
        d.order.status === wanted &&
        d.operations.every((o: { status: string }) => o.status === 'done')
      )
        return d
      await new Promise((r) => setTimeout(r, 50))
    }
    throw Error('Did not reach ' + wanted)
  }
  const child = await start()
  await call('/v1/simulation/kyc', { customerId: 'alice', status: 'approved' })
  const create = async (kind: string, scenario = 'success') => {
    const q = await call('/v1/quotes', {
      kind,
      input: {
        asset: kind === 'offramp' ? 'USDC' : 'KRW',
        amount: kind === 'offramp' ? '1000000' : '10000',
      },
    })
    const body = {
        quoteId: q.id,
        reference: randomUUID(),
        customerId: 'alice',
        scenario,
        destination:
          kind === 'onramp'
            ? '0x' + '12'.repeat(20)
            : kind === 'offramp'
              ? 'beneficiary_bank001'
              : undefined,
      },
      key = randomUUID()
    const orders = await Promise.all(Array.from({ length: 5 }, () => call('/v1/orders', body, key)))
    expect(new Set(orders.map((o) => o.id)).size).toBe(1)
    return orders[0]
  }
  const pg = await create('payment')
  await state(pg.id, 'authorized')
  await call(`/v1/orders/${pg.id}/actions/capture`, {})
  await state(pg.id, 'captured')
  await call(`/v1/orders/${pg.id}/actions/refund`, { amount: '2000' })
  await state(pg.id, 'partially_refunded')
  await call(`/v1/orders/${pg.id}/actions/settle`, {})
  await state(pg.id, 'settled')
  for (const [kind, scenario, final] of [
    ['onramp', 'success', 'completed'],
    ['offramp', 'success', 'completed'],
    ['onramp', 'transfer_failed', 'refunded'],
    ['offramp', 'payout_failed', 'refunded'],
  ]) {
    const o = await create(kind!, scenario)
    await state(o.id, kind === 'onramp' ? 'payment_pending' : 'deposit_pending')
    await call(`/v1/orders/${o.id}/actions/${kind === 'onramp' ? 'fund' : 'deposit'}`, {})
    await state(o.id, final!)
  }
  expect((await call('/v1/reconciliation')).balanced).toBe(true)
  await stop(child)
  await start()
  expect((await call('/v1/orders/' + pg.id)).order).toMatchObject({
    status: 'settled',
    refunded: '2000',
    settledAmount: '8000',
  })
  expect((await call('/v1/orders')).orders).toHaveLength(5)
}, 30000)
it('reconciles an HTTP provider response lost after execution without charging twice', async () => {
  const applied = new Map<string, ProviderResult>()
  let effects = 0
  const gateway = createServer(async (req, res) => {
    expect(req.headers.authorization).toBe('Bearer gateway-test-token')
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
    res.setHeader('content-type', 'application/json')
    if (req.url === '/quotes') {
      res.end(
        JSON.stringify(
          makeQuote(
            body.merchantId,
            body.kind
              ? { kind: body.kind, input: body.input, fiatCurrency: body.fiatCurrency }
              : body,
            Date.now()
          )
        )
      )
      return
    }
    if (req.method === 'GET') {
      const r = applied.get(decodeURIComponent(req.url!.split('/').pop()!))
      res.statusCode = r ? 200 : 404
      res.end(JSON.stringify(r ?? {}))
      return
    }
    const c = body as Command
    expect(req.headers['idempotency-key']).toBe(c.id)
    if (!applied.has(c.id)) {
      effects++
      applied.set(c.id, {
        operationId: c.id,
        orderId: c.orderId,
        providerRef: 'provider-order-' + c.orderId,
        status: 'succeeded',
        evidence: 'receipt-' + c.id,
      })
    }
    res.statusCode = 503
    res.end('{}') // Side effect committed; acknowledgment lost.
  })
  servers.push(gateway)
  const port = await listen(gateway)
  const store = new Store(':memory:')
  try {
    const engine = new Engine(
      store,
      new HTTPProvider('gateway', `http://127.0.0.1:${port}`, 'gateway-test-token', fetch, true)
    )
    const q = await engine.quote('m1', { kind: 'payment', input: { asset: 'USD', amount: '1000' } })
    const order = engine.create('m1', 'create-00001', {
      quoteId: q.id,
      customerId: 'alice',
      reference: 'r1',
      paymentMethodToken: 'pm_test00001',
    })
    await engine.workOne()
    expect(store.get('m1', order.id).status).toBe('created')
    const job = store.jobs('m1', order.id)[0]!
    await engine.reconcileOperation('m1', job.id)
    await engine.reconcileOperation('m1', job.id)
    expect(store.get('m1', order.id).status).toBe('authorized')
    expect(effects).toBe(1)
    expect(() => engine.setKYC('m1', 'alice', 'approved')).toThrow('simulation_disabled')
    engine.action('m1', order.id, 'capture-00001', 'capture')
    await engine.workOne()
    const capture = store.jobs('m1', order.id).find((j) => j.action === 'capture')!
    expect(store.journal('m1', order.id)).toHaveLength(0)
    await engine.reconcileOperation('m1', capture.id)
    await engine.reconcileOperation('m1', capture.id)
    expect(store.get('m1', order.id).status).toBe('captured')
    expect(store.journal('m1', order.id)).toHaveLength(2)
    expect(effects).toBe(2)
  } finally {
    store.close()
  }
})
