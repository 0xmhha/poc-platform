import { type NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const allowed =
  /^(capabilities|quotes|reconciliation|deliveries|orders(?:\/[a-zA-Z0-9-]+(?:\/(?:events|ledger|actions\/(?:capture|settle|cancel|refund|authenticate|fund|deposit)))?)?|simulation\/(?:kyc|operations\/[a-zA-Z0-9-]+)|operations\/[a-zA-Z0-9-]+\/reconcile)$/
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (process.env.PAYMENT_LAB_ENABLED !== 'true')
    return NextResponse.json({ error: { code: 'simulation_disabled' } }, { status: 404 })
  const { path } = await context.params
  const route = path.join('/')
  if (!allowed.test(route))
    return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 })
  if (
    request.method === 'POST' &&
    request.headers.get('origin') !==
      (process.env.PAYMENT_LAB_ORIGIN ?? new URL(request.url).origin)
  )
    return NextResponse.json({ error: { code: 'invalid_origin' } }, { status: 403 })
  const base = process.env.PAYMENT_HUB_URL ?? 'http://127.0.0.1:4353',
    key = process.env.PAYMENT_LAB_API_KEY
  if (!key)
    return NextResponse.json({ error: { code: 'simulation_not_configured' } }, { status: 503 })
  try {
    const auth = { authorization: `Bearer ${key}` }
    // A lab must never forward browser requests into a real provider environment.
    const caps = await fetch(`${base}/v1/capabilities`, {
      headers: auth,
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
    if (!caps.ok || !(await caps.json()).simulated)
      return NextResponse.json({ error: { code: 'simulation_only' } }, { status: 403 })
    const body = request.method === 'POST' ? await request.text() : undefined
    if (body && Buffer.byteLength(body) > 65536)
      return NextResponse.json({ error: { code: 'request_too_large' } }, { status: 413 })
    const response = await fetch(`${base}/v1/${route}`, {
      method: request.method,
      headers: {
        ...auth,
        'content-type': 'application/json',
        'idempotency-key': request.headers.get('idempotency-key') ?? '',
      },
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    })
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: { code: 'simulation_service_unavailable' } }, { status: 503 })
  }
}
export const GET = proxy
export const POST = proxy
