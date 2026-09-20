# 최초 결제 고도화 검증 결과 — 2026-09-19

전체 기능 후속 변경의 최신 검증은 [전체 기능 검증](full-review/VERIFICATION.md)을 참조한다. 아래 수치는 최초 결제 구현 시점의 기록이다.

대상은 stable-platform HEAD `d2557ce`, poc-contract HEAD `f5dab85`와 기존 미커밋 변경을 포함한 작업 트리다. 이번 결제 구현은 stable-platform에 추가했고 poc-contract의 기존 소스 변경은 유지했다.

| 검사 | 결과 |
|---|---|
| 전체 플랫폼 `turbo run test typecheck --env-mode=loose --concurrency=4 --force` | **84/84 작업 성공**, 캐시 0, 약 1분 52초; 의존 빌드 포함 |
| Payment Hub | **31/31** 테스트 성공: 도메인, HTTP, 재시작, 사업자 어댑터, 복구 |
| 웹 | **161/161**, 27개 테스트 파일; 신규 결제/프록시/금액/주소 등록부 검사 포함 |
| 지갑 확장 | **1,257/1,257**, 51개 suite |
| poc-contract `forge test --offline` | **1,670/1,670**, 60개 suite, 실패/skip 0 |
| 변경한 결제 소스 lint | 오류·경고 없음 |
| `git diff --check` | 통과 |
| AST | TS/JS 1091, Go 240, Solidity 124/124 소스; parser issue 0 |
| 그래프 무결성 | 노드 23,740, 관계 85,389; 중복 노드·출발 노드 누락 없음 |

[실행 요약](verification-summary.txt). AST 소스 fingerprint: `3eaf4df03f6d7caccd98979566be44fa778ceb235d616395aff562612979e672`.

## 실제 HTTP 검증

별도 키/DB와 loopback 서버를 사용했다. 5개 동시 동일 생성 요청이 한 주문만 생성하는지, PG 승인→확정→부분 환불→순액 정산, 온/오프램프 완료, 송금/지급 거절 후 전액 보상, SIGTERM 재시작 후 주문과 정산 금액 보존을 검증했다.

테스트 Gateway가 부작용을 저장하고 503을 반환하는 상황에서, 조회 대사가 원장에 한 번만 반영되는지 확인했다. 실제 Provider 모드에서 가상 KYC 조작을 거절한다. 영속 lease 복구, 원장 기록 도중 오류 시 전체 rollback, event replay/내용 충돌, KYC 역순/동일 version 충돌, dead 명령 및 발송 재시도를 검사했다.

## 브라우저 검증

인앱 브라우저의 실제 웹/서버 API 연결에서 다음을 확인했다.

- 가맹점: 10,000 KRW 승인·확정 → 2,500 KRW 부분 환불 → 7,500 KRW 정산.
- 온램프: 10,000 KRW → 수수료 100 KRW → 7.333333 USDC 가상 수령.
- 오프램프: 10 USDC 입금 → 은행 지급 거절 → 10 USDC 전액 반환. 반환 후 거래 보관금의 합계 0.
- 원장 및 이벤트 표시, 실패 보상, 명시적 시뮬레이션 표시와 화면 가독성.
- AST 탐색기의 파일 검색, 결제 엔진의 호출/의존 관계와 SVG 그래프.

브라우저에서 발견한 미배포 module 주소의 초기화 예외, 잘못된 router/bank 모듈 등록, reverse proxy origin 불일치를 수정하고 회귀 테스트를 추가했다. 응답 유실 시 브라우저의 원래 멱등 키를 보존하며 명확한 견적 만료 거절 후 새 요청이 가능한지도 테스트했다.

## 해석과 운영 경계

위 결과는 로컬 시뮬레이션·어댑터 계약 및 현재 회귀 테스트의 통과다. 실제 PG/은행/온오프램프에 자금을 전송하지 않았다. 실사업자 SDK 매핑, 토큰화/hosted 인증, 계약·운영 계정·sandbox 적합성 검증은 별도다. 단일 노드 SQLite, gross PG 정산, 초기 고정 위험 정책이라는 범위는 RUNBOOK과 API 계약에 명시했다.

기존 optional 지갑 connector의 `@base-org/account` 모듈 경고, 일부 테스트의 의도된 오류 로그, Turbo의 coverage 출력 없음 경고는 검사 실패가 아니다. 신규 서비스는 Node 22의 experimental SQLite 경고가 나온다. root의 외부 서비스 기반 통합 테스트와 실제 체인 E2E 전체를 이번 Turbo 숫자에 포함하지 않았다. 계약 테스트와 신규 결제 HTTP E2E는 이번 작업에서 직접 다시 실행했다.
