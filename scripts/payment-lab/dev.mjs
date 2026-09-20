import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const apiPort = Number(process.env.PAYMENT_LAB_HUB_PORT ?? 14353),
  webPort = Number(process.env.PAYMENT_LAB_WEB_PORT ?? 14300)
const key = randomBytes(32).toString('hex'),
  secret = randomBytes(32).toString('hex')
const data = resolve(root, '.payment-lab')
mkdirSync(data, { recursive: true, mode: 0o700 })
const children = []
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL')
    process.exit(code)
  }, 15000)
}
function run(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' })
  children.push(child)
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`Child exited (${code}); stopping local lab`)
      stop(code || 1)
    }
  })
  return child
}
run(process.execPath, ['dist/main.js'], resolve(root, 'services/payment-hub'), {
  PORT: String(apiPort),
  HOST: '127.0.0.1',
  PAYMENT_MODE: 'simulator',
  PAYMENT_DATABASE: resolve(data, 'payments.sqlite'),
  PAYMENT_API_KEYS: JSON.stringify([{ key, merchantId: 'demo-merchant', role: 'operator' }]),
  PAYMENT_WEBHOOK_SECRET: secret,
  PAYMENT_WEBHOOK_TARGETS: '{}',
})
run(
  'pnpm',
  ['exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', String(webPort)],
  resolve(root, 'apps/web'),
  {
    PAYMENT_LAB_ENABLED: 'true',
    PAYMENT_LAB_ORIGIN: `http://127.0.0.1:${webPort}`,
    PAYMENT_HUB_URL: `http://127.0.0.1:${apiPort}`,
    PAYMENT_LAB_API_KEY: key,
  }
)
console.log(`결제 실험실: http://127.0.0.1:${webPort}/payment/simulator (시뮬레이션 전용)`)
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
