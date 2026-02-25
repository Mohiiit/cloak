# Treasury Dispatcher Launch Gate (Phase 46)

Date: 2026-02-25

## Decision

`treasury_dispatcher` runtime is approved for marketplace launch.

## Scope validated

- Runtime implemented via StarkZap adapter.
- Supported actions:
  - `dispatch_batch`
  - `sweep_idle`
- x402 payment enforcement validated for billable treasury runs.
- Discovery listing + hire + run flow validated.
- Matrix coverage includes action success and required-param failures.

## Evidence

- Runtime unit tests:
  - `packages/nextjs/lib/marketplace/agents/treasury-dispatcher.test.ts`
  - `packages/nextjs/lib/marketplace/agents/treasury-dispatcher.matrix.test.ts`
- Integration:
  - `packages/nextjs/app/api/v1/__tests__/treasury.dispatcher.integration.test.ts`

## Commands used

```bash
yarn workspace @ss-2/nextjs test lib/marketplace/agents/treasury-dispatcher.test.ts
yarn workspace @ss-2/nextjs test lib/marketplace/agents/treasury-dispatcher.matrix.test.ts
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/treasury.dispatcher.integration.test.ts
```
