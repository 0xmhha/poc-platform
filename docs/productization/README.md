# StableNet 결제 기능과 사업자 연동

이 문서는 `poc-platform`의 결제 시뮬레이션과 실제 사업자 연동 경계를 설명한다.

- [기능 범위](FEATURES.md)
- [구조와 상태 흐름](ARCHITECTURE.md)
- [API 및 사업자 어댑터 계약](PROVIDER-CONTRACT.md)
- [실행·복구 절차](RUNBOOK.md)

## 바로 실행

Node 22.16 이상과 pnpm을 사용한다. 저장소 루트에서:

```sh
pnpm install --frozen-lockfile
pnpm dev:payments
```

`http://127.0.0.1:14300/payment/simulator`에서 가맹점 결제, 코인 구매, 코인 판매를 실행한다. 실행 스크립트가 임시 서비스 인증 키를 생성하며 브라우저에 노출하지 않는다. 거래는 `.payment-lab/payments.sqlite`에 남아 재시작 후 복구된다. 실제 카드나 계좌를 입력하지 않는다. Ctrl+C로 두 서버를 함께 종료한다.

## 분석 재생성

```sh
GOCACHE=/tmp/stablenet-code-graph pnpm graph:code
```

Rust/Cargo, Go, Python 3.11+, Foundry의 Solidity 바이너리와 계약 소스 의존성이 필요하다. 자동 검색이 안 되면 `SOLC_BINARY`를 해당 native solc 실행 파일로 지정한다. 결과 JSON과 HTML 탐색기는 로컬에 생성되며 git에서 제외한다.

TypeScript compiler API는 선언 및 해석 가능한 호출, Go parser는 구문 관계, Solidity compiler AST는 선언 참조·상속·호출을 수집한다. TS/Go의 동적 호출, 원격 API, 실제 체인 실행을 정적으로 증명하지 않는다. 소스 디렉터리의 파일 목록과 compiler 결과를 독립 비교하여 Solidity 누락을 검사한다. `node_modules`, 빌드 결과, 외부 vendor는 제외하며 계약 `src` 안의 vendor 소스는 포함한다. 테스트도 분석에 포함한다.

## 제공 범위

영속 결제 엔진과 시뮬레이터, 교체 가능한 사업자 인터페이스, 웹 실험실을 구현했다. 가맹점별 인증·멱등 요청·원장·대사·실패 복구를 포함한다. 기존 지갑/AA/DeFi/브리지 코드는 분석과 회귀 검증 대상으로 유지했다. 실제 PG 및 온오프램프 사업자의 SDK 매핑, 사업자 승인과 실제 정산 검증은 별도다. 전체 플랫폼의 운영 인증을 완료했다는 의미는 아니다.
