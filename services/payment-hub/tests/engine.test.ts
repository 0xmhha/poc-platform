import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Kind, Order, Scenario } from '../src/domain'
import { Engine } from '../src/engine'
import { Simulator } from '../src/providers'
import { Store } from '../src/store'

const open: Store[] = []
afterEach(() => {
  for (const s of open.splice(0)) s.close()
})
function setup(path = ':memory:') {
  const s = new Store(path)
  open.push(s)
  let time = 1700000000000
  return {
    s,
    e: new Engine(s, new Simulator(), () => time),
    advance: (n = 100000) => {
      time += n
    },
  }
}
async function create(
  e: Engine,
  kind: Kind = 'payment',
  scenario: Scenario = 'success',
  amount = kind === 'offramp' ? '1000000' : '10000'
) {
  const q = await e.quote('m1', {
    kind,
    input: { asset: kind === 'offramp' ? 'USDC' : 'KRW', amount },
    fiatCurrency: 'KRW',
  })
  if (kind !== 'payment') e.setKYC('m1', 'alice', 'approved')
  return e.create('m1', 'create-' + q.id, {
    quoteId: q.id,
    customerId: 'alice',
    reference: q.id,
    scenario,
    destination:
      kind === 'onramp'
        ? '0x' + '12'.repeat(20)
        : kind === 'offramp'
          ? 'beneficiary_bank001'
          : undefined,
  })
}
async function drain(e: Engine) {
  for (let i = 0; i < 30; i++) if (!(await e.workOne())) return
  throw Error('Worker did not drain')
}
function current(e: Engine, o: Order) {
  return e.store.get('m1', o.id)
}

