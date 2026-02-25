# ERC-8004 Gate Signoff (Phase 34)

Date: 2026-02-25
Owner: Cloak agentic stack

## Decision

ERC-8004 marketplace profile/discovery/hire infrastructure is cleared for cross-linking with x402 and agent runtime delivery.

## Delivered scope

- Agent registry lifecycle APIs:
  - `POST/GET /api/v1/marketplace/agents`
  - `GET/PATCH /api/v1/marketplace/agents/[agentId]`
- Discovery API with ranking:
  - `GET /api/v1/marketplace/discover`
- Hire lifecycle APIs:
  - `POST/GET /api/v1/marketplace/hires`
  - `PATCH /api/v1/marketplace/hires/[id]`
- Endpoint ownership proof verification.
- Profile adapter with optional on-chain ERC-8004 refresh.
- Deterministic trust summary composition.
- Abuse controls (wallet-scoped rate limits).
- Metrics + freshness endpoint:
  - `GET /api/v1/marketplace/metrics`
- SDK marketplace client surface for register/discover/hire/run orchestration.

## Evidence

- Unit:
  - `packages/nextjs/lib/marketplace/*.test.ts`
  - `packages/sdk/tests/marketplace.test.ts`
  - `packages/sdk/tests/marketplace-proof.test.ts`
- Integration:
  - `packages/nextjs/app/api/v1/__tests__/marketplace.8004.integration.test.ts`
- E2E:
  - `packages/nextjs/app/api/v1/__tests__/marketplace.8004.e2e.test.ts`
- Security/Reliability:
  - `packages/nextjs/app/api/v1/__tests__/marketplace.8004.security-reliability.test.ts`

## Commands used in this gate

```bash
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/marketplace.8004.integration.test.ts
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/marketplace.8004.e2e.test.ts
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/marketplace.8004.security-reliability.test.ts
yarn workspace @ss-2/nextjs test lib/marketplace/agents-store.test.ts lib/marketplace/hires-store.test.ts lib/marketplace/discovery-index.test.ts lib/marketplace/discovery-ranking.test.ts lib/marketplace/endpoint-proof.test.ts lib/marketplace/profile-adapter.test.ts lib/marketplace/rate-limit.test.ts lib/marketplace/registry-metrics.test.ts lib/marketplace/trust-summary.test.ts
yarn workspace @cloak-wallet/sdk test marketplace.test.ts marketplace-proof.test.ts
```

## Non-blocking follow-up

- Add durable persistent index storage (Supabase/Redis) for multi-instance deployments.
- Add live Sepolia smoke checks for `refresh_onchain=true` paths.
