# Security Policy

## Supported versions

보안 수정은 기본 브랜치와 최신 릴리스에 적용한다. 개발 단계의 `0.x` 버전은 이전 버전에 대한 별도 지원을 보장하지 않는다.

## Reporting a vulnerability

취약점은 공개 이슈 대신 [GitHub 비공개 보안 제보](https://github.com/0xmhha/poc-platform/security/advisories/new)로 전달한다.

제보에는 다음 정보를 포함한다.

- 영향을 받는 컴포넌트와 커밋 또는 버전
- 재현에 필요한 최소 단계나 코드
- 예상 영향과 공격에 필요한 조건
- 확인한 완화 방법이 있다면 그 내용

개인 키, 실제 결제 수단, 운영 인증 정보는 제보에 포함하지 않는다. 프로젝트 관리자는 재현 여부와 수정 방향을 비공개 채널에서 회신하고, 수정이 배포된 뒤 공개 범위를 협의한다.

## Scope

주요 보안 범위는 지갑 키와 서명, 브라우저와 확장 프로그램 사이의 메시지, ERC-4337 Bundler와 Paymaster, 결제 사업자 어댑터와 웹훅, 브리지와 운영 API다.

의존성 감사와 현재 예외는 [보안 조치 기록](docs/operations/security-remediation-2026-09-20.md)에 정리되어 있다.
