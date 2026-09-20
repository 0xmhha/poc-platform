# 실행과 복구

## 로컬 실험실

루트에서 `pnpm dev:payments`. Node 22.16+의 `node:sqlite`를 사용하므로 experimental 경고가 출력될 수 있다. API 기본 포트 14353, 웹 14300, 호스트 127.0.0.1. 충돌 시 `PAYMENT_LAB_HUB_PORT`, `PAYMENT_LAB_WEB_PORT`로 변경한다. 이 실행기는 실제 provider mode를 활성화하지 않는다.

PG: 견적 확인 → 거래 시작 → 승인 확인 → 결제 확정 → 부분 환불 또는 가맹점 정산. 온/오프램프: 종류 선택 → 가상 본인확인 승인 → 견적 → 거래 → 입금 확인. 실패 시나리오를 고르면 보상이 자동 진행된다. timeout은 재시도 소진까지 기다린 뒤 지연 결과를 적용할 수 있다. uncertain 요청은 브라우저 sessionStorage의 동일 멱등 키로 재확인한다.

## 서비스 단독 실행

`pnpm --filter @stablenet/payment-hub build` 후 해당 디렉터리에서 아래 환경을 주입해 `node dist/main.js`로 시작한다. 환경 파일을 자동 읽지 않는다. `.env`나 키를 저장소에 커밋하지 않는다.

| 환경 변수 | 값 |
|---|---|
| PAYMENT_MODE | simulator 또는 provider, 기본 simulator |
| PAYMENT_DATABASE | 기본 `./data/payments.sqlite`, 쓰기 가능한 영속 경로 |
| HOST / PORT | 기본 127.0.0.1 / 4353 |
| PAYMENT_API_KEYS | `[{"key":"32자 이상의 무작위 키","merchantId":"merchant-a","role":"merchant"}]` JSON 배열; operator는 별도 키 |
| PAYMENT_WEBHOOK_SECRET | gateway 수신 HMAC 비밀, 최소 32자 |
| PAYMENT_WEBHOOK_TARGETS | `{"merchant-a":{"url":"https://merchant.example/events","secret":"별도 32자 이상의 비밀"}}`, 미설정 `{}` |
| PAYMENT_PROVIDER_NAME | 소문자 영문 시작, 영숫자/밑줄/하이픈, 최대 40자 |
| PAYMENT_PROVIDER_URL / TOKEN | provider 모드의 HTTPS gateway와 서버 전용 token |

웹 서버는 `PAYMENT_LAB_ENABLED=true`, `PAYMENT_HUB_URL`, `PAYMENT_LAB_API_KEY`, `PAYMENT_LAB_ORIGIN`(예: `http://127.0.0.1:14300`)을 사용한다. reverse proxy 환경에서는 실제 공개 origin을 명시하고 요청 헤더를 신뢰해 origin을 바꾸지 않는다. Lab은 가상 operator용 화면이며 실제 provider 백엔드 연결을 거절한다.

## 장애 복구

1. GET `/ready`로 DB 연결 확인. 가맹점 키로 `/v1/reconciliation`의 unresolved 작업과 alerts를 조회한다. balanced=true는 내부 원장 합계 검사다.
2. 응답 유실은 기존 Idempotency-Key로 API를 다시 호출한다. 새 reference나 새 결제 키로 대체하지 않는다.
3. waiting/dead 작업은 `/v1/operations/:id/reconcile`로 사업자 결과를 확인한다. 기본 처리기는 30초마다 최대 20건을 자동 조회한다.
4. 불확정 dead 작업을 다시 보낼 경우 `/v1/operations/:id/retry`가 동일 operation ID를 보존한다. 사업자도 해당 ID를 멱등 처리해야 한다. 확정 거절된 환불/보상은 review_required에서 별도 명령으로 재시도한다.
5. 가맹점 webhook 수신기를 복구한 뒤 dead delivery를 `/v1/deliveries/:id/retry`로 다시 발송한다. event ID는 바뀌지 않는다. HTTP 2xx 이외는 전달 실패다.
6. SIGTERM은 새 연결/작업을 중단하고 실행 중 HTTP와 worker가 끝나기를 최대 15초 기다린다. 비정상 종료 후 lease가 만료되면 동일 명령을 다시 처리한다.

계속 실패하는 보상은 원장 값을 직접 수정해 완료로 바꾸지 않는다. provider 증빙 확인 후 복구 경로를 사용한다. alerts는 감사 기록으로 보존되어 해결 뒤에도 과거 경보가 남는다.

## 저장소와 백업

DB 디렉터리는 프로세스 사용자만 접근하도록 둔다. 단일 writer 운영을 전제로 한다. 가장 간단한 일관된 백업은 서비스를 정상 종료한 뒤 SQLite DB와 존재하는 `-wal`, `-shm` 파일을 함께 보관하는 것이다. 복구도 종료된 서비스에서 수행하고 준비 상태, 주문 목록, 원장 대사, 미완료 작업을 확인한다. 실행 중 주 DB 파일만 복사하지 않는다. 키와 DB 백업은 별도로 보호한다.

원장/이벤트의 자동 삭제는 구현하지 않았다. 거래량 증가 시 보존·아카이브 정책과 tenant별 인덱스/서버형 DB가 필요하다. 현재 목록 API는 최근 100건까지 반환한다. 실제 은행 명세서 대량 수입, 차지백, 분쟁 및 PG 수수료 정산은 이번 시뮬레이터의 범위 밖이다.

## 검증 명령

```sh
pnpm --filter @stablenet/payment-hub test
pnpm --filter @stablenet/payment-hub typecheck
pnpm exec turbo run test typecheck --env-mode=loose --concurrency=4
# poc-contract에서
forge test --offline
```

HTTP 통합 테스트는 loopback 포트 바인딩이 필요하다. 별도 테스트용 DB/키를 생성하고 종료 후 삭제한다. 운영 키나 서비스는 사용하지 않는다. 기본 simulator에서 외부 결제망·실체인에 접근하지 않는다.
