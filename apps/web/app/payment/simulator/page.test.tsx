import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PaymentSimulator from './page'

let calls: { path: string; body: unknown; headers: Record<string, string> }[] = []
beforeEach(() => {
  calls = []
  sessionStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ path, body, headers: init?.headers as Record<string, string> })
      let result: unknown = {}
      if (path.endsWith('/capabilities')) result = { simulated: true }
      else if (path.endsWith('/reconciliation')) result = { balanced: true }
      else if (path.endsWith('/quotes'))
        result = {
          id: 'quote-1',
          input: { asset: 'KRW', amount: '10000' },
          output: { asset: 'KRW', amount: '10000' },
          fee: { asset: 'KRW', amount: '0' },
          expiresAt: Date.now() + 60000,
        }
      else if (path.endsWith('/orders') && !body) result = { orders: [] }
      else if (path.endsWith('/orders')) result = { id: 'order-1' }
      else if (path.endsWith('/events')) result = { events: [] }
      else if (path.endsWith('/ledger')) result = { entries: [] }
      else if (path.endsWith('/order-1'))
        result = {
          order: {
            id: 'order-1',
            kind: 'payment',
            status: 'created',
            quote: { input: { asset: 'KRW', amount: '10000' } },
            refunded: '0',
          },
          operations: [],
        }
      return { ok: true, json: async () => result }
    })
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
describe('payment lab', () => {
  it('shows simulation clearly and creates an idempotent order from a quote', async () => {
    render(<PaymentSimulator />)
    expect(screen.getByText(/실제 자금은 이동하지 않습니다/)).toBeTruthy()
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '견적 확인' }) as HTMLButtonElement).disabled
      ).toBe(false)
    )
    fireEvent.click(screen.getByRole('button', { name: '견적 확인' }))
    await screen.findByText(/수수료:/)
    fireEvent.click(screen.getByRole('button', { name: '거래 시작' }))
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/orders') && c.body)).toBe(true))
    const create = calls.find((c) => c.path.endsWith('/orders') && c.body)!
    expect(create.headers['idempotency-key']).toBeTruthy()
    expect(create.body).toMatchObject({ quoteId: 'quote-1', scenario: 'success' })
    expect(JSON.stringify(create.headers)).not.toContain('authorization')
    await screen.findByRole('heading', { name: /거래 상세/ })
  })
  it('preserves the original key after an uncertain response and retries the same order', async () => {
    const normal = vi.mocked(fetch).getMockImplementation()!
    let attempts = 0
    vi.mocked(fetch).mockImplementation(async (...args: Parameters<typeof fetch>) => {
      const [path, init] = args
      if (String(path).endsWith('/orders') && init?.body && attempts++ === 0) {
        calls.push({
          path: String(path),
          body: JSON.parse(String(init.body)),
          headers: init.headers as Record<string, string>,
        })
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { code: 'simulation_service_unavailable' } }),
        } as Response
      }
      return normal(...args)
    })
    render(<PaymentSimulator />)
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '견적 확인' }) as HTMLButtonElement).disabled
      ).toBe(false)
    )
    fireEvent.click(screen.getByRole('button', { name: '견적 확인' }))
    await screen.findByText(/수수료:/)
    fireEvent.click(screen.getByRole('button', { name: '거래 시작' }))
    await screen.findByRole('alert')
    expect(sessionStorage.getItem('payment-lab-pending')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '이전 요청 결과 확인' }))
    await screen.findByRole('heading', { name: /거래 상세/ })
    const writes = calls.filter((c) => c.path.endsWith('/orders') && c.body)
    expect(writes).toHaveLength(2)
    expect(writes[0]!.headers['idempotency-key']).toBe(writes[1]!.headers['idempotency-key'])
    expect(writes[0]!.body).toEqual(writes[1]!.body)
    expect(sessionStorage.getItem('payment-lab-pending')).toBeNull()
  })
  it('releases a definitively rejected expired quote so a fresh order can be requested', async () => {
    const normal = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (...args: Parameters<typeof fetch>) =>
      String(args[0]).endsWith('/orders') && args[1]?.body
        ? ({
            ok: false,
            status: 409,
            json: async () => ({ error: { code: 'quote_expired' } }),
          } as Response)
        : normal(...args)
    )
    render(<PaymentSimulator />)
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '견적 확인' }) as HTMLButtonElement).disabled
      ).toBe(false)
    )
    fireEvent.click(screen.getByRole('button', { name: '견적 확인' }))
    await screen.findByText(/수수료:/)
    fireEvent.click(screen.getByRole('button', { name: '거래 시작' }))
    await screen.findByRole('alert')
    expect(sessionStorage.getItem('payment-lab-pending')).toBeNull()
    expect(screen.getByRole('button', { name: '거래 시작' })).toBeTruthy()
  })
  it('requires a quote and exposes simulated identity approval for offramps', async () => {
    render(<PaymentSimulator />)
    expect((screen.getByRole('button', { name: '거래 시작' }) as HTMLButtonElement).disabled).toBe(
      true
    )
    fireEvent.change(screen.getByLabelText('거래 종류'), { target: { value: 'offramp' } })
    expect(screen.getByText(/가상 은행 계좌로 수령/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '가상 본인확인 승인' })).toBeTruthy()
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '견적 확인' }) as HTMLButtonElement).disabled
      ).toBe(false)
    )
  })
})
