# Unified Platform Gate Signoff (Phase 38)

Date: 2026-02-25
Owner: Cloak agentic stack

## Decision

Combined x402 + ERC-8004 platform flow is cleared to proceed with agent runtime implementation (staking, treasury, swap).

## Combined guarantees validated

- Registry/discovery/hire lifecycle works with wallet-authenticated APIs.
- Billable run execution enforces x402 shielded payment and attaches payment evidence.
- Run records include agent trust snapshot from profile context.
- Endpoint ownership proofs are enforced during registration.
- Discovery quality filters out non-active profiles and enforces rate limits.
- Metrics expose payment and registry/freshness visibility for operators.

## Evidence tests

- Combined funnel:
  - `packages/nextjs/app/api/v1/__tests__/marketplace.funnel.test.ts`
- Cross-link payment + trust evidence:
  - `packages/nextjs/app/api/v1/__tests__/marketplace.crosslink.test.ts`
- Combined security/data quality:
  - `packages/nextjs/app/api/v1/__tests__/marketplace.combined.security.test.ts`
- Existing x402 flow:
  - `packages/nextjs/app/api/v1/__tests__/x402.integration.test.ts`
  - `packages/nextjs/app/api/v1/__tests__/x402.e2e.test.ts`

## Commands used in this gate

```bash
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/marketplace.funnel.test.ts
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/marketplace.crosslink.test.ts
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/marketplace.combined.security.test.ts
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/x402.integration.test.ts app/api/v1/__tests__/x402.e2e.test.ts
```

## Exit criteria for next stage

- Implement three production-facing agent runtimes:
  - `staking_steward`
  - `treasury_dispatcher`
  - `swap_runner`
