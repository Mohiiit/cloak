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
| 43 | treasury dispatcher runtime + adapter | done | packages/nextjs/lib/marketplace/agents/treasury-dispatcher.ts |
| 44 | treasury x402 + listing integration | done | packages/nextjs/app/api/v1/__tests__/treasury.dispatcher.integration.test.ts |
| 45 | treasury full test matrix | done | packages/nextjs/lib/marketplace/agents/treasury-dispatcher.matrix.test.ts |
| 46 | treasury launch gate | done | docs/agentic-stack/treasury-dispatcher-launch-gate.md |
| 47 | swap runner runtime + adapter | done | packages/nextjs/lib/marketplace/agents/swap-runner.ts |
| 48 | swap x402 + listing integration | done | packages/nextjs/app/api/v1/__tests__/swap.runner.integration.test.ts |
| 49 | swap full test matrix | done | packages/nextjs/lib/marketplace/agents/swap-runner.matrix.test.ts |
| 50 | full stack release gate | done | docs/agentic-stack/full-stack-release-gate.md |
| 51 | client integration contract freeze | done | docs/agentic-stack/client-integration-contract-freeze.md |
| 52 | marketplace run persistence migration | done | supabase-migration-agent-runs.sql |
| 53 | supabase-backed marketplace repositories | done | packages/nextjs/lib/marketplace/*.repo.ts |
| 54 | operator-scoped run/hire access controls | done | packages/nextjs/app/api/v1/marketplace/runs/route.ts |
| 55 | pagination and filtering contract rollout | done | packages/nextjs/app/api/v1/marketplace/*/route.ts |
| 56 | sdk marketplace session unification | done | packages/sdk/src/marketplace-session.ts |
| 57 | x402 proof provider interface | done | packages/sdk/src/x402.ts |
| 58 | backend x402 proof adapter boundary | done | packages/nextjs/lib/marketplace/x402/facilitator.ts |
| 59 | web marketplace discovery page | done | packages/nextjs/app/marketplace/page.tsx |
| 60 | web agent profile page | done | packages/nextjs/app/marketplace/[agentId]/page.tsx |
| 61 | web hire flow | done | packages/nextjs/app/marketplace/[agentId]/page.tsx |
| 62 | web paid run flow with x402 retry | done | packages/nextjs/app/marketplace/[agentId]/page.tsx |
| 63 | web operator dashboard | done | packages/nextjs/app/marketplace/dashboard/page.tsx |
| 64 | mobile marketplace entry integration | done | packages/mobile/src/screens/AgentScreen.tsx |
| 65 | mobile discover and hire flow | done | packages/mobile/src/screens/MarketplaceScreen.tsx |
| 66 | mobile paid run x402 flow | done | packages/mobile/src/lib/marketplaceApi.ts |
| 67 | mobile run evidence views | done | packages/mobile/src/screens/MarketplaceRunDetailScreen.tsx |
| 68 | extension agents screen integration | done | packages/extension/src/popup/components/MarketplaceScreen.tsx |
| 69 | extension discover and hire flow | done | packages/extension/src/popup/components/MarketplaceScreen.tsx |
| 70 | extension paid run x402 flow | done | packages/extension/src/popup/components/MarketplaceScreen.tsx |
| 71 | marketplace telemetry funnel events | done | packages/nextjs/lib/observability/agentic.ts |
| 72 | resilience and idempotency controls | done | packages/nextjs/lib/marketplace/*.ts |
| 73 | cross-surface test matrix execution | pending | docs/agentic-stack/post-phase-50-test-matrix.md |
| 74 | demo launch assets and runbook | pending | docs/agentic-stack/client-rollout-demo-runbook.md |
| 75 | staged rollout and feature flag playbook | pending | docs/agentic-stack/rollout-playbook.md |
| 76 | post-phase-50 release gate signoff | pending | docs/agentic-stack/post-phase-50-release-gate.md |
