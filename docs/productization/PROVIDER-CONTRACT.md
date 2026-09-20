# API와 사업자 연동 계약

구현의 정확한 타입은 `services/payment-hub/src/domain.ts`, `providers.ts`, 라우트는 `app.ts`를 기준으로 한다. 새 사업자는 `Provider`를 구현하거나 기존 `HTTPProvider`가 호출하는 아래 Gateway를 구현한다. PG/램프별 SDK 및 상태 이름은 Gateway 안에서 변환한다.

## 가맹점 API

`Authorization: Bearer <merchant API key>`로 인증한다. 키는 서버에서만 보관한다. 요청 본문은 JSON, 최대 64 KiB이며 정의되지 않은 필드는 거절한다. tenant는 인증 키에서 결정한다. 시간은 epoch milliseconds, webhook 서명 timestamp만 epoch seconds다.

| 메서드·경로 | 본문 또는 응답 |
|---|---|
| GET /health, /ready | 프로세스/DB 상태, 인증 불필요 |
| GET /v1/capabilities | simulated, provider, kinds, assets |
| POST /v1/quotes | `{kind,input:{asset,amount},fiatCurrency?}` → Quote |
| POST /v1/orders | `{quoteId,customerId,reference,scenario?,destination?,paymentMethodToken?}` → Order, 201 |
| GET /v1/orders?limit=50 | `{orders}`, 최근 순서, 최대 100 |
| GET /v1/orders/:id | `{order,operations}` |
| POST /v1/orders/:id/actions/:action | `{}` 또는 refund의 `{amount}` → 수락 시 Order, 202 |
| GET /v1/orders/:id/events | `{events}` |
| GET /v1/orders/:id/ledger | `{entries}` |
| GET /v1/reconciliation | 자산별 원장 균형, 미해결 작업 및 경보 |
| POST /v1/operations/:id/reconcile | operator: 사업자 조회로 미확정 작업 복구 |
| POST /v1/operations/:id/retry | operator: dead 작업은 동일 ID로, 확정 거절된 보상은 새 명령으로 재시도 |
| GET /v1/deliveries | operator: 이벤트 전달 상태 |
| POST /v1/deliveries/:id/retry | operator: dead 이벤트 다시 발송 |
| GET /v1/metrics | operator: 프로세스 요청/오류 카운터 |
| POST /v1/simulation/kyc | operator + simulation: `{customerId,status:"approved" 또는 "rejected"}` |
| POST /v1/simulation/operations/:id | operator + simulation: `{status:"succeeded" 또는 "declined"}` 지연/소진 작업 해소 |

생성과 action에는 `Idempotency-Key`가 필수다(8~120자 영숫자/밑줄/점/콜론/슬래시/하이픈). 같은 key+본문은 저장된 최초 응답을 반환하고 다른 본문이면 409다. 응답 유실 시 같은 키와 본문으로 재시도하고 최신 상태는 GET으로 확인한다. 202는 처리 완료가 아니다. reference는 가맹점별로 유일하고 한 견적은 한 주문만 생성할 수 있다. 키 보존 기간은 현재 무기한이다.

공개 action: capture, settle, cancel, refund, authenticate, fund, deposit. 마지막 세 동작은 시뮬레이션에서만 수동 확인한다. 실제 모드는 provider가 start 후 authenticate/fund/deposit 결과를 확정해야 한다. 코인 송금 transfer와 현금 지급 payout 및 보상 return_crypto는 엔진 내부에서만 생성한다.

오류는 `{error:{code,requestId}}` 형태다. 400 입력/키, 401 인증/서명, 403 권한/KYC, 404 tenant 내 미존재, 409 상태/중복 충돌/견적 만료, 422 한도·증빙, 429 요청 제한, 5xx 서비스 오류를 구분한다. 금액은 양의 최소단위 정수 문자열(최대 18자리), 수수료는 0 허용이다. 카드번호/CVV/계좌 원문은 지원하지 않는다. 실제 결제와 온램프는 `pm_...` 사업자 토큰이 필수이고, 오프램프는 `beneficiary_...` 수취인 토큰을 사용한다. 온램프 목적지는 0이 아닌 EVM 주소다.

## Gateway HTTP 계약

기본 URL은 HTTPS, bearer token 필수, redirect 금지, 8초 timeout이다. 공급자 키나 고객의 토큰을 로그에 기록하지 않는다.

