# 전체 기능 검토 및 개선 — 2026-09-20

대상은 `stable-platform`과 `poc-contract`의 현재 작업 트리다. 결제 구현을 전체 프로젝트 완료로 간주하지 않고, 웹의 모든 화면 경로, 지갑 확장, SDK, 서비스, 계약의 기능 영역을 다시 검토했다. 기존 사용자 변경은 보존했다. 배포·실제 자금 전송·커밋·푸시는 수행하지 않았다.

## 기능별 검토와 변경

| 영역 | 확인한 문제와 반영 사항 | 주요 코드/검증 |
|---|---|---|
| 지갑·키·연결 | 연결 계정/체인 범위, 권한 조회와 키 보관 경로 검토. 스왑에서 USD 가격을 실행 견적으로 쓰던 로직 제거. 설치된 실행기의 Quoter로 실제 견적을 조회하고 만료·양수 최소 수령량·체인 일치를 확인. RPC nonce 오류를 0으로 대체하지 않음 | wallet-extension `SwapPage`, RPC `operations`, wallet-sdk; 확장 전체 테스트 |
| 체인·주소·자산·거래 내역 | 지원하지 않는 체인을 로컬 체인으로 대체하지 않음. 배포 원본의 유효 주소만 사용. 모듈 설치 체인 전달, 거래 내역 계정 전환/오래된 비동기 응답 검사 | `StableNetProvider`, `moduleAddresses`, `useModuleInstall`, `useTransactionHistory` |
| 스마트 계정·복구 | 가상의 RecoveryManager ABI를 실제 WeightedECDSAValidator로 교체. guardian 연결 목록, 정렬된 주소/가중치, uint24 한계, threshold와 delay 인코딩 적용. 설치·갱신 시 0 또는 총합 초과 threshold 거절 | `useRecoveryModule`, `contracts/recovery`; WeightedECDSA 계약 회귀 테스트 |
| 세션 키 | 실제 SessionKeyExecutor API와 권한 조회 연결. 브라우저 키 보관을 계정/체인/세션별로 분리. 확정 전 키 보관 방지. 폐기/재설치 후 이전 권한과 서명 nonce가 재사용되지 않음. 네이티브 한도 0을 무제한으로 표시하던 오류 수정 | `useSessionKey`, `sessionKeyVault`; 세션 계약·웹 테스트 |
| UserOp·Bundler | UserOp 해시와 거래 해시 구분. 실제 receipt 성공만 확정 처리. 시간 초과는 submitted로 유지하고 계정/체인 범위에서 재조회. 수수료 인상·취소 시 소유권 확인 및 RPC 장애 전파. 기존 Bundler 검증·nonce·번들 회귀 검사 실행 | `useUserOp`, `useTransactionManager`; timeout/revert 회귀 테스트 및 Bundler 전체 테스트 |
| Paymaster | sponsor/token/permit2, stub/final 데이터와 기존 ABI·예약·정산 변경 검토 및 회귀 검사. Oracle 장애 시 환율 `0`을 만들지 않고 paymaster의 실제 on-chain 견적을 사용하며, 견적할 수 없는 토큰은 지원 목록에서 제외. 지갑도 proxy 장애 시 주소 설정만 보고 USDC 지원을 추정하지 않음. 실행 결제의 사업자 승인과 가스 대납을 별도 처리 | paymaster-proxy, SDK/wallet paymaster, 관련 계약 테스트 |
| PG·은행·온/오프램프 | 영속 Payment Hub의 견적·승인·확정·환불·정산·KYC·보상·outbox·대사·멱등성 재검증. 사업자 교체 인터페이스와 시뮬레이터 유지 | Payment Hub 31개 테스트, 이전 HTTP/브라우저 검증 기록 |
| 구독·가맹점·반복 결제 | 실제 executor ABI/인자 순서/이벤트 사용. pause/resume 계약 API 추가. 이벤트 없는 권한 발급에서 임의 ID를 만들던 fallback 제거. 현재 체인의 실제 배포와 USDC/WKRC 정보만 사용하고 가맹점별 plan/event를 분리. 블록 시간으로 결제 시계열을 만들며 실패 이벤트가 없는 상태에서 성공률·실패 건수를 추정하지 않음. 실행기 signer/DB/권한 조회 실패를 성공으로 우회하지 않음 | `useRecurringPayment`, `useSubscription`, `useSubscriptionEvents`, subscription-executor, 계약 pause/resume 테스트 |
| 구독 재시작·중복 지급 | 네트워크 전송 전에 결정적 UserOp 해시 영속화. 응답 유실·시간 초과·재시작 시 같은 해시를 조회. receipt 기록과 다음 결제일/횟수 갱신을 PostgreSQL 트랜잭션으로 묶고 동시 확정을 멱등 처리 | repository journal/finalization 테스트, 서비스 RPC quantity 테스트, Go race 검사 |
| 스왑·라우터 | 존재하는 HTTP API와 V2/V3 calldata 형식에 맞춤. 승인 전 router/수령인/token/입력/최소 출력/value/deadline 검사. 승인 후 견적 재확인. V2 가짜 reserves 제거, V2/V3 factory에서 실제 풀 조회. V3 dynamic tuple offset 수정 | `useSwap`, `contracts/swap`, order-router; 웹 10개 스왑 회귀 및 Go 테스트 |
| 스테이킹 | 고정 데모 풀 대신 설치 실행기의 허용 풀과 실제 Vault config/stake/rewards 조회. 단위·잠금·페널티 표시. 다른 보상 토큰의 환율 없는 APR을 계산하지 않음. allowance/receipt 검증 | `useStaking`, `defiReads`, StakingVault/Executor 계약 테스트 |
| 대출 | 데모 시장/빈 포지션을 실제 허용 자산·reserve·잔액·누적 부채·health factor 조회로 교체. RAY 연율을 APR로 표시. 공급·인출·차입·상환은 확정 이후 상태 갱신 | `useLending`, `defiReads`, LendingPool/Executor 계약 및 불변식 테스트 |
| 유동성 | 없는 pools/positions HTTP 대신 V2 factory/pair 및 V3 NFT position 조회. LP 지분을 실제 totalSupply로 계산. V3 mint/decreaseLiquidity/collect, 정수 TickMath, NFT 소유권·token 확인. 확인되지 않은 TVL/APR은 unavailable 표시 | `usePools`, `usePoolLiquidity`, `contracts/liquidity`, `tickMath`; 실제 읽기/정밀도 테스트 |
| 프라이버시 | 스텔스 meta-address 형식·체인 제한. 출금은 파생 주소 일치·현재 잔액·가스·receipt 확인. Rust 서버에서 전체 설정 로그 제거, DB migration 실패 시 중단, 저장 실패/removed/다른 emitter 이벤트를 신규 입금으로 전파하지 않음 | `useStealth`, stealth-server; Rust 14개 고유 테스트와 웹/SDK/계약 테스트 |
| 기업 급여·경비·감사 | 계정/체인별 기록 분리. 금액 bigint 유지, 다른 자산 합산 방지, 월말 일정 계산. 급여·승인 경비를 실제 wallet 지급과 연결하고 지급 저널로 중복 제출 차단. 사용자 거절, 확정 revert, 제출 결과 불명 상태를 구분해 불명 제출을 자동 재지급하지 않음. 확정 해시/지급 이력/감사 기록 저장. 근거 없는 Compliant 표시 제거 | enterprise hooks/pages, `useEnterprisePayment`, records 정밀도·일정·제출 저널 테스트 |
| 브리지 | source 이벤트 인덱스·fee·nonce·deadline 및 canonical requestId를 계약과 통일. 가짜 MPC 서명 fallback 제거. source replay, target 등록/도전 기간/승인/완료 조회와 재시도 연결. atomic journal·단일 프로세스 파일 잠금·재시작 복구. 실제 가디언 제안/사기 증거/동기화 조회 | SecureBridge, bridge-relayer; 이벤트 ABI·journal·동시 잠금·실제 RPC ABI fixture·Go race 테스트 |
| 레지스트리·마켓플레이스 | 모듈 레지스트리 영속 저장/쓰기 실패 rollback. 데모 주소·임의 감사/설치/평점 수치 제거, seed 명시적 활성화. 현재 체인에 실제 배포된 모듈만 노출하고, 설정·서명 라우팅이 아직 연결되지 않은 모듈은 이유와 함께 설치 비활성화. MultiSig와 SpendingLimit 설치 데이터를 실제 계약 ABI로 인코딩. 공식 등록과 보안 감사를 구분. 계약 레지스트리 원자 snapshot·저장 직렬화·응답 전 저장 완료·손상 파일 거절 | `useModuleRegistry`, marketplace components, 두 registry의 재시작/손상/동시 저장 테스트 및 기존 API 권한 테스트 |
| 배포·운영·분석 | DeFi/Uniswap 이후 실행기 배포 순서로 변경해 LendingPool/Quoter 의존성 충족. compiler ABI 동기화·drift 검사 도구 추가. 23개 workspace에 비대화형 `test:ci`를 연결하고 Vault 테스트의 자동 잠금 타이머를 정리해 CI가 정상 종료하도록 수정. 외부 Google font와 선택적 Base connector가 없어도 웹 production build가 가능하도록 구성. Rust를 포함한 AST 그래프 재생성. 미배포 구성이나 RPC 장애를 정상/데모 데이터로 덮지 않음 | `poc-contract/script/ts/deploy-all.ts`, `turbo.json`, package scripts, `scripts/contracts`, `scripts/code-graph` |

