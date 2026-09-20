import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from './route'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
const context = { params: Promise.resolve({ path: ['orders'] }) }
describe('simulation-only server proxy', () => {
  it('is disabled by default', async () => {
    vi.stubEnv('PAYMENT_LAB_ENABLED', 'false')
    expect(
      (await GET(new NextRequest('http://localhost/api/payment-lab/orders'), context)).status
    ).toBe(404)
  })
  it('rejects cross-origin writes before making network calls', async () => {
    vi.stubEnv('PAYMENT_LAB_ENABLED', 'true')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(
      (
        await POST(
          new NextRequest('http://localhost/api/payment-lab/orders', {
            method: 'POST',
            headers: { origin: 'https://attacker.test' },
          }),
          context
        )
      ).status
    ).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('refuses to connect the lab to a live provider', async () => {
    vi.stubEnv('PAYMENT_LAB_ENABLED', 'true')
    vi.stubEnv('PAYMENT_LAB_API_KEY', 'server-only-key')
    const fetch = vi.fn().mockResolvedValue(Response.json({ simulated: false }))
    vi.stubGlobal('fetch', fetch)
    expect(
      (await GET(new NextRequest('http://localhost/api/payment-lab/orders'), context)).status
    ).toBe(403)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('uses an explicitly configured public origin behind a reverse proxy', async () => {
    vi.stubEnv('PAYMENT_LAB_ENABLED', 'true')
    vi.stubEnv('PAYMENT_LAB_API_KEY', 'server-key')
    vi.stubEnv('PAYMENT_LAB_ORIGIN', 'http://127.0.0.1:14300')
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ simulated: true }))
        .mockResolvedValueOnce(Response.json({ id: 'order-1' }))
    )
    const r = await POST(
      new NextRequest('http://localhost:14300/api/payment-lab/orders', {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1:14300' },
        body: '{}',
      }),
      context
    )
    expect(r.status).toBe(200)
  })
  it('keeps the credential server-side and preserves the operation key', async () => {
    vi.stubEnv('PAYMENT_LAB_ENABLED', 'true')
    vi.stubEnv('PAYMENT_LAB_API_KEY', 'server-only-key')
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ simulated: true }))
      .mockResolvedValueOnce(Response.json({ id: 'order-1' }))
    vi.stubGlobal('fetch', fetch)
    const response = await POST(
      new NextRequest('http://localhost/api/payment-lab/orders', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'idempotency-key': 'request-key-1' },
        body: '{}',
      }),
      context
    )
    expect(response.status).toBe(200)
    expect(fetch.mock.calls[1]?.[1].headers).toMatchObject({
      authorization: 'Bearer server-only-key',
      'idempotency-key': 'request-key-1',
    })
    expect(await response.text()).not.toContain('server-only-key')
  })
})
