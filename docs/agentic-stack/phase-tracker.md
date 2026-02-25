# Agentic Stack Phase Tracker

Program date: 2026-02-25
Target: Phase 01 -> Phase 50 without interruption

Legend:
- `pending`
- `in_progress`
- `done`

| Phase | Title | Status | Evidence |
| --- | --- | --- | --- |
| 01 | Scope freeze | done | docs/agentic-stack/scope-freeze.md |
| 02 | Version lock | done | docs/agentic-stack/version-lock.json |
| 03 | Environment contract | done | docs/agentic-stack/env-contract.example |
| 04 | Sepolia role topology template | done | docs/agentic-stack/sepolia-role-topology.template.md |
| 05 | Observability baseline scaffolding | done | packages/nextjs/lib/observability/agentic.ts |
| 06 | x402 challenge schema | done | packages/sdk/src/x402.ts |
| 07 | x402 payload schema | done | packages/nextjs/app/api/v1/_lib/validation.ts |
| 08 | facilitator skeleton | done | packages/nextjs/lib/marketplace/x402/facilitator.ts |
| 09 | verify pipeline | done | packages/nextjs/app/api/v1/marketplace/payments/x402/verify/route.ts |
| 10 | settle pipeline | done | packages/nextjs/app/api/v1/marketplace/payments/x402/settle/route.ts |
| 11 | replay/idempotency | done | packages/nextjs/lib/marketplace/x402/replay-store.ts |
| 12 | x402 SDK helpers | done | packages/sdk/src/x402.ts |
| 13 | paywall integrated route | done | packages/nextjs/lib/marketplace/x402/paywall.ts |
| 14 | x402 metrics/runbooks | done | packages/nextjs/app/api/v1/marketplace/payments/x402/metrics/route.ts |
| 15 | x402 unit tests | done | packages/nextjs/lib/marketplace/x402/facilitator.test.ts |
| 16 | x402 integration tests | done | packages/nextjs/app/api/v1/__tests__/x402.integration.test.ts |
| 17 | x402 e2e tests | done | packages/nextjs/app/api/v1/__tests__/x402.e2e.test.ts |
| 18 | x402 security/reliability/perf tests | done | packages/nextjs/app/api/v1/__tests__/x402.security-reliability.test.ts |
| 19 | x402 gate signoff | done | docs/agentic-stack/x402-gate-signoff.md |
| 20 | 8004 taxonomy/schema freeze | done | docs/agentic-stack/erc8004-taxonomy-schema-freeze.md |
| 21 | registry lifecycle APIs | done | packages/nextjs/app/api/v1/marketplace/agents/route.ts |
| 22 | endpoint ownership verification | done | packages/nextjs/lib/marketplace/endpoint-proof.ts |
| 23 | discovery index ingestion | done | packages/nextjs/lib/marketplace/discovery-index.ts |
| 24 | discovery query API/ranking | done | packages/nextjs/app/api/v1/marketplace/discover/route.ts |
| 25 | SDK 8004 read/write surface | done | packages/sdk/src/marketplace.ts |
| 26 | marketplace profile adapters | done | packages/nextjs/lib/marketplace/profile-adapter.ts |
| 27 | trust summary composition | done | packages/nextjs/lib/marketplace/trust-summary.ts |
| 28 | abuse controls/rate limits | done | packages/nextjs/lib/marketplace/rate-limit.ts |
| 29 | 8004 observability/freshness | done | packages/nextjs/app/api/v1/marketplace/metrics/route.ts |
| 30 | 8004 unit tests | done | packages/nextjs/lib/marketplace/agents-store.test.ts |
| 31 | 8004 integration tests | done | packages/nextjs/app/api/v1/__tests__/marketplace.8004.integration.test.ts |
| 32 | 8004 e2e tests | done | packages/nextjs/app/api/v1/__tests__/marketplace.8004.e2e.test.ts |
| 33 | 8004 security/reliability/perf tests | done | packages/nextjs/app/api/v1/__tests__/marketplace.8004.security-reliability.test.ts |
| 34 | 8004 gate signoff | done | docs/agentic-stack/erc8004-gate-signoff.md |
| 35 | cross-link profile + payment evidence | done | packages/nextjs/app/api/v1/__tests__/marketplace.crosslink.test.ts |
| 36 | combined funnel tests | done | packages/nextjs/app/api/v1/__tests__/marketplace.funnel.test.ts |
| 37 | combined security/data-quality tests | done | packages/nextjs/app/api/v1/__tests__/marketplace.combined.security.test.ts |
| 38 | unified platform gate signoff | done | docs/agentic-stack/unified-platform-gate-signoff.md |
| 39 | staking steward runtime + adapter | done | packages/nextjs/lib/marketplace/agents/staking-steward.ts |
| 40 | staking x402 + listing integration | done | packages/nextjs/app/api/v1/__tests__/staking.steward.integration.test.ts |
| 41 | staking full test matrix | done | packages/nextjs/lib/marketplace/agents/staking-steward.matrix.test.ts |
| 42 | staking launch gate | done | docs/agentic-stack/staking-steward-launch-gate.md |
| 43 | treasury dispatcher runtime + adapter | pending | |
| 44 | treasury x402 + listing integration | pending | |
| 45 | treasury full test matrix | pending | |
| 46 | treasury launch gate | pending | |
| 47 | swap runner runtime + adapter | pending | |
| 48 | swap x402 + listing integration | pending | |
| 49 | swap full test matrix | pending | |
| 50 | full stack release gate | pending | |
