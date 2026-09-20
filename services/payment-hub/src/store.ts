import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Event, Job, Order, Quote } from './domain'
import { canonical, digest, Fault, id } from './domain'

/** A single-node durable repository. Transactions never encompass network calls. */
export class Store {
  readonly db: DatabaseSync
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS metadata(version INTEGER NOT NULL); INSERT INTO metadata SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM metadata);
  CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,merchant TEXT NOT NULL,data TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,merchant TEXT NOT NULL,reference TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(merchant,reference));
  CREATE TABLE IF NOT EXISTS idempotency(scope TEXT NOT NULL,key TEXT NOT NULL,hash TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(scope,key));
  CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,merchant TEXT NOT NULL,status TEXT NOT NULL,available INTEGER NOT NULL,data TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS jobs_available ON jobs(status,available);
  CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,merchant TEXT NOT NULL,order_id TEXT NOT NULL,data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS inbox(provider TEXT NOT NULL,event_id TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(provider,event_id));
  CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,merchant TEXT NOT NULL,asset TEXT NOT NULL,account TEXT NOT NULL,amount TEXT NOT NULL,reference TEXT NOT NULL,UNIQUE(reference,account));
  CREATE TABLE IF NOT EXISTS kyc_versions(merchant TEXT NOT NULL,customer TEXT NOT NULL,version INTEGER NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(merchant,customer));
  CREATE TABLE IF NOT EXISTS kyc(merchant TEXT NOT NULL,customer TEXT NOT NULL,status TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(merchant,customer));
  CREATE TABLE IF NOT EXISTS deliveries(id TEXT PRIMARY KEY,event_id TEXT NOT NULL UNIQUE,merchant TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL,available INTEGER NOT NULL,last_error TEXT);
  CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY,merchant TEXT NOT NULL,order_id TEXT NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL);
  `)
    const v = this.db.prepare('SELECT version FROM metadata').get() as { version: number }
    if (v.version !== 1) throw new Error('Unsupported database schema')
  }
  close() {
    this.db.close()
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const value = fn()
      this.db.exec('COMMIT')
      return value
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }
  once<T>(scope: string, key: string, value: unknown, fn: () => T): T {
    if (!/^[\w.:/-]{8,120}$/.test(key)) throw new Fault('invalid_idempotency_key')
    return this.transaction(() => {
      const hash = digest(value)
      const old = this.db
        .prepare('SELECT hash,response FROM idempotency WHERE scope=? AND key=?')
        .get(scope, key) as { hash: string; response: string } | undefined
      if (old) {
        if (old.hash !== hash) throw new Fault('idempotency_conflict', 409)
        return JSON.parse(old.response) as T
      }
      const result = fn()
      this.db
        .prepare('INSERT INTO idempotency VALUES(?,?,?,?)')
        .run(scope, key, hash, canonical(result))
      return result
    })
  }
  quote(q: Quote) {
    this.db
      .prepare('INSERT INTO quotes(id,merchant,data) VALUES(?,?,?)')
      .run(q.id, q.merchantId, canonical(q))
  }
  getQuote(merchant: string, quoteId: string): Quote {
    const row = this.db
      .prepare('SELECT data,used FROM quotes WHERE id=? AND merchant=?')
      .get(quoteId, merchant) as { data: string; used: number } | undefined
    if (!row) throw new Fault('quote_not_found', 404)
    if (row.used) throw new Fault('quote_already_used', 409)
    return JSON.parse(row.data)
  }
  useQuote(quoteId: string) {
    this.db.prepare('UPDATE quotes SET used=1 WHERE id=?').run(quoteId)
  }
  get(merchant: string, orderId: string): Order {
    const r = this.db
      .prepare('SELECT data FROM orders WHERE merchant=? AND id=?')
      .get(merchant, orderId) as { data: string } | undefined
    if (!r) throw new Fault('order_not_found', 404)
    return JSON.parse(r.data)
  }
  list(merchant: string, limit = 50): Order[] {
    return (
      this.db
        .prepare('SELECT data FROM orders WHERE merchant=? ORDER BY rowid DESC LIMIT ?')
        .all(merchant, limit) as { data: string }[]
    ).map((r) => JSON.parse(r.data))
  }
  insert(o: Order) {
    if (
      this.db
        .prepare('SELECT id FROM orders WHERE merchant=? AND reference=?')
        .get(o.merchantId, o.reference)
    )
      throw new Fault('reference_conflict', 409)
    this.db
      .prepare('INSERT INTO orders VALUES(?,?,?,?)')
      .run(o.id, o.merchantId, o.reference, canonical(o))
  }
  save(o: Order, type: string, now: number) {
    o.version++
    o.updatedAt = now
    this.db
      .prepare('UPDATE orders SET data=? WHERE id=? AND merchant=?')
      .run(canonical(o), o.id, o.merchantId)
    const event: Event = {
      id: id(),
      merchantId: o.merchantId,
      orderId: o.id,
      type,
      version: o.version,
      createdAt: now,
      data: o,
    }
    this.db
      .prepare('INSERT INTO events(id,merchant,order_id,data) VALUES(?,?,?,?)')
      .run(event.id, o.merchantId, o.id, canonical(event))
    this.db
      .prepare("INSERT INTO deliveries VALUES(?,?,?,'queued',0,?,NULL)")
      .run(id(), event.id, o.merchantId, now)
  }
  events(merchant: string, orderId: string): Event[] {
    this.get(merchant, orderId)
    return (
      this.db
        .prepare('SELECT data FROM events WHERE merchant=? AND order_id=? ORDER BY sequence')
        .all(merchant, orderId) as { data: string }[]
    ).map((r) => JSON.parse(r.data))
  }
  enqueue(o: Order, action: Job['action'], now: number, amount?: string): Job {
    const job: Job = {
      id: id(),
      orderId: o.id,
      merchantId: o.merchantId,
      action,
      amount,
      status: 'queued',
      attempts: 0,
      availableAt: now,
      leaseUntil: 0,
    }
    this.job(job)
    return job
  }
  job(j: Job) {
    this.db
      .prepare(
        'INSERT INTO jobs VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,available=excluded.available,data=excluded.data'
      )
      .run(j.id, j.orderId, j.merchantId, j.status, j.availableAt, canonical(j))
  }
  getJob(jobId: string): Job {
    const row = this.db.prepare('SELECT data FROM jobs WHERE id=?').get(jobId) as
      | { data: string }
      | undefined
    if (!row) throw new Fault('operation_not_found', 404)
    return JSON.parse(row.data)
  }
  jobs(merchant: string, orderId: string): Job[] {
    this.get(merchant, orderId)
    return (
      this.db
        .prepare('SELECT data FROM jobs WHERE merchant=? AND order_id=? ORDER BY rowid')
        .all(merchant, orderId) as { data: string }[]
    ).map((r) => JSON.parse(r.data))
  }
  claim(now: number): Job | undefined {
    return this.transaction(() => {
      const rows = this.db
        .prepare(
          "SELECT data FROM jobs WHERE status IN ('queued','running') AND available<=? ORDER BY available LIMIT 1"
        )
        .all(now) as { data: string }[]
      if (!rows[0]) return
      const j: Job = JSON.parse(rows[0].data)
      j.status = 'running'
      j.attempts++
      j.leaseUntil = now + 30000
      j.availableAt = j.leaseUntil
      this.job(j)
      return j
    })
  }
  post(o: Order, reference: string, asset: string, entries: { account: string; amount: bigint }[]) {
    if (entries.reduce((s, e) => s + e.amount, 0n) !== 0n) throw new Error('Unbalanced journal')
    for (const e of entries) {
      this.db
        .prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)')
        .run(id(), o.id, o.merchantId, asset, e.account, e.amount.toString(), reference)
    }
  }
  journal(merchant: string, orderId: string) {
    this.get(merchant, orderId)
    return this.db
      .prepare(
        'SELECT asset,account,amount,reference FROM ledger WHERE merchant=? AND order_id=? ORDER BY rowid'
      )
      .all(merchant, orderId)
  }
  reconcile(merchant: string) {
    const sums = new Map<string, bigint>()
    for (const r of this.db
      .prepare('SELECT asset,amount FROM ledger WHERE merchant=?')
      .all(merchant) as { asset: string; amount: string }[])
      sums.set(r.asset, (sums.get(r.asset) ?? 0n) + BigInt(r.amount))
    const waiting = this.db
      .prepare("SELECT COUNT(*) AS n FROM jobs WHERE merchant=? AND status IN ('waiting','dead')")
      .get(merchant) as { n: number }
    return {
      balanced: [...sums.values()].every((v) => v === 0n),
      balances: Object.fromEntries([...sums].map(([k, v]) => [k, v.toString()])),
      unresolvedOperations: waiting.n,
      alerts: this.db
        .prepare(
          'SELECT order_id,reason,created FROM alerts WHERE merchant=? ORDER BY created DESC LIMIT 100'
        )
        .all(merchant),
    }
  }
}
