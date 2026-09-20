# Payment Hub

영속 PG·온램프·오프램프 시뮬레이터와 교체 가능한 Provider 인터페이스.

저장소 루트에서 `pnpm dev:payments`로 웹 실험실까지 실행한다.

[실행 및 운영 절차](../../docs/productization/RUNBOOK.md) · [사업자 API 계약](../../docs/productization/PROVIDER-CONTRACT.md) · [구조](../../docs/productization/ARCHITECTURE.md)

Node 22.16+, SQLite 단일 노드. API의 모든 돈은 정수 최소 단위 문자열이다. 실제 사업자 모드는 별도 Gateway 구현과 자격 증명이 필요하다.
