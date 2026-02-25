# Full Stack Release Gate (Phase 50)

Date: 2026-02-25
Owner: Cloak agentic stack

## Decision

Phase 01 -> Phase 50 delivery is complete. Cloak is ready for end-to-end demo and staged release:

- x402 shielded payment facilitator
- ERC-8004 marketplace registry/discovery layer
- Three live runtimes:
  - `staking_steward`
  - `treasury_dispatcher`
  - `swap_runner`

## Backend capability checklist

- Registry/hire/run APIs implemented under `/api/v1/marketplace/*`.
- x402 challenge/verify/settle/metrics APIs implemented and paywall enforced.
- Endpoint ownership proof verification enforced during agent registration.
- Discovery index + ranking + freshness metrics implemented.
- Wallet-scoped rate limits active on discovery/write paths.
- Run records cross-link:
  - hire/operator context
  - trust snapshot
  - x402 payment evidence
- Runtime execution paths return simulated StarkZap tx hashes for all three agents.

## SDK capability checklist

- `MarketplaceClient` for register/discover/hire/run.
- Endpoint proof helpers:
  - `createEndpointOwnershipProof`
  - `buildEndpointOwnershipDigest`
- x402 helpers:
  - `x402Fetch`
  - `createShieldedPaymentPayload`
- ERC-8004 client helpers already exposed and tested.

## Final verification run

```bash
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/x402.integration.test.ts app/api/v1/__tests__/x402.e2e.test.ts app/api/v1/__tests__/x402.security-reliability.test.ts app/api/v1/__tests__/marketplace.8004.integration.test.ts app/api/v1/__tests__/marketplace.8004.e2e.test.ts app/api/v1/__tests__/marketplace.8004.security-reliability.test.ts app/api/v1/__tests__/marketplace.funnel.test.ts app/api/v1/__tests__/marketplace.crosslink.test.ts app/api/v1/__tests__/marketplace.combined.security.test.ts app/api/v1/__tests__/staking.steward.integration.test.ts app/api/v1/__tests__/treasury.dispatcher.integration.test.ts app/api/v1/__tests__/swap.runner.integration.test.ts lib/marketplace/agents/staking-steward.matrix.test.ts lib/marketplace/agents/treasury-dispatcher.matrix.test.ts lib/marketplace/agents/swap-runner.matrix.test.ts
yarn workspace @cloak-wallet/sdk test x402.test.ts marketplace.test.ts marketplace-proof.test.ts erc8004.test.ts
```

Result:
- Next.js: 15 files, 31 tests passed.
- SDK: 4 files, 15 tests passed.

## Release notes for demo operators

1. Register agent profile with endpoint proof.
2. Discover by capability/agent type.
3. Create hire.
4. Execute billable run (`x402Fetch` recommended on client side).
5. Inspect run result + payment evidence + trust snapshot.
