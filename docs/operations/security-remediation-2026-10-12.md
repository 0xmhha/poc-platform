# Dependency security remediation — 2026-10-12

New advisories published after the 2026-09-20 remediation made the blocking `pnpm audit` and `govulncheck` CI steps fail on every branch. This change clears them.

## Result

| Ecosystem | Before | After |
| --- | --- | --- |
| pnpm | 3 critical and 12 high findings | 0 critical, 0 high (1 high ignored, see below) |
| Go | Reachable standard-library (`net/http`, `crypto/tls`, `mime/multipart`, `net/textproto`) and `golang.org/x/net` vulnerabilities in all eight modules | 0 reachable vulnerabilities in all eight modules |

`GHSA-vfj7-8cjw-p6xm` (`braces@3.0.3`, stack-exhaustion denial of service through deeply nested patterns) is ignored through `pnpm.auditConfig.ignoreGhsas`. The advisory covers every published `braces` version, so no patched release exists. The only reported path is `@changesets/cli > @changesets/config > micromatch > braces`, a release-time developer tool that expands glob patterns from this repository's own configuration, not untrusted input. Remove the ignore entry once a patched `braces` is published.

The remaining pnpm findings are 3 moderate and 1 low, below the CI threshold.

## Changes

- Next.js `^16.3.8` (web) and Fastify `^5.12.5` (bundler, contract-registry, module-registry).
- pnpm overrides: `axios` 1.20.0, `brace-expansion` 5.0.12, `handlebars` 4.7.10, `undici` 7.29.1, and new pins for `sharp` 0.35.5 and `source-map-js` 1.2.2.
- Go 1.26.9 in every module's `toolchain` directive, the CI Go job, and every Go container builder; `golang.org/x/net` v0.60.0 in every module.

## Validation

- `pnpm install --frozen-lockfile`
- `pnpm audit --audit-level=high`
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:ci` — all Turbo tasks passed
- `go build ./...`, `go vet ./...`, `go test ./...`, and `govulncheck ./...` with Go 1.26.9 in all eight Go modules
