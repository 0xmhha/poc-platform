import { z } from 'zod'
import type { Action, Job, Order, ProviderResult, Quote } from './domain'
import {
  canonical,
  createInput,
  digest,
  Fault,
  id,
  minor,
  providerResult,
  quoteInput,
} from './domain'
import type { Provider } from './providers'
import type { Store } from './store'

export class Engine {
  constructor(
    readonly store: Store,
    readonly provider: Provider,
    readonly now = () => Date.now()
  ) {}
  async quote(merchant: string, value: unknown) {
    const input = quoteInput.parse(value)
    if ((input.kind === 'offramp') !== (input.input.asset === 'USDC'))
      throw new Fault('invalid_asset_pair')
    const q = await this.provider.quote(merchant, input, this.now())
    if (
      q.kind !== input.kind ||
      canonical(q.input) !== canonical(input.input) ||
      q.output.asset !==
        (input.kind === 'onramp'
          ? 'USDC'
          : input.kind === 'offramp'
            ? input.fiatCurrency
            : input.input.asset) ||
      (q.kind === 'payment' && (q.fee.amount !== '0' || q.output.amount !== q.input.amount)) ||
      q.fee.asset !== q.input.asset ||
      BigInt(q.fee.amount) >= BigInt(q.input.amount)
    )
      throw new Fault('provider_quote_mismatch', 502)
    this.store.quote(q)
    return q
  }
  setKYC(
    merchant: string,
    customer: string,
    status: 'approved' | 'rejected',
    expires = this.now() + 86400000
  ) {
    if (!this.provider.simulated) throw new Fault('simulation_disabled', 403)
    z.string().min(1).max(100).parse(customer)
    this.store.db
      .prepare(
        'INSERT INTO kyc VALUES(?,?,?,?) ON CONFLICT(merchant,customer) DO UPDATE SET status=excluded.status,expires=excluded.expires'
      )
      .run(merchant, customer, status, expires)
  }
  private risk(merchant: string, customer: string, q: Quote) {
    if (q.kind === 'payment') return
    const k = this.store.db
      .prepare('SELECT status,expires FROM kyc WHERE merchant=? AND customer=?')
      .get(merchant, customer) as { status: string; expires: number } | undefined
    if (k?.status !== 'approved' || k.expires <= this.now()) throw new Fault('kyc_required', 403)
    const limits = { KRW: 10000000n, USD: 1000000n, USDC: 10000000000n }
    const rows = this.store.db
      .prepare('SELECT data FROM orders WHERE merchant=?')
      .all(merchant) as { data: string }[]
    const spent = rows
      .map((r) => JSON.parse(r.data) as Order)
      .filter(
        (o) =>
          o.customerId === customer &&
          o.createdAt > this.now() - 86400000 &&
          o.quote.input.asset === q.input.asset &&
          !['declined', 'cancelled', 'refunded'].includes(o.status)
      )
      .reduce((s, o) => s + BigInt(o.quote.input.amount), 0n)
    if (spent + BigInt(q.input.amount) > limits[q.input.asset])
      throw new Fault('daily_limit_exceeded', 422)
  }
  create(merchant: string, key: string, value: unknown): Order {
    const input = createInput.parse(value)
    return this.store.once(`${merchant}:create`, key, input, () => {
      const now = this.now(),
        q = this.store.getQuote(merchant, input.quoteId)
      if (q.expiresAt <= now) throw new Fault('quote_expired', 409)
      if (!this.provider.simulated && input.scenario !== 'success')
        throw new Fault('simulation_disabled', 403)
      if (
        q.kind === 'onramp' &&
        (!/^0x[0-9a-fA-F]{40}$/.test(input.destination ?? '') ||
          /^0x0{40}$/i.test(input.destination ?? ''))
      )
        throw new Fault('invalid_wallet')
      if (
        q.kind === 'offramp' &&
        !/^beneficiary_[a-zA-Z0-9_-]{6,100}$/.test(input.destination ?? '')
      )
        throw new Fault('beneficiary_token_required')
      if (!this.provider.simulated && q.kind !== 'offramp' && !input.paymentMethodToken)
        throw new Fault('payment_method_token_required', 400)
      this.risk(merchant, input.customerId, q)
      const o: Order = {
        id: id(),
        merchantId: merchant,
        customerId: input.customerId,
        reference: input.reference,
        kind: q.kind,
        quote: q,
        destination: input.destination,
        paymentMethodToken: input.paymentMethodToken,
        scenario: input.scenario,
        simulated: this.provider.simulated,
        provider: this.provider.name,
        status: 'created',
        refunded: '0',
        version: 0,
        createdAt: now,
        updatedAt: now,
      }
      this.store.insert(o)
      this.store.useQuote(q.id)
      this.store.save(o, 'order.created', now)
      this.store.enqueue(o, 'start', now)
      return o
    })
  }
  action(
    merchant: string,
    orderId: string,
    key: string,
    action: Action,
    value: unknown = {}
  ): Order {
    const input = z.object({ amount: minor.optional() }).strict().parse(value)
    return this.store.once(`${merchant}:${orderId}:${action}`, key, input, () => {
      const o = this.store.get(merchant, orderId),
        now = this.now()
      const busy = this.store.jobs(merchant, orderId).some((j) => !['done'].includes(j.status))
      if (busy) throw new Fault('operation_in_progress', 409)
      const states: Partial<Record<Action, string[]>> = {
        authenticate: ['requires_action'],
        capture: ['authorized'],
        settle: ['captured', 'partially_refunded'],
        cancel: ['authorized', 'requires_action', 'payment_pending', 'deposit_pending'],
        refund: ['captured', 'partially_refunded', 'settled'],
        fund: ['payment_pending'],
        deposit: ['deposit_pending'],
      }
      if (!states[action]?.includes(o.status)) throw new Fault('invalid_transition', 409)
      if (['authenticate', 'fund', 'deposit'].includes(action) && !this.provider.simulated)
        throw new Fault('provider_confirmation_required', 403)
      if (action === 'settle' && o.settledAmount) throw new Fault('already_settled', 409)
      if (action === 'refund') {
        if (o.kind !== 'payment') throw new Fault('refund_not_supported', 409)
        const amount = BigInt(input.amount ?? o.quote.input.amount)
        if (amount > BigInt(o.quote.input.amount) - BigInt(o.refunded))
          throw new Fault('refund_exceeds_balance', 409)
        input.amount = amount.toString()
      }
      if (o.kind !== 'payment' && ['fund', 'deposit'].includes(action))
        this.risk(merchant, o.customerId, { ...o.quote, input: { ...o.quote.input, amount: '0' } })
      this.store.enqueue(o, action, now, input.amount)
      this.store.save(o, `operation.${action}.requested`, now)
      return o
    })
  }
  private finish(j: Job, result: ProviderResult) {
    const o = this.store.get(j.merchantId, j.orderId),
      now = this.now()
    if (result.operationId !== j.id || result.orderId !== o.id)
      throw new Fault('provider_result_mismatch', 422)
    if (j.status === 'done') {
      if (j.result && j.result.status !== result.status)
        throw new Fault('operation_result_conflict', 409)
      return
    }
    if (o.providerRef && o.providerRef !== result.providerRef)
      throw new Fault('provider_reference_mismatch', 422)
    if (
      result.status === 'pending' ||
      (result.status === 'requires_action' && j.action !== 'start')
    ) {
      j.status = 'waiting'
      j.availableAt = now
      this.store.job(j)
      return
    }
    if (
      !o.simulated &&
      result.status === 'succeeded' &&
      [
        'capture',
        'settle',
        'fund',
        'deposit',
        'transfer',
        'payout',
        'refund',
        'return_crypto',
      ].includes(j.action) &&
      !result.evidence
    )
      throw new Fault('settlement_evidence_required', 422)
    const success = result.status === 'succeeded'
    const from = o.status
    o.providerRef = result.providerRef
    const post = (
      asset: string,
      amount: bigint,
      fromAccount: string,
      toAccount: string,
      suffix = ''
    ) =>
      this.store.post(o, j.id + suffix, asset, [
        { account: fromAccount, amount: -amount },
        { account: toAccount, amount },
      ])
    const a = BigInt(o.quote.input.amount)
    switch (j.action) {
      case 'start':
        if (from !== 'created') throw new Fault('stale_operation', 409)
        if (result.status === 'requires_action') {
          if (o.kind !== 'payment') throw new Fault('unsupported_provider_action', 422)
          o.status = 'requires_action'
        } else
          o.status = !success
            ? 'declined'
            : o.kind === 'payment'
              ? 'authorized'
              : o.kind === 'onramp'
                ? 'payment_pending'
                : 'deposit_pending'
        if (!o.simulated && success && o.kind !== 'payment')
          this.store.enqueue(o, o.kind === 'onramp' ? 'fund' : 'deposit', now)
        if (!o.simulated && o.status === 'requires_action')
          this.store.enqueue(o, 'authenticate', now)
        break
      case 'authenticate':
        if (from !== 'requires_action') throw new Fault('stale_operation', 409)
        o.status = success ? 'authorized' : 'declined'
        break
      case 'capture':
        if (from !== 'authorized') throw new Fault('stale_operation', 409)
        if (success) {
          o.status = 'captured'
          post(o.quote.input.asset, a, 'provider:clearing', `merchant:${o.merchantId}:available`)
        } else o.status = 'authorized'
        break
      case 'settle':
        if (!['captured', 'partially_refunded'].includes(from))
          throw new Fault('stale_operation', 409)
        if (success) {
          o.status = 'settled'
          o.settledAmount = (a - BigInt(o.refunded)).toString()
          post(
            o.quote.input.asset,
            a - BigInt(o.refunded),
            `merchant:${o.merchantId}:available`,
            `merchant:${o.merchantId}:paid_out`
          )
        }
        break
      case 'cancel':
        if (success) o.status = 'cancelled'
        break
      case 'fund':
      case 'deposit':
        if (from !== (j.action === 'fund' ? 'payment_pending' : 'deposit_pending'))
          throw new Fault('stale_operation', 409)
        if (success) {
          post(o.quote.input.asset, a, 'provider:clearing', `order:${o.id}:reserved`)
          o.status = 'processing'
          this.store.enqueue(o, j.action === 'fund' ? 'transfer' : 'payout', now)
        } else o.status = 'declined'
        break
      case 'transfer':
      case 'payout':
        if (from !== 'processing') throw new Fault('stale_operation', 409)
        if (success) {
          o.status = 'completed'
          post(o.quote.input.asset, a, `order:${o.id}:reserved`, 'provider:conversion', ':input')
          post(
            o.quote.output.asset,
            BigInt(o.quote.output.amount),
            'provider:liquidity',
            `customer:${o.customerId}:delivered`,
            ':output'
          )
        } else {
          o.status = 'refund_pending'
          this.store.enqueue(
            o,
            j.action === 'transfer' ? 'refund' : 'return_crypto',
            now,
            o.quote.input.amount
          )
        }
        break
      case 'refund':
      case 'return_crypto': {
        if (!success) {
          o.status = 'review_required'
          this.alert(o, 'compensation_or_refund_declined')
          break
        }
        const amount = BigInt(j.amount ?? o.quote.input.amount)
        if (amount > a - BigInt(o.refunded)) throw new Fault('refund_exceeds_balance', 409)
        post(
          o.quote.input.asset,
          amount,
          o.kind === 'payment'
            ? `merchant:${o.merchantId}:${o.settledAmount ? 'paid_out' : 'available'}`
            : `order:${o.id}:reserved`,
          'provider:clearing'
        )
        o.refunded = (BigInt(o.refunded) + amount).toString()
        o.status = o.refunded === o.quote.input.amount ? 'refunded' : 'partially_refunded'
        break
      }
    }
    j.status = 'done'
    j.result = result
    j.leaseUntil = 0
    this.store.job(j)
    this.store.save(o, `operation.${j.action}.${result.status}`, now)
  }
  private alert(o: Order, reason: string) {
    this.store.db
      .prepare('INSERT INTO alerts VALUES(?,?,?,?,?)')
      .run(id(), o.merchantId, o.id, reason, this.now())
  }
  async workOne() {
    const j = this.store.claim(this.now())
    if (!j) return false
    try {
      const o = this.store.get(j.merchantId, j.orderId)
      const result = providerResult.parse(
        await this.provider.execute({
          id: j.id,
          orderId: j.orderId,
          merchantId: j.merchantId,
          action: j.action,
          amount: j.amount,
          order: o,
        })
      )
      this.store.transaction(() => {
        const current = this.store.getJob(j.id)
        if (current.status === 'done') return
        this.finish(current, result)
      })
    } catch (error) {
      this.store.transaction(() => {
        const current = this.store.getJob(j.id)
        if (current.status === 'done') return
        current.lastError = error instanceof Fault ? error.code : 'provider_unavailable'
        current.status = current.attempts >= 5 ? 'dead' : 'queued'
        current.availableAt = this.now() + Math.min(60000, 1000 * 2 ** current.attempts)
        this.store.job(current)
        if (current.status === 'dead') {
          const o = this.store.get(j.merchantId, j.orderId)
          this.alert(o, 'operation_retry_exhausted')
          this.store.save(o, 'operation.review_required', this.now())
        }
      })
    }
    return true
  }
  webhook(provider: string, eventId: string, value: unknown) {
    const result = providerResult.parse(value)
    if (provider !== this.provider.name) throw new Fault('unknown_provider', 404)
    return this.store.transaction(() => {
      const hash = digest(result)
      const old = this.store.db
        .prepare('SELECT hash FROM inbox WHERE provider=? AND event_id=?')
        .get(provider, eventId) as { hash: string } | undefined
      if (old) {
        if (old.hash !== hash) throw new Fault('event_conflict', 409)
        return { duplicate: true }
      }
      const j = this.store.getJob(result.operationId)
      this.finish(j, result)
      this.store.db.prepare('INSERT INTO inbox VALUES(?,?,?)').run(provider, eventId, hash)
      return { duplicate: false }
    })
  }
  kycWebhook(eventId: string, value: unknown) {
    const data = z
      .object({
        merchantId: z.string().min(1).max(100),
        customerId: z.string().min(1).max(100),
        status: z.enum(['approved', 'rejected']),
        expiresAt: z.number().int(),
        version: z.number().int().positive().safe(),
      })
      .strict()
      .parse(value)
    if (data.expiresAt <= this.now() || data.expiresAt > this.now() + 366 * 86400000)
      throw new Fault('invalid_kyc_expiry', 422)
    return this.store.transaction(() => {
      const hash = digest(data)
      const old = this.store.db
        .prepare('SELECT hash FROM inbox WHERE provider=? AND event_id=?')
        .get(this.provider.name, eventId) as { hash: string } | undefined
      if (old) {
        if (old.hash !== hash) throw new Fault('event_conflict', 409)
        return { duplicate: true }
      }
      const previous = this.store.db
        .prepare('SELECT version,hash FROM kyc_versions WHERE merchant=? AND customer=?')
        .get(data.merchantId, data.customerId) as { version: number; hash: string } | undefined
      if (previous && previous.version === data.version && previous.hash !== hash)
        throw new Fault('kyc_version_conflict', 409)
      if (!previous || data.version > previous.version) {
        this.store.db
          .prepare(
            'INSERT INTO kyc_versions VALUES(?,?,?,?) ON CONFLICT(merchant,customer) DO UPDATE SET version=excluded.version,hash=excluded.hash'
          )
          .run(data.merchantId, data.customerId, data.version, hash)
        this.store.db
          .prepare(
            'INSERT INTO kyc VALUES(?,?,?,?) ON CONFLICT(merchant,customer) DO UPDATE SET status=excluded.status,expires=excluded.expires'
          )
          .run(data.merchantId, data.customerId, data.status, data.expiresAt)
      }
      this.store.db
        .prepare('INSERT INTO inbox VALUES(?,?,?)')
        .run(this.provider.name, eventId, hash)
      return { duplicate: false }
    })
  }
  retryOperation(merchant: string, operationId: string) {
    return this.store.transaction(() => {
      const j = this.store.getJob(operationId)
      if (j.merchantId !== merchant) throw new Fault('operation_not_found', 404)
      const o = this.store.get(merchant, j.orderId)
      if (j.status === 'dead') {
        // Retry the same provider idempotency key: never duplicate an uncertain charge.
        j.status = 'queued'
        j.attempts = 0
        j.availableAt = this.now()
        j.leaseUntil = 0
        this.store.job(j)
      } else if (
        j.status === 'done' &&
        j.result?.status === 'declined' &&
        o.status === 'review_required' &&
        ['refund', 'return_crypto'].includes(j.action) &&
        !this.store.jobs(merchant, o.id).some((x) => x.status !== 'done')
      ) {
        o.status =
          o.kind === 'payment' ? (o.settledAmount ? 'settled' : 'captured') : 'refund_pending'
        this.store.enqueue(o, j.action, this.now(), j.amount)
      } else throw new Fault('operation_not_retryable', 409)
      this.store.save(o, 'operation.retry.requested', this.now())
      return o
    })
  }
  async reconcileOperation(merchant: string, operationId: string) {
    const j = this.store.getJob(operationId)
    if (j.merchantId !== merchant) throw new Fault('operation_not_found', 404)
    const result = await this.provider.lookup(j.id)
    if (result) this.webhook(this.provider.name, `reconcile:${j.id}:${digest(result)}`, result)
    return this.store.transaction(() => {
      const current = this.store.getJob(j.id)
      if (['waiting', 'dead'].includes(current.status)) {
        current.availableAt = this.now() + 30000
        this.store.job(current)
      }
      return current
    })
  }
  simulate(merchant: string, operationId: string, status: ProviderResult['status']) {
    if (!this.provider.simulated) throw new Fault('simulation_disabled', 403)
    const j = this.store.getJob(operationId)
    if (j.merchantId !== merchant) throw new Fault('operation_not_found', 404)
    if (!['waiting', 'dead'].includes(j.status)) throw new Fault('operation_not_waiting', 409)
    return this.webhook(this.provider.name, `sim:${j.id}:${status}`, {
      operationId: j.id,
      orderId: j.orderId,
      providerRef: `sim_${j.orderId}`,
      status,
      evidence: `simulation:${j.id}`,
    })
  }
}
