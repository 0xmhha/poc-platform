'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Asset } from '@/lib/payment-lab/money'
import { formatMinor, toMinor } from '@/lib/payment-lab/money'

type Money = { asset: Asset; amount: string }
type Quote = { id: string; input: Money; output: Money; fee: Money; expiresAt: number }
type Order = {
  id: string
  kind: string
  status: string
  quote: Quote
  settledAmount?: string
  refunded: string
  reference: string
  simulated: boolean
}
type Operation = { id: string; action: string; status: string; attempts: number }
type Detail = { order: Order; operations: Operation[] }
type Journal = { asset: Asset; account: string; amount: string; reference: string }
const states: Record<string, string> = {
  created: '처리 대기',
  requires_action: '추가 인증 필요',
  authorized: '승인 완료',
  captured: '결제 완료',
  settled: '가맹점 정산 완료',
  payment_pending: '입금 대기',
  deposit_pending: '코인 입금 대기',
  processing: '송금 중',
  completed: '완료',
  declined: '거절',
  cancelled: '취소',
  partially_refunded: '부분 환불',
  refund_pending: '환불 중',
  refunded: '환불 완료',
  review_required: '확인 필요',
}
const actions: Record<string, string> = {
  start: '거래 승인',
  authenticate: '추가 인증',
  capture: '결제 확정',
  settle: '가맹점 정산',
  cancel: '거래 취소',
  refund: '환불',
  fund: '현금 입금',
  deposit: '코인 입금',
  transfer: '코인 송금',
  payout: '현금 지급',
  return_crypto: '코인 반환',
  retry: '작업 재시도',
}
function eventLabel(type: string) {
  if (type === 'order.created') return '거래 생성'
  const [, action, status] = type.split('.')
  return `${actions[action ?? ''] ?? action} · ${({ requested: '요청', succeeded: '완료', declined: '거절', requires_action: '인증 필요' } as Record<string, string>)[status ?? ''] ?? status ?? '확인 필요'}`
}
function accountLabel(account: string) {
  if (account.endsWith(':reserved')) return '거래 보관금'
  if (account.endsWith(':available')) return '가맹점 정산 대기'
  if (account.endsWith(':paid_out')) return '가맹점 지급 완료'
  if (account.endsWith(':delivered')) return '고객 수령'
  return (
    (
      {
        'provider:clearing': '사업자 수납·반환',
        'provider:conversion': '환전 원금·수수료',
        'provider:liquidity': '사업자 지급 자금',
      } as Record<string, string>
    )[account] ?? account
  )
}
const scenarios = {
  success: '정상 처리',
  declined: '결제 거절',
  requires_action: '추가 인증',
  delayed: '지연 알림',
  timeout: '사업자 응답 없음',
  transfer_failed: '코인 송금 실패',
  payout_failed: '은행 지급 실패',
}
const errors: Record<string, string> = {
  simulation_disabled: '결제 실험실이 비활성화되어 있습니다.',
  simulation_not_configured: '결제 실험실 연결 설정이 필요합니다.',
  simulation_service_unavailable: '시뮬레이터에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
  kyc_required: '먼저 가상 본인확인을 승인해주세요.',
  quote_expired: '견적이 만료되었습니다. 다시 조회해주세요.',
  invalid_transition: '현재 상태에서는 실행할 수 없습니다.',
  operation_in_progress: '이전 작업을 처리 중입니다.',
  refund_exceeds_balance: '환불 가능한 잔액을 초과했습니다.',
  daily_limit_exceeded: '하루 거래 한도를 초과했습니다.',
}
class APIError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message)
  }
}
async function api<T>(path: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch('/api/payment-lab/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok)
    throw new APIError(
      errors[data.error?.code] ??
        `요청을 처리하지 못했습니다 (${data.error?.code ?? response.status}).`,
      response.status,
      data.error?.code ?? 'unknown'
    )
  return data
}
export default function PaymentSimulator() {
  const [kind, setKind] = useState('payment'),
    [currency, setCurrency] = useState<'KRW' | 'USD'>('KRW'),
    [amount, setAmount] = useState('10000'),
    [scenario, setScenario] = useState('success'),
    [quote, setQuote] = useState<Quote | null>(null)
  const [orders, setOrders] = useState<Order[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [events, setEvents] = useState<{ id: string; type: string; createdAt: number }[]>([]),
    [journal, setJournal] = useState<Journal[]>([])
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [kyc, setKyc] = useState(false),
    [refund, setRefund] = useState(''),
    [balanced, setBalanced] = useState<boolean | null>(null),
    [available, setAvailable] = useState(false)
  const [clock, setClock] = useState(Date.now()),
    pending = useRef<{ key: string; body: unknown } | null>(null)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const pendingAction = useRef<{
    orderId: string
    action: string
    body: unknown
    key: string
  } | null>(null)
  const refresh = useCallback(async () => {
    const list = await api<{ orders: Order[] }>('orders')
    setOrders(list.orders)
    const r = await api<{ balanced: boolean }>('reconciliation')
    setBalanced(r.balanced)
    if (selected) {
      const [d, e, l] = await Promise.all([
        api<Detail>('orders/' + selected),
        api<{ events: typeof events }>('orders/' + selected + '/events'),
        api<{ entries: Journal[] }>('orders/' + selected + '/ledger'),
      ])
      if (selectedRef.current !== selected) return
      setDetail(d)
      setEvents(e.events)
      setJournal(l.entries)
    }
  }, [selected])
  useEffect(() => {
    api<{ simulated: boolean }>('capabilities')
      .then((c) => setAvailable(c.simulated))
      .catch((e) => setError(e.message))
    const actionCache = sessionStorage.getItem('payment-lab-action')
    if (actionCache) {
      try {
        pendingAction.current = JSON.parse(actionCache)
      } catch {
        sessionStorage.removeItem('payment-lab-action')
      }
    }
    const cached = sessionStorage.getItem('payment-lab-pending')
    if (cached) {
      try {
        pending.current = JSON.parse(cached)
      } catch {
        sessionStorage.removeItem('payment-lab-pending')
      }
    }
  }, [])
  useEffect(() => {
    let active = true
    const tick = () =>
      refresh().catch((e) => {
        if (active) setError(e.message)
      })
    void tick()
    const timer = setInterval(() => {
      setClock(Date.now())
      void tick()
    }, 3000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [refresh])
  const perform = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.')
    } finally {
      setBusy(false)
    }
  }
  const invalidate = () => {
    setQuote(null)
  }
  const fetchQuote = () =>
    perform(async () => {
      setClock(Date.now())
      const inputAsset = kind === 'offramp' ? 'USDC' : currency
      setQuote(
        await api<Quote>('quotes', {
          kind,
          input: { asset: inputAsset, amount: toMinor(amount, inputAsset) },
          fiatCurrency: currency,
        })
      )
    })
  const savedRequest = async <T,>(
    cache: string,
    ref: { current: { key: string; body: unknown } | null },
    path: string
  ): Promise<T> => {
    const clear = () => {
      ref.current = null
      sessionStorage.removeItem(cache)
    }
    try {
      const r = await api<T>(path, ref.current!.body, ref.current!.key)
      clear()
      return r
    } catch (e) {
      if (
        e instanceof APIError &&
        [
          'quote_expired',
          'quote_not_found',
          'invalid_request',
          'invalid_transition',
          'refund_exceeds_balance',
          'kyc_required',
          'daily_limit_exceeded',
          'invalid_wallet',
          'beneficiary_token_required',
          'already_settled',
          'operation_in_progress',
        ].includes(e.code)
      )
        clear()
      throw e
    }
  }
  const create = () =>
    perform(async () => {
      if (!pending.current) {
        if (!quote || quote.expiresAt <= Date.now())
          throw new Error('유효한 견적을 먼저 조회해주세요.')
        pending.current = {
          key: crypto.randomUUID(),
          body: {
            quoteId: quote.id,
            customerId: 'demo-customer',
            reference: crypto.randomUUID(),
            scenario,
            destination:
              kind === 'onramp'
                ? '0x0000000000000000000000000000000000000001'
                : kind === 'offramp'
                  ? 'beneficiary_demo_bank'
                  : undefined,
          },
        }
        sessionStorage.setItem('payment-lab-pending', JSON.stringify(pending.current))
      }
      const o = await savedRequest<Order>('payment-lab-pending', pending, 'orders')
      setSelected(o.id)
      setQuote(null)
    })
  const action = (name: string) =>
    perform(async () => {
      if (!detail) return
      const body =
        name === 'refund' ? { amount: toMinor(refund, detail.order.quote.input.asset) } : {}
      const old = pendingAction.current
      if (
        old &&
        (old.orderId !== detail.order.id ||
          old.action !== name ||
          JSON.stringify(old.body) !== JSON.stringify(body))
      )
        throw new Error('이전 작업 결과를 먼저 확인해주세요.')
      const request = old ?? {
        orderId: detail.order.id,
        action: name,
        body,
        key: crypto.randomUUID(),
      }
      pendingAction.current = request
      sessionStorage.setItem('payment-lab-action', JSON.stringify(request))
      await savedRequest(
        'payment-lab-action',
        pendingAction,
        `orders/${request.orderId}/actions/${request.action}`
      )
    })
  const status = detail?.order.status ?? '',
    operationBusy = detail?.operations.some((o) => o.status !== 'done') ?? false
  const control =
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:opacity-50'
  const button = 'rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-50'
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header>
        <p className="text-sm font-semibold text-amber-700">
          시뮬레이션 전용 · 실제 자금은 이동하지 않습니다
        </p>
        <h1 className="text-3xl font-bold mt-2">결제 실험실</h1>
        <p className="mt-2 text-slate-500">
          가맹점 결제와 현금 ↔ 코인 전환을 테스트하고, 실패·환불·복구 과정을 확인하세요.
        </p>
      </header>
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 text-red-800 p-4">
          {error}
        </div>
      )}
      {pendingAction.current && (
        <button
          type="button"
          className={control}
          disabled={busy}
          onClick={() =>
            perform(async () => {
              const request = pendingAction.current!
              await savedRequest(
                'payment-lab-action',
                pendingAction,
                `orders/${request.orderId}/actions/${request.action}`
              )
              setSelected(request.orderId)
            })
          }
        >
          이전 작업 결과 확인
        </button>
      )}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border p-5 space-y-4">
          <h2 className="text-xl font-semibold">새 거래</h2>
          <label className="block">
            거래 종류
            <select
              aria-label="거래 종류"
              className={control + ' w-full mt-1'}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value)
                setAmount(e.target.value === 'offramp' ? '10' : '10000')
                invalidate()
              }}
            >
              <option value="payment">가맹점 결제</option>
              <option value="onramp">코인 구매 (온램프)</option>
              <option value="offramp">코인 판매 (오프램프)</option>
            </select>
          </label>
          <div className="flex gap-3">
            <label className="flex-1">
              {kind === 'offramp' ? '판매 수량 (USDC)' : '결제 금액'}
              <input
                aria-label="거래 금액"
                className={control + ' w-full mt-1'}
                value={amount}
                inputMode="decimal"
                onChange={(e) => {
                  setAmount(e.target.value)
                  invalidate()
                }}
              />
            </label>
            <label>
              현금 통화
              <select
                aria-label="현금 통화"
                className={control + ' block mt-1'}
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value as 'KRW' | 'USD')
                  invalidate()
                }}
              >
                <option>KRW</option>
                <option>USD</option>
              </select>
            </label>
          </div>
          <label className="block">
            시험 상황
            <select
              aria-label="시험 상황"
              className={control + ' w-full mt-1'}
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
            >
              {Object.entries(scenarios).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {kind !== 'payment' && (
            <div className="p-3 rounded bg-slate-100 text-slate-800">
              <p>
                가상 고객 · {kind === 'onramp' ? '테스트 지갑으로 수령' : '가상 은행 계좌로 수령'}
              </p>
              <button
                type="button"
                className={control + ' mt-2'}
                disabled={busy || !available}
                onClick={() =>
                  perform(async () => {
                    await api('simulation/kyc', { customerId: 'demo-customer', status: 'approved' })
                    setKyc(true)
                  })
                }
              >
                {kyc ? '가상 본인확인 승인됨' : '가상 본인확인 승인'}
              </button>
            </div>
          )}
          <button
            type="button"
            className={button}
            disabled={busy || !available}
            onClick={fetchQuote}
          >
            견적 확인
          </button>
          {quote && (
            <div className="bg-blue-50 text-slate-900 rounded p-4 space-y-1">
              <p>입력: {formatMinor(quote.input.amount, quote.input.asset)}</p>
              <p>
                수령: <strong>{formatMinor(quote.output.amount, quote.output.asset)}</strong>
              </p>
              <p>수수료: {formatMinor(quote.fee.amount, quote.fee.asset)}</p>
              <p>
                유효 시간: {Math.max(0, Math.min(60, Math.ceil((quote.expiresAt - clock) / 1000)))}
                초 · 고정 시험 환율
              </p>
            </div>
          )}
          <button
            type="button"
            className={button + ' ml-2'}
            disabled={
              busy || !available || (!pending.current && (!quote || quote.expiresAt <= clock))
            }
            onClick={create}
          >
            {pending.current ? '이전 요청 결과 확인' : '거래 시작'}
          </button>
        </div>
        <div className="rounded-xl border p-5 space-y-3">
          <div className="flex justify-between">
            <h2 className="text-xl font-semibold">최근 거래</h2>
            <span>
              {balanced === true ? '원장 균형 정상' : balanced === false ? '원장 확인 필요' : ''}
            </span>
          </div>
          {orders.length === 0 ? (
            <p className="text-slate-500">아직 거래가 없습니다.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {orders.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  className={
                    'w-full text-left rounded-lg border p-3 ' +
                    (selected === o.id ? 'border-blue-600 bg-blue-50 text-slate-900' : '')
                  }
                  onClick={() => {
                    setSelected(o.id)
                    setDetail(null)
                  }}
                >
                  <span className="font-medium">
                    {o.kind === 'payment'
                      ? '결제'
                      : o.kind === 'onramp'
                        ? '코인 구매'
                        : '코인 판매'}{' '}
                    · {formatMinor(o.quote.input.amount, o.quote.input.asset)}
                  </span>
                  <span className="block">{states[o.status] ?? o.status}</span>
                  <small className="text-slate-500">{o.id.slice(0, 8)}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
      {detail && (
        <section className="rounded-xl border p-5 space-y-4">
          <h2 className="text-xl font-semibold">거래 상세 · {states[status] ?? status}</h2>
          <p className="text-sm text-slate-500 break-all">{detail.order.id}</p>
          <div className="flex flex-wrap gap-2">
            {[
              ['requires_action', 'authenticate', '추가 인증 완료'],
              ['authorized', 'capture', '결제 확정'],
              ['payment_pending', 'fund', '가상 현금 입금'],
              ['deposit_pending', 'deposit', '가상 코인 입금'],
            ]
              .filter(([s]) => s === status)
              .map(([, a, label]) => (
                <button
                  type="button"
                  key={a}
                  className={button}
                  disabled={busy || operationBusy}
                  onClick={() => action(a!)}
                >
                  {label}
                </button>
              ))}
            {['authorized', 'requires_action', 'payment_pending', 'deposit_pending'].includes(
              status
            ) && (
              <button
                type="button"
                className={control}
                disabled={busy || operationBusy}
                onClick={() => action('cancel')}
              >
                거래 취소
              </button>
            )}
            {['captured', 'partially_refunded'].includes(status) && !detail.order.settledAmount && (
              <button
                type="button"
                className={button}
                disabled={busy || operationBusy}
                onClick={() => action('settle')}
              >
                가맹점 정산
              </button>
            )}
            {['captured', 'partially_refunded', 'settled'].includes(status) && (
              <>
                <input
                  className={control}
                  aria-label="환불 금액"
                  placeholder="환불할 금액"
                  inputMode="decimal"
                  value={refund}
                  onChange={(e) => setRefund(e.target.value)}
                />
                <button
                  type="button"
                  className={button}
                  disabled={busy || operationBusy || !refund}
                  onClick={() => action('refund')}
                >
                  환불 요청
                </button>
                <span>
                  누적 환불: {formatMinor(detail.order.refunded, detail.order.quote.input.asset)}
                </span>
              </>
            )}
          </div>
          {detail.operations
            .filter((o) => ['waiting', 'dead'].includes(o.status))
            .map((o) => (
              <div key={o.id} className="rounded bg-amber-50 text-amber-950 p-3">
                <p>
                  {o.status === 'dead'
                    ? '사업자 응답을 확인하지 못했습니다.'
                    : '사업자 알림을 기다리고 있습니다.'}{' '}
                  재시도 {o.attempts}회
                </p>
                <button
                  type="button"
                  className={control + ' mt-2'}
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await api('simulation/operations/' + o.id, { status: 'succeeded' })
                    })
                  }
                >
                  지연된 성공 알림 보내기
                </button>
                <button
                  type="button"
                  className={control + ' ml-2'}
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await api('simulation/operations/' + o.id, { status: 'declined' })
                    })
                  }
                >
                  거절 알림 보내기
                </button>
              </div>
            ))}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold mb-2">처리 기록</h3>
              <ol className="space-y-2 text-sm">
                {events.map((e) => (
                  <li key={e.id} title={e.type}>
                    {new Date(e.createdAt).toLocaleTimeString()} · {eventLabel(e.type)}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="font-semibold mb-2">원장 기록</h3>
              {journal.length === 0 ? (
                <p className="text-slate-500">아직 확정된 자금 이동이 없습니다.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">계정</th>
                      <th>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.map((j) => (
                      <tr key={j.reference + j.account}>
                        <td className="break-all py-1 pr-3" title={j.account}>
                          {accountLabel(j.account)}
                        </td>
                        <td className="text-right">{formatMinor(j.amount, j.asset)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
