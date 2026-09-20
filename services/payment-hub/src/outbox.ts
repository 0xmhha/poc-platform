import type { Event } from './domain'
import { canonical } from './domain'
import { signature } from './providers'
import type { Store } from './store'
export interface WebhookTarget {
  url: string
  secret: string
}
interface Delivery {
  id: string
  event_id: string
  merchant: string
  status: string
  attempts: number
  available: number
}
export class Outbox {
  constructor(
    readonly store: Store,
    readonly targets: Record<string, WebhookTarget>,
    readonly now = () => Date.now(),
    private request: typeof fetch = fetch
  ) {}
  async workOne() {
    const d = this.store.transaction(() => {
      const r = this.store.db
        .prepare(
          "SELECT * FROM deliveries WHERE status IN ('queued','running') AND available<=? ORDER BY available LIMIT 1"
        )
        .get(this.now()) as Delivery | undefined
      if (!r) return
      this.store.db
        .prepare(
          "UPDATE deliveries SET status='running',attempts=attempts+1,available=? WHERE id=?"
        )
        .run(this.now() + 30000, r.id)
      return { ...r, attempts: r.attempts + 1 }
    })
    if (!d) return false
    const target = this.targets[d.merchant]
    if (!target) {
      this.store.db.prepare("UPDATE deliveries SET status='disabled' WHERE id=?").run(d.id)
      return true
    }
    const r = this.store.db.prepare('SELECT data FROM events WHERE id=?').get(d.event_id) as {
      data: string
    }
    const event = JSON.parse(r.data) as Event
    const body = canonical(event),
      timestamp = Math.floor(this.now() / 1000).toString()
    try {
      const response = await this.request(target.url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          'content-type': 'application/json',
          'x-event-id': event.id,
          'x-webhook-timestamp': timestamp,
          'x-webhook-signature': signature(target.secret, timestamp, body),
        },
        body,
      })
      await response.body?.cancel()
      if (!response.ok) throw new Error(`http_${response.status}`)
      this.store.db
        .prepare("UPDATE deliveries SET status='delivered',last_error=NULL WHERE id=?")
        .run(d.id)
    } catch {
      this.store.db
        .prepare('UPDATE deliveries SET status=?,available=?,last_error=? WHERE id=?')
        .run(
          d.attempts >= 8 ? 'dead' : 'queued',
          this.now() + Math.min(3600000, 1000 * 2 ** d.attempts),
          'delivery_failed',
          d.id
        )
    }
    return true
  }
  list(merchant: string) {
    return this.store.db
      .prepare(
        'SELECT id,event_id,status,attempts,available,last_error FROM deliveries WHERE merchant=? ORDER BY rowid DESC LIMIT 100'
      )
      .all(merchant)
  }
  retry(merchant: string, id: string) {
    return (
      this.store.db
        .prepare(
          "UPDATE deliveries SET status='queued',attempts=0,available=? WHERE merchant=? AND id=? AND status='dead'"
        )
        .run(this.now(), merchant, id).changes === 1
    )
  }
}
