import { afterEach, expect, it } from 'vitest'
import type { Command } from '../src/domain'
import { Engine } from '../src/engine'
import { Outbox } from '../src/outbox'
import { Simulator } from '../src/providers'
import { Store } from '../src/store'

const stores: Store[] = []
afterEach(() => {
  for (const s of stores.splice(0)) s.close()
})
function setup(provider = new Simulator()) {
  const s = new Store(':memory:')
  stores.push(s)
  let now = 1700000000000
  return {
    s,
    e: new Engine(s, provider, () => now),
    advance: () => {
      now += 4000000
    },
  }
}
async function create(e: Engine) {
  const q = await e.quote('m1', { kind: 'payment', input: { asset: 'KRW', amount: '10000' } })
  const o = e.create('m1', 'create-00001', { quoteId: q.id, customerId: 'alice', reference: 'r1' })
  await e.workOne()
  return o
}
it('ignores older KYC approval after revocation and rejects same-version conflict', () => {
  const { e, s } = setup(),
    base = { merchantId: 'm1', customerId: 'alice', expiresAt: e.now() + 86400000 }
  e.kycWebhook('revoke-0001', { ...base, version: 2, status: 'rejected' })
  e.kycWebhook('approve-001', { ...base, version: 1, status: 'approved' })
  expect(s.db.prepare('SELECT status FROM kyc').get()).toMatchObject({ status: 'rejected' })
  expect(() => e.kycWebhook('conflict-001', { ...base, version: 2, status: 'approved' })).toThrow(
    'kyc_version_conflict'
  )
})
it('recovers a definitively declined refund with a new command only once', async () => {
  class OnceDeclined extends Simulator {
    declined = false
    override async execute(c: Command) {
      if (c.action === 'refund' && !this.declined) {
        this.declined = true
        return {
          operationId: c.id,
          orderId: c.orderId,
          providerRef: 'sim_' + c.orderId,
          status: 'declined' as const,
        }
      }
      return super.execute(c)
    }
  }
  const { e, s } = setup(new OnceDeclined()),
    o = await create(e)
  e.action('m1', o.id, 'capture-0001', 'capture')
  await e.workOne()
  e.action('m1', o.id, 'refund-00001', 'refund', { amount: '10000' })
  await e.workOne()
  expect(s.get('m1', o.id).status).toBe('review_required')
  const j = s.jobs('m1', o.id).find((j) => j.action === 'refund')!
  e.retryOperation('m1', j.id)
  expect(() => e.retryOperation('m1', j.id)).toThrow('operation_not_retryable')
  await e.workOne()
  expect(s.get('m1', o.id).status).toBe('refunded')
  expect(s.reconcile('m1').balanced).toBe(true)
})
it('resends dead outbound events with the original event id, scoped to merchant', async () => {
  const { e, s, advance } = setup()
  await create(e)
  const outbox = new Outbox(
    s,
    { m1: { url: 'https://merchant.example/hook', secret: 'secret'.repeat(8) } },
    e.now,
    async () => new Response(null, { status: 503 })
  )
  for (let i = 0; i < 16; i++) {
    await outbox.workOne()
    advance()
  }
  const d = outbox.list('m1').find((d) => d.status === 'dead')!
  expect(d).toBeDefined()
  expect(outbox.retry('m2', String(d.id))).toBe(false)
  expect(outbox.retry('m1', String(d.id))).toBe(true)
  expect(outbox.list('m1').find((x) => x.id === d.id)).toMatchObject({
    status: 'queued',
    event_id: d.event_id,
    attempts: 0,
  })
})
it('retains the same command id when restarting an uncertain operation', async () => {
  class Down extends Simulator {
    override async execute(_c: Command): Promise<never> {
      throw Error('timeout')
    }
  }
  const { e, s, advance } = setup(new Down()),
    o = await create(e)
  for (let i = 0; i < 4; i++) {
    advance()
    await e.workOne()
  }
  const dead = s.jobs('m1', o.id)[0]!
  expect(dead.status).toBe('dead')
  e.retryOperation('m1', dead.id)
  expect(s.jobs('m1', o.id)).toHaveLength(1)
  expect(s.getJob(dead.id)).toMatchObject({ id: dead.id, status: 'queued', attempts: 0 })
  expect(s.journal('m1', o.id)).toHaveLength(0)
})