describe('durable payment domain', () => {
  it('settles net funds once and handles repeated post-settlement refunds', async () => {
    const { e } = setup()
    const o = await create(e)
    await drain(e)
    e.action('m1', o.id, 'capture-0001', 'capture')
    await drain(e)
    e.action('m1', o.id, 'settle-00001', 'settle')
    await drain(e)
    expect(current(e, o).status).toBe('settled')
    e.action('m1', o.id, 'refund-00001', 'refund', { amount: '2000' })
    await drain(e)
    expect(() => e.action('m1', o.id, 'settle-00002', 'settle')).toThrow('already_settled')
    e.action('m1', o.id, 'refund-00002', 'refund', { amount: '8000' })
    await drain(e)
    const entries = e.store.journal('m1', o.id) as { account: string; amount: string }[]
    expect(
      entries
        .filter((x) => x.account === 'merchant:m1:paid_out')
        .reduce((s, x) => s + BigInt(x.amount), 0n)
    ).toBe(0n)
    expect(
      entries
        .filter((x) => x.account === 'merchant:m1:available')
        .reduce((s, x) => s + BigInt(x.amount), 0n)
    ).toBe(0n)
    expect(current(e, o).status).toBe('refunded')
  })

  it('authorizes, captures, partially refunds, rejects excess and refunds the remainder', async () => {
    const { e } = setup()
    const o = await create(e)
    await drain(e)
    expect(current(e, o).status).toBe('authorized')
    e.action('m1', o.id, 'capture-0001', 'capture')
    await drain(e)
    expect(current(e, o).status).toBe('captured')
    e.action('m1', o.id, 'refund-00001', 'refund', { amount: '2500' })
    await drain(e)
    expect(current(e, o)).toMatchObject({ status: 'partially_refunded', refunded: '2500' })
    expect(() => e.action('m1', o.id, 'refund-00002', 'refund', { amount: '7501' })).toThrow(
      'refund_exceeds_balance'
    )
    e.action('m1', o.id, 'refund-00003', 'refund', { amount: '7500' })
    await drain(e)
    expect(current(e, o).status).toBe('refunded')
    expect(e.store.reconcile('m1').balanced).toBe(true)
    expect(e.store.journal('m1', o.id)).toHaveLength(6)
  })
  it('requires successful additional authentication before capture', async () => {
    const { e } = setup()
    const o = await create(e, 'payment', 'requires_action')
    await drain(e)
    expect(current(e, o).status).toBe('requires_action')
    expect(() => e.action('m1', o.id, 'capture-0001', 'capture')).toThrow('invalid_transition')
    e.action('m1', o.id, 'auth-0000001', 'authenticate')
    await drain(e)
    expect(current(e, o).status).toBe('authorized')
  })
  it('cancels an authorization without posting settled money', async () => {
    const { e } = setup()
    const o = await create(e)
    await drain(e)
    e.action('m1', o.id, 'cancel-00001', 'cancel')
    await drain(e)
    expect(current(e, o).status).toBe('cancelled')
    expect(e.store.journal('m1', o.id)).toEqual([])
  })
  it('declines without crediting a merchant', async () => {
    const { e } = setup()
    const o = await create(e, 'payment', 'declined')
    await drain(e)
    expect(current(e, o).status).toBe('declined')
    expect(e.store.journal('m1', o.id)).toEqual([])
  })
  it('uses exact integer quote arithmetic and ceiling fees', async () => {
    const { e } = setup()
    const q = await e.quote('m1', { kind: 'onramp', input: { asset: 'USD', amount: '10001' } })
    expect(q.fee.amount).toBe('101')
    expect(q.output.amount).toBe('99000000')
    await expect(
      e.quote('m1', { kind: 'payment', input: { asset: 'USD', amount: '1.5' } })
    ).rejects.toThrow()
    await expect(
      e.quote('m1', { kind: 'onramp', input: { asset: 'KRW', amount: '1' } })
    ).rejects.toThrow('amount_below_minimum')
  })
  it('rejects expired or cross-merchant quotes and unapproved KYC', async () => {
    const { e, advance } = setup()
    const q = await e.quote('m1', { kind: 'onramp', input: { asset: 'KRW', amount: '10000' } })
    const req = {
      quoteId: q.id,
      customerId: 'alice',
      reference: 'r1',
      destination: '0x' + '12'.repeat(20),
    }
    expect(() => e.create('m2', 'create-00001', req)).toThrow('quote_not_found')
    expect(() => e.create('m1', 'create-00001', req)).toThrow('kyc_required')
    e.setKYC('m1', 'alice', 'approved')
    advance()
    expect(() => e.create('m1', 'create-00001', req)).toThrow('quote_expired')
  })
  it('rejects aggregate daily limits atomically', async () => {
    const { e } = setup()
    await create(e, 'onramp', 'success', '6000000')
    await expect(create(e, 'onramp', 'success', '6000000')).rejects.toThrow('daily_limit_exceeded')
  })
  it.each([
    'onramp',
    'offramp',
  ] as const)('completes %s only after simulated funds arrive', async (kind) => {
    const { e } = setup()
    const o = await create(e, kind)
    await drain(e)
    expect(current(e, o).status).toBe(kind === 'onramp' ? 'payment_pending' : 'deposit_pending')
    expect(e.store.journal('m1', o.id)).toHaveLength(0)
    e.action('m1', o.id, 'fund-0000001', kind === 'onramp' ? 'fund' : 'deposit')
    await drain(e)
    expect(current(e, o).status).toBe('completed')
    expect(e.store.journal('m1', o.id)).toHaveLength(6)
    expect(e.store.reconcile('m1').balanced).toBe(true)
  })
  it.each([
    ['onramp', 'transfer_failed'],
    ['offramp', 'payout_failed'],
  ] as const)('compensates %s when delivery fails', async (kind, scenario) => {
    const { e } = setup()
    const o = await create(e, kind, scenario)
    await drain(e)
    e.action('m1', o.id, 'fund-0000001', kind === 'onramp' ? 'fund' : 'deposit')
    await drain(e)
    expect(current(e, o).status).toBe('refunded')
    const entries = e.store.journal('m1', o.id) as { account: string; amount: string }[]
    expect(entries.reduce((n, x) => n + BigInt(x.amount), 0n)).toBe(0n)
    expect(
      entries
        .filter((x) => x.account.includes(':reserved'))
        .reduce((n, x) => n + BigInt(x.amount), 0n)
    ).toBe(0n)
  })
  it('deduplicates creates and rejects changed bodies, reused quotes and references', async () => {
    const { e } = setup()
    const q = await e.quote('m1', { kind: 'payment', input: { asset: 'USD', amount: '100' } })
    const body = { quoteId: q.id, customerId: 'alice', reference: 'invoice-1' }
    const a = e.create('m1', 'create-00001', body)
    expect(e.create('m1', 'create-00001', body).id).toBe(a.id)
    expect(() => e.create('m1', 'create-00001', { ...body, customerId: 'bob' })).toThrow(
      'idempotency_conflict'
    )
    expect(() => e.create('m1', 'create-00002', body)).toThrow('quote_already_used')
    expect(e.store.list('m1')).toHaveLength(1)
  })
  it('prevents concurrent capture/refund commands even with different keys', async () => {
    const { e } = setup()
    const o = await create(e)
    await drain(e)
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        Promise.resolve().then(() =>
          e.action('m1', o.id, 'capture-' + String(i).padStart(8, '0'), 'capture')
        )
      )
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    await drain(e)
    expect(e.store.journal('m1', o.id)).toHaveLength(2)
  })
  it('stores webhook replay protection and prevents duplicate postings', async () => {
    const { e } = setup()
    const o = await create(e, 'payment', 'delayed')
    await drain(e)
    const op = e.store.jobs('m1', o.id)[0]!
    const result = {
      operationId: op.id,
      orderId: o.id,
      providerRef: 'sim_' + o.id,
      status: 'succeeded' as const,
    }
    expect(e.webhook('simulator', 'event-000001', result).duplicate).toBe(false)
    expect(e.webhook('simulator', 'event-000001', result).duplicate).toBe(true)
    expect(() => e.webhook('simulator', 'event-000001', { ...result, status: 'declined' })).toThrow(
      'event_conflict'
    )
    expect(e.store.events('m1', o.id)).toHaveLength(2)
    expect(current(e, o).status).toBe('authorized')
  })
  it('keeps uncertain operations unresolved, retries with one operation id, and requires reconciliation', async () => {
    const { e, advance } = setup()
    const o = await create(e, 'payment', 'timeout')
    for (let i = 0; i < 5; i++) {
      await e.workOne()
      advance()
    }
    const jobs = e.store.jobs('m1', o.id)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ status: 'dead', attempts: 5 })
    expect(current(e, o).status).toBe('created')
    expect(e.store.reconcile('m1').unresolvedOperations).toBe(1)
    expect(e.store.journal('m1', o.id)).toHaveLength(0)
    e.simulate('m1', jobs[0]!.id, 'succeeded')
    expect(current(e, o).status).toBe('authorized')
  })
  it('rolls back orders and jobs together when persistence fails', async () => {
    const { e, s } = setup()
    const q = await e.quote('m1', { kind: 'payment', input: { asset: 'KRW', amount: '100' } })
    s.db.exec(
      "CREATE TRIGGER fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'disk failure'); END"
    )
    expect(() =>
      e.create('m1', 'create-00001', { quoteId: q.id, customerId: 'alice', reference: 'r1' })
    ).toThrow()
    expect(s.list('m1')).toEqual([])
    expect(s.getQuote('m1', q.id).id).toBe(q.id)
  })
  it('recovers queued and expired leased jobs after a process restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'payment-hub-'))
    const path = join(dir, 'db.sqlite')
    const a = setup(path)
    const o = await create(a.e)
    a.s.claim(a.e.now())
    a.s.close()
    open.splice(open.indexOf(a.s), 1)
    const b = setup(path)
    b.advance()
    await drain(b.e)
    expect(current(b.e, o).status).toBe('authorized')
    expect(b.s.events('m1', o.id)).toHaveLength(2)
    b.s.close()
    open.splice(open.indexOf(b.s), 1)
    rmSync(dir, { recursive: true })
  })
  it('isolates reads, actions and reconciliation by merchant', async () => {
    const { e } = setup()
    const o = await create(e)
    expect(() => e.store.get('m2', o.id)).toThrow('order_not_found')
    expect(() => e.action('m2', o.id, 'cancel-00001', 'cancel')).toThrow('order_not_found')
    await expect(e.reconcileOperation('m2', e.store.jobs('m1', o.id)[0]!.id)).rejects.toThrow(
      'operation_not_found'
    )
    expect(e.store.list('m2')).toEqual([])
  })
})
