# 기능 분석과 고도화 기준

대상은 `poc-platform`의 현재 코드다. TypeScript compiler API, Go parser, Rust syn, Solidity compiler AST에서 파일·선언·import·call·inheritance 관계를 추출한다. Go 호출은 구문 수준이며, TypeScript 동적 호출·외부 API·체인 실행은 정적 호출 그래프로 확정하지 않는다.

## 확인된 기능

| 기능 | 주 구현 | 분석 결과와 이번 처리 |
|---|---|---|
| 지갑·서명·키·체인 연결 | apps/wallet-extension, packages/wallet-sdk | 모듈형 지갑 및 연결·세션 분리. 이전 검토의 세션/주소/ABI 수정 유지, 전체 회귀 검사 대상 |
| 스마트 계정·모듈 | packages/sdk-ts, poc-contract/src/erc7579-* | Kernel, ECDSA/WebAuthn/MultiSig, SessionKey, hook/executor. ABI 및 bytecode 크기 검증 유지 |
| UserOperation·가스 대납 | services/bundler, paymaster-proxy, erc4337-* | nonce·stub·한도 예약 수정 유지. 결제 사업자 승인과 on-chain 가스 대납을 별개 도메인으로 취급 |
| 거래 내역·자산 조회 | apps/web/hooks, indexer client | 일반/실패 거래와 토큰 로그 병합. 결제 사업자의 주문/정산 내역은 새 결제 원장으로 분리 |
| PG | services/pg-simulator | 카드 승인·3DS·환불·checkout·정산. in-memory map, 비동기 goroutine, 일부 float 금액 검사. 기존 데모 API는 유지하되 신규 결제의 기준 원장으로 사용하지 않음 |
| 온램프 | services/onramp-simulator | KYC·quote·PG/은행 연동·crypto transfer·refund. 주문 상태가 메모리이고 sleep/확률 기반 송금이며 TxHash는 임의 생성. 신규 흐름은 영속 payment-hub로 대체 |
| 은행 | services/bank-simulator | 계좌/입금/출금/debit 요청 데모. 실제 은행 계정 또는 자금 증빙으로 취급하지 않음 |
| 오프램프 | 신규 services/payment-hub | USDC 입금 확인 → 현금 지급, 실패 시 코인 반환. 실제 사업자와 같은 command/result 인터페이스 |
| 구독 | plugin-subscription, subscription-executor, subscription contracts | recurring authorization/실행. 이전 deadline ABI 수정 유지. 신규 일회성 PG 주문과 기존 구독 온체인 권한을 혼동하지 않음 |
| DeFi | plugin-defi, executors, LendingPool/StakingVault | swap/staking/lending 실행. 결제 사업자의 환율·유동성을 DeFi 견적과 자동 혼합하지 않음 |
| Privacy/Compliance/Bridge | poc-contract/src/privacy, compliance, bridge | stealth 출금·역할·감사·KYC·브리지. 기존 자산 이관이나 실체인 역할 변경은 수행하지 않음 |

## 결제 경로 고도화

`Payment Lab → 서버 전용 API 프록시 → Payment Hub → Provider 인터페이스 → Simulator 또는 HTTPS Provider Gateway`

- 거래·견적·처리 명령·서명 이벤트·원장·발송 대기열은 SQLite WAL의 원자적 트랜잭션으로 저장한다.
- 네트워크 호출은 DB 트랜잭션 밖에서 실행하고 고정 operationId를 사업자 멱등 키로 전달한다.
- 승인, 확정, 취소, 부분/전액 환불, 가맹점 정산, 추가 인증, 입금 대기, crypto delivery, fiat payout, 실패 보상을 구분한다.
- 응답 유실과 시간 초과를 성공/실패로 추측하지 않는다. 동일 작업 재시도 후 대사/지연 webhook으로 확인한다.
- 새 API는 카드 번호·CVV·은행 원문을 받지 않는다. 결제 수단·수취인은 사업자의 토큰/참조를 사용하는 어댑터 경계에서 처리한다.
- 금액은 KRW 0자리, USD 2자리, USDC 6자리 최소 단위의 정수 문자열이다. 계산은 BigInt, 변환은 내림, 수수료는 올림이다.
- 가상 고정 환율은 Simulator에만 존재한다. Provider 모드의 견적은 사업자 gateway에서 가져온다.
- 본인확인과 일일 누적 한도, tenant 분리, 인증 키, timestamp/HMAC/replay 검사, webhook retry/dead-letter, 원장 대사 경로를 제공한다.

## 운영 범위

이 구현은 단일 노드의 영속 결제 서비스와 사업자 연동 경계다. 외부 PG/은행/온오프램프 업체의 계약·인증·실제 자금 이동을 완료했다고 표시하지 않는다. 사업자 gateway는 문서의 계약에 따라 업체 SDK/API·status·webhook을 변환해야 하며, 운영 전 vendor sandbox에서 동일 적합성 테스트를 수행해야 한다. 다중 리전/다중 writer 배포에는 repository를 서버형 DB로 교체해야 한다. 기존 지갑·DeFi·브리지 전체에 대한 독립 보안 감사나 운영 SLA는 결제 시뮬레이터의 테스트 통과와 구분한다.
