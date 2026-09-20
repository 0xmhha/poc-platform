import { createServer } from 'node:http'
import { createApp } from './app'
import { loadConfig } from './config'
import { Engine } from './engine'
import { Outbox } from './outbox'
import { HTTPProvider, Simulator } from './providers'
import { Store } from './store'

const config = loadConfig(),
  store = new Store(config.database)
const provider =
  config.mode === 'simulator'
    ? new Simulator()
    : new HTTPProvider(config.providerName, config.providerURL ?? '', config.providerToken ?? '')
const engine = new Engine(store, provider),
  outbox = new Outbox(store, config.targets),
  app = createApp(engine, outbox, config)
let working = false,
  closing = false,
  lastReconcile = 0
const timer = setInterval(async () => {
  if (working || closing) return
  working = true
  try {
    for (let i = 0; i < 20 && !closing && (await engine.workOne()); i++) {}
    for (let i = 0; i < 20 && !closing && (await outbox.workOne()); i++) {}
    if (!closing && Date.now() - lastReconcile > 30000) {
      lastReconcile = Date.now()
      const rows = store.db
        .prepare(
          "SELECT id,merchant FROM jobs WHERE status IN ('waiting','dead') AND available<=? ORDER BY available LIMIT 20"
        )
        .all(Date.now()) as { id: string; merchant: string }[]
      for (const r of rows) {
        if (closing) break
        try {
          await engine.reconcileOperation(r.merchant, r.id)
        } catch {
          /* Uncertain operations remain pending for reconciliation. */
        }
      }
    }
  } catch {
    console.error(JSON.stringify({ event: 'worker_error' }))
  } finally {
    working = false
  }
}, 250)
const server = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = []
    let length = 0
    for await (const chunk of req) {
      length += chunk.length
      if (length > 65536) {
        res.writeHead(413)
        res.end('{"error":{"code":"request_too_large"}}')
        return
      }
      chunks.push(chunk)
    }
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: new Headers(
        Object.entries(req.headers).flatMap(([k, v]) =>
          v === undefined ? [] : [[k, Array.isArray(v) ? v.join(',') : v]]
        )
      ),
      body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks),
    })
    const response = await app.fetch(request)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch {
    res.writeHead(500)
    res.end('{"error":{"code":"internal_error"}}')
  }
})
server.requestTimeout = 10000
server.headersTimeout = 10000
server.keepAliveTimeout = 5000
server.listen(config.port, config.host, () =>
  process.stdout.write(
    JSON.stringify({
      event: 'listening',
      host: config.host,
      port: config.port,
      mode: config.mode,
    }) + '\n'
  )
)
async function shutdown() {
  if (closing) return
  closing = true
  clearInterval(timer)
  let drained = false
  server.close(() => {
    drained = true
  })
  server.closeIdleConnections()
  const deadline = Date.now() + 15000
  while ((working || !drained) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
  if (working || !drained) process.exit(1)
  store.close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
