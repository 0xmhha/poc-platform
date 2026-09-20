# StableNet 문서 안내

이 디렉터리에는 현재 코드의 설계, 연동 계약, 운영 절차를 설명하는 문서만 유지한다. 구현 상태와 명령은 각 패키지의 `README.md`와 소스 코드를 최종 기준으로 삼는다.

## 시작과 운영

- [시작 가이드](tutorials/getting-started.md)
- [운영 가이드](operations/README.md)
- [배포 가이드](operations/deployment.md)
- [최근 보안 조치](operations/security-remediation-2026-09-20.md)
- [보안 취약점 제보 정책](../SECURITY.md)

## 제품과 아키텍처

- [제품 요구사항](prd/StableNet_PRD.md)
- [정보 아키텍처](architecture/StableNet_IA.md)
- [Wallet Extension 아키텍처](../apps/wallet-extension/docs/ARCHITECTURE.md)
- PoC 설계: [개요](poc/00_PoC_Overview.md), [시스템](poc/01_System_Architecture.md), [스마트 컨트랙트](poc/02_Smart_Contracts.md), [브리지](poc/04_Secure_Bridge.md)

## 계정 추상화 표준

- [ERC-4337 기술 가이드](eip/ERC-4337.md)
- [EIP-4337 정리](EIP-4337_스펙표준_정리.md)
- [EIP-4337 Paymaster 구현 가이드](EIP-4337_Paymaster_개발자_구현가이드.md)
- [ERC-7579 정리](EIP-7579_스펙표준_정리.md)
- [EIP-7702 정리](EIP-7702_스펙표준_정리.md)

## SDK와 서비스

- SDK: [개요](sdk/00_SDK_OVERVIEW.md), [컨트랙트 매핑](sdk/01_CONTRACT_SDK_MAPPING.md), [API](sdk/api/README.md)
- 서비스: [API 안내](services/README.md), [Contract Registry](services/contract-registry.md)
- Paymaster: [시스템 명세](../services/paymaster-proxy/docs/PAYMASTER_SYSTEM_SPEC.md), [운영 가이드](../services/paymaster-proxy/PAYMASTER_OPERATIONS_GUIDE.md)

## 결제와 사업자 연동

- [결제 기능 안내](productization/README.md)
- [구조](productization/ARCHITECTURE.md)
- [기능 범위](productization/FEATURES.md)
- [사업자 어댑터 계약](productization/PROVIDER-CONTRACT.md)
- [실행 및 복구](productization/RUNBOOK.md)
- [시뮬레이터 API](simulator/README.md)

시뮬레이터 문서는 은행, PG, 온램프의 요청·응답·상태·웹훅 계약을 정의한다. 실제 사업자를 연결할 때 동일한 내부 계약으로 변환해야 한다.

## 유지 관리 원칙

1. API, 환경 변수, 실행 명령을 바꾸면 같은 변경에서 관련 문서를 갱신한다.
2. 완료된 계획서, 감사 작업 로그, 잔여 작업 목록, 생성된 그래프와 검증 출력은 저장소 문서로 보관하지 않는다. 진행 상태는 이슈와 PR, 실행 결과는 CI 아티팩트에서 관리한다.
3. 동일 주제의 설명은 하나의 정본만 유지하고 세부 구현은 해당 패키지의 README로 연결한다.
4. 주소, 버전, 테스트 개수처럼 쉽게 낡는 값은 필요할 때 코드나 자동 생성 결과에서 확인한다.
