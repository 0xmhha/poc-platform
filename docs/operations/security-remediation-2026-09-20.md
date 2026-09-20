# Dependency security remediation — 2026-09-20

This change consolidates the open Dependabot updates that were applicable to the platform monorepo and makes dependency audits blocking CI checks.

## Result

| Ecosystem | Before | After |
| --- | --- | --- |
| pnpm | 6 critical, 75 high, 98 moderate, 11 low dependency findings | 0 critical, 0 high, 0 moderate, 1 low |
| Go | Reachable standard-library and module vulnerabilities across the services | 0 reachable vulnerabilities in all eight modules |
| Rust | 3 vulnerabilities (`h2`, `rsa`, and `ruint`) | 0 vulnerabilities |

The remaining npm finding is `GHSA-848j-6mx2-7j84` in `elliptic@6.6.1`, reached through `@ledgerhq/hw-app-eth` and Ethers v5. The advisory covers every published `elliptic` version and has no patched release. The Ledger dependency is at its current requested release, so there is no automated remediation to apply. CI blocks high and critical npm findings while this low, unpatched transitive finding is monitored.

RustSec reports two allowed maintenance warnings for `derivative@2.2.0` and `paste@1.0.15`; neither is a vulnerability. `govulncheck` also reports advisory metadata in some required Go modules, but symbol analysis confirms that no vulnerable function is reachable from this repository.

## Changes

- Updated security-sensitive JavaScript dependencies and pinned transitive fixes with pnpm overrides, including Next.js 16.3.3, Hono 4.13.5, Fastify 5.12.1, Vitest 4.1.11, Viem 2.47.6, Wagmi 3.6.0, and Zod 4.3.6.
- Migrated the web application to Next.js 16 while retaining the repository's existing webpack configuration through explicit `--webpack` development and build flags.
- Removed the wallet's broad Node polyfill plugin and reused Viem's BIP-39 implementation so the browser bundle and Jest use one maintained crypto path.
- Added Wagmi's MetaMask peer integration explicitly so the production bundle resolves every exported connector without a missing-module warning.
- Updated every Go module, CI job, and Go container builder to Go 1.26.8; updated affected networking, PostgreSQL, WebSocket, and Ethereum dependencies.
- Updated the Rust cryptography and database stack, disabled the vulnerable unused HTTP/2 feature, and fixed scalar reduction and parameterized database configuration.
- Added the Rust lockfile to version control for reproducible CI and production builds.
- Updated pinned GitHub Actions revisions and made npm, Go, and Rust vulnerability scans fail CI on findings.
- Added the previously omitted Go SDK and shared module to Dependabot and the Go CI matrix.
- Applied repository formatting so the existing format job passes with the current Biome and rustfmt versions.

## Validation

- `pnpm install --frozen-lockfile --offline`
- `pnpm audit --audit-level=high`
- `pnpm check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test:ci` — 55 of 55 Turbo tasks passed; wallet extension 1,257 tests and web 184 tests passed
- `go build ./...`, `go test ./...`, and `govulncheck ./...` in all eight Go modules
- `cargo fmt --check`, `cargo build --release`, `cargo test --all`, and `cargo audit`
