# Staking Steward Launch Gate (Phase 42)

Date: 2026-02-25

## Decision

`staking_steward` runtime is approved for marketplace launch paths.

## Scope validated

- Agent runtime wired through StarkZap adapter.
- Supported actions:
  - `stake`
  - `unstake`
  - `rebalance`
- Paid execution path verified through x402.
- Discovery + listing integration verified.
- Error handling matrix validated for missing parameters and unsupported actions.

## Evidence

- Runtime unit tests:
  - `packages/nextjs/lib/marketplace/agents/staking-steward.test.ts`
  - `packages/nextjs/lib/marketplace/agents/staking-steward.matrix.test.ts`
- Integration:
  - `packages/nextjs/app/api/v1/__tests__/staking.steward.integration.test.ts`

## Commands used

```bash
yarn workspace @ss-2/nextjs test lib/marketplace/agents/staking-steward.test.ts
yarn workspace @ss-2/nextjs test lib/marketplace/agents/staking-steward.matrix.test.ts
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/staking.steward.integration.test.ts
```