1. `POST /quotes`: `{merchantId,kind,input,fiatCurrency}`. 서버가 Quote 전체를 반환한다: UUID id, merchantId, kind, input, output, fee, rateNumerator, rateDenominator, createdAt, expiresAt. 환율은 **순입력 최소단위 → 출력 최소단위**의 유리수다. 만료는 현재 이후 최대 15분. `fee.asset === input.asset`, fee < input. onramp 출력 USDC, offramp 출력 fiatCurrency, payment 입출력 자산 동일. 금액·수수료 계산과 실제 실행 약정은 Gateway가 일치시켜야 한다.
2. `POST /operations`: `{id,orderId,merchantId,action,amount?,order}`. HTTP Idempotency-Key도 id와 동일하다. Gateway는 DB에 id↔사업자 operation 참조를 저장하고, POST 재수신 시 부작용을 중복 실행하지 않는다. 여러 사업자를 쓰면 이 매핑에 라우팅 결정도 저장한다.
3. `GET /operations/:id`: 알려진 결과를 반환한다. 미확인/진행 중이면 pending, 미존재면 404다. 404/timeout을 실패 확정으로 변환하지 않는다.

응답 예시:

```json
{"operationId":"command-uuid","orderId":"order-uuid","providerRef":"stable-order-reference","status":"succeeded","evidence":"provider-receipt-reference"}
```

status는 succeeded/pending/declined/requires_action이다. `providerRef`는 주문 수명 동안 일정해야 하며 단계별 거래 ID는 evidence에 넣는다. reason은 200자 이내, evidence는 300자 이내다. 실모드 capture/settle/fund/deposit/transfer/payout/refund/return_crypto 성공은 증빙이 필수다. Gateway는 PSP webhook 서명과 금액/통화/수취인/확정성(체인의 경우 confirmations/reorg 정책)을 검증한 뒤 succeeded로 정규화해야 한다. 여기서 문자열 존재 검사는 증빙 진위 검증의 대체가 아니다.

사업자별 hosted checkout/3DS 화면은 Gateway/가맹점 애플리케이션에서 제공한다. `requires_action` 이후 authenticate 명령은 그 결과를 조회하는 동작이다. 엔진이 고객 대신 인증을 완료하지 않는다. PG의 수수료 정산 및 후속 chargeback/dispute API는 이 초기 정산 모델의 별도 확장 영역이다. 이 버전의 가맹점 PG quote는 수수료 0의 gross settlement 모델이며, 램프만 quote 수수료를 반영한다.

## 수신 webhook

`POST /webhooks/<PAYMENT_PROVIDER_NAME>`로 전송한다. 본문:

```json
{"id":"unique-event-id","type":"operation.updated","data":{"operationId":"command-uuid","orderId":"order-uuid","providerRef":"stable-order-reference","status":"succeeded","evidence":"provider-receipt-reference"}}
```

`x-webhook-timestamp`는 초 단위 정수 문자열이다. `x-webhook-signature`는 `HMAC-SHA256(secret, timestamp + "." + rawBody)`의 hex다. ±300초 창을 적용한다. 수신자는 JSON을 다시 직렬화하여 검증하면 안 된다. 동일 event ID와 다른 결과는 409다. event ID는 8~150자.

KYC 알림은 type `kyc.updated`, data는 `{merchantId,customerId,status,expiresAt,version}`이다. status는 approved/rejected, version은 고객별 양의 단조 증가 정수다. 이전 version은 현재 판정을 바꾸지 않고 같은 version의 다른 내용은 거절한다. KYC 만료는 현재 이후 최대 366일이다. 고객 한도는 24시간 생성된 미취소 주문 입력금액 기준 KRW 10,000,000 / USD 1,000,000 cents / USDC 10,000,000,000 units다. 이 기본 위험 정책은 실제 사업자 정책에 맞춰 교체한다.

## 가맹점 발송 webhook

`PAYMENT_WEBHOOK_TARGETS`에 가맹점별 고정 HTTPS URL/별도 secret을 설정한다. 이벤트에는 id, merchantId, orderId, type, version, createdAt, data가 포함된다. x-event-id, timestamp, signature 헤더를 사용한다. 2xx면 성공, 8회까지 지수 backoff 후 dead로 남긴다. 수신자는 event ID를 저장하고 중복을 무시하며 주문 version으로 역순 알림을 처리한다. 대상 미설정은 disabled로 남고 성공 전송으로 표시하지 않는다.

적합성 테스트 `services/payment-hub/tests/http.test.ts`는 실제 로컬 HTTP Gateway에서 처리 완료 뒤 503이 발생하는 경우를 검증한다. 새 사업자의 sandbox에서도 같은 테스트 시나리오와 취소·부분환불·KYC·입출금 증빙 검증을 적용한다.
