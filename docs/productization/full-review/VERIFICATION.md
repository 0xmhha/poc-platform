# 전체 기능 검증 — 2026-09-20

검사 대상은 platform `d2557ce134eb6cebb881f933420c431e2d8e6bde`와 contracts `f5dab8551a0c8437ef97c5c0e7ff224cea65c9df`에 미커밋 변경을 포함한 작업 트리다. [전체 검토 및 운영 조건](WORKLOG.md), [검증 로그 요약](verification-summary.txt).

| 검사 | 결과 |
|---|---|
| `pnpm exec turbo run test:ci --force --concurrency=6` | **55/55 성공**, 캐시 0; 32개 workspace 범위, 23개 workspace의 실제 `test:ci`와 의존 빌드 실행 |
| `pnpm exec turbo run build typecheck test --force --concurrency=6` | **84/84 성공**, 캐시 0 |
| 웹 | **184/184**, 31개 테스트 파일; production build 및 33개 route 생성 통과 |
| 지갑 확장 | **1,257/1,257**, 51개 suite; Vault timer 정리 후 Jest 정상 종료 |
| Payment Hub | **31/31** |
| Paymaster Proxy | **196/196**, 11개 테스트 파일; 가격 불명 토큰 제외 회귀 포함 |
| 모듈 레지스트리 | **4/4**; 재시작, 손상, rollback, 예제 증빙 |
| 계약 레지스트리 | **42/42**; 기존 API/권한 및 원자 snapshot/저장 직렬화 |
| `poc-contract` 전체 Forge | **1,675/1,675**, 60개 suite, 실패/skip 0 |
| bridge-relayer, subscription-executor, order-router `go test -race ./...` | 모두 통과 |
| Rust stealth-server `cargo test --locked --offline` | **14개 고유 테스트** 통과(lib/bin 각각 실행), 실패/ignore 0 |
| 주요 신규/수정 로직 15개 파일 Biome lint | 오류·경고 0 |
| compiler runtime ABI `--check` | 통과 |
| 배포 스크립트 `--dry-run` | 통과; Uniswap/DeFi 다음에 executors 실행 |
| 두 저장소 `git diff --check` | 통과 |

## 확인한 실패 시나리오

- UserOp receipt timeout과 revert를 성공으로 표시하지 않는다.
- 원본 계정과 다른 거래의 대체/취소를 거절한다.
- session 키 등록 실패 시 signer를 보관하지 않는다. 폐기/재설치 전 권한·서명 재사용을 거절한다.
- recovery threshold가 0이거나 guardian 가중치 총합을 초과하면 거절한다.
- swap router/recipient/value/minimum/deadline 변조 및 만료 견적을 거절하고 allowance reset도 확정 후 진행한다.
- 실제 LP totalSupply 기준 지분과 V3 TickMath 경계/정수 정밀도를 확인한다.
- 서로 다른 자산의 급여 합산, bigint 정밀도 손실, 월말 일정 넘김을 방지한다.
- 구독 pending 지급을 중복 생성하지 않고, 동시에 receipt를 처리해도 결제 횟수를 한 번만 증가시킨다.
- bridge fee/nonce/deadline을 포함한 이벤트와 source/target requestId를 일치시킨다. pending 거래는 journal 재시작 후 유지하며 두 프로세스가 같은 journal을 쓰지 못한다.
- guardian 제안의 실제 ABI 응답으로 조회·종결 제거를 검증한다. 검증기가 없는 사기 증거를 byte 길이만으로 인정하지 않는다.
- registry의 손상 snapshot을 빈 데이터로 대체하지 않으며 저장 실패를 성공 응답으로 처리하지 않는다.

## 해석 범위

로컬 테스트와 빌드는 통과했지만 실사업자 인증, 운영 두 체인 브리지 통합, 실제 PostgreSQL 장애 주입, 공동 조직 RBAC/감사 서버, 대규모 풀 페이지네이션, 외부 감사는 완료된 것으로 간주하지 않는다. 금융 지급의 응답 유실을 자동 재지급으로 해결하지 않는다. 검토 기록의 미구현/운영 조건을 따른다.

지갑 빌드에는 큰 번들 chunk와 오래된 Browserslist 데이터 경고가 있고 일부 React 테스트에는 `act(...)` 경고가 남는다. Rust에는 사용하지 않는 코드 경고가 있다. optional Base connector가 없는 환경의 웹 빌드 경고는 alias 처리로 제거했다. 실패한 검사나 건너뛴 계약 테스트로 숨기지는 않았다.

## AST 산출물

TypeScript/JavaScript 1,109개, Go 251개, Rust 17개, Solidity 124/124개 파일을 파싱했다. 총 1,501개 파일, 노드 24,117개, 관계 87,693개이며 parser issue·중복 노드·출발 노드 누락은 0이다. Rust 매크로는 확장 결과가 아닌 호출 구문으로 기록하며, Go/Rust 동적 dispatch를 해결된 호출로 주장하지 않는다.

소스 fingerprint: `85037e9b1f138e19b802754161b2bbc64d6e4fcce11204d372bce5a51d59ee73`. [AST 목록](../graph/INVENTORY.md), [그래프 탐색기](../graph/explorer.html). 계약 범위는 `src`이며 TS/Go/Rust 목록에는 테스트·도구 파일도 포함한다.