## 실행 및 운영 조건

- 새 ABI는 `poc-contract` 빌드 산출물에서 생성한다. `node scripts/contracts/sync-runtime-abis.mjs --check`로 drift를 확인한다. SessionKeyExecutor의 권한 목록과 nonce 정리, RecurringPaymentExecutor의 pause/resume, SecureBridge의 이벤트/requestId는 기존 배포 계약에 자동 반영되지 않는다. 계약 배포/주소 갱신과 프런트/relayer 버전 전환을 함께 수행해야 한다.
- 브리지는 `CONTRACT_SOURCE_BRIDGE`와 target의 `CONTRACT_SECURE_BRIDGE`, verifier/guardian 주소, signer endpoint, relayer 권한을 설정한다. `MONITOR_SOURCE_START_BLOCK`/`MONITOR_TARGET_START_BLOCK`은 마지막 처리 블록 기준이다. 최초 실행은 배포 직전 블록을 지정한다. `BRIDGE_STATE_FILE`은 영속 볼륨에 두며 하나의 relayer가 사용한다. authorization deadline은 target challenge period와 확인 시간을 포함해야 한다. 만료/실패 건의 source 환불은 별도 확인이 필요하다.
- 구독은 signer가 계정의 실제 validator 정책을 만족해야 한다. PostgreSQL을 지정하면 연결 실패 시 임시 메모리 저장으로 전환하지 않는다. 전송 응답 유실은 새 nonce로 재지급하지 않는다. hash가 없는 과거 pending 또는 네트워크에 도달했는지 알 수 없는 지급은 운영자가 확인해야 한다. DB 원자 확정 코드는 구현했으며 실제 PostgreSQL 장애 주입 검증은 아래 남은 조건에 포함된다.
- 모듈 레지스트리는 `MODULE_REGISTRY_DATA_FILE`(기본 `./data/modules.json`)을 보존한다. 예제 목록은 `SEED_DATA=true`에서만 생성하며 배포·감사 증빙은 운영자가 등록한다. 계약 레지스트리의 새 `registry.json`은 계약과 주소 세트를 함께 저장하며, 파일이 없을 때 기존 `contracts.json`/`sets.json`을 읽는다.
- 지갑 스왑 실행기는 ERC-20 쌍을 사용한다. 네이티브 자산은 먼저 래핑한다. aggregator의 임의 calldata는 수령인/최소 수령량을 검증하는 전용 어댑터가 생기기 전 실행을 거절한다. native DEX 경로는 검증된 router로 실행한다.
- 풀 탐색은 1,000개 초과 시 오류로 알린다. 대규모 인덱서 페이지네이션은 별도 확장이 필요하다. 가격 oracle/거래량 데이터가 없으면 USD TVL/APR을 생성하지 않는다.
- 기업 기록은 현재 브라우저/계정/체인 범위의 로컬 기록이며, 공동 조직 DB·서버 RBAC·불변 감사 원장이 아니다. 지급은 연결 지갑으로 실행하지만 조직 전체 승인/회계 시스템의 구현과 이관은 남아 있다. 스텔스 서버의 장기 재조직 처리도 인덱서와 함께 검증해야 한다.

## 검증 범위와 남은 운영 검증

초기 전 범위 build/typecheck/test 84/84와 계약 1,675/1,675, 변경한 Go 서비스 race 검사, Rust 서비스 테스트를 통과했다. 최종 변경 뒤에는 캐시 없는 `turbo run test:ci`를 다시 실행해 의존 빌드를 포함한 55/55 작업을 통과했고, 웹 production build와 184개 웹 테스트, 1,257개 지갑 테스트를 같은 실행에서 확인했다. 자세한 수치·로그는 [검증 결과](VERIFICATION.md)에 기록한다.

이 검토는 실제 운영 준비 완료나 외부 감사를 의미하지 않는다. 운영 전에는 새 계약이 배포된 두 체인의 브리지 통합 테스트, PostgreSQL 실제 장애/복구 시험, 조직 권한 서버, 실사업자 gateway 자격 증명 및 sandbox 인증, 부하/복구/외부 보안 검증이 필요하다. 아직 구현되지 않은 조직 서버나 aggregator adapter를 완료된 기능으로 표시하지 않는다.
