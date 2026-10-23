# Dependency security remediation — 2026-10-23

Advisories published on 2026-10-23 made the blocking `pnpm audit`, `cargo audit` and `govulncheck` CI steps fail on `main` (first failing commit `d78d441`; `8495c0e` passed before the advisories were published). This change clears them.

## Result

| Ecosystem | Before | After |
| --- | --- | --- |
| pnpm | 2 critical and 4 high findings | 0 critical, 0 high (`GHSA-vfj7-8cjw-p6xm` still ignored, see the 2026-10-12 record) |
| Rust (stealth-server) | 1 vulnerability (`ctutils` 0.4.2, RUSTSEC-2026-0385) | 0 vulnerabilities; unmaintained/yanked warnings unchanged |
| Go | `crypto/x509` GO-2026-6809 reachable in all eight modules | 0 reachable vulnerabilities in all eight modules |

The critical findings are unauthenticated remote code execution in the Next.js App Router (`GHSA-2464-fhr4-w9xw`, `GHSA-673q-mjm6-r5xr`), fixed in Next.js 16.4.1.

## Changes

- Next.js `^16.4.3` (web).
- pnpm override `follow-redirects` 1.16.1 (`GHSA-q3jh-wrc6-jgq8`, `GHSA-8r9p-f939-6h3c`).
- `vite` ^6.4.5 in the wallet extension (`GHSA-587h-7wmj-h5pm`, patched in 6.4.4).
- `ctutils` 0.4.5 in `services/stealth-server/Cargo.lock`.
- Go 1.26.10 in every module's `toolchain` directive, the CI Go job, and every Go container builder.

## Validation

- `pnpm install`, `pnpm audit --audit-level=high`
- `cargo build --locked`, `cargo audit` in `services/stealth-server`
- `go build ./...`, `go test ./...`, and `govulncheck ./...` with Go 1.26.10 in all eight Go modules
